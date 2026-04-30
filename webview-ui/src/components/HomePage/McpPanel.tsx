import { useEffect, useState } from "react";
import type { McpServerConfig } from "../../types/Homepage";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  sendToExtension: (cmd: string, data?: any) => void;
}

const McpPanel = ({ sendToExtension }: Props) => {
  const { t } = useI18n();
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [newArgs, setNewArgs] = useState("");

  useEffect(() => {
    sendToExtension("listMcpServers");
    const handler = (e: MessageEvent) => {
      if (e.data?.command === "mcpServerList") {
        setServers(e.data.data || []);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleAdd = () => {
    if (!newId.trim() || !newCommand.trim()) return;
    sendToExtension("addMcpServer", {
      config: {
        id: newId.trim(),
        name: newName.trim() || newId.trim(),
        command: newCommand.trim(),
        args: newArgs.split(" ").filter(Boolean),
        env: {},
        scope: "user",
        disabled: false,
      },
    });
    setNewId(""); setNewName(""); setNewCommand(""); setNewArgs("");
    setShowForm(false);
    setTimeout(() => sendToExtension("listMcpServers"), 100);
  };

  const handleRemove = (id: string) => {
    sendToExtension("removeMcpServer", { id });
    setTimeout(() => sendToExtension("listMcpServers"), 100);
  };

  const handleToggle = (id: string, current: boolean) => {
    sendToExtension("toggleMcpServer", { id, enabled: current });
    setTimeout(() => sendToExtension("listMcpServers"), 100);
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold">{t.mcpTitle}</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-[10px] px-2 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] cursor-pointer"
        >
          {t.mcpAddServer}
        </button>
      </div>

      {showForm && (
        <div className="p-2.5 rounded border border-[var(--vscode-focusBorder)] bg-[var(--vscode-input-background)] space-y-2">
          <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder={t.mcpServerIdPlaceholder} className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-editor-background)] border border-[var(--vscode-input-border)] rounded" />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t.mcpDisplayNamePlaceholder} className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-editor-background)] border border-[var(--vscode-input-border)] rounded" />
          <input value={newCommand} onChange={(e) => setNewCommand(e.target.value)} placeholder={t.mcpCommandPlaceholder} className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-editor-background)] border border-[var(--vscode-input-border)] rounded" />
          <input value={newArgs} onChange={(e) => setNewArgs(e.target.value)} placeholder={t.mcpArgsPlaceholder} className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-editor-background)] border border-[var(--vscode-input-border)] rounded" />
          <div className="flex gap-1.5 justify-end">
            <button onClick={() => setShowForm(false)} className="px-2 py-1 text-[10px] rounded bg-[var(--vscode-button-secondaryBackground)]">{t.mcpCancel}</button>
            <button onClick={handleAdd} disabled={!newId.trim() || !newCommand.trim()} className="px-2 py-1 text-[10px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] disabled:opacity-40">{t.mcpAdd}</button>
          </div>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="text-[11px] text-[var(--vscode-descriptionForeground)] py-8 text-center">
          {t.mcpEmpty}
          <div className="mt-2 text-[10px] opacity-70">{t.mcpEmptyHint}</div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {servers.map((s) => (
            <div key={s.id} className="p-2 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${s.disabled ? "bg-gray-500" : "bg-green-400"}`} />
                  <span className="text-[11px] font-semibold">{s.name}</span>
                  <span className="text-[9px] px-1 rounded bg-[var(--vscode-badge-background)]">{s.scope}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleToggle(s.id, s.disabled)} className="text-[9px] px-1.5 py-0.5 rounded hover:bg-[var(--vscode-list-hoverBackground)]">{s.disabled ? t.mcpEnable : t.mcpDisable}</button>
                  <button onClick={() => handleRemove(s.id)} className="text-[9px] px-1.5 py-0.5 rounded hover:bg-[var(--vscode-list-hoverBackground)] text-red-400">{t.mcpRemove}</button>
                </div>
              </div>
              <div className="mt-1 text-[9px] text-[var(--vscode-descriptionForeground)] font-mono truncate">
                {s.command} {s.args.join(" ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default McpPanel;
