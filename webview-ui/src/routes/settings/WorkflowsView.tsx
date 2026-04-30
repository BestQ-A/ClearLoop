import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { getVsCodeApi } from "../../utils/vscode";
import { useI18n } from "../../i18n/I18nContext";

/**
 * WorkflowsView —— Traycer 3 大工作流（plan / refactoring / agile）的元信息与开关。
 *
 * 与 PromptTemplatesView 的关系：
 *   - PromptTemplates  —— 编辑每个 step 的 prompt body
 *   - Workflows        —— 列举工作流元数据（step 数 / 描述 / 启用状态）
 *
 * 行为：
 *   - 列出 3 个工作流；每个 row 显示 name + step 数 + description
 *   - 点击展开看 step list（折叠/展开）
 *   - "Enable" toggle 发 `setWorkflowEnabled`
 *
 * 后端契约：
 *   - request:  { command: "listWorkflows" }
 *   - response: { command: "workflowsList", workflows: WorkflowMeta[] }
 *   - request:  { command: "setWorkflowEnabled", workflowId, enabled }
 */

interface WorkflowStepMeta {
  id: string;
  name: string;
  description?: string;
}

interface WorkflowMeta {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStepMeta[];
  enabled?: boolean;
}

const FALLBACK_WORKFLOWS: WorkflowMeta[] = [
  {
    id: "plan",
    name: "Plan Workflow",
    description: "From user goal to a locked task plan (trigger → review → finalize).",
    enabled: true,
    steps: [
      { id: "trigger", name: "trigger", description: "Capture user goal & context" },
      { id: "review", name: "review", description: "Critique draft plan" },
      { id: "finalize", name: "finalize", description: "Lock plan + dispatch" },
    ],
  },
  {
    id: "refactoring",
    name: "Refactoring Workflow",
    description: "Code-level refactor (analyze → propose → apply).",
    enabled: true,
    steps: [
      { id: "analyze", name: "analyze", description: "Map call graph & smells" },
      { id: "propose", name: "propose", description: "Propose patches" },
      { id: "apply", name: "apply", description: "Apply diffs + verify" },
    ],
  },
  {
    id: "agile",
    name: "Agile Workflow",
    description: "Epic-board agile flow (epic → phase → story → execute).",
    enabled: false,
    steps: [
      { id: "epic", name: "epic", description: "Create epic" },
      { id: "phase", name: "phase", description: "Slice phases" },
      { id: "story", name: "story", description: "Author user stories" },
      { id: "execute", name: "execute", description: "Execute + commit" },
    ],
  },
];

export default function WorkflowsView() {
  const { t } = useI18n();
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>(FALLBACK_WORKFLOWS);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleEnabled = (wf: WorkflowMeta) => {
    const next = !(wf.enabled ?? true);
    setWorkflows((prev) =>
      prev.map((w) => (w.id === wf.id ? { ...w, enabled: next } : w))
    );
    getVsCodeApi().postMessage({
      command: "setWorkflowEnabled",
      workflowId: wf.id,
      enabled: next,
    });
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--vscode-foreground)]">{t.settingsTabWorkflows}</h2>
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">
            {t.workflowsDesc}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {workflows.length} {t.workflowsBadge}
        </Badge>
      </header>

      <Separator />

      <div className="space-y-2">
        {workflows.map((wf) => {
          const enabled = wf.enabled ?? true;
          const isOpen = expanded[wf.id] ?? false;
          return (
            <div key={wf.id} className="p-3 border border-[var(--vscode-panel-border)] rounded-md">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--vscode-foreground)]">{wf.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {wf.steps.length} {t.workflowsSteps}
                    </Badge>
                    {enabled ? (
                      <Badge variant="default" className="text-[10px]">
                        {t.workflowsEnabled}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        {t.workflowsDisabled}
                      </Badge>
                    )}
                  </div>
                  {wf.description && (
                    <div className="mt-1 text-xs text-[var(--vscode-descriptionForeground)]">
                      {wf.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => toggleExpanded(wf.id)}>
                    {isOpen ? t.workflowsCollapse : t.workflowsExpand}
                  </Button>
                  <Button
                    size="sm"
                    variant={enabled ? "secondary" : "outline"}
                    onClick={() => toggleEnabled(wf)}
                  >
                    {enabled ? t.workflowsDisable : t.workflowsEnable}
                  </Button>
                </div>
              </div>

              {isOpen && (
                <ol className="mt-3 pl-5 list-decimal space-y-1.5 border-l border-[var(--vscode-panel-border)] ml-1">
                  {wf.steps.map((step) => (
                    <li key={step.id} className="pl-2">
                      <div className="text-sm text-[var(--vscode-foreground)]">{step.name}</div>
                      {step.description && (
                        <div className="text-xs text-[var(--vscode-descriptionForeground)]">
                          {step.description}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
