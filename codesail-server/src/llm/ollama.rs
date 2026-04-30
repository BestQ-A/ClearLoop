use async_trait::async_trait;
use futures::StreamExt;
use serde::{Deserialize, Serialize};

use super::{LlmConfig, LlmProvider, StreamChunk};

#[derive(Debug, Clone)]
pub struct OllamaProvider {
    config: LlmConfig,
    client: reqwest::Client,
}

#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<OllamaOptions>,
}

#[derive(Serialize)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
}

#[derive(Serialize, Deserialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: OllamaMessage,
}

/// Ollama 流式响应的单行 JSON 结构
#[derive(Deserialize)]
struct OllamaStreamLine {
    #[serde(default)]
    message: Option<OllamaMessage>,
    #[serde(default)]
    done: bool,
}

impl OllamaProvider {
    pub fn new(config: LlmConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }

    /// 构建 Ollama options（temperature / max_tokens）
    fn build_options(&self) -> Option<OllamaOptions> {
        if self.config.temperature.is_none() && self.config.max_tokens.is_none() {
            return None;
        }
        Some(OllamaOptions {
            temperature: self.config.temperature,
            num_predict: self.config.max_tokens,
        })
    }

    /// 构建消息列表
    fn build_messages(system: &str, user: &str) -> Vec<OllamaMessage> {
        vec![
            OllamaMessage {
                role: "system".into(),
                content: system.into(),
            },
            OllamaMessage {
                role: "user".into(),
                content: user.into(),
            },
        ]
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    fn id(&self) -> &str {
        "ollama"
    }

    fn name(&self) -> &str {
        "Ollama"
    }

    fn models(&self) -> Vec<String> {
        vec![
            "qwen3.5:9b".into(),
            "qwen2.5-coder".into(),
            "qwen2.5-coder:32b".into(),
            "deepseek-coder-v2".into(),
            "deepseek-coder-v2:16b".into(),
            "codellama".into(),
            "codellama:34b".into(),
            "llama3.1".into(),
            "llama3.1:70b".into(),
            "mistral".into(),
        ]
    }

    fn is_local(&self) -> bool {
        true
    }

    async fn chat(&self, system: &str, user: &str) -> Result<String, String> {
        let url = format!("{}/api/chat", self.config.endpoint);
        let body = OllamaChatRequest {
            model: self.config.model.clone(),
            messages: Self::build_messages(system, user),
            stream: false,
            options: self.build_options(),
        };

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Ollama error {}: {}", status, text));
        }

        let chat_resp: OllamaChatResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

        Ok(chat_resp.message.content)
    }

    async fn chat_stream(
        &self,
        system: &str,
        user: &str,
        sender: tokio::sync::mpsc::Sender<StreamChunk>,
    ) -> Result<String, String> {
        let url = format!("{}/api/chat", self.config.endpoint);
        let body = OllamaChatRequest {
            model: self.config.model.clone(),
            messages: Self::build_messages(system, user),
            stream: true,
            options: self.build_options(),
        };

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama stream request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Ollama stream error {}: {}", status, text));
        }

        let mut full_response = String::new();
        let mut byte_stream = resp.bytes_stream();
        // Ollama 的流式响应是换行分隔的 JSON，可能一个 chunk 包含多行或跨 chunk 断行，
        // 因此需要用 buffer 拼接不完整的行。
        let mut line_buffer = String::new();

        while let Some(chunk_result) = byte_stream.next().await {
            let chunk_bytes = chunk_result
                .map_err(|e| format!("Ollama stream read error: {}", e))?;

            let chunk_text = String::from_utf8_lossy(&chunk_bytes);
            line_buffer.push_str(&chunk_text);

            // 按换行符切分，处理完整行
            while let Some(newline_pos) = line_buffer.find('\n') {
                let line: String = line_buffer.drain(..=newline_pos).collect();
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }

                match serde_json::from_str::<OllamaStreamLine>(line) {
                    Ok(stream_line) => {
                        if stream_line.done {
                            // 流结束
                            let _ = sender
                                .send(StreamChunk {
                                    delta: String::new(),
                                    done: true,
                                })
                                .await;
                            return Ok(full_response);
                        }

                        if let Some(msg) = stream_line.message {
                            if !msg.content.is_empty() {
                                full_response.push_str(&msg.content);
                                let _ = sender
                                    .send(StreamChunk {
                                        delta: msg.content,
                                        done: false,
                                    })
                                    .await;
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Ollama stream JSON parse error: {} (line: {})", e, line);
                    }
                }
            }
        }

        // 处理 buffer 中可能残留的最后一行（无换行符结尾）
        let remaining = line_buffer.trim();
        if !remaining.is_empty() {
            if let Ok(stream_line) = serde_json::from_str::<OllamaStreamLine>(remaining) {
                if let Some(msg) = stream_line.message {
                    if !msg.content.is_empty() {
                        full_response.push_str(&msg.content);
                        let _ = sender
                            .send(StreamChunk {
                                delta: msg.content,
                                done: false,
                            })
                            .await;
                    }
                }
            }
        }

        // 流意外结束但未收到 done:true，仍然发送终止 chunk
        let _ = sender
            .send(StreamChunk {
                delta: String::new(),
                done: true,
            })
            .await;

        Ok(full_response)
    }
}
