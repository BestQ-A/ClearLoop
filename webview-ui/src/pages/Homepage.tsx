import { useState, useEffect, useRef } from "react";
import type {
  FilePath, WorkflowType, WorkflowInfo, PlanResult, ValidationResult, ViewMode,
  ProviderInfo, HistoryEntry, Epic, AgentConfig, StreamEvent, VerificationThread, YoloConfig,
  ConversationTurn,
} from "../types/Homepage";
import { getVsCodeApi } from "../utils/vscode";
import WorkflowSelector from "../components/HomePage/WorkflowSelector";
import PlanView from "../components/HomePage/PlanView";
import ValidationView from "../components/HomePage/ValidationView";
import SettingsPanel from "../components/HomePage/SettingsPanel";
import HistoryPanel from "../components/HomePage/HistoryPanel";
import ChatInput from "../components/HomePage/ChatInput";
import ConversationView from "../components/HomePage/ConversationView";
import EpicBoard from "../components/HomePage/EpicBoard";
import EpicDetail from "../components/HomePage/EpicDetail";
import AgentSelector from "../components/HomePage/AgentSelector";
import YoloPanel from "../components/HomePage/YoloPanel";
import EnhancedVerificationView from "../components/HomePage/EnhancedVerificationView";
import StreamingView from "../components/HomePage/StreamingView";
import McpPanel from "../components/HomePage/McpPanel";
import CommandPalette, { type PaletteCommand } from "../components/HomePage/CommandPalette";
import NavigationBar from "../components/Navigation/NavigationBar";

// 兼容性 UUID 生成（部分 webview 环境无 crypto.randomUUID）
const genId = (): string => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* fallthrough */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const Homepage = () => {
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowType>("plan");
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [currentEpic, setCurrentEpic] = useState<Epic | null>(null);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("claude-code");
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [verificationThreads, setVerificationThreads] = useState<VerificationThread[]>([]);
  const [yoloConfig, setYoloConfig] = useState<YoloConfig>({
    skip_plan: false, auto_approve: false, disable_verification: false,
    severity_threshold: "MAJOR", max_retries: 3, auto_fix: true,
    execution_agent: "claude-code", timeout_minutes: 10, auto_commit: false,
  });
  const [yoloRunning, setYoloRunning] = useState(false);
  const [yoloResults, setYoloResults] = useState<any[]>([]);
  const [allFiles, setAllFiles] = useState<FilePath[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FilePath[]>([]);
  const [selectedModel, setSelectedModel] = useState("qwen3.5:9b");
  const [modelProfile, setModelProfile] = useState<"frontier" | "balanced" | "eco">("balanced");
  const [paletteOpen, setPaletteOpen] = useState(false);
  // === Conversation 状态：Traycer 风格"chat with the plan" ===
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [conversationId, setConversationId] = useState<string>(() => genId());

  const vscodeRef = useRef(getVsCodeApi());
  const send = (command: string, data?: any) => vscodeRef.current.postMessage({ command, data });

  useEffect(() => { send("fetchdata"); send("initialize"); }, []);

  const handleSubmit = (text: string) => {
    if (!text.trim()) return;
    // 立即追加用户 turn 到对话流
    const userTurn: ConversationTurn = {
      id: genId(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setConversation((prev) => [...prev, userTurn]);

    setError("");
    setIsLoading(true);
    // 默认走流式：MessageHandler 会包裹 streamStart/streamEnd，并由全局监听器实时转发 streamEvent
    // 携带 previousPlan + conversationId 以便后端做 plan 修订（revision context）
    send("planStream", {
      filePaths: selectedFiles.map((f) => f.path),
      files: selectedFiles,
      prompt: text,
      workflow: activeWorkflow,
      previousPlan: planResult || undefined,
      conversationId,
    });
  };

  const handleValidate = () => {
    if (!planResult) return;
    setIsLoading(true);
    setValidationResult(null);
    send("validateStream", { planId: planResult.id, plan: planResult });
  };

  const handleGenerate = (agent: string) => {
    if (!planResult) return;
    setIsLoading(true);
    send("generateStream", { plan: planResult, agent });
  };

  const handleClear = () => {
    setPlanResult(null);
    setValidationResult(null);
    setError("");
    setIsLoading(false);
    setSelectedFiles([]);
    setViewMode("home");
    // 重置对话流（New Conversation）
    setConversation([]);
    setConversationId(genId());
  };

  // 斜杠命令分发：把 /cmd args 映射到现有 handler
  const handleSlashCommand = (cmd: string, args?: string) => {
    switch (cmd) {
      case "plan":
        setActiveWorkflow("plan");
        handleSubmit(args || "");
        break;
      case "refactoring":
      case "refactor":
        setActiveWorkflow("refactoring");
        handleSubmit(args || "");
        break;
      case "agile":
        setActiveWorkflow("agile");
        handleSubmit(args || "");
        break;
      case "verify":
        if (planResult) handleValidate();
        break;
      case "epic":
        setViewMode("epic");
        break;
      case "yolo":
        setViewMode("yolo");
        break;
      case "palette":
        setPaletteOpen(true);
        break;
      case "clear":
        handleClear();
        break;
      case "help":
        // 暂时仅控制台输出，后续可改为内联提示
        console.log("Available commands: /plan, /refactoring, /agile, /verify, /epic, /yolo, /palette, /clear, /help");
        break;
      default:
        console.warn(`Unknown slash command: /${cmd}`);
    }
  };

  // 命令面板：聚合所有可执行命令（导航 / 工作流 / 操作）
  const paletteCommands: PaletteCommand[] = [
    // Navigation
    { id: "nav-home", label: "Go to Home", category: "Nav", action: () => setViewMode("home") },
    { id: "nav-epic", label: "Open Epic Board", category: "Nav", shortcut: "⌘E", action: () => setViewMode("epic") },
    { id: "nav-agents", label: "Manage Agents", category: "Nav", action: () => setViewMode("agents") },
    { id: "nav-yolo", label: "YOLO Mode", category: "Nav", action: () => setViewMode("yolo") },
    { id: "nav-mcp", label: "MCP Servers", category: "Nav", action: () => setViewMode("mcp") },
    { id: "nav-history", label: "Task History", category: "Nav", action: () => setViewMode("history") },
    { id: "nav-settings", label: "Open Settings", category: "Nav", shortcut: "⌘,", action: () => setViewMode("settings") },
    // Workflows
    { id: "wf-plan", label: "Switch to Plan workflow", category: "Workflow", action: () => setActiveWorkflow("plan") },
    { id: "wf-refactoring", label: "Switch to Refactoring workflow", category: "Workflow", action: () => setActiveWorkflow("refactoring") },
    { id: "wf-agile", label: "Switch to Agile workflow", category: "Workflow", action: () => setActiveWorkflow("agile") },
    // Actions
    { id: "act-new", label: "New Task", category: "Action", shortcut: "⌘N", action: handleClear },
    { id: "act-validate", label: "Validate current plan", category: "Action", action: handleValidate },
    { id: "act-execute", label: "Execute current plan", category: "Action", action: () => handleGenerate(selectedAgent) },
    { id: "act-reload-workflows", label: "Reload workflow templates", category: "Action", action: () => send("reloadWorkflows") },
  ];

  // 全局键盘快捷键：Cmd/Ctrl + K / N / E / , 以及 Esc 取消流式
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K opens palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      // Cmd/Ctrl + N — new task
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !paletteOpen) {
        e.preventDefault();
        handleClear();
      }
      // Cmd/Ctrl + E — epic board
      if ((e.metaKey || e.ctrlKey) && e.key === "e" && !paletteOpen) {
        e.preventDefault();
        setViewMode("epic");
      }
      // Cmd/Ctrl + , — settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setViewMode("settings");
      }
      // Esc cancels streaming
      if (e.key === "Escape" && isStreaming) {
        send("cancelStream");
        setIsStreaming(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, isStreaming]);

  // Messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { command, text, data } = event.data;
      switch (command) {
        case "all-files": setAllFiles(data); break;
        case "initialized":
          if (data?.workflows) setWorkflows(data.workflows);
          if (data?.providers) setProviders(data.providers);
          break;
        case "providers": setProviders(data); break;
        case "planResult":
          try {
            const plan = typeof text === "string" ? JSON.parse(text) : text;
            setPlanResult(plan); setViewMode("plan"); setIsLoading(false);
          } catch { setError("Invalid plan response."); setIsLoading(false); }
          break;
        case "validationResult":
          try {
            const vr = typeof text === "string" ? JSON.parse(text) : text;
            setValidationResult(vr); setViewMode("validation"); setIsLoading(false);
          } catch { setError("Invalid validation response."); setIsLoading(false); }
          break;
        case "generateResult":
          try {
            const gen = typeof text === "string" ? JSON.parse(text) : text;
            if (planResult) setPlanResult({ ...planResult, file_changes: gen.file_changes || [] });
            setIsLoading(false);
          } catch { setError("Invalid generation response."); setIsLoading(false); }
          break;
        case "analysisStart": setIsLoading(true); break;
        case "final":
          try {
            const parsed = JSON.parse(text);
            setPlanResult({
              id: "legacy", workflow: activeWorkflow, task_name: parsed.task_name,
              problem_context: "", user_experience: "", technical_approach: "",
              steps: (parsed.thinking_steps || []).map((s: any, i: number) => ({
                id: `step-${i}`, title: s.step_title, description: s.step_description,
                status: "completed" as const, dependencies: [],
              })),
              file_changes: parsed.file_changes || [], clarification: parsed.clarification,
            });
            setViewMode("plan"); setIsLoading(false);
          } catch { setError("Invalid response."); setIsLoading(false); }
          break;
        case "error": setError(text); setIsLoading(false); break;
        case "historyResult": setHistory(data || []); break;
        case "epicList": setEpics(data); break;
        case "epicDetail": setCurrentEpic(data); setViewMode("epicDetail"); break;
        case "epicCreated": setEpics((p) => [...p, data]); break;
        case "epicUpdated":
          setEpics((p) => p.map((e) => e.id === data.id ? data : e));
          if (currentEpic?.id === data.id) setCurrentEpic(data);
          break;
        case "epicDeleted": setEpics((p) => p.filter((e) => e.id !== data.id)); setCurrentEpic(null); setViewMode("epic"); break;
        case "specCreated": if (currentEpic) setCurrentEpic({ ...currentEpic, specs: [...currentEpic.specs, data] }); break;
        case "specUpdated":
          if (currentEpic) setCurrentEpic({ ...currentEpic, specs: currentEpic.specs.map((s) => s.id === data.id ? data : s) });
          break;
        case "specDeleted":
          if (currentEpic) setCurrentEpic({ ...currentEpic, specs: currentEpic.specs.filter((s) => s.id !== data.spec_id) });
          break;
        case "ticketCreated": if (currentEpic) setCurrentEpic({ ...currentEpic, tickets: [...currentEpic.tickets, data] }); break;
        case "ticketUpdated":
          if (currentEpic) setCurrentEpic({ ...currentEpic, tickets: currentEpic.tickets.map((t) => t.id === data.id ? data : t) });
          break;
        case "ticketDeleted":
          if (currentEpic) setCurrentEpic({ ...currentEpic, tickets: currentEpic.tickets.filter((t) => t.id !== data.ticket_id) });
          break;
        case "executionStarted": if (currentEpic) setCurrentEpic({ ...currentEpic, executions: [...currentEpic.executions, data] }); break;
        case "verifyResult":
          try { const vr = typeof data === "string" ? JSON.parse(data) : data; setVerificationThreads(vr.threads || []); } catch {}
          break;
        case "agentList": setAgents(data); break;
        case "streamStart":
          // 流式开始：StreamingView 接管 UI，关闭 loading 转圈避免与之竞争
          setIsStreaming(true);
          setStreamEvents([]);
          setIsLoading(false);
          break;
        case "streamEvent": setStreamEvents((p) => [...p, data]); break;
        case "streamEnd": setIsStreaming(false); break;
        case "yoloResult": setYoloRunning(false); setYoloResults(data.executions || []); break;
        case "yoloProgress": setYoloResults((p) => [...p, data]); break;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeWorkflow, planResult, currentEpic]);

  useEffect(() => {
    if (viewMode === "epic") { send("listEpics"); send("listAgents"); }
    if (viewMode === "agents") send("listAgents");
  }, [viewMode]);

  // Models from first provider
  const modelList = providers[0]?.models || ["qwen3.5:9b"];

  // Views that hide the bottom input bar
  const hideInput = ["settings", "history", "epic", "epicDetail", "agents", "yolo", "verification", "mcp"].includes(viewMode);

  // Sub-view title for breadcrumb
  const subTitle = viewMode === "plan" && planResult ? planResult.task_name
    : viewMode === "epicDetail" && currentEpic ? currentEpic.title : null;

  return (
    <div className="flex flex-col h-[100vh] bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)] overflow-hidden">

      {/* ===== TOP BAR — Traycer NavigationBar 1:1 ===== */}
      <NavigationBar />

      {/* ===== SECONDARY NAV — context breadcrumb ===== */}
      {(subTitle || !["home"].includes(viewMode)) && viewMode !== "settings" && viewMode !== "history" && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--vscode-panel-border)] text-[11px]">
          {viewMode !== "home" && (
            <button
              onClick={() => {
                if (viewMode === "epicDetail") setViewMode("epic");
                else if (["plan", "validation", "verification"].includes(viewMode)) setViewMode("home");
                else setViewMode("home");
              }}
              className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] cursor-pointer"
            >
              &lt;
            </button>
          )}
          {viewMode !== "home" && (
            <button
              className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] cursor-pointer"
            >
              &gt;
            </button>
          )}
          <span className="text-[var(--vscode-foreground)] font-medium ml-1">
            {viewMode === "home" ? "Create new task"
              : viewMode === "plan" ? subTitle || "Plan"
              : viewMode === "epic" ? "Epic Board"
              : viewMode === "epicDetail" ? subTitle || "Epic"
              : viewMode === "agents" ? "Agents"
              : viewMode === "yolo" ? "Auto Mode"
              : viewMode === "validation" ? "Validation"
              : viewMode === "verification" ? "Verification"
              : viewMode === "mcp" ? "MCP Servers"
              : ""}
          </span>
        </div>
      )}

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 流式视图优先于其他子视图：只要正在流式，就接管主内容区 */}
        {isStreaming && (
          <StreamingView events={streamEvents} isStreaming={isStreaming} onCancel={() => { send("cancelStream"); setIsStreaming(false); }} />
        )}

        {!isStreaming && viewMode === "settings" && <SettingsPanel providers={providers} sendToExtension={send} onBack={() => setViewMode("home")} />}
        {!isStreaming && viewMode === "history" && <HistoryPanel history={history} sendToExtension={send} onBack={() => setViewMode("home")} />}

        {!isStreaming && viewMode === "home" && !planResult && !isLoading && (
          <WorkflowSelector active={activeWorkflow} onSelect={setActiveWorkflow} />
        )}
        {!isStreaming && viewMode === "home" && isLoading && !planResult && (
          <div className="flex justify-center items-center h-full">
            <div className="flex flex-col items-center gap-2">
              <svg className="animate-spin h-6 w-6 text-[var(--vscode-foreground)] opacity-50" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-70" fill="currentColor" d="M4 12a8 8 0 018-8v8h8a8 8 0 01-8 8 8 8 0 01-8-8z" />
              </svg>
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                {activeWorkflow === "refactoring"
                  ? "Refactoring..."
                  : activeWorkflow === "agile"
                  ? "Building epic..."
                  : "Planning..."}
              </span>
            </div>
          </div>
        )}

        {!isStreaming && viewMode === "plan" && planResult && <PlanView plan={planResult} isLoading={isLoading} onValidate={handleValidate} onGenerate={handleGenerate} />}
        {!isStreaming && viewMode === "validation" && validationResult && <ValidationView result={validationResult} isLoading={isLoading} onGenerate={() => handleGenerate("local")} />}
        {!isStreaming && viewMode === "epic" && <EpicBoard epics={epics} onSelectEpic={(epic) => { setCurrentEpic(epic); send("getEpic", { epic_id: epic.id }); setViewMode("epicDetail"); }} onCreateEpic={() => {}} sendToExtension={send} />}
        {!isStreaming && viewMode === "epicDetail" && currentEpic && <EpicDetail epic={currentEpic} onBack={() => setViewMode("epic")} sendToExtension={send} />}
        {!isStreaming && viewMode === "agents" && <AgentSelector agents={agents} selectedAgent={selectedAgent} onSelect={setSelectedAgent} onRegister={(c) => setAgents((p) => [...p, c])} sendToExtension={send} />}
        {!isStreaming && viewMode === "yolo" && <YoloPanel config={yoloConfig} onConfigChange={setYoloConfig} onStart={() => setYoloRunning(true)} isRunning={yoloRunning} results={yoloResults} sendToExtension={send} />}
        {!isStreaming && viewMode === "mcp" && <McpPanel sendToExtension={send} />}
        {!isStreaming && viewMode === "verification" && <EnhancedVerificationView threads={verificationThreads} overallPassed={verificationThreads.every((t) => t.status === "resolved")} overallScore={verificationThreads.length ? verificationThreads.filter((t) => t.status === "resolved").length / verificationThreads.length : 0} promptForAgent={verificationThreads.flatMap((t) => t.comments).filter((c) => !c.is_applied).map((c) => c.prompt_for_ai_agent).join("\n")} isLoading={isLoading} onReVerify={() => { setIsLoading(true); send("reVerify"); }} onResolveComment={(tid, cid) => { send("resolveComment", { threadId: tid, commentId: cid }); setVerificationThreads((p) => p.map((t) => t.id === tid ? { ...t, comments: t.comments.map((c) => c.id === cid ? { ...c, is_applied: true } : c) } : t)); }} onCopyPrompt={() => { navigator.clipboard.writeText(verificationThreads.flatMap((t) => t.comments).filter((c) => !c.is_applied).map((c) => c.prompt_for_ai_agent).join("\n\n---\n\n")); }} />}

        {/* Error toast */}
        {error && (
          <div className="fixed bottom-20 left-3 right-3 p-2.5 bg-[var(--vscode-inputValidation-errorBackground,#5a1d1d)] border border-[var(--vscode-inputValidation-errorBorder,#be1100)] rounded text-[11px] z-50">
            <div className="flex items-start justify-between">
              <span>{error}</span>
              <button onClick={() => setError("")} className="ml-2 text-[var(--vscode-foreground)] cursor-pointer opacity-60 hover:opacity-100">x</button>
            </div>
          </div>
        )}
      </div>

      {/* ===== BOTTOM BAR — Traycer style ===== */}
      {!hideInput && (
        <div className="shrink-0 border-t border-[var(--vscode-panel-border)]">
          {/* Chat input */}
          <ChatInput
            files={allFiles}
            selectedFiles={selectedFiles}
            onAttachFile={(f) => { if (!selectedFiles.find((sf) => sf.path === f.path)) setSelectedFiles([...selectedFiles, f]); }}
            onRemoveFile={(f) => setSelectedFiles(selectedFiles.filter((sf) => sf.path !== f.path))}
            onSend={handleSubmit}
            onSlashCommand={handleSlashCommand}
            isLoading={isLoading}
            placeholder="Type your message here (@mention for context)"
          />

          {/* Workflow + Profile + Model selector bar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--vscode-panel-border)] gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <select
                value={activeWorkflow}
                onChange={(e) => setActiveWorkflow(e.target.value as WorkflowType)}
                className="text-[10px] px-1.5 py-1 rounded bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border)] cursor-pointer focus:outline-none"
              >
                <option value="plan">Plan Workflow</option>
                <option value="refactoring">Refactoring Workflow</option>
                <option value="agile">Agile Workflow</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <select
                value={modelProfile}
                onChange={(e) => {
                  const next = e.target.value as "frontier" | "balanced" | "eco";
                  setModelProfile(next);
                  // 暂时仅记录，后续接后端
                  console.log(`Model profile changed to: ${next}`);
                }}
                className="text-[10px] px-1.5 py-1 rounded bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border)] cursor-pointer focus:outline-none"
                title="Model Profile"
              >
                <option value="frontier">Frontier</option>
                <option value="balanced">Balanced</option>
                <option value="eco">Eco</option>
              </select>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="text-[10px] px-1.5 py-1 rounded bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border)] cursor-pointer focus:outline-none"
              >
                {modelList.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ===== Command Palette (⌘K) ===== */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />
    </div>
  );
};

export default Homepage;
