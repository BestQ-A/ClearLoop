use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub mod ollama;
pub mod openai;

#[derive(Debug, Clone)]
pub struct LlmConfig {
    pub endpoint: String,
    pub model: String,
    pub api_key: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

/// 流式输出的单个分片
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    /// 增量文本内容
    pub delta: String,
    /// 是否为最后一个分片
    pub done: bool,
}

#[async_trait]
pub trait LlmProvider: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn models(&self) -> Vec<String>;
    fn is_local(&self) -> bool;

    /// 非流式对话，返回完整响应
    async fn chat(&self, system: &str, user: &str) -> Result<String, String>;

    /// 流式对话，逐 token 通过 sender 发送 StreamChunk。
    /// 返回累积的完整响应文本。
    /// 默认实现回退到 `chat()`，将完整结果作为单个 chunk 发送。
    async fn chat_stream(
        &self,
        system: &str,
        user: &str,
        sender: tokio::sync::mpsc::Sender<StreamChunk>,
    ) -> Result<String, String> {
        let response = self.chat(system, user).await?;
        // 将完整响应作为一个 chunk 发送，忽略发送失败（接收端可能已关闭）
        let _ = sender
            .send(StreamChunk {
                delta: response.clone(),
                done: false,
            })
            .await;
        let _ = sender
            .send(StreamChunk {
                delta: String::new(),
                done: true,
            })
            .await;
        Ok(response)
    }
}
