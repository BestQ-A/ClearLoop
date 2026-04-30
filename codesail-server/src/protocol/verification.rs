use serde::{Deserialize, Serialize};

/// 验证线程——对齐 Traycer ThreadStatus 二态（open ↔ resolved）+ isDetached 警示
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationThread {
    pub id: String,
    pub plan_id: String,
    pub comments: Vec<VerificationComment>,
    pub status: ThreadStatus,
    /// Traycer 警示位：是否已与原始 plan/spec 脱离
    #[serde(default)]
    pub is_detached: bool,
    pub created_at: String,
}

/// Traycer 真实二态（lowercase 序列化）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ThreadStatus {
    Open,
    Resolved,
}

/// 单条验证评论
///
/// 注：`severity` / `category` / `prompt_for_ai_agent` / `is_applied` 这几个字段
/// 在 Traycer proto 里属于 ReviewComment 模型（用于 CommentNavigator 侧边栏 review 流），
/// 不应在 EpicBoard 上渲染。在 codesail-server 的协议层保留这些字段是为了序列化兼容
/// CommentNavigator UI 的输入；EpicBoard UI 应忽略它们。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationComment {
    pub id: String,
    pub title: String,
    pub description: String,
    pub severity: Severity,
    pub category: ReviewCategory,
    pub referred_files: Vec<String>,
    pub prompt_for_ai_agent: String,
    pub is_applied: bool,
    pub created_at: String,
}

/// 严重级别——复用 protocol::Severity 的语义但独立定义以避免跨模块耦合
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Severity {
    Minor,
    Major,
    Critical,
}

/// 审查分类——对应 Traycer verification.proto 的五大维度
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewCategory {
    Bug,
    Security,
    Performance,
    Clarity,
    Architecture,
}

// === 验证请求/响应 ===

/// 发起验证请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyParams {
    pub plan_id: String,
    pub plan_json: String,
    pub original_code: String,
    #[serde(default)]
    pub execution_id: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

/// 验证结果——包含线程列表和总体评分
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyResult {
    pub thread_id: String,
    pub plan_id: String,
    pub threads: Vec<VerificationThread>,
    pub overall_passed: bool,
    pub overall_score: f32,
    pub prompt_for_ai_agent: String,
}

/// 重新验证请求——用于修复后的增量校验
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReVerifyParams {
    pub thread_id: String,
    pub updated_code: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}
