import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { FileText, MessageSquare, Plus, Sparkles, Ticket, Workflow } from "lucide-react";
import { Button } from "../components/ui/button";
import { useTraycerApp } from "./TraycerAppContext";

const emptyTitle = "What should this epic accomplish?";
const emptyDescription =
  "Describe the initiative in the composer below. ClearLoop will create the epic, then keep specs and tickets attached to the board.";

export default function EpicChatView() {
  const { epicId } = useParams();
  const {
    currentEpic,
    epics,
    conversation,
    refreshEpics,
    openEpic,
    createEpic,
    sendToExtension,
  } = useTraycerApp();

  useEffect(() => {
    refreshEpics();
  }, [refreshEpics]);

  useEffect(() => {
    if (epicId && epicId !== "new") {
      sendToExtension("getEpic", { id: epicId });
    }
  }, [epicId, sendToExtension]);

  const epic =
    currentEpic && (!epicId || epicId === "new" || currentEpic.id === epicId)
      ? currentEpic
      : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-3 px-3 py-4">
        {epic ? (
          <section className="rounded-md border border-border bg-[var(--vscode-editor-background)] p-3">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 rounded-md border border-border p-1.5">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-[var(--vscode-foreground)]">
                  {epic.title}
                </h2>
                {epic.description && (
                  <p className="mt-1 text-sm leading-relaxed text-[var(--vscode-descriptionForeground)]">
                    {epic.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-[var(--vscode-descriptionForeground)]">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                    <FileText className="size-3.5" />
                    {epic.specs.length} Specs
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                    <Ticket className="size-3.5" />
                    {epic.tickets.length} Tickets
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                    <Workflow className="size-3.5" />
                    {epic.executions.length} Executions
                  </span>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-md border border-border p-2">
              <MessageSquare className="size-5" />
            </div>
            <div className="max-w-sm">
              <h2 className="text-base font-semibold text-[var(--vscode-foreground)]">
                {emptyTitle}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--vscode-descriptionForeground)]">
                {emptyDescription}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-md border-border gap-1.5"
              onClick={createEpic}
            >
              <Plus className="size-3.5" />
              New Epic
            </Button>
          </section>
        )}

        {conversation.length > 0 && (
          <section className="flex flex-col gap-2">
            {conversation.map((turn) => (
              <article
                key={turn.id}
                className={[
                  "rounded-md border border-border p-3 text-sm leading-relaxed",
                  turn.role === "user"
                    ? "ml-6 bg-[var(--vscode-input-background)]"
                    : "mr-6 bg-[var(--vscode-editor-background)]",
                ].join(" ")}
              >
                <div className="mb-1 text-xs font-medium uppercase text-[var(--vscode-descriptionForeground)]">
                  {turn.role}
                </div>
                <div className="whitespace-pre-wrap">{turn.content}</div>
              </article>
            ))}
          </section>
        )}

        {!epic && epics.length > 0 && (
          <section className="mt-auto border-t border-border pt-3">
            <div className="mb-2 text-xs font-semibold uppercase text-[var(--vscode-descriptionForeground)]">
              Recent epics
            </div>
            <div className="flex flex-col gap-1">
              {epics.slice(0, 5).map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  className="h-auto justify-start rounded-md px-2 py-1.5 text-left"
                  onClick={() => openEpic(item)}
                >
                  <span className="truncate text-sm font-medium">{item.title}</span>
                </Button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
