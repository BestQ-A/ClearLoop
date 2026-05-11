import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type {
  AgentConfig,
  ConversationTurn,
  Epic,
  FilePath,
  HistoryEntry,
  PlanResult,
  ProviderInfo,
  StreamEvent,
  ValidationResult,
  WorkflowType,
} from "../types/Homepage";
import { getVsCodeApi } from "../utils/vscode";
import ChatInput from "../components/HomePage/ChatInput";
import CommandPalette, { type PaletteCommand } from "../components/HomePage/CommandPalette";
import NavigationBar from "../components/Navigation/NavigationBar";
import { TraycerAppProvider, type TraycerNotification } from "./TraycerAppContext";

const genId = (): string => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to compact random id
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const toFilePath = (filePath: string): FilePath => {
  const name = filePath.split(/[\\/]/).pop() || filePath;
  const ext = name.includes(".") ? name.split(".").pop() || "" : "";
  return { path: filePath, name, extension: ext, icon: "file" };
};

function parsePayload<T>(text: unknown, data: unknown): T {
  const raw = text ?? data;
  if (typeof raw === "string") {
    return JSON.parse(raw) as T;
  }
  return raw as T;
}

export default function RootLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const vscodeRef = useRef(getVsCodeApi());

  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowType>("plan");
  const [activeEntryStep, setActiveEntryStep] = useState<string | undefined>("trigger");
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
  const [allFiles, setAllFiles] = useState<FilePath[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FilePath[]>([]);
  const [selectedModel, setSelectedModel] = useState("qwen3.5:9b");
  const [modelProfile, setModelProfile] = useState<"frontier" | "balanced" | "eco">("balanced");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [conversationId, setConversationId] = useState<string>(() => genId());
  const [taskChainId, setTaskChainId] = useState<string>(() => genId());

  const sendToExtension = useCallback((command: string, data?: unknown) => {
    vscodeRef.current.postMessage({ command, data });
  }, []);

  const setWorkflowSelection = useCallback((workflow: WorkflowType, entryStep?: string) => {
    setActiveWorkflow(workflow);
    setActiveEntryStep(entryStep);
  }, []);

  const attachFile = useCallback((file: FilePath) => {
    setSelectedFiles((prev) =>
      prev.some((selected) => selected.path === file.path) ? prev : [...prev, file],
    );
  }, []);

  const removeFile = useCallback((file: FilePath) => {
    setSelectedFiles((prev) => prev.filter((selected) => selected.path !== file.path));
  }, []);

  const startTask = useCallback(
    (text: string, workflow: WorkflowType, filesOverride?: FilePath[]) => {
      const prompt = text.trim();
      if (!prompt) return;
      const files = filesOverride ?? selectedFiles;

      const chainId = taskChainId || genId();
      setTaskChainId(chainId);
      setError("");
      setIsLoading(true);
      setValidationResult(null);
      navigate(`/task/loading/${encodeURIComponent(chainId)}`);

      const userTurn: ConversationTurn = {
        id: genId(),
        role: "user",
        content: prompt,
        timestamp: new Date().toISOString(),
        workflow,
      };
      setConversation((prev) => [...prev, userTurn]);

      sendToExtension("planStream", {
        filePaths: files.map((file) => file.path),
        files,
        prompt,
        workflow,
        previousPlan: planResult || undefined,
        conversationId,
        entryStep: activeEntryStep,
        modelProfile,
        model: selectedModel,
      });
    },
    [
      activeEntryStep,
      conversationId,
      modelProfile,
      navigate,
      planResult,
      selectedFiles,
      selectedModel,
      sendToExtension,
      taskChainId,
    ],
  );

  const handleSubmit = useCallback(
    (text: string) => {
      const prompt = text.trim();
      if (!prompt) return;

      if (pathname.startsWith("/epic/chat")) {
        const title = prompt.split(/\r?\n/)[0].slice(0, 96) || "Untitled Epic";
        setConversation((prev) => [
          ...prev,
          {
            id: genId(),
            role: "user",
            content: prompt,
            timestamp: new Date().toISOString(),
            workflow: "agile",
          },
        ]);

        if (currentEpic) {
          sendToExtension("createTicket", {
            epic_id: currentEpic.id,
            title,
            description: prompt,
          });
        } else {
          sendToExtension("createEpic", {
            title,
            description: prompt,
          });
        }
        return;
      }

      startTask(prompt, activeWorkflow);
    },
    [activeWorkflow, currentEpic, pathname, sendToExtension, startTask],
  );

  const handleValidate = useCallback(() => {
    if (!planResult) return;
    setIsLoading(true);
    setValidationResult(null);
    sendToExtension("validateStream", { planId: planResult.id, plan: planResult });
  }, [planResult, sendToExtension]);

  const handleGenerate = useCallback(
    (agent: string) => {
      if (!planResult) return;
      setIsLoading(true);
      sendToExtension("generateStream", { plan: planResult, agent });
    },
    [planResult, sendToExtension],
  );

  const cancelStream = useCallback(() => {
    sendToExtension("cancelStream");
    setIsStreaming(false);
    setIsLoading(false);
  }, [sendToExtension]);

  const handleClear = useCallback(() => {
    const nextId = genId();
    setPlanResult(null);
    setValidationResult(null);
    setError("");
    setIsLoading(false);
    setIsStreaming(false);
    setStreamEvents([]);
    setSelectedFiles([]);
    setConversation([]);
    setConversationId(nextId);
    setTaskChainId(nextId);
    setCurrentEpic(null);
    navigate("/");
  }, [navigate]);

  const refreshHistory = useCallback(() => sendToExtension("history"), [sendToExtension]);
  const refreshEpics = useCallback(() => {
    sendToExtension("listEpics");
    sendToExtension("listAgents");
  }, [sendToExtension]);

  const openEpic = useCallback(
    (epic: Epic) => {
      setCurrentEpic(epic);
      sendToExtension("getEpic", { id: epic.id });
      navigate(`/epic/chat/${encodeURIComponent(epic.id)}`);
    },
    [navigate, sendToExtension],
  );

  const createEpic = useCallback(() => {
    sendToExtension("createEpic", {
      title: "Untitled Epic",
      description: "New Traycer epic",
    });
  }, [sendToExtension]);

  const handleSlashCommand = useCallback(
    (cmd: string, args?: string) => {
      switch (cmd) {
        case "plan":
          setWorkflowSelection("plan", "trigger");
          if (args) startTask(args, "plan");
          else navigate("/");
          break;
        case "refactoring":
        case "refactor":
          setWorkflowSelection("refactoring", "trigger");
          if (args) startTask(args, "refactoring");
          else navigate("/");
          break;
        case "agile":
        case "epic":
          setWorkflowSelection("agile", "trigger");
          if (args) startTask(args, "agile");
          else navigate("/epic/chat/new");
          break;
        case "phases":
          setWorkflowSelection("agile", "tech-plan");
          if (args) startTask(args, "agile");
          else navigate("/task/interview/new");
          break;
        case "verify":
          handleValidate();
          break;
        case "history":
          navigate("/history");
          break;
        case "runs":
        case "run-ledger":
          navigate("/runs");
          break;
        case "mcp":
          navigate("/mcp");
          break;
        case "memory":
        case "memory-reviews":
          navigate("/memory-reviews");
          break;
        case "settings":
          navigate("/settings/prompt-template");
          break;
        case "clear":
          handleClear();
          break;
        default:
          setError(`Unknown slash command: /${cmd}`);
      }
    },
    [handleClear, handleValidate, navigate, setWorkflowSelection, startTask],
  );

  useEffect(() => {
    sendToExtension("fetchdata");
    sendToExtension("initialize");
  }, [sendToExtension]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !paletteOpen) {
        e.preventDefault();
        handleClear();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "e" && !paletteOpen) {
        e.preventDefault();
        navigate("/epic/chat/new");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        navigate("/settings/prompt-template");
      }
      if (e.key === "Escape" && isStreaming) {
        cancelStream();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelStream, handleClear, isStreaming, navigate, paletteOpen]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { command, text, data, path } = event.data ?? {};
      switch (command) {
        case "all-files":
          setAllFiles(Array.isArray(data) ? data : []);
          break;
        case "initialized":
          if (data?.providers) setProviders(data.providers);
          break;
        case "providers":
          setProviders(Array.isArray(data) ? data : []);
          break;
        case "planResult": {
          try {
            const plan = parsePayload<PlanResult>(text, data);
            setPlanResult(plan);
            setIsLoading(false);
            setIsStreaming(false);
            setConversation((prev) => [
              ...prev,
              {
                id: genId(),
                role: "assistant",
                content: "Plan generated.",
                plan,
                timestamp: new Date().toISOString(),
                workflow: plan.workflow,
              },
            ]);
            navigate(
              `/task/view/${encodeURIComponent(taskChainId)}/phase-1/${encodeURIComponent(plan.id || "plan")}`,
            );
          } catch {
            setError("Invalid plan response.");
            setIsLoading(false);
            setIsStreaming(false);
          }
          break;
        }
        case "validationResult": {
          try {
            const validation = parsePayload<ValidationResult>(text, data);
            setValidationResult(validation);
            setIsLoading(false);
            setIsStreaming(false);
            setConversation((prev) => [
              ...prev,
              {
                id: genId(),
                role: "assistant",
                content: validation.passed ? "Validation passed." : "Validation needs revision.",
                validation,
                timestamp: new Date().toISOString(),
              },
            ]);
          } catch {
            setError("Invalid validation response.");
            setIsLoading(false);
            setIsStreaming(false);
          }
          break;
        }
        case "generateResult": {
          try {
            const generation = parsePayload<{ file_changes?: PlanResult["file_changes"] }>(text, data);
            setPlanResult((prev) =>
              prev ? { ...prev, file_changes: generation.file_changes || [] } : prev,
            );
            setIsLoading(false);
            setIsStreaming(false);
          } catch {
            setError("Invalid generation response.");
            setIsLoading(false);
            setIsStreaming(false);
          }
          break;
        }
        case "analysisStart":
          setIsLoading(true);
          break;
        case "error":
          setError(String(text || data || "Unknown error"));
          setIsLoading(false);
          setIsStreaming(false);
          break;
        case "historyResult":
          setHistory(Array.isArray(data) ? data : []);
          break;
        case "epicList":
          setEpics(Array.isArray(data) ? data : []);
          break;
        case "epicDetail":
          setCurrentEpic(data || null);
          break;
        case "epicCreated":
          setEpics((prev) => [...prev, data]);
          setCurrentEpic(data);
          setConversation((prev) => [
            ...prev,
            {
              id: genId(),
              role: "assistant",
              content: `Epic created: ${data.title}`,
              timestamp: new Date().toISOString(),
              workflow: "agile",
            },
          ]);
          navigate(`/epic/chat/${encodeURIComponent(data.id)}`);
          break;
        case "epicUpdated":
          setEpics((prev) => prev.map((epic) => (epic.id === data.id ? data : epic)));
          setCurrentEpic((prev) => (prev?.id === data.id ? data : prev));
          break;
        case "epicDeleted":
          setEpics((prev) => prev.filter((epic) => epic.id !== data.id));
          setCurrentEpic(null);
          navigate("/epic/chat/new");
          break;
        case "specCreated":
          setCurrentEpic((prev) =>
            prev ? { ...prev, specs: [...prev.specs, data] } : prev,
          );
          break;
        case "specUpdated":
          setCurrentEpic((prev) =>
            prev
              ? { ...prev, specs: prev.specs.map((spec) => (spec.id === data.id ? data : spec)) }
              : prev,
          );
          break;
        case "specDeleted":
          setCurrentEpic((prev) =>
            prev
              ? { ...prev, specs: prev.specs.filter((spec) => spec.id !== data.spec_id) }
              : prev,
          );
          break;
        case "ticketCreated":
          setCurrentEpic((prev) =>
            prev ? { ...prev, tickets: [...prev.tickets, data] } : prev,
          );
          setConversation((prev) => [
            ...prev,
            {
              id: genId(),
              role: "assistant",
              content: `Ticket created: ${data.title}`,
              timestamp: new Date().toISOString(),
              workflow: "agile",
            },
          ]);
          break;
        case "ticketUpdated":
          setCurrentEpic((prev) =>
            prev
              ? { ...prev, tickets: prev.tickets.map((ticket) => (ticket.id === data.id ? data : ticket)) }
              : prev,
          );
          break;
        case "ticketDeleted":
          setCurrentEpic((prev) =>
            prev
              ? { ...prev, tickets: prev.tickets.filter((ticket) => ticket.id !== data.ticket_id) }
              : prev,
          );
          break;
        case "executionStarted":
          setCurrentEpic((prev) =>
            prev ? { ...prev, executions: [...prev.executions, data] } : prev,
          );
          break;
        case "agentList":
          setAgents(Array.isArray(data) ? data : []);
          break;
        case "streamStart":
          setIsStreaming(true);
          setStreamEvents([]);
          setIsLoading(false);
          break;
        case "streamEvent":
          setStreamEvents((prev) => [...prev, data]);
          break;
        case "streamEnd":
          setIsStreaming(false);
          break;
        case "navigate":
          navigate(String(path || data?.path || "/"));
          break;
        case "switchView": {
          const target = String(data || "");
          if (target === "settings") navigate("/settings/prompt-template");
          else if (target === "history") navigate("/history");
          else if (target === "runs" || target === "run-ledger") navigate("/runs");
          else if (target === "mcp") navigate("/mcp");
          else if (target === "memory" || target === "memory-reviews") navigate("/memory-reviews");
          else if (target === "notifications") navigate("/notifications");
          else if (target === "epic") navigate("/epic/chat/new");
          else navigate("/");
          break;
        }
        case "reset":
          handleClear();
          break;
        case "analyzeFile": {
          const filePath = data?.filePath;
          if (typeof filePath === "string") {
            const file = toFilePath(filePath);
            setSelectedFiles([file]);
            startTask(`Analyze ${file.name}`, activeWorkflow, [file]);
          }
          break;
        }
        case "analyzeChanges":
          startTask(
            data?.diff
              ? `Analyze the current Git changes.\n\n${data.diff}`
              : "Analyze the current Git changes.",
            activeWorkflow,
          );
          break;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeWorkflow, handleClear, navigate, startTask, taskChainId]);

  const notifications = useMemo<TraycerNotification[]>(() => {
    const items: TraycerNotification[] = [];
    if (error) {
      items.push({
        id: "error",
        title: "Action failed",
        description: error,
        tone: "error",
        createdAt: new Date().toISOString(),
      });
    }
    if (isStreaming) {
      items.push({
        id: "streaming",
        title: "Task running",
        description: "Traycer is streaming analysis from the local backend.",
        tone: "info",
        createdAt: new Date().toISOString(),
      });
    }
    if (planResult) {
      items.push({
        id: `plan-${planResult.id}`,
        title: "Plan ready",
        description: planResult.task_name,
        tone: "success",
        createdAt: new Date().toISOString(),
      });
    }
    if (validationResult) {
      items.push({
        id: `validation-${validationResult.plan_id}`,
        title: validationResult.passed ? "Validation passed" : "Validation needs revision",
        description: `${Math.round((validationResult.score || 0) * 100)}% score`,
        tone: validationResult.passed ? "success" : "warning",
        createdAt: new Date().toISOString(),
      });
    }
    return items;
  }, [error, isStreaming, planResult, validationResult]);

  const hideBottomInput =
    pathname.startsWith("/settings") ||
    pathname.startsWith("/history") ||
    pathname.startsWith("/runs") ||
    pathname.startsWith("/mcp") ||
    pathname.startsWith("/memory-reviews") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/task/kanban");

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      { id: "new-task", label: "New Task", category: "Action", shortcut: "Ctrl+N", action: handleClear },
      { id: "history", label: "Task History", category: "Nav", action: () => navigate("/history") },
      { id: "runs", label: "Run Ledger", category: "Nav", action: () => navigate("/runs") },
      { id: "mcp", label: "Remote MCP Servers", category: "Nav", action: () => navigate("/mcp") },
      { id: "memory-reviews", label: "Memory Reviews", category: "Nav", action: () => navigate("/memory-reviews") },
      { id: "notifications", label: "Notifications", category: "Nav", action: () => navigate("/notifications") },
      { id: "epic", label: "Open Epic View", category: "Nav", shortcut: "Ctrl+E", action: () => navigate("/epic/chat/new") },
      { id: "prompt-templates", label: "Prompt Templates", category: "Settings", action: () => navigate("/settings/prompt-template") },
      { id: "cli-agents", label: "CLI Agents", category: "Settings", action: () => navigate("/settings/cli-agents") },
      { id: "workflows", label: "Workflows", category: "Settings", action: () => navigate("/settings/workflows") },
      { id: "git-scripts", label: "Git Scripts", category: "Settings", action: () => navigate("/settings/git") },
      { id: "model-profiles", label: "Model Profiles", category: "Settings", action: () => navigate("/settings/model-profiles") },
      { id: "validate", label: "Validate Current Plan", category: "Action", action: handleValidate },
      { id: "execute", label: "Execute Current Plan", category: "Action", action: () => handleGenerate(selectedAgent) },
      { id: "reload-workflows", label: "Reload Workflow Templates", category: "Action", action: () => sendToExtension("reloadWorkflows") },
    ],
    [handleClear, handleGenerate, handleValidate, navigate, selectedAgent, sendToExtension],
  );

  const value = useMemo(
    () => ({
      activeWorkflow,
      activeEntryStep,
      setWorkflowSelection,
      allFiles,
      selectedFiles,
      attachFile,
      removeFile,
      providers,
      selectedModel,
      setSelectedModel,
      modelProfile,
      setModelProfile,
      conversation,
      planResult,
      validationResult,
      history,
      epics,
      currentEpic,
      agents,
      selectedAgent,
      setSelectedAgent,
      isLoading,
      isStreaming,
      streamEvents,
      notifications,
      error,
      clearError: () => setError(""),
      sendToExtension,
      handleSubmit,
      handleSlashCommand,
      handleValidate,
      handleGenerate,
      cancelStream,
      handleClear,
      refreshHistory,
      refreshEpics,
      openEpic,
      createEpic,
    }),
    [
      activeEntryStep,
      activeWorkflow,
      agents,
      allFiles,
      attachFile,
      cancelStream,
      conversation,
      createEpic,
      currentEpic,
      epics,
      error,
      handleClear,
      handleGenerate,
      handleSlashCommand,
      handleSubmit,
      handleValidate,
      history,
      isLoading,
      isStreaming,
      modelProfile,
      notifications,
      openEpic,
      planResult,
      providers,
      refreshEpics,
      refreshHistory,
      removeFile,
      selectedAgent,
      selectedFiles,
      selectedModel,
      sendToExtension,
      setWorkflowSelection,
      streamEvents,
      validationResult,
    ],
  );

  return (
    <TraycerAppProvider value={value}>
      <div className="flex h-screen flex-col overflow-hidden bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
        <NavigationBar
          unreadCount={notifications.length}
          onNotificationsClick={() => navigate("/notifications")}
          onOpenBoard={() =>
            navigate(
              currentEpic
                ? `/task/kanban/${encodeURIComponent(currentEpic.id)}/artifacts`
                : `/task/kanban/${encodeURIComponent(taskChainId)}/phase-1`,
            )
          }
        />

        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>

        {!hideBottomInput && (
          <div className="shrink-0 border-t border-border bg-[var(--vscode-editor-background)] px-1 py-1">
            <ChatInput
              files={allFiles}
              selectedFiles={selectedFiles}
              onAttachFile={attachFile}
              onRemoveFile={removeFile}
              onSend={handleSubmit}
              onSlashCommand={handleSlashCommand}
              isLoading={isLoading || isStreaming}
              isAborting={false}
              onAbort={cancelStream}
            />
          </div>
        )}

        {error && (
          <div className="fixed bottom-20 left-3 right-3 z-50 rounded border border-[var(--vscode-inputValidation-errorBorder,#be1100)] bg-[var(--vscode-inputValidation-errorBackground,#5a1d1d)] p-2.5 text-[11px]">
            <div className="flex items-start justify-between gap-2">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError("")}
                className="cursor-pointer bg-transparent px-1 text-[var(--vscode-foreground)] opacity-70 hover:opacity-100"
                aria-label="Dismiss error"
              >
                x
              </button>
            </div>
          </div>
        )}

        <CommandPalette
          isOpen={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          commands={paletteCommands}
        />
      </div>
    </TraycerAppProvider>
  );
}
