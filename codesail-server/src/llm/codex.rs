use async_trait::async_trait;
use serde::Deserialize;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use super::{LlmConfig, LlmProvider, StreamChunk};

/// Codex CLI 子进程包装。
///
/// 复用用户已经登录的 `codex` CLI（ChatGPT Plus / Pro 配额），通过
/// `codex exec --json` 非交互模式跑一发，stdout 解析 JSONL 事件流。
///
/// codex exec 不吐 token delta，而是 task-level：每个 `item.completed` 给完整
/// `agent_message`，所以这里实现的是"伪流式"——拿到一条就当一个 chunk 发。
#[derive(Debug, Clone)]
pub struct CodexProvider {
    config: LlmConfig,
}

/// codex exec --json 的事件包装
#[derive(Deserialize)]
struct CodexEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    item: Option<CodexItem>,
}

#[derive(Deserialize)]
struct CodexItem {
    #[serde(rename = "type")]
    item_type: String,
    #[serde(default)]
    text: Option<String>,
}

impl CodexProvider {
    pub fn new(config: LlmConfig) -> Self {
        Self { config }
    }

    /// 把 system + user 拼成单段 prompt 喂给 codex stdin
    fn build_prompt(system: &str, user: &str) -> String {
        if system.is_empty() {
            user.to_string()
        } else {
            format!("{}\n\n{}", system, user)
        }
    }

    /// 构建 codex exec 命令。
    /// Windows 上 `codex` 通常是 npm 装的 .cmd shim，CreateProcess 不会自动加 .cmd，
    /// 所以 Windows 走 `cmd /c codex`；其他平台直接 spawn `codex`。
    fn build_command(&self) -> Command {
        // 允许通过环境变量指定 codex 可执行路径（绝对路径优先）
        let codex_bin = std::env::var("CODESAIL_CODEX_BIN").unwrap_or_else(|_| "codex".to_string());

        // sandbox 默认 workspace-write（codex agent 完成任务可能需要写工作区）。
        // 通过 CODESAIL_CODEX_SANDBOX 覆盖：read-only / workspace-write / danger-full-access
        let sandbox = std::env::var("CODESAIL_CODEX_SANDBOX")
            .unwrap_or_else(|_| "workspace-write".to_string());

        #[cfg(windows)]
        let mut cmd = {
            let mut c = Command::new("cmd");
            c.arg("/c").arg(&codex_bin);
            c
        };
        #[cfg(not(windows))]
        let mut cmd = Command::new(&codex_bin);

        cmd.arg("exec")
            .arg("--skip-git-repo-check")
            .arg("--ephemeral")
            .arg("--json")
            .arg("-s")
            .arg(&sandbox)
            .arg("-m")
            .arg(&self.config.model)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // 关键：主动剥离 OPENAI_API_KEY / CODEX_API_KEY，确保 codex 走 ChatGPT 订阅
        // 额度而不是 API 计费。父进程若意外带了这两个变量会被强制 unset。
        cmd.env_remove("OPENAI_API_KEY");
        cmd.env_remove("CODEX_API_KEY");

        cmd
    }

    /// 共享实现：spawn codex exec，喂 prompt，逐行解析 JSONL，
    /// 每个 `item.completed`（type=agent_message）作为一个 chunk 发出。
    /// `sender` 为 None 时不发流式，仅累积返回。
    async fn run_internal(
        &self,
        system: &str,
        user: &str,
        sender: Option<tokio::sync::mpsc::Sender<StreamChunk>>,
    ) -> Result<String, String> {
        let prompt = Self::build_prompt(system, user);
        let mut cmd = self.build_command();

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn codex: {}", e))?;

        // 写 prompt 到 stdin，写完关闭以触发 EOF
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(prompt.as_bytes())
                .await
                .map_err(|e| format!("Failed to write prompt to codex stdin: {}", e))?;
            // drop 关闭 fd，让 codex 知道 prompt 完整
            drop(stdin);
        }

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "codex stdout missing".to_string())?;

        // stderr 单独 drain，避免管道 backpressure 卡住子进程
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    tracing::debug!("codex stderr: {}", line);
                }
            });
        }

        let mut full = String::new();
        let mut reader = BufReader::new(stdout).lines();

        while let Ok(Some(line)) = reader.next_line().await {
            let trimmed = line.trim();
            // codex 在 cleanup 时会输出 "SUCCESS: The process..." 这类非 JSON 行，跳过
            if trimmed.is_empty() || !trimmed.starts_with('{') {
                continue;
            }

            match serde_json::from_str::<CodexEvent>(trimmed) {
                Ok(event) => {
                    if event.event_type == "item.completed" {
                        if let Some(item) = event.item {
                            if item.item_type == "agent_message" {
                                if let Some(text) = item.text {
                                    if !text.is_empty() {
                                        full.push_str(&text);
                                        if let Some(ref tx) = sender {
                                            let _ = tx
                                                .send(StreamChunk {
                                                    delta: text,
                                                    done: false,
                                                })
                                                .await;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // 其他事件类型（thread.started / turn.started / turn.completed / reasoning 等）忽略
                }
                Err(e) => {
                    tracing::warn!("codex JSON parse error: {} (line: {})", e, trimmed);
                }
            }
        }

        let status = child
            .wait()
            .await
            .map_err(|e| format!("codex wait error: {}", e))?;

        if !status.success() {
            return Err(format!("codex exited with non-zero status: {}", status));
        }

        if let Some(ref tx) = sender {
            let _ = tx
                .send(StreamChunk {
                    delta: String::new(),
                    done: true,
                })
                .await;
        }

        Ok(full)
    }
}

#[async_trait]
impl LlmProvider for CodexProvider {
    fn id(&self) -> &str {
        "codex"
    }

    fn name(&self) -> &str {
        "Codex CLI"
    }

    fn models(&self) -> Vec<String> {
        // 与 codex CLI v0.129 实测一致；新模型上线后用户可手动通过 set_provider 传入
        vec![
            "gpt-5.5".into(),
            "gpt-5.4".into(),
            "gpt-5.4-mini".into(),
            "gpt-5.3-codex".into(),
            "gpt-5.3-codex-spark".into(),
            "gpt-5.2".into(),
        ]
    }

    fn is_local(&self) -> bool {
        false
    }

    async fn chat(&self, system: &str, user: &str) -> Result<String, String> {
        self.run_internal(system, user, None).await
    }

    async fn chat_stream(
        &self,
        system: &str,
        user: &str,
        sender: tokio::sync::mpsc::Sender<StreamChunk>,
    ) -> Result<String, String> {
        self.run_internal(system, user, Some(sender)).await
    }
}
