use async_trait::async_trait;
use futures::StreamExt;
use serde::{Deserialize, Serialize};

use super::{LlmConfig, LlmProvider, StreamChunk};

#[derive(Debug, Clone)]
pub struct OpenAiProvider {
    config: LlmConfig,
    client: reqwest::Client,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

/// 非流式响应
#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

/// 流式 SSE 响应中的 data JSON
#[derive(Deserialize)]
struct ChatStreamResponse {
    choices: Vec<ChatStreamChoice>,
}

#[derive(Deserialize)]
struct ChatStreamChoice {
    delta: ChatStreamDelta,
}

#[derive(Deserialize)]
struct ChatStreamDelta {
    #[serde(default)]
    content: Option<String>,
}

impl OpenAiProvider {
    pub fn new(config: LlmConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }

    /// 构建消息列表
    fn build_messages(system: &str, user: &str) -> Vec<ChatMessage> {
        vec![
            ChatMessage {
                role: "system".into(),
                content: system.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user.into(),
            },
        ]
    }

    /// 添加 Authorization header（如果配置了 api_key）
    fn authorize(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self.config.api_key {
            Some(ref key) => req.header("Authorization", format!("Bearer {}", key)),
            None => req,
        }
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    fn id(&self) -> &str {
        "openai"
    }

    fn name(&self) -> &str {
        "OpenAI Compatible"
    }

    fn models(&self) -> Vec<String> {
        vec![
            "gpt-4o".into(),
            "gpt-4o-mini".into(),
            "gpt-4-turbo".into(),
            "deepseek-chat".into(),
            "deepseek-coder".into(),
            "claude-3-5-sonnet".into(),
            "mimo-v2-pro".into(),
        ]
    }

    fn is_local(&self) -> bool {
        false
    }

    async fn chat(&self, system: &str, user: &str) -> Result<String, String> {
        let url = build_chat_url(&self.config.endpoint);
        let body = ChatRequest {
            model: self.config.model.clone(),
            messages: Self::build_messages(system, user),
            stream: false,
            temperature: self.config.temperature,
            max_tokens: self.config.max_tokens,
        };

        let req = self.authorize(self.client.post(&url).json(&body));

        let resp = req
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("OpenAI error {}: {}", status, text));
        }

        let chat_resp: ChatResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

        chat_resp
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .ok_or_else(|| "No response from OpenAI".into())
    }

    async fn chat_stream(
        &self,
        system: &str,
        user: &str,
        sender: tokio::sync::mpsc::Sender<StreamChunk>,
    ) -> Result<String, String> {
        let url = build_chat_url(&self.config.endpoint);
        let body = ChatRequest {
            model: self.config.model.clone(),
            messages: Self::build_messages(system, user),
            stream: true,
            temperature: self.config.temperature,
            max_tokens: self.config.max_tokens,
        };

        let req = self.authorize(self.client.post(&url).json(&body));

        let resp = req
            .send()
            .await
            .map_err(|e| format!("OpenAI stream request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("OpenAI stream error {}: {}", status, text));
        }

        let mut full_response = String::new();
        let mut byte_stream = resp.bytes_stream();
        // SSE 格式可能跨 chunk 分割，用 buffer 拼接不完整的行
        let mut line_buffer = String::new();

        while let Some(chunk_result) = byte_stream.next().await {
            let chunk_bytes =
                chunk_result.map_err(|e| format!("OpenAI stream read error: {}", e))?;

            let chunk_text = String::from_utf8_lossy(&chunk_bytes);
            line_buffer.push_str(&chunk_text);

            // 按换行符切分，处理完整行
            while let Some(newline_pos) = line_buffer.find('\n') {
                let line: String = line_buffer.drain(..=newline_pos).collect();
                let line = line.trim();

                if line.is_empty() {
                    continue;
                }

                // SSE 格式: "data: {...}" 或 "data: [DONE]"
                if let Some(data) = line.strip_prefix("data:") {
                    let data = data.trim();

                    if data == "[DONE]" {
                        let _ = sender
                            .send(StreamChunk {
                                delta: String::new(),
                                done: true,
                            })
                            .await;
                        return Ok(full_response);
                    }

                    match serde_json::from_str::<ChatStreamResponse>(data) {
                        Ok(stream_resp) => {
                            if let Some(choice) = stream_resp.choices.first() {
                                if let Some(ref content) = choice.delta.content {
                                    if !content.is_empty() {
                                        full_response.push_str(content);
                                        let _ = sender
                                            .send(StreamChunk {
                                                delta: content.clone(),
                                                done: false,
                                            })
                                            .await;
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!(
                                "OpenAI stream JSON parse error: {} (data: {})",
                                e,
                                data
                            );
                        }
                    }
                }
                // 忽略非 "data:" 开头的 SSE 行（如 "event:", "id:", "retry:" 等）
            }
        }

        // 处理 buffer 中可能残留的最后一行
        let remaining = line_buffer.trim();
        if !remaining.is_empty() {
            if let Some(data) = remaining.strip_prefix("data:") {
                let data = data.trim();
                if data != "[DONE]" {
                    if let Ok(stream_resp) = serde_json::from_str::<ChatStreamResponse>(data) {
                        if let Some(choice) = stream_resp.choices.first() {
                            if let Some(ref content) = choice.delta.content {
                                if !content.is_empty() {
                                    full_response.push_str(content);
                                    let _ = sender
                                        .send(StreamChunk {
                                            delta: content.clone(),
                                            done: false,
                                        })
                                        .await;
                                }
                            }
                        }
                    }
                }
            }
        }

        // 流结束但未收到 [DONE]，仍然发送终止 chunk
        let _ = sender
            .send(StreamChunk {
                delta: String::new(),
                done: true,
            })
            .await;

        Ok(full_response)
    }
}

/// 用户配的 endpoint 风格各异，统一拼成 `<base>/chat/completions`：
/// - `https://api.openai.com`        → `https://api.openai.com/v1/chat/completions`
/// - `https://api.openai.com/v1`     → `https://api.openai.com/v1/chat/completions`
/// - `https://api.z.ai/api/paas/v4`  → `https://api.z.ai/api/paas/v4/chat/completions`
/// - 末尾已带 `/chat/completions`     → 原样返回
fn build_chat_url(endpoint: &str) -> String {
    let trimmed = endpoint.trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        return trimmed.to_string();
    }
    // endpoint 已经包含版本号段（/v1 /v2 ... /v9 或 /paas/v\d+），直接拼 /chat/completions
    let has_version_segment = trimmed
        .rsplit('/')
        .next()
        .map(|seg| {
            seg.starts_with('v') && seg.len() >= 2 && seg[1..].chars().all(|c| c.is_ascii_digit())
        })
        .unwrap_or(false);
    if has_version_segment {
        format!("{}/chat/completions", trimmed)
    } else {
        format!("{}/v1/chat/completions", trimmed)
    }
}

#[cfg(test)]
mod tests {
    use super::build_chat_url;

    #[test]
    fn build_chat_url_variants() {
        assert_eq!(
            build_chat_url("https://api.openai.com"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            build_chat_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            build_chat_url("https://api.openai.com/v1/"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            build_chat_url("https://api.z.ai/api/paas/v4"),
            "https://api.z.ai/api/paas/v4/chat/completions"
        );
        assert_eq!(
            build_chat_url("https://api.z.ai/api/paas/v4/chat/completions"),
            "https://api.z.ai/api/paas/v4/chat/completions"
        );
    }
}
