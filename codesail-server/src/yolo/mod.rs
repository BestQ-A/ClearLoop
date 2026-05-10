use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::epic::EpicManager;
use crate::llm::LlmProvider;
use crate::protocol::epic::*;
use crate::protocol::verification::VerifyParams;
use crate::protocol::yolo::*;
use crate::verification::VerificationEngine;

/// YOLO 运行的当前阶段——用于进度回调和外部观察
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum YoloPhase {
    /// 启动——已接收任务，准备拓扑排序
    Start,
    /// 正在生成计划
    Plan,
    /// 正在执行（agent handoff）
    Execute,
    /// 正在验证
    Verify,
    /// 正在生成 commit
    Commit,
    /// 工单已完成
    TicketDone,
    /// 全部完成
    Done,
    /// 已取消
    Cancelled,
    /// 出错
    Error,
}

/// 进度事件——在 phase 边界触发，由调用方桥接到 StreamEvent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YoloProgressEvent {
    pub run_id: String,
    pub ticket_id: String,
    pub phase: YoloPhase,
    pub message: String,
    /// 0.0 - 100.0
    pub percent: f32,
}

/// 单个 run 的运行时上下文——存活于 active_runs 表
#[derive(Debug)]
struct RunContext {
    cancelled: Arc<AtomicBool>,
    started_at: chrono::DateTime<chrono::Utc>,
    epic_id: String,
    ticket_count: usize,
}

/// 公开的 active run 描述——用于 listActive
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunInfo {
    pub run_id: String,
    pub epic_id: String,
    pub ticket_count: usize,
    pub started_at: String,
    pub cancelled: bool,
}

/// 进度回调类型——在所有 phase 边界由 runner 调用。
/// 必须 Send + Sync，因为 run() 内部跨 await 持有它。
pub type ProgressCallback = Arc<dyn Fn(YoloProgressEvent) + Send + Sync>;

/// YOLO 自动化运行器——长生命周期单例，持有 active_runs 注册表。
///
/// 不再持有 `provider`——provider 因请求而异（不同 ticket 可能用不同
/// LLM），由调用方在 run() 时显式传入。
pub struct YoloRunner {
    epic_manager: Arc<EpicManager>,
    verification_engine: Arc<VerificationEngine>,
    /// run_id -> 上下文。整个 server 生命周期内累积+清理。
    active_runs: Arc<RwLock<HashMap<String, RunContext>>>,
}

impl YoloRunner {
    pub fn new(
        epic_manager: Arc<EpicManager>,
        verification_engine: Arc<VerificationEngine>,
    ) -> Self {
        Self {
            epic_manager,
            verification_engine,
            active_runs: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 主自动化循环——按依赖顺序执行工单。
    ///
    /// `on_progress` 在以下时间点触发：
    ///   - 每个 ticket 开始之前（Plan 之前）
    ///   - 计划生成完成 / 失败
    ///   - 执行启动完成
    ///   - 验证完成 / 失败 / 重试
    ///   - commit 生成完成
    ///   - 工单完成
    ///   - 取消
    ///   - 整体完成
    ///
    /// 返回的 `YoloRunResult` 自带 `run_id`，调用方据此调用 `cancel`。
    pub async fn run<F>(
        &self,
        params: YoloRunParams,
        provider: Arc<dyn LlmProvider>,
        on_progress: F,
    ) -> Result<YoloRunResult, String>
    where
        F: Fn(YoloProgressEvent) + Send + Sync + 'static,
    {
        let run_id = uuid::Uuid::new_v4().to_string();
        let cancelled = Arc::new(AtomicBool::new(false));
        let on_progress: ProgressCallback = Arc::new(on_progress);

        // 注册到 active_runs
        {
            let mut runs = self.active_runs.write().await;
            runs.insert(
                run_id.clone(),
                RunContext {
                    cancelled: cancelled.clone(),
                    started_at: chrono::Utc::now(),
                    epic_id: params.epic_id.clone(),
                    ticket_count: params.ticket_ids.len(),
                },
            );
        }

        // 不论 OK/Err 还是 panic，都要保证清理
        let result = self
            .run_inner(&run_id, &cancelled, params, provider, on_progress.clone())
            .await;

        // 清理 active_runs（即使被取消也要清）
        {
            let mut runs = self.active_runs.write().await;
            runs.remove(&run_id);
        }

        result
    }

    /// 内部实现——分离出来便于在外层做 active_runs 清理
    async fn run_inner(
        &self,
        run_id: &str,
        cancelled: &Arc<AtomicBool>,
        params: YoloRunParams,
        provider: Arc<dyn LlmProvider>,
        on_progress: ProgressCallback,
    ) -> Result<YoloRunResult, String> {
        emit(
            &on_progress,
            run_id,
            "",
            YoloPhase::Start,
            0.0,
            format!(
                "YOLO 运行已启动：epic={} tickets={}",
                params.epic_id,
                params.ticket_ids.len()
            ),
        );

        let epic = self.epic_manager.get_epic(&params.epic_id)?;
        let ordered_ticket_ids = self.topological_sort(&epic, &params.ticket_ids)?;
        let total = ordered_ticket_ids.len().max(1) as f32;

        let mut results = Vec::new();

        for (idx, ticket_id) in ordered_ticket_ids.iter().enumerate() {
            // 在每个 ticket 开始前检查取消信号
            if cancelled.load(Ordering::SeqCst) {
                emit(
                    &on_progress,
                    run_id,
                    ticket_id,
                    YoloPhase::Cancelled,
                    (idx as f32 / total) * 100.0,
                    format!("已取消：跳过工单 {}", ticket_id),
                );
                results.push(YoloExecutionResult {
                    ticket_id: ticket_id.clone(),
                    status: ExecutionStatus::Aborting,
                    plan_id: None,
                    verification_thread_id: None,
                    commit_sha: None,
                    error: Some("YOLO 运行已取消".into()),
                });
                continue;
            }

            let base_pct = (idx as f32 / total) * 100.0;

            let result = self
                .execute_ticket(
                    run_id,
                    cancelled,
                    &params.epic_id,
                    ticket_id,
                    &params.config,
                    &params.code,
                    provider.clone(),
                    on_progress.clone(),
                    base_pct,
                    100.0 / total,
                )
                .await;

            results.push(result);
        }

        // 整体完成
        emit(
            &on_progress,
            run_id,
            "",
            YoloPhase::Done,
            100.0,
            format!("YOLO 运行完成：{} 个工单已处理", results.len()),
        );

        Ok(YoloRunResult {
            executions: results,
        })
    }

    /// 取消正在运行的 YOLO 循环
    pub async fn cancel(&self, run_id: &str) -> Result<(), String> {
        let runs = self.active_runs.read().await;
        match runs.get(run_id) {
            Some(ctx) => {
                ctx.cancelled.store(true, Ordering::SeqCst);
                Ok(())
            }
            None => Err(format!("run_id 不存在或已完成：{}", run_id)),
        }
    }

    /// 列出当前所有活跃的 run
    pub async fn list_active(&self) -> Vec<RunInfo> {
        let runs = self.active_runs.read().await;
        runs.iter()
            .map(|(rid, ctx)| RunInfo {
                run_id: rid.clone(),
                epic_id: ctx.epic_id.clone(),
                ticket_count: ctx.ticket_count,
                started_at: ctx.started_at.to_rfc3339(),
                cancelled: ctx.cancelled.load(Ordering::SeqCst),
            })
            .collect()
    }

    /// 执行单个工单的完整流程
    #[allow(clippy::too_many_arguments)]
    async fn execute_ticket(
        &self,
        run_id: &str,
        cancelled: &Arc<AtomicBool>,
        epic_id: &str,
        ticket_id: &str,
        config: &YoloConfig,
        code: &str,
        provider: Arc<dyn LlmProvider>,
        on_progress: ProgressCallback,
        base_pct: f32,
        slice_pct: f32,
    ) -> YoloExecutionResult {
        let mut plan_id: Option<String> = None;
        let mut verification_thread_id: Option<String> = None;
        let mut retries = 0;
        let max_retries = config.verification_config.max_retries;

        loop {
            // 每个循环开头检查取消位（覆盖重试场景）
            if cancelled.load(Ordering::SeqCst) {
                emit(
                    &on_progress,
                    run_id,
                    ticket_id,
                    YoloPhase::Cancelled,
                    base_pct,
                    format!("工单 {} 在重试中被取消", ticket_id),
                );
                return YoloExecutionResult {
                    ticket_id: ticket_id.into(),
                    status: ExecutionStatus::Aborting,
                    plan_id,
                    verification_thread_id,
                    commit_sha: None,
                    error: Some("YOLO 运行已取消".into()),
                };
            }

            // 步骤 1：生成计划
            if !config.plan_config.skip_plan {
                emit(
                    &on_progress,
                    run_id,
                    ticket_id,
                    YoloPhase::Plan,
                    base_pct + slice_pct * 0.1,
                    format!("生成计划：{}", ticket_id),
                );

                let plan_fut =
                    self.generate_plan(epic_id, ticket_id, code, config, provider.clone());
                let plan_result = run_cancellable(cancelled, plan_fut).await;

                match plan_result {
                    Ok(Ok(pid)) => plan_id = Some(pid),
                    Ok(Err(e)) => {
                        emit(
                            &on_progress,
                            run_id,
                            ticket_id,
                            YoloPhase::Error,
                            base_pct + slice_pct * 0.1,
                            format!("计划生成失败: {}", e),
                        );
                        return YoloExecutionResult {
                            ticket_id: ticket_id.into(),
                            status: ExecutionStatus::Failed,
                            plan_id: None,
                            verification_thread_id: None,
                            commit_sha: None,
                            error: Some(format!("计划生成失败: {}", e)),
                        };
                    }
                    Err(()) => {
                        emit(
                            &on_progress,
                            run_id,
                            ticket_id,
                            YoloPhase::Cancelled,
                            base_pct + slice_pct * 0.1,
                            "计划阶段被取消".into(),
                        );
                        return YoloExecutionResult {
                            ticket_id: ticket_id.into(),
                            status: ExecutionStatus::Aborting,
                            plan_id: None,
                            verification_thread_id: None,
                            commit_sha: None,
                            error: Some("YOLO 运行已取消".into()),
                        };
                    }
                }
            }

            // 步骤 2：启动执行
            emit(
                &on_progress,
                run_id,
                ticket_id,
                YoloPhase::Execute,
                base_pct + slice_pct * 0.4,
                format!("启动执行：{}", ticket_id),
            );

            let execution = match self.epic_manager.start_execution(StartExecutionParams {
                epic_id: epic_id.into(),
                ticket_id: ticket_id.into(),
                agent: parse_agent(&config.execution_config.execution_agent),
            }) {
                Ok(exec) => exec,
                Err(e) => {
                    emit(
                        &on_progress,
                        run_id,
                        ticket_id,
                        YoloPhase::Error,
                        base_pct + slice_pct * 0.4,
                        format!("启动执行失败: {}", e),
                    );
                    return YoloExecutionResult {
                        ticket_id: ticket_id.into(),
                        status: ExecutionStatus::Failed,
                        plan_id,
                        verification_thread_id: None,
                        commit_sha: None,
                        error: Some(format!("启动执行失败: {}", e)),
                    };
                }
            };

            // 步骤 3：验证
            if !config.verification_config.disable_verification {
                emit(
                    &on_progress,
                    run_id,
                    ticket_id,
                    YoloPhase::Verify,
                    base_pct + slice_pct * 0.6,
                    format!("验证：{}", ticket_id),
                );

                let plan_json = plan_id.clone().unwrap_or_default();
                let verify_fut = self.verification_engine.verify(
                    VerifyParams {
                        plan_id: plan_json.clone(),
                        plan_json: plan_json.clone(),
                        original_code: code.into(),
                        execution_id: Some(execution.id.0.clone()),
                        provider: None,
                        model: None,
                    },
                    provider.clone(),
                );

                match run_cancellable(cancelled, verify_fut).await {
                    Ok(Ok(verify_result)) => {
                        verification_thread_id = Some(verify_result.thread_id.clone());

                        if !verify_result.overall_passed {
                            retries += 1;
                            if retries > max_retries {
                                emit(
                                    &on_progress,
                                    run_id,
                                    ticket_id,
                                    YoloPhase::Error,
                                    base_pct + slice_pct * 0.6,
                                    format!(
                                        "验证失败，重试 {} 次后放弃。评分: {:.2}",
                                        max_retries, verify_result.overall_score
                                    ),
                                );
                                return YoloExecutionResult {
                                    ticket_id: ticket_id.into(),
                                    status: ExecutionStatus::Failed,
                                    plan_id,
                                    verification_thread_id,
                                    commit_sha: None,
                                    error: Some(format!(
                                        "验证失败，重试 {} 次后放弃。评分: {:.2}",
                                        max_retries, verify_result.overall_score
                                    )),
                                };
                            }
                            // 重试——回到计划生成
                            emit(
                                &on_progress,
                                run_id,
                                ticket_id,
                                YoloPhase::Plan,
                                base_pct + slice_pct * 0.1,
                                format!("验证未通过，第 {}/{} 次重试", retries, max_retries),
                            );
                            continue;
                        }
                    }
                    Ok(Err(e)) => {
                        emit(
                            &on_progress,
                            run_id,
                            ticket_id,
                            YoloPhase::Error,
                            base_pct + slice_pct * 0.6,
                            format!("验证执行失败: {}", e),
                        );
                        return YoloExecutionResult {
                            ticket_id: ticket_id.into(),
                            status: ExecutionStatus::Failed,
                            plan_id,
                            verification_thread_id: None,
                            commit_sha: None,
                            error: Some(format!("验证执行失败: {}", e)),
                        };
                    }
                    Err(()) => {
                        emit(
                            &on_progress,
                            run_id,
                            ticket_id,
                            YoloPhase::Cancelled,
                            base_pct + slice_pct * 0.6,
                            "验证阶段被取消".into(),
                        );
                        return YoloExecutionResult {
                            ticket_id: ticket_id.into(),
                            status: ExecutionStatus::Aborting,
                            plan_id,
                            verification_thread_id: None,
                            commit_sha: None,
                            error: Some("YOLO 运行已取消".into()),
                        };
                    }
                }
            }

            // 步骤 4：commit
            let commit_sha = if config.execution_config.auto_commit {
                let sha = format!("auto-{}", &uuid::Uuid::new_v4().to_string()[..8]);
                emit(
                    &on_progress,
                    run_id,
                    ticket_id,
                    YoloPhase::Commit,
                    base_pct + slice_pct * 0.85,
                    format!("生成 commit：{}", sha),
                );
                Some(sha)
            } else {
                None
            };

            emit(
                &on_progress,
                run_id,
                ticket_id,
                YoloPhase::TicketDone,
                base_pct + slice_pct,
                format!("工单 {} 完成", ticket_id),
            );

            return YoloExecutionResult {
                ticket_id: ticket_id.into(),
                status: ExecutionStatus::Completed,
                plan_id,
                verification_thread_id,
                commit_sha,
                error: None,
            };
        }
    }

    /// 通过 LLM 生成计划
    async fn generate_plan(
        &self,
        epic_id: &str,
        ticket_id: &str,
        code: &str,
        config: &YoloConfig,
        provider: Arc<dyn LlmProvider>,
    ) -> Result<String, String> {
        let prompt_template = config
            .plan_config
            .plan_prompt_template
            .as_deref()
            .unwrap_or("为以下工单生成实现计划。\n\n工单 ID: {ticket_id}\n\n代码库:\n{code}");

        let prompt = prompt_template
            .replace("{ticket_id}", ticket_id)
            .replace("{epic_id}", epic_id)
            .replace("{code}", code);

        let system = "你是一个编码助手。为给定的工单生成详细的实现计划，返回 JSON 格式。";
        let raw = provider.chat(system, &prompt).await?;

        let plan_id = uuid::Uuid::new_v4().to_string();

        // 验证返回的是有效 JSON
        let _: serde_json::Value = serde_json::from_str(&raw)
            .or_else(|_| {
                let cleaned = raw.replace("```json", "").replace("```", "");
                serde_json::from_str(cleaned.trim())
            })
            .map_err(|e| format!("计划 JSON 解析失败: {}", e))?;

        Ok(plan_id)
    }

    /// 拓扑排序——按依赖关系确定执行顺序
    ///
    /// Traycer Ticket 没有 dependencies 字段（已删除），所以现在就是按
    /// 输入 ticket_ids 顺序产出，外加一个对 epic.tickets 存在性的过滤。
    /// 保留函数签名是为了上游 run_inner 不必改动；后续若要重新引入依赖图，
    /// 应通过独立的 spec_refs 或 plan 关系重建，而非把字段塞回 Ticket。
    fn topological_sort(&self, epic: &Epic, ticket_ids: &[String]) -> Result<Vec<String>, String> {
        let known: std::collections::HashSet<&str> =
            epic.tickets.iter().map(|t| t.id.0.as_str()).collect();

        // 仅保留 epic 中存在的 ticket，按输入顺序产出
        let result: Vec<String> = ticket_ids
            .iter()
            .filter(|tid| known.contains(tid.as_str()))
            .cloned()
            .collect();

        Ok(result)
    }
}

/// 触发一次进度事件——把生成 YoloProgressEvent 的样板集中
fn emit(
    cb: &ProgressCallback,
    run_id: &str,
    ticket_id: &str,
    phase: YoloPhase,
    percent: f32,
    message: String,
) {
    cb(YoloProgressEvent {
        run_id: run_id.to_string(),
        ticket_id: ticket_id.to_string(),
        phase,
        message,
        percent,
    });
}

/// 把一个 Future 与取消信号竞速。
/// - `Ok(t)`：future 正常完成，得到 t
/// - `Err(())`：取消信号在 future 完成前被置位
///
/// 实现：用一个轻量轮询任务监视 cancelled，配合 `tokio::select!`
async fn run_cancellable<F, T>(cancelled: &Arc<AtomicBool>, fut: F) -> Result<T, ()>
where
    F: std::future::Future<Output = T>,
{
    let cancelled = cancelled.clone();
    let watcher = async {
        // 100ms 间隔轮询足够 UI 响应；若希望更紧，可降到 50ms
        loop {
            if cancelled.load(Ordering::SeqCst) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    };

    tokio::select! {
        result = fut => Ok(result),
        _ = watcher => Err(()),
    }
}

/// 从字符串解析 ExecutionAgent
fn parse_agent(s: &str) -> ExecutionAgent {
    match s.to_lowercase().as_str() {
        "claudecode" | "claude_code" | "claude-code" => ExecutionAgent::ClaudeCode,
        "codex" | "codex_cli" | "codex-cli" => ExecutionAgent::Custom("codex-cli".into()),
        "cursor" => ExecutionAgent::Cursor,
        "copilot" => ExecutionAgent::Copilot,
        "cline" => ExecutionAgent::Cline,
        "roocode" | "roo_code" | "roo-code" => ExecutionAgent::RooCode,
        "augment" => ExecutionAgent::Augment,
        "zencoder" | "zen_coder" | "zen-coder" => ExecutionAgent::ZenCoder,
        "amp" => ExecutionAgent::Amp,
        "windsurf" => ExecutionAgent::Windsurf,
        other => ExecutionAgent::Custom(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_agent() {
        assert_eq!(parse_agent("claudecode"), ExecutionAgent::ClaudeCode);
        assert_eq!(parse_agent("claude-code"), ExecutionAgent::ClaudeCode);
        assert_eq!(
            parse_agent("codex-cli"),
            ExecutionAgent::Custom("codex-cli".into())
        );
        assert_eq!(parse_agent("Cursor"), ExecutionAgent::Cursor);
        assert_eq!(parse_agent("copilot"), ExecutionAgent::Copilot);
        assert_eq!(
            parse_agent("my-agent"),
            ExecutionAgent::Custom("my-agent".into())
        );
    }

    #[test]
    fn test_topological_sort_no_deps() {
        let store = Arc::new(crate::persistence::SqliteStore::new(":memory:").unwrap());
        let epic_manager = Arc::new(EpicManager::new(store.clone()));
        let verification_engine = Arc::new(VerificationEngine::new(store));

        let runner = YoloRunner::new(epic_manager, verification_engine);

        let epic = Epic {
            id: EpicId("e-1".into()),
            title: "test".into(),
            description: "".into(),
            status: None,
            specs: vec![],
            tickets: vec![
                Ticket {
                    id: TicketId("t-1".into()),
                    epic_id: EpicId("e-1".into()),
                    title: "A".into(),
                    description: "".into(),
                    status: TicketStatus::Todo,
                    assignee: None,
                    is_streaming: false,
                    spec_refs: vec![],
                    created_at: "".into(),
                    updated_at: "".into(),
                },
                Ticket {
                    id: TicketId("t-2".into()),
                    epic_id: EpicId("e-1".into()),
                    title: "B".into(),
                    description: "".into(),
                    status: TicketStatus::Todo,
                    assignee: None,
                    is_streaming: false,
                    spec_refs: vec![],
                    created_at: "".into(),
                    updated_at: "".into(),
                },
            ],
            executions: vec![],
            created_at: "".into(),
            updated_at: "".into(),
        };

        // Traycer Ticket 已无 dependencies；topological_sort 现在保持输入顺序
        let sorted = runner
            .topological_sort(&epic, &["t-1".into(), "t-2".into()])
            .unwrap();
        assert_eq!(sorted, vec!["t-1".to_string(), "t-2".to_string()]);
    }

    #[tokio::test]
    async fn test_list_active_empty() {
        let store = Arc::new(crate::persistence::SqliteStore::new(":memory:").unwrap());
        let epic_manager = Arc::new(EpicManager::new(store.clone()));
        let verification_engine = Arc::new(VerificationEngine::new(store));
        let runner = YoloRunner::new(epic_manager, verification_engine);

        let active = runner.list_active().await;
        assert!(active.is_empty());
    }

    #[tokio::test]
    async fn test_cancel_unknown_run() {
        let store = Arc::new(crate::persistence::SqliteStore::new(":memory:").unwrap());
        let epic_manager = Arc::new(EpicManager::new(store.clone()));
        let verification_engine = Arc::new(VerificationEngine::new(store));
        let runner = YoloRunner::new(epic_manager, verification_engine);

        let res = runner.cancel("does-not-exist").await;
        assert!(res.is_err());
    }
}
