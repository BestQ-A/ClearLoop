import { Bell, CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { useTraycerApp } from "./TraycerAppContext";

const iconForTone = (tone: string) => {
  if (tone === "success") return <CheckCircle2 className="size-4 text-[var(--vscode-testing-iconPassed,#73c991)]" />;
  if (tone === "warning") return <TriangleAlert className="size-4 text-[var(--vscode-editorWarning-foreground,#cca700)]" />;
  if (tone === "error") return <XCircle className="size-4 text-[var(--vscode-errorForeground,#f14c4c)]" />;
  return <Info className="size-4 text-[var(--vscode-textLink-foreground,#3794ff)]" />;
};

export default function NotificationsView() {
  const { notifications } = useTraycerApp();

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-2xl space-y-3">
        <header className="flex items-center gap-2">
          <Bell className="size-4" />
          <div>
            <h1 className="text-base font-semibold text-[var(--vscode-foreground)]">
              Notifications
            </h1>
            <p className="text-xs text-[var(--vscode-descriptionForeground)]">
              Local task, validation, and backend events from this webview session.
            </p>
          </div>
        </header>

        {notifications.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--vscode-panel-border)] p-8 text-center text-sm text-[var(--vscode-descriptionForeground)]">
            No notifications yet.
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((item) => (
              <article
                key={item.id}
                className="flex gap-3 rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] p-3"
              >
                <div className="mt-0.5">{iconForTone(item.tone)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--vscode-foreground)]">
                    {item.title}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
                    {item.description}
                  </div>
                  <div className="mt-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
