use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;

use crate::protocol::epic::*;
use crate::protocol::verification::{VerificationComment, VerificationThread};
use crate::protocol::HistoryEntry;

/// SQLite 持久化层——用 Mutex<Connection> 保证线程安全
pub struct SqliteStore {
    conn: Mutex<Connection>,
}

impl SqliteStore {
    /// 创建或打开数据库，并运行迁移
    pub fn new(path: &str) -> Result<Self, String> {
        let conn = if path == ":memory:" {
            Connection::open_in_memory()
        } else {
            Connection::open(path)
        }
        .map_err(|e| format!("打开数据库失败: {}", e))?;

        let store = Self {
            conn: Mutex::new(conn),
        };
        store.run_migrations()?;
        Ok(store)
    }

    /// 执行建表 DDL
    ///
    /// Schema v2（Traycer 1:1 对齐）相对 v1 的变更：
    /// - tickets: 删除 priority / dependencies_json / labels_json / estimated_effort 列
    /// - tickets: assigned_agent 重命名为 assignee
    /// - tickets: 新增 is_streaming INTEGER
    /// - epics: status 允许 NULL（裸 string，不再是强枚举）
    /// - executions: status 默认值改为 'NOT_STARTED'（旧 PENDING 等价）
    /// - verification_threads: status 默认值改为 'open'（小写二态，去掉 OUTDATED）
    /// - verification_threads: 新增 is_detached INTEGER
    /// - 新增 schema_version 表，记录当前迁移版本（v2）
    fn run_migrations(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY
            );

            CREATE TABLE IF NOT EXISTS epics (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                description TEXT NOT NULL,
                status      TEXT,
                specs_json  TEXT NOT NULL DEFAULT '[]',
                tickets_json TEXT NOT NULL DEFAULT '[]',
                executions_json TEXT NOT NULL DEFAULT '[]',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS specs (
                id          TEXT PRIMARY KEY,
                epic_id     TEXT NOT NULL,
                title       TEXT NOT NULL,
                content     TEXT NOT NULL,
                spec_type   TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'DRAFT',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL,
                FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tickets (
                id              TEXT PRIMARY KEY,
                epic_id         TEXT NOT NULL,
                title           TEXT NOT NULL,
                description     TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'TICKET_TODO',
                assignee        TEXT,
                is_streaming    INTEGER NOT NULL DEFAULT 0,
                spec_refs_json  TEXT NOT NULL DEFAULT '[]',
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS executions (
                id                  TEXT PRIMARY KEY,
                epic_id             TEXT NOT NULL,
                ticket_id           TEXT NOT NULL,
                agent               TEXT NOT NULL,
                status              TEXT NOT NULL DEFAULT 'NOT_STARTED',
                plan_snapshot       TEXT,
                verification_threads_json TEXT NOT NULL DEFAULT '[]',
                commit_metadata_json TEXT,
                started_at          TEXT NOT NULL,
                completed_at        TEXT,
                duration_ms         INTEGER,
                FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE CASCADE,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS verification_threads (
                id          TEXT PRIMARY KEY,
                plan_id     TEXT NOT NULL,
                comments_json TEXT NOT NULL DEFAULT '[]',
                status      TEXT NOT NULL DEFAULT 'open',
                is_detached INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS verification_comments (
                id                  TEXT PRIMARY KEY,
                thread_id           TEXT NOT NULL,
                title               TEXT NOT NULL,
                description         TEXT NOT NULL,
                severity            TEXT NOT NULL,
                category            TEXT NOT NULL,
                referred_files_json TEXT NOT NULL DEFAULT '[]',
                prompt_for_ai_agent TEXT NOT NULL DEFAULT '',
                is_applied          INTEGER NOT NULL DEFAULT 0,
                created_at          TEXT NOT NULL,
                FOREIGN KEY (thread_id) REFERENCES verification_threads(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS history (
                id          TEXT PRIMARY KEY,
                workflow    TEXT NOT NULL,
                task_name   TEXT NOT NULL,
                prompt      TEXT NOT NULL,
                file_path   TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'pending'
            );

            CREATE INDEX IF NOT EXISTS idx_specs_epic ON specs(epic_id);
            CREATE INDEX IF NOT EXISTS idx_tickets_epic ON tickets(epic_id);
            CREATE INDEX IF NOT EXISTS idx_executions_epic ON executions(epic_id);
            CREATE INDEX IF NOT EXISTS idx_executions_ticket ON executions(ticket_id);
            CREATE INDEX IF NOT EXISTS idx_vthreads_plan ON verification_threads(plan_id);
            CREATE INDEX IF NOT EXISTS idx_vcomments_thread ON verification_comments(thread_id);

            INSERT OR REPLACE INTO schema_version (version) VALUES (2);
            ",
        )
        .map_err(|e| format!("迁移失败: {}", e))?;

        Ok(())
    }

    // ========== Epic CRUD ==========

    pub fn save_epic(&self, epic: &Epic) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        // Traycer Epic.status 是裸 string（可空），直接绑定 Option<String>
        let specs_json =
            serde_json::to_string(&epic.specs).map_err(|e| format!("序列化 specs 失败: {}", e))?;
        let tickets_json = serde_json::to_string(&epic.tickets)
            .map_err(|e| format!("序列化 tickets 失败: {}", e))?;
        let executions_json = serde_json::to_string(&epic.executions)
            .map_err(|e| format!("序列化 executions 失败: {}", e))?;

        conn.execute(
            "INSERT INTO epics (id, title, description, status, specs_json, tickets_json, executions_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                status = excluded.status,
                specs_json = excluded.specs_json,
                tickets_json = excluded.tickets_json,
                executions_json = excluded.executions_json,
                updated_at = excluded.updated_at",
            params![
                epic.id.0,
                epic.title,
                epic.description,
                epic.status,
                specs_json,
                tickets_json,
                executions_json,
                epic.created_at,
                epic.updated_at,
            ],
        )
        .map_err(|e| format!("保存 epic 失败: {}", e))?;

        Ok(())
    }

    pub fn get_epic(&self, id: &str) -> Result<Option<Epic>, String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let result = conn
            .query_row(
                "SELECT id, title, description, status, specs_json, tickets_json, executions_json, created_at, updated_at FROM epics WHERE id = ?1",
                params![id],
                |row| {
                    let id_str: String = row.get(0)?;
                    let title: String = row.get(1)?;
                    let description: String = row.get(2)?;
                    let status: Option<String> = row.get(3)?;
                    let specs_json: String = row.get(4)?;
                    let tickets_json: String = row.get(5)?;
                    let executions_json: String = row.get(6)?;
                    let created_at: String = row.get(7)?;
                    let updated_at: String = row.get(8)?;

                    Ok((id_str, title, description, status, specs_json, tickets_json, executions_json, created_at, updated_at))
                },
            )
            .optional()
            .map_err(|e| format!("查询 epic 失败: {}", e))?;

        match result {
            Some((
                id_str,
                title,
                description,
                status,
                specs_json,
                tickets_json,
                executions_json,
                created_at,
                updated_at,
            )) => {
                let specs: Vec<Spec> = serde_json::from_str(&specs_json).unwrap_or_default();
                let tickets: Vec<Ticket> = serde_json::from_str(&tickets_json).unwrap_or_default();
                let executions: Vec<Execution> =
                    serde_json::from_str(&executions_json).unwrap_or_default();

                Ok(Some(Epic {
                    id: EpicId(id_str),
                    title,
                    description,
                    status,
                    specs,
                    tickets,
                    executions,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    pub fn list_epics(&self) -> Result<Vec<Epic>, String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, title, description, status, specs_json, tickets_json, executions_json, created_at, updated_at FROM epics ORDER BY updated_at DESC")
            .map_err(|e| format!("准备语句失败: {}", e))?;

        let epics = stmt
            .query_map([], |row| {
                let id_str: String = row.get(0)?;
                let title: String = row.get(1)?;
                let description: String = row.get(2)?;
                let status: Option<String> = row.get(3)?;
                let specs_json: String = row.get(4)?;
                let tickets_json: String = row.get(5)?;
                let executions_json: String = row.get(6)?;
                let created_at: String = row.get(7)?;
                let updated_at: String = row.get(8)?;

                let specs: Vec<Spec> = serde_json::from_str(&specs_json).unwrap_or_default();
                let tickets: Vec<Ticket> = serde_json::from_str(&tickets_json).unwrap_or_default();
                let executions: Vec<Execution> =
                    serde_json::from_str(&executions_json).unwrap_or_default();

                Ok(Epic {
                    id: EpicId(id_str),
                    title,
                    description,
                    status,
                    specs,
                    tickets,
                    executions,
                    created_at,
                    updated_at,
                })
            })
            .map_err(|e| format!("查询 epics 失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取 epic 行失败: {}", e))?;

        Ok(epics)
    }

    pub fn delete_epic(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;
        conn.execute("DELETE FROM epics WHERE id = ?1", params![id])
            .map_err(|e| format!("删除 epic 失败: {}", e))?;
        Ok(())
    }

    // ========== Spec CRUD ==========

    pub fn save_spec(&self, spec: &Spec) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let spec_type_str = serde_json::to_string(&spec.spec_type)
            .map_err(|e| format!("序列化 spec_type 失败: {}", e))?;
        let spec_type_str = spec_type_str.trim_matches('"');

        let status_str = serde_json::to_string(&spec.status)
            .map_err(|e| format!("序列化 status 失败: {}", e))?;
        let status_str = status_str.trim_matches('"');

        conn.execute(
            "INSERT OR REPLACE INTO specs (id, epic_id, title, content, spec_type, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                spec.id.0,
                spec.epic_id.0,
                spec.title,
                spec.content,
                spec_type_str,
                status_str,
                spec.created_at,
                spec.updated_at,
            ],
        )
        .map_err(|e| format!("保存 spec 失败: {}", e))?;

        Ok(())
    }

    pub fn get_spec(&self, id: &str) -> Result<Option<Spec>, String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let result = conn
            .query_row(
                "SELECT id, epic_id, title, content, spec_type, status, created_at, updated_at FROM specs WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| format!("查询 spec 失败: {}", e))?;

        match result {
            Some((
                id_str,
                epic_id,
                title,
                content,
                spec_type_str,
                status_str,
                created_at,
                updated_at,
            )) => {
                let spec_type = serde_json::from_str(&format!("\"{}\"", spec_type_str))
                    .unwrap_or(SpecType::Custom);
                let status = serde_json::from_str(&format!("\"{}\"", status_str))
                    .unwrap_or(SpecStatus::Draft);

                Ok(Some(Spec {
                    id: SpecId(id_str),
                    epic_id: EpicId(epic_id),
                    title,
                    content,
                    spec_type,
                    status,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    pub fn list_specs(&self, epic_id: &str) -> Result<Vec<Spec>, String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, epic_id, title, content, spec_type, status, created_at, updated_at FROM specs WHERE epic_id = ?1 ORDER BY created_at")
            .map_err(|e| format!("准备语句失败: {}", e))?;

        let specs = stmt
            .query_map(params![epic_id], |row| {
                let id_str: String = row.get(0)?;
                let epic_id: String = row.get(1)?;
                let title: String = row.get(2)?;
                let content: String = row.get(3)?;
                let spec_type_str: String = row.get(4)?;
                let status_str: String = row.get(5)?;
                let created_at: String = row.get(6)?;
                let updated_at: String = row.get(7)?;

                let spec_type = serde_json::from_str(&format!("\"{}\"", spec_type_str))
                    .unwrap_or(SpecType::Custom);
                let status = serde_json::from_str(&format!("\"{}\"", status_str))
                    .unwrap_or(SpecStatus::Draft);

                Ok(Spec {
                    id: SpecId(id_str),
                    epic_id: EpicId(epic_id),
                    title,
                    content,
                    spec_type,
                    status,
                    created_at,
                    updated_at,
                })
            })
            .map_err(|e| format!("查询 specs 失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取 spec 行失败: {}", e))?;

        Ok(specs)
    }

    pub fn delete_spec(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;
        conn.execute("DELETE FROM specs WHERE id = ?1", params![id])
            .map_err(|e| format!("删除 spec 失败: {}", e))?;
        Ok(())
    }

    // ========== Ticket CRUD ==========

    pub fn save_ticket(&self, ticket: &Ticket) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let status_str = serde_json::to_string(&ticket.status)
            .map_err(|e| format!("序列化 status 失败: {}", e))?;
        // serde rename 输出 "TICKET_TODO" 等，去引号
        let status_str = status_str.trim_matches('"').to_string();

        let spec_refs_json = serde_json::to_string(&ticket.spec_refs)
            .map_err(|e| format!("序列化 spec_refs 失败: {}", e))?;

        conn.execute(
            "INSERT INTO tickets (id, epic_id, title, description, status, assignee, is_streaming, spec_refs_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                epic_id = excluded.epic_id,
                title = excluded.title,
                description = excluded.description,
                status = excluded.status,
                assignee = excluded.assignee,
                is_streaming = excluded.is_streaming,
                spec_refs_json = excluded.spec_refs_json,
                updated_at = excluded.updated_at",
            params![
                ticket.id.0,
                ticket.epic_id.0,
                ticket.title,
                ticket.description,
                status_str,
                ticket.assignee,
                ticket.is_streaming as i64,
                spec_refs_json,
                ticket.created_at,
                ticket.updated_at,
            ],
        )
        .map_err(|e| format!("保存 ticket 失败: {}", e))?;

        Ok(())
    }

    pub fn get_ticket(&self, id: &str) -> Result<Option<Ticket>, String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let result = conn
            .query_row(
                "SELECT id, epic_id, title, description, status, assignee, is_streaming, spec_refs_json, created_at, updated_at FROM tickets WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, String>(8)?,
                        row.get::<_, String>(9)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| format!("查询 ticket 失败: {}", e))?;

        match result {
            Some((
                id_str,
                epic_id,
                title,
                description,
                status_str,
                assignee,
                is_streaming,
                spec_refs_json,
                created_at,
                updated_at,
            )) => {
                let status = serde_json::from_str(&format!("\"{}\"", status_str))
                    .unwrap_or(TicketStatus::Todo);
                let spec_refs: Vec<SpecId> =
                    serde_json::from_str(&spec_refs_json).unwrap_or_default();

                Ok(Some(Ticket {
                    id: TicketId(id_str),
                    epic_id: EpicId(epic_id),
                    title,
                    description,
                    status,
                    assignee,
                    is_streaming: is_streaming != 0,
                    spec_refs,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    pub fn list_tickets(&self, epic_id: &str) -> Result<Vec<Ticket>, String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, epic_id, title, description, status, assignee, is_streaming, spec_refs_json, created_at, updated_at FROM tickets WHERE epic_id = ?1 ORDER BY created_at")
            .map_err(|e| format!("准备语句失败: {}", e))?;

        let tickets = stmt
            .query_map(params![epic_id], |row| {
                let id_str: String = row.get(0)?;
                let epic_id: String = row.get(1)?;
                let title: String = row.get(2)?;
                let description: String = row.get(3)?;
                let status_str: String = row.get(4)?;
                let assignee: Option<String> = row.get(5)?;
                let is_streaming: i64 = row.get(6)?;
                let spec_refs_json: String = row.get(7)?;
                let created_at: String = row.get(8)?;
                let updated_at: String = row.get(9)?;

                let status = serde_json::from_str(&format!("\"{}\"", status_str))
                    .unwrap_or(TicketStatus::Todo);
                let spec_refs: Vec<SpecId> =
                    serde_json::from_str(&spec_refs_json).unwrap_or_default();

                Ok(Ticket {
                    id: TicketId(id_str),
                    epic_id: EpicId(epic_id),
                    title,
                    description,
                    status,
                    assignee,
                    is_streaming: is_streaming != 0,
                    spec_refs,
                    created_at,
                    updated_at,
                })
            })
            .map_err(|e| format!("查询 tickets 失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取 ticket 行失败: {}", e))?;

        Ok(tickets)
    }

    pub fn delete_ticket(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;
        conn.execute("DELETE FROM tickets WHERE id = ?1", params![id])
            .map_err(|e| format!("删除 ticket 失败: {}", e))?;
        Ok(())
    }

    // ========== Execution CRUD ==========

    pub fn save_execution(&self, exec: &Execution) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let agent_str =
            serde_json::to_string(&exec.agent).map_err(|e| format!("序列化 agent 失败: {}", e))?;
        let agent_str = agent_str.trim_matches('"');

        let status_str = serde_json::to_string(&exec.status)
            .map_err(|e| format!("序列化 status 失败: {}", e))?;
        let status_str = status_str.trim_matches('"');

        let vthreads_json = serde_json::to_string(&exec.verification_threads)
            .map_err(|e| format!("序列化 verification_threads 失败: {}", e))?;

        let commit_json = exec
            .commit_metadata
            .as_ref()
            .map(|c| serde_json::to_string(c).unwrap_or_default());

        conn.execute(
            "INSERT INTO executions (id, epic_id, ticket_id, agent, status, plan_snapshot, verification_threads_json, commit_metadata_json, started_at, completed_at, duration_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                epic_id = excluded.epic_id,
                ticket_id = excluded.ticket_id,
                agent = excluded.agent,
                status = excluded.status,
                plan_snapshot = excluded.plan_snapshot,
                verification_threads_json = excluded.verification_threads_json,
                commit_metadata_json = excluded.commit_metadata_json,
                completed_at = excluded.completed_at,
                duration_ms = excluded.duration_ms",
            params![
                exec.id.0,
                exec.epic_id.0,
                exec.ticket_id.0,
                agent_str,
                status_str,
                exec.plan_snapshot,
                vthreads_json,
                commit_json,
                exec.started_at,
                exec.completed_at,
                exec.duration_ms,
            ],
        )
        .map_err(|e| format!("保存 execution 失败: {}", e))?;

        Ok(())
    }

    pub fn get_execution(&self, id: &str) -> Result<Option<Execution>, String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let result = conn
            .query_row(
                "SELECT id, epic_id, ticket_id, agent, status, plan_snapshot, verification_threads_json, commit_metadata_json, started_at, completed_at, duration_ms FROM executions WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, String>(8)?,
                        row.get::<_, Option<String>>(9)?,
                        row.get::<_, Option<u64>>(10)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| format!("查询 execution 失败: {}", e))?;

        match result {
            Some((
                id_str,
                epic_id,
                ticket_id,
                agent_str,
                status_str,
                plan_snapshot,
                vthreads_json,
                commit_json,
                started_at,
                completed_at,
                duration_ms,
            )) => {
                let agent = serde_json::from_str(&format!("\"{}\"", agent_str))
                    .unwrap_or(ExecutionAgent::ClaudeCode);
                let status = serde_json::from_str(&format!("\"{}\"", status_str))
                    .unwrap_or(ExecutionStatus::NotStarted);
                let verification_threads: Vec<String> =
                    serde_json::from_str(&vthreads_json).unwrap_or_default();
                let commit_metadata: Option<CommitMetadata> =
                    commit_json.and_then(|j| serde_json::from_str(&j).ok());

                Ok(Some(Execution {
                    id: ExecutionId(id_str),
                    epic_id: EpicId(epic_id),
                    ticket_id: TicketId(ticket_id),
                    agent,
                    status,
                    plan_snapshot,
                    verification_threads,
                    commit_metadata,
                    started_at,
                    completed_at,
                    duration_ms,
                }))
            }
            None => Ok(None),
        }
    }

    pub fn list_executions(&self, epic_id: &str) -> Result<Vec<Execution>, String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, epic_id, ticket_id, agent, status, plan_snapshot, verification_threads_json, commit_metadata_json, started_at, completed_at, duration_ms FROM executions WHERE epic_id = ?1 ORDER BY started_at DESC")
            .map_err(|e| format!("准备语句失败: {}", e))?;

        let execs = stmt
            .query_map(params![epic_id], |row| {
                let id_str: String = row.get(0)?;
                let epic_id: String = row.get(1)?;
                let ticket_id: String = row.get(2)?;
                let agent_str: String = row.get(3)?;
                let status_str: String = row.get(4)?;
                let plan_snapshot: Option<String> = row.get(5)?;
                let vthreads_json: String = row.get(6)?;
                let commit_json: Option<String> = row.get(7)?;
                let started_at: String = row.get(8)?;
                let completed_at: Option<String> = row.get(9)?;
                let duration_ms: Option<u64> = row.get(10)?;

                let agent = serde_json::from_str(&format!("\"{}\"", agent_str))
                    .unwrap_or(ExecutionAgent::ClaudeCode);
                let status = serde_json::from_str(&format!("\"{}\"", status_str))
                    .unwrap_or(ExecutionStatus::NotStarted);
                let verification_threads: Vec<String> =
                    serde_json::from_str(&vthreads_json).unwrap_or_default();
                let commit_metadata: Option<CommitMetadata> =
                    commit_json.and_then(|j| serde_json::from_str(&j).ok());

                Ok(Execution {
                    id: ExecutionId(id_str),
                    epic_id: EpicId(epic_id),
                    ticket_id: TicketId(ticket_id),
                    agent,
                    status,
                    plan_snapshot,
                    verification_threads,
                    commit_metadata,
                    started_at,
                    completed_at,
                    duration_ms,
                })
            })
            .map_err(|e| format!("查询 executions 失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取 execution 行失败: {}", e))?;

        Ok(execs)
    }

    pub fn delete_execution(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;
        conn.execute("DELETE FROM executions WHERE id = ?1", params![id])
            .map_err(|e| format!("删除 execution 失败: {}", e))?;
        Ok(())
    }

    // ========== VerificationThread ==========

    pub fn save_verification_thread(&self, thread: &VerificationThread) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let status_str = serde_json::to_string(&thread.status)
            .map_err(|e| format!("序列化 status 失败: {}", e))?;
        // serde lowercase 输出 "open" / "resolved"
        let status_str = status_str.trim_matches('"').to_string();

        let comments_json = serde_json::to_string(&thread.comments)
            .map_err(|e| format!("序列化 comments 失败: {}", e))?;

        conn.execute(
            "INSERT OR REPLACE INTO verification_threads (id, plan_id, comments_json, status, is_detached, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                thread.id,
                thread.plan_id,
                comments_json,
                status_str,
                thread.is_detached as i64,
                thread.created_at,
            ],
        )
        .map_err(|e| format!("保存 verification_thread 失败: {}", e))?;

        Ok(())
    }

    pub fn get_verification_threads(
        &self,
        plan_id: &str,
    ) -> Result<Vec<VerificationThread>, String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, plan_id, comments_json, status, is_detached, created_at FROM verification_threads WHERE plan_id = ?1 ORDER BY created_at")
            .map_err(|e| format!("准备语句失败: {}", e))?;

        let threads = stmt
            .query_map(params![plan_id], |row| {
                let id: String = row.get(0)?;
                let plan_id: String = row.get(1)?;
                let comments_json: String = row.get(2)?;
                let status_str: String = row.get(3)?;
                let is_detached: i64 = row.get(4)?;
                let created_at: String = row.get(5)?;

                let status = serde_json::from_str(&format!("\"{}\"", status_str))
                    .unwrap_or(crate::protocol::verification::ThreadStatus::Open);
                let comments: Vec<VerificationComment> =
                    serde_json::from_str(&comments_json).unwrap_or_default();

                Ok(VerificationThread {
                    id,
                    plan_id,
                    comments,
                    status,
                    is_detached: is_detached != 0,
                    created_at,
                })
            })
            .map_err(|e| format!("查询 verification_threads 失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取 verification_thread 行失败: {}", e))?;

        Ok(threads)
    }

    // ========== History ==========

    pub fn save_history(&self, entry: &HistoryEntry) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let workflow_str = serde_json::to_string(&entry.workflow)
            .map_err(|e| format!("序列化 workflow 失败: {}", e))?;
        let workflow_str = workflow_str.trim_matches('"');

        conn.execute(
            "INSERT OR REPLACE INTO history (id, workflow, task_name, prompt, file_path, created_at, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                entry.id,
                workflow_str,
                entry.task_name,
                entry.prompt,
                entry.file_path,
                entry.created_at,
                entry.status,
            ],
        )
        .map_err(|e| format!("保存 history 失败: {}", e))?;

        Ok(())
    }

    pub fn list_history(&self) -> Result<Vec<HistoryEntry>, String> {
        let conn = self.conn.lock().map_err(|e| format!("锁获取失败: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, workflow, task_name, prompt, file_path, created_at, status FROM history ORDER BY created_at DESC")
            .map_err(|e| format!("准备语句失败: {}", e))?;

        let entries = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let workflow_str: String = row.get(1)?;
                let task_name: String = row.get(2)?;
                let prompt: String = row.get(3)?;
                let file_path: String = row.get(4)?;
                let created_at: String = row.get(5)?;
                let status: String = row.get(6)?;

                let workflow = serde_json::from_str(&format!("\"{}\"", workflow_str))
                    .unwrap_or(crate::protocol::WorkflowType::Plan);

                Ok(HistoryEntry {
                    id,
                    workflow,
                    task_name,
                    prompt,
                    file_path,
                    created_at,
                    status,
                })
            })
            .map_err(|e| format!("查询 history 失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取 history 行失败: {}", e))?;

        Ok(entries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_store() -> SqliteStore {
        SqliteStore::new(":memory:").expect("创建内存数据库失败")
    }

    fn now_str() -> String {
        "2026-04-30T00:00:00Z".to_string()
    }

    #[test]
    fn test_epic_crud() {
        let store = make_test_store();

        let epic = Epic {
            id: EpicId("epic-1".into()),
            title: "测试 Epic".into(),
            description: "描述".into(),
            status: None,
            specs: vec![],
            tickets: vec![],
            executions: vec![],
            created_at: now_str(),
            updated_at: now_str(),
        };

        store.save_epic(&epic).unwrap();

        let loaded = store.get_epic("epic-1").unwrap().unwrap();
        assert_eq!(loaded.title, "测试 Epic");
        assert!(loaded.status.is_none());

        let all = store.list_epics().unwrap();
        assert_eq!(all.len(), 1);

        store.delete_epic("epic-1").unwrap();
        assert!(store.get_epic("epic-1").unwrap().is_none());
    }

    #[test]
    fn test_ticket_crud() {
        let store = make_test_store();

        // 先创建 epic
        let epic = Epic {
            id: EpicId("epic-1".into()),
            title: "E".into(),
            description: "D".into(),
            status: None,
            specs: vec![],
            tickets: vec![],
            executions: vec![],
            created_at: now_str(),
            updated_at: now_str(),
        };
        store.save_epic(&epic).unwrap();

        let ticket = Ticket {
            id: TicketId("ticket-1".into()),
            epic_id: EpicId("epic-1".into()),
            title: "实现登录".into(),
            description: "用户登录功能".into(),
            status: TicketStatus::Todo,
            assignee: Some("claude-code".into()),
            is_streaming: true,
            spec_refs: vec![],
            created_at: now_str(),
            updated_at: now_str(),
        };

        store.save_ticket(&ticket).unwrap();

        let loaded = store.get_ticket("ticket-1").unwrap().unwrap();
        assert_eq!(loaded.title, "实现登录");
        assert_eq!(loaded.assignee.as_deref(), Some("claude-code"));
        assert!(loaded.is_streaming);

        let all = store.list_tickets("epic-1").unwrap();
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn test_history_crud() {
        let store = make_test_store();

        let entry = HistoryEntry {
            id: "h-1".into(),
            workflow: crate::protocol::WorkflowType::Plan,
            task_name: "测试任务".into(),
            prompt: "修复 bug".into(),
            file_path: "src/main.rs".into(),
            created_at: now_str(),
            status: "planned".into(),
        };

        store.save_history(&entry).unwrap();

        let all = store.list_history().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].task_name, "测试任务");
    }
}
