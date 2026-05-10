pub mod agents;
pub mod epic;
pub mod epic_chat;
pub mod mcp;
pub mod streaming;
pub mod verification;
pub mod yolo;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<u64>,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl JsonRpcResponse {
    pub fn ok(id: Option<u64>, result: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn err(id: Option<u64>, code: i32, message: String) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code,
                message,
                data: None,
            }),
        }
    }
}

// --- Workflow types ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WorkflowType {
    Plan,
    Refactoring,
    Agile,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkflowInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub steps: Vec<WorkflowStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: StepStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum StepStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

// --- Plan types ---

#[derive(Debug, Serialize, Deserialize)]
pub struct PlanParams {
    pub code: String,
    pub prompt: String,
    pub workflow: WorkflowType,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlanResult {
    pub id: String,
    pub workflow: WorkflowType,
    pub task_name: String,
    pub problem_context: String,
    pub user_experience: String,
    pub technical_approach: String,
    pub steps: Vec<PlanStep>,
    pub file_changes: Vec<FileChange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clarification: Option<Clarification>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: StepStatus,
    #[serde(default)]
    pub dependencies: Vec<String>,
}

// --- Validation types ---

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateParams {
    pub plan_id: String,
    pub plan: PlanResult,
    pub original_code: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationResult {
    pub plan_id: String,
    pub passed: bool,
    pub score: f32,
    pub comments: Vec<ValidationComment>,
    pub prompt_for_ai_agent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationComment {
    pub id: String,
    pub title: String,
    pub description: String,
    pub severity: Severity,
    pub referred_files: Vec<String>,
    pub is_applied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Severity {
    Minor,
    Major,
    Critical,
}

// --- Generate (execute plan) ---

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerateParams {
    pub plan: PlanResult,
    pub code: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

// --- Legacy Analyze (kept for backward compat) ---

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalyzeParams {
    pub code: String,
    pub prompt: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalyzeResult {
    pub task_name: String,
    pub thinking_steps: Vec<ThinkingStep>,
    pub pr_title: String,
    pub pr_description: String,
    pub file_changes: Vec<FileChange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clarification: Option<Clarification>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ThinkingStep {
    pub step_number: u32,
    pub step_title: String,
    pub step_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub file_status: String,
    pub file_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Clarification {
    pub message: String,
    pub questions: Vec<String>,
}

// --- Provider / Settings types ---

#[derive(Debug, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub models: Vec<String>,
    pub is_local: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetProviderParams {
    pub provider: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub endpoint: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelProfile {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
}

// --- History types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub workflow: WorkflowType,
    pub task_name: String,
    pub prompt: String,
    pub file_path: String,
    pub created_at: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryListResult {
    pub entries: Vec<HistoryEntry>,
}
