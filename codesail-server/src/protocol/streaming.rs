use std::fmt;

use serde::{Deserialize, Serialize};

use super::{FileChange, PlanStep, ValidationComment};

/// 流式事件——涵盖从 token 级别到阶段级别的所有通知类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum StreamEvent {
    /// 逐 token 输出
    Token { text: String },
    /// 思考步骤开始
    ThinkingStart { step_title: String },
    /// 思考步骤结束
    ThinkingEnd { step_id: String },
    /// 计划生成开始
    PlanStart { task_name: String },
    /// 计划中的一步
    PlanStep { step: PlanStep },
    /// 验证开始
    ValidationStart,
    /// 验证评论
    ValidationComment { comment: ValidationComment },
    /// 代码生成开始（指定文件）
    GenerationStart { file_path: String },
    /// 代码生成完成
    GenerationComplete { file_change: FileChange },
    /// 阶段进度
    Progress {
        phase: String,
        percent: f32,
        message: String,
    },
    /// 错误
    Error { code: i32, message: String },
    /// 完成信号
    Done { result_type: String },
    /// 通用扩展事件——给 Epic Chat 这类需要自定义 wire-format 的链路用。
    /// `event_type` 即对外的字符串名（`epicFieldAppend` / `epicFieldAdded` / `epicFinal`），
    /// `payload` 是结构化的事件载荷（任意 JSON）。
    ///
    /// 序列化为 `{"type":"Custom","data":{"eventType":"...","payload":{...}}}`。
    Custom {
        #[serde(rename = "eventType")]
        event_type: String,
        payload: serde_json::Value,
    },
}

/// 流式消息封装——添加序号和时间戳
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamMessage {
    pub id: u64,
    pub event: StreamEvent,
    pub timestamp: String,
}

/// 将 StreamEvent 序列化为 JSON 行（NDJSON 协议）
impl fmt::Display for StreamEvent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match serde_json::to_string(self) {
            Ok(json) => write!(f, "{}", json),
            Err(e) => write!(
                f,
                "{{\"type\":\"Error\",\"data\":{{\"code\":-1,\"message\":\"序列化失败: {}\"}}}}",
                e
            ),
        }
    }
}

impl fmt::Display for StreamMessage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match serde_json::to_string(self) {
            Ok(json) => write!(f, "{}", json),
            Err(e) => write!(f, "{{\"error\":\"序列化失败: {}\"}}", e),
        }
    }
}

/// JSON-RPC 通知（无 id 字段）——用于流式推送
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    pub params: StreamMessage,
}

/// 创建一条流式 JSON-RPC 通知
pub fn make_stream_notification(message: StreamMessage) -> JsonRpcNotification {
    JsonRpcNotification {
        jsonrpc: "2.0".into(),
        method: "stream".into(),
        params: message,
    }
}

/// 便捷函数：从事件+序号创建完整的通知消息
pub fn make_stream_event_notification(
    id: u64,
    event: StreamEvent,
    timestamp: String,
) -> JsonRpcNotification {
    make_stream_notification(StreamMessage {
        id,
        event,
        timestamp,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stream_event_display_token() {
        let event = StreamEvent::Token {
            text: "hello".into(),
        };
        let s = format!("{}", event);
        assert!(s.contains("Token"));
        assert!(s.contains("hello"));
    }

    #[test]
    fn test_stream_event_display_progress() {
        let event = StreamEvent::Progress {
            phase: "planning".into(),
            percent: 0.5,
            message: "正在生成计划".into(),
        };
        let s = format!("{}", event);
        assert!(s.contains("Progress"));
        assert!(s.contains("0.5"));
    }

    #[test]
    fn test_make_stream_notification() {
        let msg = StreamMessage {
            id: 1,
            event: StreamEvent::Done {
                result_type: "plan".into(),
            },
            timestamp: "2026-04-30T00:00:00Z".into(),
        };
        let notif = make_stream_notification(msg);
        assert_eq!(notif.jsonrpc, "2.0");
        assert_eq!(notif.method, "stream");
        assert_eq!(notif.params.id, 1);
    }

    #[test]
    fn test_stream_event_roundtrip() {
        let event = StreamEvent::Error {
            code: -32603,
            message: "内部错误".into(),
        };
        let json = serde_json::to_string(&event).unwrap();
        let parsed: StreamEvent = serde_json::from_str(&json).unwrap();
        if let StreamEvent::Error { code, message } = parsed {
            assert_eq!(code, -32603);
            assert_eq!(message, "内部错误");
        } else {
            panic!("反序列化类型不匹配");
        }
    }
}
