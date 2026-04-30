use serde::{Deserialize, Serialize};

use super::epic::ExecutionStatus;
use super::verification::Severity;

/// YOLO 全自动配置——控制计划、验证、执行三个阶段的行为
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YoloConfig {
    pub plan_config: PlanYoloConfig,
    pub verification_config: VerificationYoloConfig,
    pub execution_config: ExecutionYoloConfig,
}

/// 计划阶段配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanYoloConfig {
    /// 跳过计划生成，直接执行
    pub skip_plan: bool,
    /// 自定义计划 prompt 模板
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_prompt_template: Option<String>,
    /// 自动批准计划（不等人工审批）
    pub auto_approve: bool,
}

/// 验证阶段配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationYoloConfig {
    /// 完全跳过验证
    pub disable_verification: bool,
    /// 低于此严重级别的问题自动忽略
    pub severity_threshold: Severity,
    /// 验证失败时最大重试次数
    pub max_retries: u32,
    /// 自动修复验证发现的问题
    pub auto_fix: bool,
}

/// 执行阶段配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionYoloConfig {
    /// 目标代理标识符
    pub execution_agent: String,
    /// 超时时间（分钟）
    pub timeout_minutes: u32,
    /// 执行成功后自动提交
    pub auto_commit: bool,
    /// 自定义 commit message 模板
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_message_template: Option<String>,
}

// === YOLO 运行请求/响应 ===

/// YOLO 运行请求——批量执行多个工单
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YoloRunParams {
    pub epic_id: String,
    pub ticket_ids: Vec<String>,
    pub config: YoloConfig,
    pub code: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

/// YOLO 运行结果——汇总所有工单的执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YoloRunResult {
    pub executions: Vec<YoloExecutionResult>,
}

/// 单个工单的 YOLO 执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YoloExecutionResult {
    pub ticket_id: String,
    pub status: ExecutionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// === 默认配置 ===

impl Default for YoloConfig {
    fn default() -> Self {
        Self {
            plan_config: PlanYoloConfig {
                skip_plan: false,
                plan_prompt_template: None,
                auto_approve: false,
            },
            verification_config: VerificationYoloConfig {
                disable_verification: false,
                severity_threshold: Severity::Major,
                max_retries: 2,
                auto_fix: false,
            },
            execution_config: ExecutionYoloConfig {
                execution_agent: "claudecode".into(),
                timeout_minutes: 30,
                auto_commit: false,
                commit_message_template: None,
            },
        }
    }
}

impl Default for PlanYoloConfig {
    fn default() -> Self {
        Self {
            skip_plan: false,
            plan_prompt_template: None,
            auto_approve: false,
        }
    }
}

impl Default for VerificationYoloConfig {
    fn default() -> Self {
        Self {
            disable_verification: false,
            severity_threshold: Severity::Major,
            max_retries: 2,
            auto_fix: false,
        }
    }
}

impl Default for ExecutionYoloConfig {
    fn default() -> Self {
        Self {
            execution_agent: "claudecode".into(),
            timeout_minutes: 30,
            auto_commit: false,
            commit_message_template: None,
        }
    }
}
