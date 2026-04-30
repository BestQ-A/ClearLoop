use std::sync::Arc;

use crate::persistence::SqliteStore;
use crate::protocol::agents::HandoffResult;
use crate::protocol::epic::*;

/// Epic 管理器——封装 Epic/Spec/Ticket/Execution 的 CRUD 和领域逻辑
pub struct EpicManager {
    store: Arc<SqliteStore>,
}

impl EpicManager {
    pub fn new(store: Arc<SqliteStore>) -> Self {
        Self { store }
    }

    // ========== Epic ==========

    pub fn create_epic(&self, params: CreateEpicParams) -> Result<Epic, String> {
        let now = now_iso();
        let epic = Epic {
            id: EpicId(make_uuid()),
            title: params.title,
            description: params.description,
            // Traycer proto 中 Epic.status 是裸 string，初始为 None
            status: None,
            specs: vec![],
            tickets: vec![],
            executions: vec![],
            created_at: now.clone(),
            updated_at: now,
        };

        self.store.save_epic(&epic)?;
        Ok(epic)
    }

    pub fn get_epic(&self, id: &str) -> Result<Epic, String> {
        self.store
            .get_epic(id)?
            .ok_or_else(|| format!("Epic '{}' 不存在", id))
    }

    pub fn list_epics(&self) -> Result<Vec<Epic>, String> {
        self.store.list_epics()
    }

    pub fn update_epic(&self, params: UpdateEpicParams) -> Result<Epic, String> {
        let mut epic = self.get_epic(&params.id)?;

        if let Some(title) = params.title {
            epic.title = title;
        }
        if let Some(description) = params.description {
            epic.description = description;
        }
        if let Some(status) = params.status {
            epic.status = Some(status);
        }
        epic.updated_at = now_iso();

        self.store.save_epic(&epic)?;
        Ok(epic)
    }

    pub fn delete_epic(&self, id: &str) -> Result<(), String> {
        // 确认存在
        self.get_epic(id)?;
        self.store.delete_epic(id)
    }

    // ========== Spec ==========

    pub fn add_spec(&self, params: CreateSpecParams) -> Result<Spec, String> {
        // 确认 epic 存在
        let mut epic = self.get_epic(&params.epic_id)?;

        let now = now_iso();
        let spec = Spec {
            id: SpecId(make_uuid()),
            epic_id: EpicId(params.epic_id.clone()),
            title: params.title,
            content: params.content,
            spec_type: params.spec_type,
            status: SpecStatus::Draft,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        // 同步到 epic 的 specs 列表并持久化
        self.store.save_spec(&spec)?;
        epic.specs.push(spec.clone());
        epic.updated_at = now;
        self.store.save_epic(&epic)?;

        Ok(spec)
    }

    /// 更新 spec 的 title / content / status（部分字段可选）
    pub fn update_spec(&self, params: UpdateSpecParams) -> Result<Spec, String> {
        let mut spec = self
            .store
            .get_spec(&params.spec_id)?
            .ok_or_else(|| format!("Spec '{}' 不存在", params.spec_id))?;

        if let Some(title) = params.title {
            spec.title = title;
        }
        if let Some(content) = params.content {
            spec.content = content;
        }
        if let Some(status) = params.status {
            spec.status = status;
        }
        spec.updated_at = now_iso();

        self.store.save_spec(&spec)?;

        // 同步更新 epic 中的 spec
        let mut epic = self.get_epic(&params.epic_id)?;
        if let Some(existing) = epic.specs.iter_mut().find(|s| s.id == spec.id) {
            *existing = spec.clone();
        }
        epic.updated_at = now_iso();
        self.store.save_epic(&epic)?;

        Ok(spec)
    }

    /// 删除 spec —— 同时从持久层和所属 epic 的 specs 列表中移除
    pub fn delete_spec(&self, epic_id: &str, spec_id: &str) -> Result<(), String> {
        // 确认 spec 存在
        self.store
            .get_spec(spec_id)?
            .ok_or_else(|| format!("Spec '{}' 不存在", spec_id))?;

        self.store.delete_spec(spec_id)?;

        // 同步移除 epic.specs 中的对应项
        let mut epic = self.get_epic(epic_id)?;
        epic.specs.retain(|s| s.id.0 != spec_id);
        epic.updated_at = now_iso();
        self.store.save_epic(&epic)?;

        Ok(())
    }

    // ========== Ticket ==========

    pub fn add_ticket(&self, params: CreateTicketParams) -> Result<Ticket, String> {
        let mut epic = self.get_epic(&params.epic_id)?;

        let now = now_iso();
        let ticket = Ticket {
            id: TicketId(make_uuid()),
            epic_id: EpicId(params.epic_id.clone()),
            title: params.title,
            description: params.description,
            status: TicketStatus::Todo,
            assignee: None,
            is_streaming: false,
            spec_refs: vec![],
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        self.store.save_ticket(&ticket)?;
        epic.tickets.push(ticket.clone());
        epic.updated_at = now;
        self.store.save_epic(&epic)?;

        Ok(ticket)
    }

    pub fn update_ticket(&self, params: UpdateTicketParams) -> Result<Ticket, String> {
        let mut ticket = self
            .store
            .get_ticket(&params.ticket_id)?
            .ok_or_else(|| format!("Ticket '{}' 不存在", params.ticket_id))?;

        if let Some(title) = params.title {
            ticket.title = title;
        }
        if let Some(description) = params.description {
            ticket.description = description;
        }
        if let Some(status) = params.status {
            ticket.status = status;
        }
        if let Some(agent) = params.assignee {
            ticket.assignee = Some(agent);
        }
        if let Some(streaming) = params.is_streaming {
            ticket.is_streaming = streaming;
        }
        ticket.updated_at = now_iso();

        self.store.save_ticket(&ticket)?;

        // 同步更新 epic 中的 ticket
        self.sync_ticket_to_epic(&ticket)?;

        Ok(ticket)
    }

    /// 删除 ticket —— 同时从持久层和所属 epic 的 tickets 列表中移除
    pub fn delete_ticket(&self, epic_id: &str, ticket_id: &str) -> Result<(), String> {
        // 确认 ticket 存在
        self.store
            .get_ticket(ticket_id)?
            .ok_or_else(|| format!("Ticket '{}' 不存在", ticket_id))?;

        self.store.delete_ticket(ticket_id)?;

        // 同步移除 epic.tickets 中的对应项
        let mut epic = self.get_epic(epic_id)?;
        epic.tickets.retain(|t| t.id.0 != ticket_id);
        epic.updated_at = now_iso();
        self.store.save_epic(&epic)?;

        Ok(())
    }

    /// 将 ticket 变更同步到 epic 的 tickets 列表
    fn sync_ticket_to_epic(&self, ticket: &Ticket) -> Result<(), String> {
        let mut epic = self.get_epic(&ticket.epic_id.0)?;
        if let Some(existing) = epic.tickets.iter_mut().find(|t| t.id == ticket.id) {
            *existing = ticket.clone();
        }
        epic.updated_at = now_iso();
        self.store.save_epic(&epic)?;
        Ok(())
    }

    // ========== Execution ==========

    pub fn start_execution(&self, params: StartExecutionParams) -> Result<Execution, String> {
        let mut epic = self.get_epic(&params.epic_id)?;

        // 确认 ticket 存在
        let ticket_exists = epic.tickets.iter().any(|t| t.id.0 == params.ticket_id);
        if !ticket_exists {
            return Err(format!(
                "Ticket '{}' 在 Epic '{}' 中不存在",
                params.ticket_id, params.epic_id
            ));
        }

        let now = now_iso();
        let execution = Execution {
            id: ExecutionId(make_uuid()),
            epic_id: EpicId(params.epic_id.clone()),
            ticket_id: TicketId(params.ticket_id.clone()),
            agent: params.agent,
            // Traycer 真实命名：执行刚启动时为 IN_PROGRESS（旧 RUNNING 等价映射）
            status: ExecutionStatus::InProgress,
            plan_snapshot: None,
            verification_threads: vec![],
            commit_metadata: None,
            started_at: now.clone(),
            completed_at: None,
            duration_ms: None,
        };

        self.store.save_execution(&execution)?;
        epic.executions.push(execution.clone());

        // 将 ticket 状态更新为 InProgress
        if let Some(ticket) = epic.tickets.iter_mut().find(|t| t.id.0 == params.ticket_id) {
            ticket.status = TicketStatus::InProgress;
            ticket.updated_at = now.clone();
            self.store.save_ticket(ticket)?;
        }

        // Traycer Epic.status 是裸 string，置为 "IN_PROGRESS"
        epic.status = Some("IN_PROGRESS".to_string());
        epic.updated_at = now;
        self.store.save_epic(&epic)?;

        Ok(execution)
    }

    pub fn complete_execution(
        &self,
        execution_id: &str,
        result: HandoffResult,
    ) -> Result<Execution, String> {
        let mut execution = self
            .store
            .get_execution(execution_id)?
            .ok_or_else(|| format!("Execution '{}' 不存在", execution_id))?;

        let now = now_iso();

        // 计算持续时间
        let duration_ms = result.duration_ms;

        execution.status = result.status.clone();
        execution.completed_at = Some(now.clone());
        execution.duration_ms = duration_ms;

        if let Some(sha) = &result.commit_sha {
            execution.commit_metadata = Some(CommitMetadata {
                sha: sha.clone(),
                branch: String::new(),
                message: String::new(),
                files_changed: result.files_changed.clone(),
            });
        }

        self.store.save_execution(&execution)?;

        // 更新 ticket 状态——按 Traycer 三态映射
        // Completed → Done；Failed/Aborting/Skipped/RateLimited/凭据问题 → Todo（需重启）；
        // 其他活跃态保持 InProgress
        let new_ticket_status = match result.status {
            ExecutionStatus::Completed => TicketStatus::Done,
            ExecutionStatus::Failed
            | ExecutionStatus::Aborting
            | ExecutionStatus::Skipped
            | ExecutionStatus::RateLimited
            | ExecutionStatus::StepInsufficientCredits
            | ExecutionStatus::StepOrgBundleInsufficient => TicketStatus::Todo,
            _ => TicketStatus::InProgress,
        };

        if let Some(mut ticket) = self.store.get_ticket(&execution.ticket_id.0)? {
            ticket.status = new_ticket_status;
            ticket.updated_at = now.clone();
            self.store.save_ticket(&ticket)?;
            self.sync_ticket_to_epic(&ticket)?;
        }

        // 同步 execution 到 epic
        let mut epic = self.get_epic(&execution.epic_id.0)?;
        if let Some(existing) = epic.executions.iter_mut().find(|e| e.id == execution.id) {
            *existing = execution.clone();
        }
        epic.updated_at = now;
        self.store.save_epic(&epic)?;

        Ok(execution)
    }

    // ========== 依赖图 ==========
    //
    // 旧版 `get_dependency_graph` 依赖 Ticket.dependencies + Ticket.priority，
    // 这两个字段在 Traycer proto 中不存在，已被整体删除。
    // 依赖图功能不在 Traycer Epic Board 蓝图内，故彻底移除而非降级保留。
}

// ========== 工具函数 ==========

/// 生成 UUID v4
fn make_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// 生成 ISO 8601 时间戳
fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::SqliteStore;

    fn make_manager() -> EpicManager {
        let store = Arc::new(SqliteStore::new(":memory:").unwrap());
        EpicManager::new(store)
    }

    #[test]
    fn test_create_and_get_epic() {
        let mgr = make_manager();
        let epic = mgr
            .create_epic(CreateEpicParams {
                title: "测试项目".into(),
                description: "描述".into(),
            })
            .unwrap();

        assert_eq!(epic.title, "测试项目");
        // Traycer Epic.status 是裸 string，初始为 None
        assert!(epic.status.is_none());

        let loaded = mgr.get_epic(&epic.id.0).unwrap();
        assert_eq!(loaded.title, epic.title);
    }

    #[test]
    fn test_update_epic() {
        let mgr = make_manager();
        let epic = mgr
            .create_epic(CreateEpicParams {
                title: "原标题".into(),
                description: "描述".into(),
            })
            .unwrap();

        let updated = mgr
            .update_epic(UpdateEpicParams {
                id: epic.id.0.clone(),
                title: Some("新标题".into()),
                description: None,
                status: Some("PLANNING".into()),
            })
            .unwrap();

        assert_eq!(updated.title, "新标题");
        assert_eq!(updated.status.as_deref(), Some("PLANNING"));
    }

    #[test]
    fn test_add_ticket() {
        let mgr = make_manager();
        let epic = mgr
            .create_epic(CreateEpicParams {
                title: "项目".into(),
                description: "描述".into(),
            })
            .unwrap();

        let _t1 = mgr
            .add_ticket(CreateTicketParams {
                epic_id: epic.id.0.clone(),
                title: "任务A".into(),
                description: "做A".into(),
            })
            .unwrap();

        let _t2 = mgr
            .add_ticket(CreateTicketParams {
                epic_id: epic.id.0.clone(),
                title: "任务B".into(),
                description: "做B".into(),
            })
            .unwrap();

        // 验证 ticket 已写入 epic
        let loaded = mgr.get_epic(&epic.id.0).unwrap();
        assert_eq!(loaded.tickets.len(), 2);
    }

    #[test]
    fn test_start_and_complete_execution() {
        let mgr = make_manager();
        let epic = mgr
            .create_epic(CreateEpicParams {
                title: "项目".into(),
                description: "描述".into(),
            })
            .unwrap();

        let ticket = mgr
            .add_ticket(CreateTicketParams {
                epic_id: epic.id.0.clone(),
                title: "实现功能".into(),
                description: "具体实现".into(),
            })
            .unwrap();

        let execution = mgr
            .start_execution(StartExecutionParams {
                epic_id: epic.id.0.clone(),
                ticket_id: ticket.id.0.clone(),
                agent: ExecutionAgent::ClaudeCode,
            })
            .unwrap();

        assert_eq!(execution.status, ExecutionStatus::InProgress);

        let completed = mgr
            .complete_execution(
                &execution.id.0,
                crate::protocol::agents::HandoffResult {
                    agent_id: "claude-code".into(),
                    execution_id: execution.id.0.clone(),
                    status: ExecutionStatus::Completed,
                    files_changed: vec!["src/main.rs".into()],
                    commit_sha: Some("abc123".into()),
                    duration_ms: Some(5000),
                },
            )
            .unwrap();

        assert_eq!(completed.status, ExecutionStatus::Completed);
        assert!(completed.commit_metadata.is_some());
    }

    #[test]
    fn test_delete_epic() {
        let mgr = make_manager();
        let epic = mgr
            .create_epic(CreateEpicParams {
                title: "待删除".into(),
                description: "".into(),
            })
            .unwrap();

        mgr.delete_epic(&epic.id.0).unwrap();
        assert!(mgr.get_epic(&epic.id.0).is_err());
    }

    #[test]
    fn test_add_spec() {
        let mgr = make_manager();
        let epic = mgr
            .create_epic(CreateEpicParams {
                title: "项目".into(),
                description: "".into(),
            })
            .unwrap();

        let spec = mgr
            .add_spec(CreateSpecParams {
                epic_id: epic.id.0.clone(),
                title: "PRD".into(),
                content: "产品需求文档内容".into(),
                spec_type: SpecType::Prd,
            })
            .unwrap();

        assert_eq!(spec.title, "PRD");
        assert_eq!(spec.spec_type, SpecType::Prd);
        assert_eq!(spec.status, SpecStatus::Draft);
    }
}
