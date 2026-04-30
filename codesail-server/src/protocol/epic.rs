use serde::{Deserialize, Serialize};

// === 标识符（Traycer 通用寻址系统） ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct EpicId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct SpecId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct TicketId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct ExecutionId(pub String);

/// 工件标识符——通过带标签的枚举实现多态寻址
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ArtifactIdentifier {
    Epic {
        epic_id: EpicId,
    },
    Spec {
        epic_id: EpicId,
        spec_id: SpecId,
    },
    Ticket {
        epic_id: EpicId,
        ticket_id: TicketId,
    },
    Execution {
        epic_id: EpicId,
        execution_id: ExecutionId,
    },
}

// === Epic ===

/// 顶层工作容器——包含需求文档、工单和执行记录
///
/// 对齐 Traycer：proto 中 Epic.status 是裸 string，不是强类型枚举。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Epic {
    pub id: EpicId,
    pub title: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    pub specs: Vec<Spec>,
    pub tickets: Vec<Ticket>,
    pub executions: Vec<Execution>,
    pub created_at: String,
    pub updated_at: String,
}

// === Spec（需求文档） ===

/// 需求/设计文档——绑定到某个 Epic
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Spec {
    pub id: SpecId,
    pub epic_id: EpicId,
    pub title: String,
    pub content: String,
    pub spec_type: SpecType,
    pub status: SpecStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SpecType {
    Prd,
    Technical,
    Architecture,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SpecStatus {
    Draft,
    Review,
    Approved,
    Outdated,
}

// === Ticket（工单） ===

/// 最小可执行工作单元——对齐 Traycer 模型
///
/// 字段对齐说明：
/// - `assignee`：Traycer 字段名（CodeSail 旧版叫 assigned_agent）
/// - `is_streaming`：Traycer 流式 UI 标识
/// - 不存在的字段（priority / dependencies / labels / estimated_effort）已删除
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ticket {
    pub id: TicketId,
    pub epic_id: EpicId,
    pub title: String,
    pub description: String,
    pub status: TicketStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(default)]
    pub is_streaming: bool,
    pub spec_refs: Vec<SpecId>,
    pub created_at: String,
    pub updated_at: String,
}

/// Traycer 真实三态：TICKET_TODO / TICKET_IN_PROGRESS / TICKET_DONE
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TicketStatus {
    #[serde(rename = "TICKET_TODO")]
    Todo,
    #[serde(rename = "TICKET_IN_PROGRESS")]
    InProgress,
    #[serde(rename = "TICKET_DONE")]
    Done,
}

// === Execution（Agent 执行记录） ===

/// 一次代理执行的完整记录——从计划快照到提交元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Execution {
    pub id: ExecutionId,
    pub epic_id: EpicId,
    pub ticket_id: TicketId,
    pub agent: ExecutionAgent,
    pub status: ExecutionStatus,
    pub plan_snapshot: Option<String>,
    /// 验证线程 ID 列表
    pub verification_threads: Vec<String>,
    pub commit_metadata: Option<CommitMetadata>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionAgent {
    ClaudeCode,
    Cursor,
    Copilot,
    Cline,
    RooCode,
    Augment,
    ZenCoder,
    Amp,
    Windsurf,
    Custom(String),
}

/// Execution 状态——完全照搬 Traycer 的 10 态枚举（命名也照抄）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExecutionStatus {
    NotStarted,
    WaitingForExecution,
    InProgress,
    Aborting,
    Completed,
    Skipped,
    Failed,
    RateLimited,
    StepInsufficientCredits,
    StepOrgBundleInsufficient,
}

/// Git 提交元数据——记录变更的 SHA、分支和文件列表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitMetadata {
    pub sha: String,
    pub branch: String,
    pub message: String,
    pub files_changed: Vec<String>,
}

// === CRUD 参数 ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEpicParams {
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateEpicParams {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Traycer proto 中 Epic.status 是裸 string
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSpecParams {
    pub epic_id: String,
    pub title: String,
    pub content: String,
    pub spec_type: SpecType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTicketParams {
    pub epic_id: String,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTicketParams {
    pub epic_id: String,
    pub ticket_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<TicketStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_streaming: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSpecParams {
    pub epic_id: String,
    pub spec_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<SpecStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartExecutionParams {
    pub epic_id: String,
    pub ticket_id: String,
    pub agent: ExecutionAgent,
}
