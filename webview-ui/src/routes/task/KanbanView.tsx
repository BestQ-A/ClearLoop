import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import EpicDetail from "../../components/HomePage/EpicDetail";
import { useTraycerApp } from "../TraycerAppContext";

const statusIcon = (status: string) => {
  if (status === "completed") return <CheckCircle2 className="size-4 text-[var(--vscode-testing-iconPassed,#73c991)]" />;
  if (status === "running") return <Loader2 className="size-4 animate-spin text-[var(--vscode-progressBar-background,#0078d4)]" />;
  if (status === "failed") return <XCircle className="size-4 text-[var(--vscode-testing-iconFailed,#f14c4c)]" />;
  return <Circle className="size-4 text-[var(--vscode-descriptionForeground)]" />;
};

export default function KanbanView() {
  const navigate = useNavigate();
  const { planResult, conversation, activeWorkflow, currentEpic, sendToExtension } = useTraycerApp();
  const steps = planResult?.steps ?? [];

  if (currentEpic) {
    return (
      <EpicDetail
        epic={currentEpic}
        embedded
        onBack={() => navigate(`/epic/chat/${encodeURIComponent(currentEpic.id)}`)}
        sendToExtension={sendToExtension}
      />
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <header className="rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] p-3">
          <div className="text-sm font-semibold text-[var(--vscode-foreground)]">
            Phase board
          </div>
          <div className="mt-1 text-xs text-[var(--vscode-descriptionForeground)]">
            {planResult?.task_name || `No generated plan yet. Current workflow: ${activeWorkflow}.`}
          </div>
        </header>

        {steps.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--vscode-panel-border)] p-6 text-center text-sm text-[var(--vscode-descriptionForeground)]">
            Start a task to populate the Traycer phase list.
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <section
                key={step.id}
                className="rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{statusIcon(step.status)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[var(--vscode-badge-background)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--vscode-badge-foreground)]">
                        {index + 1}
                      </span>
                      <h2 className="truncate text-sm font-semibold text-[var(--vscode-foreground)]">
                        {step.title}
                      </h2>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
                      {step.description}
                    </p>
                    {step.dependencies.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {step.dependencies.map((dep) => (
                          <span
                            key={dep}
                            className="rounded-full border border-[var(--vscode-panel-border)] px-1.5 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground)]"
                          >
                            depends on {dep}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}

        {conversation.length > 0 && (
          <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
            {conversation.length} conversation turns linked to this task chain.
          </div>
        )}
      </div>
    </div>
  );
}
