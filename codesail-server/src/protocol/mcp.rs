use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    #[serde(default = "default_scope")]
    pub scope: McpScope,
    #[serde(default)]
    pub disabled: bool,
}

fn default_scope() -> McpScope { McpScope::User }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpScope {
    User,
    Workspace,
    Organization,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStatus {
    pub id: String,
    pub running: bool,
    pub error: Option<String>,
    pub tools_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddMcpServerParams {
    pub config: McpServerConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RemoveMcpServerParams {
    pub id: String,
}
