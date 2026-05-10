use crate::protocol::mcp::*;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct McpManager {
    servers: Arc<RwLock<Vec<McpServerConfig>>>,
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn add_server(&self, config: McpServerConfig) -> Result<(), String> {
        let mut servers = self.servers.write().await;
        if servers.iter().any(|s| s.id == config.id) {
            return Err(format!("Server with id '{}' already exists", config.id));
        }
        servers.push(config);
        Ok(())
    }

    pub async fn remove_server(&self, id: &str) -> Result<(), String> {
        let mut servers = self.servers.write().await;
        let len_before = servers.len();
        servers.retain(|s| s.id != id);
        if servers.len() == len_before {
            return Err(format!("Server '{}' not found", id));
        }
        Ok(())
    }

    pub async fn list_servers(&self) -> Vec<McpServerConfig> {
        self.servers.read().await.clone()
    }

    pub async fn server_status(&self, id: &str) -> Result<McpServerStatus, String> {
        let servers = self.servers.read().await;
        let server = servers
            .iter()
            .find(|s| s.id == id)
            .ok_or_else(|| format!("Server '{}' not found", id))?;
        Ok(McpServerStatus {
            id: server.id.clone(),
            running: !server.disabled, // simplified — not actually launching for MVP
            error: None,
            tools_count: 0,
        })
    }

    pub async fn toggle_server(&self, id: &str, enabled: bool) -> Result<(), String> {
        let mut servers = self.servers.write().await;
        let server = servers
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or_else(|| format!("Server '{}' not found", id))?;
        server.disabled = !enabled;
        Ok(())
    }
}
