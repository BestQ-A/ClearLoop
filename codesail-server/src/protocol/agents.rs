use serde::{Deserialize, Serialize};

use super::epic::{ExecutionStatus, Ticket};

/// 代理配置——描述一个可用的编码代理
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub agent_type: AgentType,
    /// CLI 代理的启动命令
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// API 代理的端点地址
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    /// 代理支持的能力列表
    #[serde(default)]
    pub capabilities: Vec<String>,
}

/// 代理类型枚举——覆盖主流编码代理
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    ClaudeCode,
    Cursor,
    Copilot,
    Cline,
    RooCode,
    Augment,
    ZenCoder,
    Amp,
    Windsurf,
    Custom,
}

/// 交接载荷——传递给目标代理的完整上下文
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffPayload {
    pub ticket: Ticket,
    pub plan_snapshot: String,
    pub context_files: Vec<FileContext>,
    pub instructions: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_prompt: Option<String>,
}

/// 文件上下文——提供给代理的源文件内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContext {
    pub path: String,
    pub content: String,
    pub language: String,
}

/// 交接结果——代理执行完成后的返回值
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffResult {
    pub agent_id: String,
    pub execution_id: String,
    pub status: ExecutionStatus,
    pub files_changed: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
}

/// 模型配置——控制不同工作流步骤使用哪个 LLM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelProfile {
    pub id: String,
    pub name: String,
    pub profile_type: ModelProfileType,
    pub step_overrides: ModelProfileStepOverrides,
}

/// 模型配置档次
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ModelProfileType {
    Balanced,
    Frontier,
    Eco,
}

/// 工作流步骤级别的模型覆盖
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelProfileStepOverrides {
    /// 计划生成步骤使用的模型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_generation: Option<String>,
    /// 计划迭代步骤使用的模型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_iteration: Option<String>,
    /// 代码审查步骤使用的模型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review: Option<String>,
    /// 验证步骤使用的模型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification: Option<String>,
    /// 编排步骤使用的模型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orchestration: Option<String>,
}

impl Default for ModelProfileStepOverrides {
    fn default() -> Self {
        Self {
            plan_generation: None,
            plan_iteration: None,
            review: None,
            verification: None,
            orchestration: None,
        }
    }
}
