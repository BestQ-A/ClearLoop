mod analysis;
mod llm;
mod protocol;
mod persistence;
mod epic;
mod verification;
mod yolo;
mod agents;
mod mcp;

use std::collections::HashMap;
use std::io::{self, BufRead, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use protocol::*;
use protocol::epic as proto_epic;
use protocol::verification as proto_verify;
use protocol::yolo as proto_yolo;
use protocol::agents as proto_agents;
use protocol::streaming::{
    make_stream_event_notification, StreamEvent, StreamMessage,
};
use tokio::sync::{Mutex as AsyncMutex, RwLock};

use llm::{LlmProvider, StreamChunk};
use llm::ollama::OllamaProvider;
use llm::openai::OpenAiProvider;
use persistence::SqliteStore;
use epic::EpicManager;
use verification::VerificationEngine;
use agents::AgentOrchestrator;
use yolo::YoloRunner;
use mcp::McpManager;

/// 共享 stdout 写入句柄。所有 stdout 写入（同步响应 + 流式通知）都
/// 必须经过这个 Mutex，避免请求处理线程与流式后台任务交错写出半行 JSON。
type SharedStdout = Arc<AsyncMutex<io::Stdout>>;

/// 全局递增的 stream message id，用于给每条 `StreamMessage` 分配序号。
static STREAM_SEQ: AtomicU64 = AtomicU64::new(1);

fn next_stream_id() -> u64 {
    STREAM_SEQ.fetch_add(1, Ordering::Relaxed)
}

struct AppState {
    providers: HashMap<String, Arc<dyn LlmProvider>>,
    active_provider: String,
    history: Vec<HistoryEntry>,
    store: Arc<SqliteStore>,
    epic_mgr: Arc<EpicManager>,
    verify_engine: Arc<VerificationEngine>,
    agent_orch: Arc<RwLock<AgentOrchestrator>>,
    /// 长生命周期 YOLO 运行器——持有 active_runs 注册表，使 cancel 真正生效
    yolo_runner: Arc<YoloRunner>,
    /// MCP 服务器注册表（仅管理元数据，不真正启动 MCP 协议进程）
    mcp_mgr: Arc<McpManager>,
}

impl AppState {
    fn new() -> Self {
        let ollama_endpoint = std::env::var("CODESAIL_OLLAMA_ENDPOINT")
            .unwrap_or_else(|_| "http://localhost:11434".into());
        let ollama_model = std::env::var("CODESAIL_OLLAMA_MODEL")
            .unwrap_or_else(|_| "qwen3.5:9b".into());

        let ollama = Arc::new(OllamaProvider::new(llm::LlmConfig {
            endpoint: ollama_endpoint,
            model: ollama_model,
            api_key: None,
            temperature: None,
            max_tokens: None,
        }));

        let mut providers: HashMap<String, Arc<dyn LlmProvider>> = HashMap::new();
        providers.insert("ollama".into(), ollama);

        // 自动注册 OpenAI 兼容 API（通过环境变量配置）
        // 支持: CODESAIL_API_ENDPOINT + CODESAIL_API_KEY + CODESAIL_API_MODEL
        if let Ok(endpoint) = std::env::var("CODESAIL_API_ENDPOINT") {
            let api_key = std::env::var("CODESAIL_API_KEY").ok();
            let model = std::env::var("CODESAIL_API_MODEL")
                .unwrap_or_else(|_| "gpt-4o".into());
            let custom = Arc::new(OpenAiProvider::new(llm::LlmConfig {
                endpoint,
                model,
                api_key,
                temperature: None,
                max_tokens: None,
            }));
            providers.insert("openai".into(), custom);
        }

        let store = Arc::new(
            SqliteStore::new("codesail.db").expect("Failed to open SQLite database"),
        );
        let epic_mgr = Arc::new(EpicManager::new(store.clone()));
        let verify_engine = Arc::new(VerificationEngine::new(store.clone()));
        let agent_orch = Arc::new(RwLock::new(AgentOrchestrator::new()));
        let yolo_runner = Arc::new(YoloRunner::new(epic_mgr.clone(), verify_engine.clone()));
        let mcp_mgr = Arc::new(McpManager::new());

        // 默认 provider 走环境变量；若用户配了 openai 端点就默认用 openai
        let default_provider = std::env::var("CODESAIL_DEFAULT_PROVIDER")
            .ok()
            .filter(|s| providers.contains_key(s))
            .unwrap_or_else(|| {
                if providers.contains_key("openai") {
                    "openai".into()
                } else {
                    "ollama".into()
                }
            });

        Self {
            providers,
            active_provider: default_provider,
            history: Vec::new(),
            store,
            epic_mgr,
            verify_engine,
            agent_orch,
            yolo_runner,
            mcp_mgr,
        }
    }

    fn active(&self) -> Result<Arc<dyn LlmProvider>, String> {
        self.providers
            .get(&self.active_provider)
            .cloned()
            .ok_or_else(|| format!("No active provider '{}'", self.active_provider))
    }
}

fn make_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .with_writer(std::io::stderr)
        .init();

    let state = Arc::new(RwLock::new(AppState::new()));
    let stdout: SharedStdout = Arc::new(AsyncMutex::new(io::stdout()));
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();

    // ready 通知
    {
        let ready = JsonRpcResponse::ok(
            None,
            serde_json::json!({"status": "ready", "version": "2.0.0"}),
        );
        write_line(&stdout, &serde_json::to_string(&ready).unwrap()).await;
    }

    while let Some(Ok(line)) = lines.next() {
        if line.trim().is_empty() {
            continue;
        }

        let req: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let resp = JsonRpcResponse::err(None, -32700, format!("Parse error: {}", e));
                write_line(&stdout, &serde_json::to_string(&resp).unwrap()).await;
                continue;
            }
        };

        let method = req.method.clone();
        let resp = handle_request(req, &state, &stdout).await;
        let out = serde_json::to_string(&resp).unwrap();
        write_line(&stdout, &out).await;

        if method == "shutdown" {
            break;
        }
    }
}

/// 把一行 JSON 写到共享 stdout（独占锁内 writeln + flush）。
async fn write_line(stdout: &SharedStdout, line: &str) {
    let mut guard = stdout.lock().await;
    let _ = writeln!(*guard, "{}", line);
    let _ = guard.flush();
}

/// 发送一条 `StreamEvent` 作为 JSON-RPC `stream` 通知（无 id）。
async fn emit_stream(stdout: &SharedStdout, event: StreamEvent) {
    let msg = StreamMessage {
        id: next_stream_id(),
        event,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    let notif = make_stream_event_notification(msg.id, msg.event.clone(), msg.timestamp.clone());
    match serde_json::to_string(&notif) {
        Ok(line) => write_line(stdout, &line).await,
        Err(e) => {
            // fallback：序列化失败时输出最简错误（避免静默吞掉）
            tracing::warn!("emit_stream serialize failed: {}", e);
        }
    }
}

async fn handle_request(
    req: JsonRpcRequest,
    state: &Arc<RwLock<AppState>>,
    stdout: &SharedStdout,
) -> JsonRpcResponse {
    let id = req.id;
    match req.method.as_str() {
        // === Core ===
        "initialize" => JsonRpcResponse::ok(
            id,
            serde_json::json!({
                "version": "2.0.0",
                "providers": provider_list(state).await,
                "workflows": analysis::workflow::get_all_workflows_with_templates(),
            }),
        ),

        "listProviders" => JsonRpcResponse::ok(
            id,
            serde_json::to_value(provider_list(state).await).unwrap(),
        ),

        "setProvider" => {
            let params: SetProviderParams = match serde_json::from_value(req.params) {
                Ok(p) => p,
                Err(e) => return JsonRpcResponse::err(id, -32602, format!("Invalid params: {}", e)),
            };
            set_provider(state, params).await;
            JsonRpcResponse::ok(id, serde_json::json!({"status": "ok"}))
        }

        "listWorkflows" => JsonRpcResponse::ok(
            id,
            serde_json::to_value(analysis::workflow::get_all_workflows_with_templates()).unwrap(),
        ),

        // 重新扫描 resources/workflows/ 目录并返回最新合并结果。
        // 与 listWorkflows 的语义差异：reloadWorkflows 强调"重新读盘"，
        // 适合在编辑 JSON 模板后立即看到效果，无需重启服务。
        "reloadWorkflows" => {
            let workflows = analysis::workflow::get_all_workflows_with_templates();
            JsonRpcResponse::ok(id, serde_json::to_value(workflows).unwrap())
        }

        // === Plan / Validate / Generate (existing) ===
        "plan" => {
            let params: PlanParams = try_parse!(id, req.params);
            match run_plan(state, params).await {
                Ok(r) => JsonRpcResponse::ok(id, serde_json::to_value(r).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }
        "validate" => {
            let params: ValidateParams = try_parse!(id, req.params);
            match run_validation(state, params).await {
                Ok(r) => JsonRpcResponse::ok(id, serde_json::to_value(r).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }
        "generate" => {
            let params: GenerateParams = try_parse!(id, req.params);
            match run_generate(state, params).await {
                Ok(r) => JsonRpcResponse::ok(id, serde_json::to_value(r).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        // === Streaming variants ===
        // 这些路由在请求处理过程中以 `stream` 通知形式（无 id）持续推送
        // StreamEvent，最终再用与请求 id 匹配的常规 JSON-RPC response 收尾。
        "planStream" => {
            let params: PlanParams = try_parse!(id, req.params);
            match run_plan_stream(state, params, stdout).await {
                Ok(r) => JsonRpcResponse::ok(id, serde_json::to_value(r).unwrap()),
                Err(e) => {
                    emit_stream(
                        stdout,
                        StreamEvent::Error {
                            code: -32603,
                            message: e.clone(),
                        },
                    )
                    .await;
                    JsonRpcResponse::err(id, -32603, e)
                }
            }
        }
        "validateStream" => {
            let params: ValidateParams = try_parse!(id, req.params);
            match run_validation_stream(state, params, stdout).await {
                Ok(r) => JsonRpcResponse::ok(id, serde_json::to_value(r).unwrap()),
                Err(e) => {
                    emit_stream(
                        stdout,
                        StreamEvent::Error {
                            code: -32603,
                            message: e.clone(),
                        },
                    )
                    .await;
                    JsonRpcResponse::err(id, -32603, e)
                }
            }
        }
        "generateStream" => {
            let params: GenerateParams = try_parse!(id, req.params);
            match run_generate_stream(state, params, stdout).await {
                Ok(r) => JsonRpcResponse::ok(id, serde_json::to_value(r).unwrap()),
                Err(e) => {
                    emit_stream(
                        stdout,
                        StreamEvent::Error {
                            code: -32603,
                            message: e.clone(),
                        },
                    )
                    .await;
                    JsonRpcResponse::err(id, -32603, e)
                }
            }
        }

        "analyze" => {
            let params: AnalyzeParams = try_parse!(id, req.params);
            match run_analysis(state, params).await {
                Ok(r) => JsonRpcResponse::ok(id, serde_json::to_value(r).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        // === Epic CRUD ===
        "createEpic" => {
            let params: proto_epic::CreateEpicParams = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.create_epic(params) {
                Ok(epic) => JsonRpcResponse::ok(id, serde_json::to_value(epic).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "listEpics" => {
            let s = state.read().await;
            match s.epic_mgr.list_epics() {
                Ok(epics) => JsonRpcResponse::ok(id, serde_json::to_value(epics).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "getEpic" => {
            #[derive(serde::Deserialize)]
            struct P { id: String }
            let p: P = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.get_epic(&p.id) {
                Ok(epic) => JsonRpcResponse::ok(id, serde_json::to_value(epic).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "updateEpic" => {
            let params: proto_epic::UpdateEpicParams = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.update_epic(params) {
                Ok(epic) => JsonRpcResponse::ok(id, serde_json::to_value(epic).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "deleteEpic" => {
            #[derive(serde::Deserialize)]
            struct P { id: String }
            let p: P = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.delete_epic(&p.id) {
                Ok(()) => JsonRpcResponse::ok(id, serde_json::json!({"status": "deleted"})),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        // === Spec ===
        "createSpec" => {
            let params: proto_epic::CreateSpecParams = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.add_spec(params) {
                Ok(spec) => JsonRpcResponse::ok(id, serde_json::to_value(spec).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "updateSpec" => {
            let params: proto_epic::UpdateSpecParams = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.update_spec(params) {
                Ok(spec) => JsonRpcResponse::ok(id, serde_json::to_value(spec).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "deleteSpec" => {
            #[derive(serde::Deserialize)]
            struct P { epic_id: String, spec_id: String }
            let p: P = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.delete_spec(&p.epic_id, &p.spec_id) {
                Ok(()) => JsonRpcResponse::ok(id, serde_json::json!({"status": "deleted"})),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        // === Ticket ===
        "createTicket" => {
            let params: proto_epic::CreateTicketParams = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.add_ticket(params) {
                Ok(ticket) => JsonRpcResponse::ok(id, serde_json::to_value(ticket).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "updateTicket" => {
            let params: proto_epic::UpdateTicketParams = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.update_ticket(params) {
                Ok(ticket) => JsonRpcResponse::ok(id, serde_json::to_value(ticket).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "deleteTicket" => {
            #[derive(serde::Deserialize)]
            struct P { epic_id: String, ticket_id: String }
            let p: P = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.delete_ticket(&p.epic_id, &p.ticket_id) {
                Ok(()) => JsonRpcResponse::ok(id, serde_json::json!({"status": "deleted"})),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        // === Execution ===
        "startExecution" => {
            let params: proto_epic::StartExecutionParams = try_parse!(id, req.params);
            let s = state.read().await;
            match s.epic_mgr.start_execution(params) {
                Ok(exec) => JsonRpcResponse::ok(id, serde_json::to_value(exec).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        // === Verification ===
        "verify" => {
            let params: proto_verify::VerifyParams = try_parse!(id, req.params);
            let provider = {
                let s = state.read().await;
                match resolve_provider(&s, &params.provider) {
                    Ok(p) => p,
                    Err(resp) => return resp,
                }
            };
            let s = state.read().await;
            match s.verify_engine.verify(params, provider).await {
                Ok(result) => JsonRpcResponse::ok(id, serde_json::to_value(result).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "reVerify" => {
            let params: proto_verify::ReVerifyParams = try_parse!(id, req.params);
            let provider = {
                let s = state.read().await;
                match resolve_provider(&s, &params.provider) {
                    Ok(p) => p,
                    Err(resp) => return resp,
                }
            };
            let s = state.read().await;
            match s.verify_engine.re_verify(params, provider).await {
                Ok(result) => JsonRpcResponse::ok(id, serde_json::to_value(result).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        // === YOLO automation ===
        "yoloRun" => {
            let params: proto_yolo::YoloRunParams = try_parse!(id, req.params);

            // 解析 LLM provider —— 计划生成阶段需要
            let provider = {
                let s = state.read().await;
                match resolve_provider(&s, &params.provider) {
                    Ok(p) => p,
                    Err(resp) => return resp,
                }
            };

            // 拿到长生命周期 runner 句柄
            let runner = state.read().await.yolo_runner.clone();

            // 启动事件——告诉前端 YOLO 已经收到并即将开始
            emit_stream(
                stdout,
                StreamEvent::Progress {
                    phase: "YoloStart".into(),
                    percent: 0.0,
                    message: format!(
                        "Starting YOLO run for epic {} ({} tickets)",
                        params.epic_id,
                        params.ticket_ids.len()
                    ),
                },
            )
            .await;

            // 构造进度回调：把 YoloProgressEvent 桥接为 StreamEvent::Progress。
            // 注意回调本身是同步签名（Fn，不是 async），需要 spawn 异步任务来
            // emit_stream（emit_stream 持有 stdout 锁是 async 操作）。
            let stdout_cb = stdout.clone();
            let on_progress = move |event: yolo::YoloProgressEvent| {
                let stdout = stdout_cb.clone();
                tokio::spawn(async move {
                    emit_stream(
                        &stdout,
                        StreamEvent::Progress {
                            phase: format!("yolo:{:?}", event.phase),
                            percent: event.percent,
                            message: event.message,
                        },
                    )
                    .await;
                });
            };

            match runner.run(params, provider, on_progress).await {
                Ok(result) => {
                    let succeeded = result
                        .executions
                        .iter()
                        .filter(|e| {
                            matches!(e.status, proto_epic::ExecutionStatus::Completed)
                        })
                        .count();
                    let total = result.executions.len();

                    emit_stream(
                        stdout,
                        StreamEvent::Progress {
                            phase: "YoloComplete".into(),
                            percent: 100.0,
                            message: format!(
                                "Completed {}/{} tickets successfully",
                                succeeded, total
                            ),
                        },
                    )
                    .await;
                    emit_stream(
                        stdout,
                        StreamEvent::Done {
                            result_type: "yolo".into(),
                        },
                    )
                    .await;

                    JsonRpcResponse::ok(id, serde_json::to_value(result).unwrap())
                }
                Err(e) => {
                    emit_stream(
                        stdout,
                        StreamEvent::Error {
                            code: -32603,
                            message: e.clone(),
                        },
                    )
                    .await;
                    JsonRpcResponse::err(id, -32603, e)
                }
            }
        }

        "yoloCancel" => {
            #[derive(serde::Deserialize)]
            struct P {
                run_id: String,
            }
            let p: P = try_parse!(id, req.params);

            let runner = state.read().await.yolo_runner.clone();
            match runner.cancel(&p.run_id).await {
                Ok(()) => {
                    tracing::info!(run_id = %p.run_id, "yoloCancel 已生效");
                    JsonRpcResponse::ok(
                        id,
                        serde_json::json!({
                            "status": "cancelled",
                            "run_id": p.run_id,
                        }),
                    )
                }
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "yoloListActive" => {
            let runner = state.read().await.yolo_runner.clone();
            let active = runner.list_active().await;
            JsonRpcResponse::ok(id, serde_json::to_value(active).unwrap())
        }

        // === Agent handoff ===
        "handoff" => {
            #[derive(serde::Deserialize)]
            struct HandoffParams {
                payload: proto_agents::HandoffPayload,
                agent_id: String,
            }
            let p: HandoffParams = try_parse!(id, req.params);

            let orch = state.read().await.agent_orch.clone();
            let result = orch.read().await.handoff(p.payload, &p.agent_id).await;
            match result {
                Ok(r) => JsonRpcResponse::ok(id, serde_json::to_value(r).unwrap()),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "formatHandoff" => {
            let payload: proto_agents::HandoffPayload = try_parse!(id, req.params);
            let orch = state.read().await.agent_orch.clone();
            let markdown = orch.read().await.format_handoff_markdown(&payload);
            JsonRpcResponse::ok(id, serde_json::json!({ "markdown": markdown }))
        }

        // === Agents ===
        "listAgents" => {
            let orch = state.read().await.agent_orch.clone();
            let agents = orch.read().await.list_agents();
            JsonRpcResponse::ok(id, serde_json::to_value(agents).unwrap())
        }

        "registerAgent" => {
            let config: proto_agents::AgentConfig = try_parse!(id, req.params);
            let orch = state.read().await.agent_orch.clone();
            orch.write().await.register_agent(config);
            JsonRpcResponse::ok(id, serde_json::json!({"status": "registered"}))
        }

        // === MCP server registry ===
        "listMcpServers" => {
            let mgr = state.read().await.mcp_mgr.clone();
            let servers = mgr.list_servers().await;
            JsonRpcResponse::ok(id, serde_json::to_value(servers).unwrap())
        }

        "addMcpServer" => {
            use protocol::mcp::AddMcpServerParams;
            let params: AddMcpServerParams = try_parse!(id, req.params);
            let mgr = state.read().await.mcp_mgr.clone();
            match mgr.add_server(params.config).await {
                Ok(()) => JsonRpcResponse::ok(id, serde_json::json!({"status": "added"})),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "removeMcpServer" => {
            use protocol::mcp::RemoveMcpServerParams;
            let params: RemoveMcpServerParams = try_parse!(id, req.params);
            let mgr = state.read().await.mcp_mgr.clone();
            match mgr.remove_server(&params.id).await {
                Ok(()) => JsonRpcResponse::ok(id, serde_json::json!({"status": "removed"})),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        "toggleMcpServer" => {
            #[derive(serde::Deserialize)]
            struct P { id: String, enabled: bool }
            let p: P = try_parse!(id, req.params);
            let mgr = state.read().await.mcp_mgr.clone();
            match mgr.toggle_server(&p.id, p.enabled).await {
                Ok(()) => JsonRpcResponse::ok(id, serde_json::json!({"status": "ok"})),
                Err(e) => JsonRpcResponse::err(id, -32603, e),
            }
        }

        // === History ===
        "history" => {
            let s = state.read().await;
            // 合并内存历史和持久化历史
            let mut entries = s.history.clone();
            if let Ok(persisted) = s.store.list_history() {
                for pe in persisted {
                    if !entries.iter().any(|e| e.id == pe.id) {
                        entries.push(pe);
                    }
                }
            }
            JsonRpcResponse::ok(id, serde_json::to_value(&entries).unwrap())
        }

        "shutdown" => JsonRpcResponse::ok(id, serde_json::json!({"status": "shutting_down"})),

        _ => JsonRpcResponse::err(id, -32601, format!("Unknown method: {}", req.method)),
    }
}

// === Helper macro for parameter parsing ===

macro_rules! try_parse {
    ($id:expr, $params:expr) => {
        match serde_json::from_value($params) {
            Ok(p) => p,
            Err(e) => return JsonRpcResponse::err($id, -32602, format!("Invalid params: {}", e)),
        }
    };
}
use try_parse;

fn resolve_provider(
    state: &AppState,
    provider_id: &Option<String>,
) -> Result<Arc<dyn LlmProvider>, JsonRpcResponse> {
    if let Some(ref id) = provider_id {
        state
            .providers
            .get(id)
            .cloned()
            .ok_or_else(|| JsonRpcResponse::err(None, -32602, format!("Unknown provider: {}", id)))
    } else {
        state
            .active()
            .map_err(|e| JsonRpcResponse::err(None, -32603, e))
    }
}

// === Provider management ===

async fn provider_list(state: &Arc<RwLock<AppState>>) -> Vec<ProviderInfo> {
    let s = state.read().await;
    s.providers
        .values()
        .map(|p| ProviderInfo {
            id: p.id().into(),
            name: p.name().into(),
            models: p.models(),
            is_local: p.is_local(),
        })
        .collect()
}

async fn set_provider(state: &Arc<RwLock<AppState>>, params: SetProviderParams) {
    let mut s = state.write().await;

    let provider: Arc<dyn LlmProvider> = match params.provider.as_str() {
        "ollama" => Arc::new(OllamaProvider::new(llm::LlmConfig {
            endpoint: params.endpoint.unwrap_or_else(|| "http://localhost:11434".into()),
            model: params.model.unwrap_or_else(|| "qwen2.5-coder".into()),
            api_key: None,
            temperature: None,
            max_tokens: None,
        })),
        "openai" => Arc::new(OpenAiProvider::new(llm::LlmConfig {
            endpoint: params.endpoint.unwrap_or_else(|| "https://api.openai.com".into()),
            model: params.model.unwrap_or_else(|| "gpt-4o".into()),
            api_key: params.api_key,
            temperature: None,
            max_tokens: None,
        })),
        other => {
            Arc::new(OpenAiProvider::new(llm::LlmConfig {
                endpoint: params.endpoint.unwrap_or_else(|| format!("https://{}", other)),
                model: params.model.unwrap_or_else(|| "default".into()),
                api_key: params.api_key,
                temperature: None,
                max_tokens: None,
            }))
        }
    };

    s.providers.insert(params.provider.clone(), provider);
    s.active_provider = params.provider;
}

// === Core workflow handlers ===

async fn run_plan(state: &Arc<RwLock<AppState>>, params: PlanParams) -> Result<PlanResult, String> {
    let provider = {
        let s = state.read().await;
        if let Some(ref id) = params.provider {
            s.providers.get(id).cloned()
                .ok_or_else(|| format!("Unknown provider: {}", id))?
        } else {
            s.active()?
        }
    };

    let system = analysis::workflow::plan_system_prompt(&params.workflow);
    let user = format!(
        "# Existing Codebase\n<codebase>\n{}\n</codebase>\n\n# Task\n<task_details>\n{}\n</task_details>",
        params.code, params.prompt
    );

    let raw = provider.chat(&system, &user).await?;
    let mut result: PlanResult = parse_json(&raw)?;

    result.id = make_id();
    result.workflow = params.workflow.clone();

    for step in &mut result.steps {
        step.status = StepStatus::Pending;
    }

    let entry = HistoryEntry {
        id: result.id.clone(),
        workflow: params.workflow,
        task_name: result.task_name.clone(),
        prompt: params.prompt,
        file_path: String::new(),
        created_at: chrono_now(),
        status: "planned".into(),
    };

    let mut s = state.write().await;
    s.history.push(entry.clone());
    let _ = s.store.save_history(&entry);

    Ok(result)
}

async fn run_validation(state: &Arc<RwLock<AppState>>, params: ValidateParams) -> Result<ValidationResult, String> {
    let provider = {
        let s = state.read().await;
        if let Some(ref id) = params.provider {
            s.providers.get(id).cloned()
                .ok_or_else(|| format!("Unknown provider: {}", id))?
        } else {
            s.active()?
        }
    };

    let system = analysis::workflow::validation_system_prompt(&params.plan.workflow);
    let plan_json = serde_json::to_string_pretty(&params.plan)
        .map_err(|e| format!("Failed to serialize plan: {}", e))?;
    let user = format!(
        "# Plan to Validate\n```json\n{}\n```\n\n# Original Code\n```\n{}\n```",
        plan_json, params.original_code
    );

    let raw = provider.chat(&system, &user).await?;
    let mut result: ValidationResult = parse_json(&raw)?;
    result.plan_id = params.plan_id;

    let plan_id = result.plan_id.clone();
    let passed = result.passed;
    if let Some(entry) = state.write().await.history.iter_mut().find(|e| e.id == plan_id) {
        entry.status = if passed { "validated".into() } else { "needs_revision".into() };
    }

    Ok(result)
}

async fn run_generate(state: &Arc<RwLock<AppState>>, params: GenerateParams) -> Result<AnalyzeResult, String> {
    let provider = {
        let s = state.read().await;
        if let Some(ref id) = params.provider {
            s.providers.get(id).cloned()
                .ok_or_else(|| format!("Unknown provider: {}", id))?
        } else {
            s.active()?
        }
    };

    let system = analysis::system_prompt();
    let plan_json = serde_json::to_string_pretty(&params.plan)
        .map_err(|e| format!("Failed to serialize plan: {}", e))?;
    let user = format!(
        "# Approved Plan\n```json\n{}\n```\n\n# Existing Code\n```\n{}\n```\n\nImplement the plan. Generate complete file changes.",
        plan_json, params.code
    );

    let raw = provider.chat(&system, &user).await?;
    let result: AnalyzeResult = parse_json(&raw)?;

    let plan_id = params.plan.id.clone();
    if let Some(entry) = state.write().await.history.iter_mut().find(|e| e.id == plan_id) {
        entry.status = "generated".into();
    }

    Ok(result)
}

// === Streaming workflow handlers ===

/// 通用流式驱动：在后台 task 里跑 `chat_stream`，主任务从 mpsc receiver
/// 拉 chunk → 发 `StreamEvent::Token` 通知 → 累积全文。结束时 join 后台
/// task 拿到 provider 返回的最终字符串，并发出 `Done` 事件。
async fn drive_chat_stream(
    provider: Arc<dyn LlmProvider>,
    system: String,
    user: String,
    result_type: &str,
    stdout: &SharedStdout,
) -> Result<String, String> {
    let (tx, mut rx) = tokio::sync::mpsc::channel::<StreamChunk>(64);

    // 后台跑 LLM 流式调用
    let provider_clone = provider.clone();
    let task = tokio::spawn(async move {
        provider_clone.chat_stream(&system, &user, tx).await
    });

    let mut accumulated = String::new();
    let mut saw_done = false;

    while let Some(chunk) = rx.recv().await {
        if chunk.done {
            saw_done = true;
            emit_stream(
                stdout,
                StreamEvent::Done {
                    result_type: result_type.into(),
                },
            )
            .await;
            // 不要 break——某些 provider 可能在 done=true 之后再发空 chunk；
            // 但绝大多数实现到此为止，让 sender drop 自然关 channel。
        } else {
            if !chunk.delta.is_empty() {
                accumulated.push_str(&chunk.delta);
                emit_stream(
                    stdout,
                    StreamEvent::Token {
                        text: chunk.delta,
                    },
                )
                .await;
            }
        }
    }

    // join 后台 task：以它返回的完整字符串为权威结果（chat_stream 默认实现
    // 会把整段响应一次性塞 chunk，accumulated 正好等于 final；自定义实现
    // 也应保证两者一致，此处优先 final）。
    let final_text = match task.await {
        Ok(Ok(text)) => text,
        Ok(Err(e)) => return Err(e),
        Err(join_err) => return Err(format!("stream task join error: {}", join_err)),
    };

    if !saw_done {
        // 没收到 done=true，但任务正常结束——补一个 Done 事件，保持协议干净。
        emit_stream(
            stdout,
            StreamEvent::Done {
                result_type: result_type.into(),
            },
        )
        .await;
    }

    if final_text.is_empty() {
        Ok(accumulated)
    } else {
        Ok(final_text)
    }
}

async fn run_plan_stream(
    state: &Arc<RwLock<AppState>>,
    params: PlanParams,
    stdout: &SharedStdout,
) -> Result<PlanResult, String> {
    let provider = {
        let s = state.read().await;
        if let Some(ref id) = params.provider {
            s.providers
                .get(id)
                .cloned()
                .ok_or_else(|| format!("Unknown provider: {}", id))?
        } else {
            s.active()?
        }
    };

    emit_stream(
        stdout,
        StreamEvent::Progress {
            phase: "Planning".into(),
            percent: 0.0,
            message: "Analyzing codebase".into(),
        },
    )
    .await;

    let system = analysis::workflow::plan_system_prompt(&params.workflow);
    let user = format!(
        "# Existing Codebase\n<codebase>\n{}\n</codebase>\n\n# Task\n<task_details>\n{}\n</task_details>",
        params.code, params.prompt
    );

    let raw = drive_chat_stream(provider, system, user, "plan", stdout).await?;
    let mut result: PlanResult = parse_json(&raw)?;

    result.id = make_id();
    result.workflow = params.workflow.clone();
    for step in &mut result.steps {
        step.status = StepStatus::Pending;
    }

    // 解析完成后，把 plan 结构以语义事件再次推一遍，方便前端不依赖 token 累积。
    emit_stream(
        stdout,
        StreamEvent::PlanStart {
            task_name: result.task_name.clone(),
        },
    )
    .await;
    for step in &result.steps {
        emit_stream(
            stdout,
            StreamEvent::PlanStep {
                step: step.clone(),
            },
        )
        .await;
    }

    let entry = HistoryEntry {
        id: result.id.clone(),
        workflow: params.workflow,
        task_name: result.task_name.clone(),
        prompt: params.prompt,
        file_path: String::new(),
        created_at: chrono_now(),
        status: "planned".into(),
    };

    let mut s = state.write().await;
    s.history.push(entry.clone());
    let _ = s.store.save_history(&entry);

    Ok(result)
}

async fn run_validation_stream(
    state: &Arc<RwLock<AppState>>,
    params: ValidateParams,
    stdout: &SharedStdout,
) -> Result<ValidationResult, String> {
    let provider = {
        let s = state.read().await;
        if let Some(ref id) = params.provider {
            s.providers
                .get(id)
                .cloned()
                .ok_or_else(|| format!("Unknown provider: {}", id))?
        } else {
            s.active()?
        }
    };

    emit_stream(stdout, StreamEvent::ValidationStart).await;
    emit_stream(
        stdout,
        StreamEvent::Progress {
            phase: "Validation".into(),
            percent: 0.0,
            message: "Reviewing plan".into(),
        },
    )
    .await;

    let system = analysis::workflow::validation_system_prompt(&params.plan.workflow);
    let plan_json = serde_json::to_string_pretty(&params.plan)
        .map_err(|e| format!("Failed to serialize plan: {}", e))?;
    let user = format!(
        "# Plan to Validate\n```json\n{}\n```\n\n# Original Code\n```\n{}\n```",
        plan_json, params.original_code
    );

    let raw = drive_chat_stream(provider, system, user, "validation", stdout).await?;
    let mut result: ValidationResult = parse_json(&raw)?;
    result.plan_id = params.plan_id;

    // 推送 ValidationComment 语义事件
    for comment in &result.comments {
        emit_stream(
            stdout,
            StreamEvent::ValidationComment {
                comment: comment.clone(),
            },
        )
        .await;
    }

    let plan_id = result.plan_id.clone();
    let passed = result.passed;
    if let Some(entry) = state
        .write()
        .await
        .history
        .iter_mut()
        .find(|e| e.id == plan_id)
    {
        entry.status = if passed {
            "validated".into()
        } else {
            "needs_revision".into()
        };
    }

    Ok(result)
}

async fn run_generate_stream(
    state: &Arc<RwLock<AppState>>,
    params: GenerateParams,
    stdout: &SharedStdout,
) -> Result<AnalyzeResult, String> {
    let provider = {
        let s = state.read().await;
        if let Some(ref id) = params.provider {
            s.providers
                .get(id)
                .cloned()
                .ok_or_else(|| format!("Unknown provider: {}", id))?
        } else {
            s.active()?
        }
    };

    emit_stream(
        stdout,
        StreamEvent::Progress {
            phase: "Generation".into(),
            percent: 0.0,
            message: "Generating file changes".into(),
        },
    )
    .await;

    let system = analysis::system_prompt();
    let plan_json = serde_json::to_string_pretty(&params.plan)
        .map_err(|e| format!("Failed to serialize plan: {}", e))?;
    let user = format!(
        "# Approved Plan\n```json\n{}\n```\n\n# Existing Code\n```\n{}\n```\n\nImplement the plan. Generate complete file changes.",
        plan_json, params.code
    );

    let raw = drive_chat_stream(provider, system, user, "generate", stdout).await?;
    let result: AnalyzeResult = parse_json(&raw)?;

    // 推送每个 FileChange 的 GenerationStart/Complete 语义事件
    for fc in &result.file_changes {
        emit_stream(
            stdout,
            StreamEvent::GenerationStart {
                file_path: fc.file_path.clone(),
            },
        )
        .await;
        emit_stream(
            stdout,
            StreamEvent::GenerationComplete {
                file_change: fc.clone(),
            },
        )
        .await;
    }

    let plan_id = params.plan.id.clone();
    if let Some(entry) = state
        .write()
        .await
        .history
        .iter_mut()
        .find(|e| e.id == plan_id)
    {
        entry.status = "generated".into();
    }

    Ok(result)
}

async fn run_analysis(state: &Arc<RwLock<AppState>>, params: AnalyzeParams) -> Result<AnalyzeResult, String> {
    let provider = {
        let s = state.read().await;
        if let Some(ref id) = params.provider {
            s.providers.get(id).cloned()
                .ok_or_else(|| format!("Unknown provider: {}", id))?
        } else {
            s.active()?
        }
    };

    let (system, user) = analysis::build_analysis_prompt(&params.code, &params.prompt);
    let raw = provider.chat(&system, &user).await?;
    parse_json(&raw)
}

// === Utilities ===

fn parse_json<T: serde::de::DeserializeOwned>(raw: &str) -> Result<T, String> {
    if let Ok(result) = serde_json::from_str::<T>(raw) {
        return Ok(result);
    }

    let cleaned = raw
        .replace("```json", "")
        .replace("```", "")
        .trim()
        .to_string();

    serde_json::from_str::<T>(&cleaned)
        .map_err(|e| format!("Failed to parse LLM response: {}. Raw: {}", e, &raw[..raw.len().min(200)]))
}

fn chrono_now() -> String {
    chrono::Utc::now().to_rfc3339()
}
