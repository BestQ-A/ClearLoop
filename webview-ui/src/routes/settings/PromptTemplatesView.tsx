import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { getVsCodeApi } from "../../utils/vscode";
import { useI18n } from "../../i18n/I18nContext";

/**
 * PromptTemplatesView —— Traycer §F PromptTemplatesPanel 复刻。
 *
 * 行为：
 *   - mount 时向 extension 发送 `listWorkflows`，等待 `workflowsList` 回包
 *   - 每个 workflow 展开看 step 列表（每个 step 对应一份 .md prompt）
 *   - 点击 step 显示 markdown body；Edit -> textarea，Save 发 `updateWorkflow`
 *
 * 后端契约（参考 GAPS.md §10）：
 *   - request:  { command: "listWorkflows" }
 *   - response: { command: "workflowsList", workflows: WorkflowMeta[] }
 *   - request:  { command: "updateWorkflow", workflowId, stepId, body }
 *
 * TODO(SETTINGS↔backend): updateWorkflow 接口尚未实现，先把消息发出去；
 *                         backend 接通后联调。
 */

interface WorkflowStepMeta {
  id: string;
  name: string;
  description?: string;
  body?: string; // markdown 文本
  file?: string; // 相对路径，e.g. workflows/plan/01-trigger.md
}

interface WorkflowMeta {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStepMeta[];
}

// 兜底 mock —— backend 没回包前先有内容可看
const FALLBACK_WORKFLOWS: WorkflowMeta[] = [
  {
    id: "plan",
    name: "Plan Workflow",
    description: "Create-new-task plan flow (trigger → review → finalize).",
    steps: [
      { id: "trigger", name: "trigger", description: "Capture user goal", file: "workflows/plan/01-trigger.md" },
      { id: "review", name: "review", description: "Critique draft plan", file: "workflows/plan/02-review.md" },
      { id: "finalize", name: "finalize", description: "Lock plan + dispatch", file: "workflows/plan/03-finalize.md" },
    ],
  },
  {
    id: "refactoring",
    name: "Refactoring Workflow",
    description: "Code-level refactor (analyze → propose → apply).",
    steps: [
      { id: "analyze", name: "analyze", description: "Map call graph & smells", file: "workflows/refactoring/01-analyze.md" },
      { id: "propose", name: "propose", description: "Propose patches", file: "workflows/refactoring/02-propose.md" },
      { id: "apply", name: "apply", description: "Apply diffs + verify", file: "workflows/refactoring/03-apply.md" },
    ],
  },
  {
    id: "agile",
    name: "Agile Workflow",
    description: "Epic-board agile flow (epic → phase → story → execute).",
    steps: [
      { id: "epic", name: "epic", description: "Create epic", file: "workflows/agile/01-epic.md" },
      { id: "phase", name: "phase", description: "Slice phases", file: "workflows/agile/02-phase.md" },
      { id: "story", name: "story", description: "Author user stories", file: "workflows/agile/03-story.md" },
      { id: "execute", name: "execute", description: "Execute + commit", file: "workflows/agile/04-execute.md" },
    ],
  },
];

export default function PromptTemplatesView() {
  const { t } = useI18n();
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>(FALLBACK_WORKFLOWS);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>(FALLBACK_WORKFLOWS[0].id);
  const [activeStepId, setActiveStepId] = useState<string>(FALLBACK_WORKFLOWS[0].steps[0].id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // 取 VS Code API + 监听 message
  useEffect(() => {
    const vsc = getVsCodeApi();
    vsc.postMessage({ command: "listWorkflows" });

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.command === "workflowsList" && Array.isArray(msg.workflows)) {
        setWorkflows(msg.workflows as WorkflowMeta[]);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const activeWorkflow = useMemo(
    () => workflows.find((w) => w.id === activeWorkflowId) ?? workflows[0],
    [workflows, activeWorkflowId]
  );
  const activeStep = useMemo(
    () => activeWorkflow?.steps.find((s) => s.id === activeStepId) ?? activeWorkflow?.steps[0],
    [activeWorkflow, activeStepId]
  );

  const handleEdit = () => {
    setDraft(activeStep?.body ?? `# ${activeStep?.name}\n\n${activeStep?.description ?? ""}\n`);
    setEditing(true);
  };

  const handleSave = () => {
    const vsc = getVsCodeApi();
    // TODO(SETTINGS↔backend): backend 还未实现 updateWorkflow，先发出去等接通
    vsc.postMessage({
      command: "updateWorkflow",
      workflowId: activeWorkflow?.id,
      stepId: activeStep?.id,
      body: draft,
    });
    // 本地乐观更新
    setWorkflows((prev) =>
      prev.map((w) =>
        w.id === activeWorkflow?.id
          ? { ...w, steps: w.steps.map((s) => (s.id === activeStep?.id ? { ...s, body: draft } : s)) }
          : w
      )
    );
    setEditing(false);
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--vscode-foreground)]">{t.settingsTabPromptTemplates}</h2>
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">
            {t.promptTplDesc}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {workflows.length} {t.promptTplWorkflowsBadge}
        </Badge>
      </header>

      <Separator />

      <div className="grid grid-cols-[minmax(180px,240px)_1fr] gap-4">
        {/* 左侧：workflow + step 列表 */}
        <nav className="space-y-3 min-w-0">
          {workflows.map((wf) => (
            <div key={wf.id} className="space-y-1">
              <button
                onClick={() => {
                  setActiveWorkflowId(wf.id);
                  setActiveStepId(wf.steps[0]?.id ?? "");
                  setEditing(false);
                }}
                className={
                  "w-full text-left px-2 py-1 rounded-md text-sm font-medium transition-colors " +
                  (wf.id === activeWorkflowId
                    ? "bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]"
                    : "text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]")
                }
              >
                {wf.name}
              </button>
              <ul className="pl-2 space-y-0.5">
                {wf.steps.map((step) => {
                  const selected = wf.id === activeWorkflowId && step.id === activeStepId;
                  return (
                    <li key={step.id}>
                      <button
                        onClick={() => {
                          setActiveWorkflowId(wf.id);
                          setActiveStepId(step.id);
                          setEditing(false);
                        }}
                        className={
                          "w-full text-left px-2 py-1 rounded text-sm transition-colors " +
                          (selected
                            ? "bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]"
                            : "text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]")
                        }
                      >
                        <span className="truncate block">{step.name}</span>
                        {step.description && (
                          <span className="block text-xs text-[var(--vscode-descriptionForeground)] truncate">
                            {step.description}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* 右侧：step body */}
        <section className="p-3 border border-[var(--vscode-panel-border)] rounded-md min-w-0">
          {activeStep ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-[var(--vscode-foreground)] truncate">
                    {activeWorkflow?.name} / {activeStep.name}
                  </div>
                  {activeStep.file && (
                    <div className="text-xs text-[var(--vscode-descriptionForeground)] font-mono truncate">
                      {activeStep.file}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                        {t.promptTplCancel}
                      </Button>
                      <Button size="sm" onClick={handleSave}>
                        {t.promptTplSave}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={handleEdit}>
                      {t.promptTplEdit}
                    </Button>
                  )}
                </div>
              </div>

              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={18}
                  className="w-full font-mono text-sm p-2 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)] resize-y"
                />
              ) : (
                <pre className="text-sm whitespace-pre-wrap font-mono text-[var(--vscode-foreground)] bg-[var(--vscode-input-background)] p-3 rounded border border-[var(--vscode-input-border)] max-h-[60vh] overflow-auto">
                  {activeStep.body ??
                    `# ${activeStep.name}\n\n${activeStep.description ?? t.promptTplBodyMissing}\n`}
                </pre>
              )}
            </div>
          ) : (
            <div className="text-sm text-[var(--vscode-descriptionForeground)]">
              {t.promptTplNoStep}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
