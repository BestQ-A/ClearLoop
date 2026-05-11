import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Circle, Clock3, FileText, RefreshCw, XCircle } from "lucide-react";
import { useTraycerApp } from "./TraycerAppContext";

type JsonObject = Record<string, unknown>;

type RunLedgerRecord = {
  path: string;
  runId: string;
  title: string;
  status: string;
  stage: string;
  updatedAt: string;
  resultSummary: string;
  memoryDecision: string;
  commandCount: number;
  evidenceCount: number;
  changedFilesCount: number;
  manifest: JsonObject;
  evidence: JsonObject[];
  commands: JsonObject[];
  changes: JsonObject;
  verification: string;
  result: string;
};

type RunLedgerMessage = {
  command?: string;
  data?: unknown;
  text?: string;
};

const phases = [
  { id: "handoff", label: "Handoff" },
  { id: "execution", label: "Execution" },
  { id: "result", label: "Result" },
  { id: "verification", label: "Verification" },
  { id: "memory", label: "Memory" },
] as const;

function basename(value: string): string {
  return value.split(/[\\/]/).pop() || value;
}

function asText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function formatDate(value: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function isRun(value: unknown): value is RunLedgerRecord {
  return Boolean(value && typeof value === "object" && "path" in value && "runId" in value);
}

function isRunList(value: unknown): value is RunLedgerRecord[] {
  return Array.isArray(value);
}

function phaseState(run: RunLedgerRecord | null, phase: (typeof phases)[number]["id"]): "done" | "active" | "pending" | "failed" {
  if (!run) {
    return "pending";
  }
  const status = run.status.toUpperCase();
  const evidenceTypes = new Set(run.evidence.map((event) => asText(event.type)));
  if (phase === "handoff") {
    return run.runId ? "done" : "pending";
  }
  if (phase === "execution") {
    if (status === "WAITING_FOR_EXECUTION") {
      return "pending";
    }
    return status === "RUNNING" ? "active" : "done";
  }
  if (phase === "result") {
    return evidenceTypes.has("result_recorded") || run.resultSummary ? "done" : "pending";
  }
  if (phase === "verification") {
    if (status === "FAILED_VERIFICATION") {
      return "failed";
    }
    return evidenceTypes.has("verification_recorded") || status === "VERIFIED" || status === "PROMOTED_TO_MEMORY"
      ? "done"
      : "pending";
  }
  if (run.memoryDecision === "promoted" || status === "PROMOTED_TO_MEMORY") {
    return "done";
  }
  if (run.memoryDecision === "blocked") {
    return "failed";
  }
  return "pending";
}

function statusClass(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "VERIFIED" || normalized === "PROMOTED_TO_MEMORY") {
    return "border-[var(--vscode-testing-iconPassed)] text-[var(--vscode-testing-iconPassed)]";
  }
  if (normalized.includes("FAILED") || normalized.includes("BLOCKED")) {
    return "border-[var(--vscode-testing-iconFailed)] text-[var(--vscode-testing-iconFailed)]";
  }
  if (normalized === "RUNNING") {
    return "border-[var(--vscode-progressBar-background)] text-[var(--vscode-progressBar-background)]";
  }
  return "border-border text-text-secondary";
}

function phaseClass(state: ReturnType<typeof phaseState>): string {
  if (state === "done") {
    return "border-[var(--vscode-testing-iconPassed)] text-[var(--vscode-testing-iconPassed)]";
  }
  if (state === "active") {
    return "border-[var(--vscode-progressBar-background)] text-[var(--vscode-progressBar-background)]";
  }
  if (state === "failed") {
    return "border-[var(--vscode-testing-iconFailed)] text-[var(--vscode-testing-iconFailed)]";
  }
  return "border-border text-text-secondary";
}

function phaseIcon(state: ReturnType<typeof phaseState>) {
  if (state === "done") {
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
  if (state === "active") {
    return <Clock3 className="h-3.5 w-3.5" />;
  }
  if (state === "failed") {
    return <XCircle className="h-3.5 w-3.5" />;
  }
  return <Circle className="h-3.5 w-3.5" />;
}

export default function RunLedgerView() {
  const { sendToExtension } = useTraycerApp();
  const [runs, setRuns] = useState<RunLedgerRecord[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [detail, setDetail] = useState<RunLedgerRecord | null>(null);
  const [error, setError] = useState("");

  const selectedRun = useMemo(
    () => runs.find((run) => run.path === selectedPath),
    [runs, selectedPath],
  );
  const activeDetail = detail || selectedRun || null;

  const refresh = useCallback(() => {
    setError("");
    sendToExtension("runLedger.list");
  }, [sendToExtension]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<RunLedgerMessage>) => {
      const { command, data, text } = event.data ?? {};
      switch (command) {
        case "runLedger.list":
          if (isRunList(data)) {
            setRuns(data);
            if (!selectedPath && data[0]) {
              setSelectedPath(data[0].path);
              sendToExtension("runLedger.read", { path: data[0].path });
            }
          }
          break;
        case "runLedger.detail":
          if (isRun(data)) {
            setDetail(data);
            setSelectedPath(data.path);
          }
          break;
        case "runLedger.error":
          setError(String(text || data || "Run Ledger action failed"));
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [selectedPath, sendToExtension]);

  const selectRun = useCallback(
    (runPath: string) => {
      setSelectedPath(runPath);
      setError("");
      sendToExtension("runLedger.read", { path: runPath });
    },
    [sendToExtension],
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(180px,0.38fr)_minmax(300px,1fr)] overflow-hidden">
      <aside className="min-h-0 border-r border-border pr-2">
        <div className="flex h-10 items-center justify-between gap-2 border-b border-border">
          <div className="min-w-0 text-xs font-semibold">Run Ledger</div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center border border-border bg-transparent"
            title="Refresh"
            aria-label="Refresh"
            onClick={refresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="h-[calc(100%-2.5rem)] overflow-y-auto py-2">
          {runs.length === 0 ? (
            <div className="px-1 text-[11px] text-text-secondary">No run ledgers.</div>
          ) : (
            <div className="space-y-1">
              {runs.map((run) => (
                <button
                  key={run.path}
                  type="button"
                  onClick={() => selectRun(run.path)}
                  className={`w-full border border-border bg-transparent px-2 py-2 text-left text-[11px] ${
                    selectedPath === run.path ? "outline outline-1 outline-[var(--vscode-focusBorder)]" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate font-medium">{basename(run.title)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-text-secondary">
                    <span className={`shrink-0 border px-1 ${statusClass(run.status)}`}>{run.status}</span>
                    <span className="truncate">{formatDate(run.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="min-h-0 overflow-y-auto pl-3 pr-1">
        <div className="sticky top-0 z-10 flex min-h-10 items-center justify-between gap-2 border-b border-border bg-[var(--vscode-editor-background)]">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{activeDetail ? activeDetail.runId : "Run"}</div>
            <div className="truncate text-[10px] text-text-secondary">{activeDetail?.path || ""}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[10px] text-text-secondary">
            <Activity className="h-3.5 w-3.5" />
            {activeDetail?.stage || "stage"}
          </div>
        </div>

        {error && (
          <div className="mt-2 border border-[var(--vscode-inputValidation-errorBorder,#be1100)] px-2 py-1.5 text-[11px]">
            {error}
          </div>
        )}

        {activeDetail ? (
          <div className="space-y-4 py-3">
            <div className="grid grid-cols-5 gap-1">
              {phases.map((phase) => {
                const state = phaseState(activeDetail, phase.id);
                return (
                  <div
                    key={phase.id}
                    className={`flex min-h-12 flex-col items-center justify-center gap-1 border px-1 text-center text-[10px] ${phaseClass(
                      state,
                    )}`}
                  >
                    {phaseIcon(state)}
                    <span className="truncate">{phase.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-4 gap-2 text-[11px]">
              <div className="border border-border px-2 py-1.5">
                <div className="text-[10px] text-text-secondary">Status</div>
                <div className="truncate">{activeDetail.status}</div>
              </div>
              <div className="border border-border px-2 py-1.5">
                <div className="text-[10px] text-text-secondary">Commands</div>
                <div>{activeDetail.commandCount}</div>
              </div>
              <div className="border border-border px-2 py-1.5">
                <div className="text-[10px] text-text-secondary">Evidence</div>
                <div>{activeDetail.evidenceCount}</div>
              </div>
              <div className="border border-border px-2 py-1.5">
                <div className="text-[10px] text-text-secondary">Changed files</div>
                <div>{activeDetail.changedFilesCount}</div>
              </div>
            </div>

            {activeDetail.resultSummary && (
              <section className="border-t border-border pt-3">
                <h2 className="text-xs font-semibold">Result summary</h2>
                <p className="mt-1 whitespace-pre-wrap text-[11px] text-text-secondary">{activeDetail.resultSummary}</p>
              </section>
            )}

            <section className="border-t border-border pt-3">
              <h2 className="text-xs font-semibold">Evidence events</h2>
              <div className="mt-2 space-y-1">
                {activeDetail.evidence.length === 0 ? (
                  <div className="text-[11px] text-text-secondary">No evidence events.</div>
                ) : (
                  activeDetail.evidence.map((event, index) => (
                    <div key={`${asText(event.type)}-${index}`} className="border border-border px-2 py-1.5 text-[11px]">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{asText(event.type) || "event"}</span>
                        <span className="shrink-0 text-[10px] text-text-secondary">{formatDate(asText(event.ts))}</span>
                      </div>
                      <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[10px] text-text-secondary">
                        {asText(event.summary) || asText(event.reason) || JSON.stringify(event)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="border-t border-border pt-3">
              <h2 className="text-xs font-semibold">Commands</h2>
              <div className="mt-2 space-y-1">
                {activeDetail.commands.length === 0 ? (
                  <div className="text-[11px] text-text-secondary">No command records.</div>
                ) : (
                  activeDetail.commands.map((command, index) => (
                    <div key={`${asText(command.command)}-${index}`} className="border border-border px-2 py-1.5 text-[11px]">
                      <div className="flex justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{asText(command.command) || "command"}</span>
                        <span className="shrink-0 text-[10px] text-text-secondary">{asText(command.status)}</span>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-text-secondary">{asText(command.summary)}</div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="border-t border-border pt-3">
              <h2 className="text-xs font-semibold">Verification</h2>
              <pre className="mt-2 max-h-48 overflow-auto border border-border p-2 text-[10px] text-text-secondary">
                {activeDetail.verification || "No verification.md content."}
              </pre>
            </section>

            <section className="border-t border-border pt-3">
              <h2 className="text-xs font-semibold">Manifest</h2>
              <pre className="mt-2 max-h-64 overflow-auto border border-border p-2 text-[10px] text-text-secondary">
                {JSON.stringify(activeDetail.manifest, null, 2)}
              </pre>
            </section>
          </div>
        ) : (
          <div className="py-8 text-center text-[11px] text-text-secondary">Select a run ledger.</div>
        )}
      </section>
    </div>
  );
}
