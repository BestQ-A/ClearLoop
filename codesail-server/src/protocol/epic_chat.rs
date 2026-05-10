//! Traycer 风格的多轮对话协议（Epic Chat）。
//!
//! 与原有 `plan/validate/generate` 的 JSON-only 契约不同，Traycer
//! 真实工作流是 step → step 的多轮 markdown 对话——server 每轮
//! 输出"有序字段流"（markdown 段落 + interview 问题 + tickets +
//! nextSteps），前端按字段顺序渲染。
//!
//! 协议契约：
//! - 请求 `EpicChatRequest`：携带 conversation_id（首轮可空，server 补）、
//!   workflow（plan / refactoring / agile）、current_step（plan / plan-validation / ...）、
//!   user_prompt 以及历史轮次 previous_turns。
//! - 响应 `EpicOutput`：扁平 ordered_fields 列表，每个字段是带 type 标签的枚举。
//!
//! serde 命名约定：所有结构体用 `camelCase`，枚举用 `tag = "type"` +
//! `rename_all = "camelCase"`，与前端 TS 端保持一致。

use serde::{Deserialize, Serialize};

use super::agents::HandoffPayload;
use super::epic::Ticket;

// === 请求 / 历史 ===

/// 单轮对话记录——按时间顺序拼成 previous_turns。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    /// "user" | "assistant"
    pub role: String,
    /// 该轮所属 step（命令名），用于 LLM 区分语境
    pub step: String,
    /// 该轮 markdown 文本（assistant 是模型输出，user 是用户原话）
    pub markdown: String,
    /// ISO-8601 时间戳
    pub timestamp: String,
}

/// 多轮对话请求——前端每次切 step 或追加 user 消息时发起。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicChatRequest {
    /// 首轮可为 None，server 自行生成
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    /// "plan" | "refactoring" | "agile"
    pub workflow: String,
    /// 例如 "plan" | "plan-validation" | "ticket-breakdown"
    pub current_step: String,
    /// 用户本轮 prompt
    pub user_prompt: String,
    #[serde(default)]
    pub previous_turns: Vec<Turn>,
    /// 可选 provider 覆盖（沿用其它 RPC 的惯例）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

// === 输出 ===

/// 一次 chat 的完整有序字段集合——前端按 ordered_fields 顺序渲染。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicOutput {
    pub conversation_id: String,
    pub step: String,
    pub ordered_fields: Vec<OrderedField>,
}

/// 有序字段——带 type discriminator 的多态枚举（Traycer wire format）。
///
/// 序列化形如：
/// - `{"type": "markdown", "content": "..."}`
/// - `{"type": "interview", "question": {...}}`
/// - `{"type": "ticketsGroup", "tickets": [...]}`
/// - `{"type": "nextSteps", "options": [...]}`
/// - `{"type": "executionRequests", "requests": [...]}`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum OrderedField {
    Markdown { content: String },
    Interview { question: Question },
    TicketsGroup { tickets: Vec<Ticket> },
    NextSteps { options: Vec<NextStepOption> },
    ExecutionRequests { requests: Vec<HandoffPayload> },
}

/// Interview 问题——前端弹卡片让用户选项 / 多选。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub multiselect: bool,
}

/// 下一步候选——来自 step .md frontmatter 的 nextSteps 列表。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextStepOption {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordered_field_markdown_tag() {
        let f = OrderedField::Markdown {
            content: "hi".into(),
        };
        let s = serde_json::to_string(&f).unwrap();
        assert!(s.contains("\"type\":\"markdown\""));
        assert!(s.contains("\"content\":\"hi\""));
    }

    #[test]
    fn ordered_field_next_steps_tag() {
        let f = OrderedField::NextSteps {
            options: vec![NextStepOption {
                name: "plan-validation".into(),
                description: None,
            }],
        };
        let s = serde_json::to_string(&f).unwrap();
        assert!(s.contains("\"type\":\"nextSteps\""));
        assert!(s.contains("plan-validation"));
    }

    #[test]
    fn epic_chat_request_camel_case() {
        let req = EpicChatRequest {
            conversation_id: None,
            workflow: "plan".into(),
            current_step: "plan".into(),
            user_prompt: "hi".into(),
            previous_turns: vec![],
            provider: None,
            model: None,
        };
        let s = serde_json::to_string(&req).unwrap();
        assert!(s.contains("\"currentStep\":\"plan\""));
        assert!(s.contains("\"userPrompt\":\"hi\""));
        assert!(s.contains("\"previousTurns\":[]"));
    }
}
