import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { getVsCodeApi } from "../../utils/vscode";
import { useI18n } from "../../i18n/I18nContext";

/**
 * CliAgentsView —— Traycer §F SupportedAgent / Default Agent 设置页。
 *
 * 23 个内置 agent（来自 TRAYCER_UI_TEARDOWN.md §F SupportedAgentIDs +
 * AGENT_METADATA），保持与 components/HomePage/AgentSelector.tsx 一致。
 *
 * 行为：
 *   - 列表展示 displayName + kind + capabilities chip
 *   - "Default" badge 标注当前默认 agent
 *   - "Set as default" 发 `setDefaultAgent`
 *   - "Remove" 仅对 custom agent 生效（暂留 backend TODO）
 *   - 顶部搜索过滤 displayName / id
 */

type AgentKind = "ide" | "terminal" | "extension" | "utility" | "native";

interface BuiltinAgent {
  id: string;
  displayName: string;
  kind: AgentKind;
  caps: string[];
  builtin: true;
}

const BUILTIN_AGENTS: BuiltinAgent[] = [
  // terminal CLIs
  { id: "claude-code", displayName: "Claude Code CLI", kind: "terminal", caps: ["planning", "coding", "review", "testing"], builtin: true },
  { id: "gemini", displayName: "Gemini CLI", kind: "terminal", caps: ["coding", "chat", "review"], builtin: true },
  { id: "codex", displayName: "Codex CLI", kind: "terminal", caps: ["coding", "planning", "terminal"], builtin: true },
  // IDE 集成
  { id: "cursor", displayName: "Cursor", kind: "ide", caps: ["coding", "autocomplete", "chat"], builtin: true },
  { id: "visualstudiocode", displayName: "VS Code", kind: "ide", caps: ["coding", "extension"], builtin: true },
  { id: "visualstudiocode-insiders", displayName: "VS Code Insiders", kind: "ide", caps: ["coding", "extension"], builtin: true },
  { id: "code-server", displayName: "Code Server", kind: "ide", caps: ["coding", "remote"], builtin: true },
  { id: "windsurf", displayName: "Windsurf", kind: "ide", caps: ["coding", "flow", "chat"], builtin: true },
  { id: "trae", displayName: "Trae", kind: "ide", caps: ["coding", "chat"], builtin: true },
  { id: "augment", displayName: "Augment", kind: "ide", caps: ["coding", "context", "chat"], builtin: true },
  { id: "antigravity", displayName: "Antigravity", kind: "ide", caps: ["coding", "chat"], builtin: true },
  // extension 系
  { id: "kilo-code", displayName: "Kilo Code", kind: "extension", caps: ["coding", "review"], builtin: true },
  { id: "roo-code", displayName: "Roo Code", kind: "extension", caps: ["coding", "review"], builtin: true },
  { id: "cline", displayName: "Cline", kind: "extension", caps: ["coding", "planning", "terminal"], builtin: true },
  { id: "claude-code-extension", displayName: "Claude Code Extension", kind: "extension", caps: ["coding", "review", "chat"], builtin: true },
  { id: "codex-extension", displayName: "Codex Extension", kind: "extension", caps: ["coding", "chat"], builtin: true },
  { id: "zencoder", displayName: "ZenCoder", kind: "extension", caps: ["coding", "testing", "review"], builtin: true },
  { id: "amp", displayName: "Amp", kind: "extension", caps: ["coding", "planning", "terminal"], builtin: true },
  // utility
  { id: "copy", displayName: "Copy", kind: "utility", caps: ["export"], builtin: true },
  { id: "markdown-export", displayName: "Export as Markdown", kind: "utility", caps: ["export"], builtin: true },
  // native（Traycer 自家 phase agent）
  { id: "traycer-phases", displayName: "Traycer Phases", kind: "native", caps: ["planning", "phases"], builtin: true },
  { id: "traycer-plan", displayName: "Traycer Plan", kind: "native", caps: ["planning"], builtin: true },
  { id: "traycer-review", displayName: "Traycer Review", kind: "native", caps: ["review"], builtin: true },
];

export default function CliAgentsView() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [defaultAgent, setDefaultAgent] = useState<string>("claude-code");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BUILTIN_AGENTS;
    return BUILTIN_AGENTS.filter(
      (a) =>
        a.id.toLowerCase().includes(q) ||
        a.displayName.toLowerCase().includes(q) ||
        a.caps.some((c) => c.toLowerCase().includes(q))
    );
  }, [query]);

  const handleSetDefault = (id: string) => {
    setDefaultAgent(id);
    getVsCodeApi().postMessage({ command: "setDefaultAgent", agentId: id });
  };

  const handleRemove = (id: string) => {
    // TODO(SETTINGS↔backend): backend 还没实现 removeAgent；先发 message
    getVsCodeApi().postMessage({ command: "removeAgent", agentId: id });
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--vscode-foreground)]">{t.settingsTabCliAgents}</h2>
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">
            {t.cliAgentsDesc}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {BUILTIN_AGENTS.length} {t.cliAgentsBadge}
        </Badge>
      </header>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.cliAgentsSearch}
        className="w-full px-3 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
      />

      <Separator />

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-sm text-[var(--vscode-descriptionForeground)] py-6 text-center">
            {t.cliAgentsNoMatchPrefix} "{query}".
          </div>
        )}
        {filtered.map((agent) => {
          const isDefault = agent.id === defaultAgent;
          return (
            <div
              key={agent.id}
              className="p-3 border border-[var(--vscode-panel-border)] rounded-md flex items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--vscode-foreground)] truncate">
                    {agent.displayName}
                  </span>
                  <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                    {agent.kind}
                  </Badge>
                  {isDefault && (
                    <Badge variant="default" className="text-[10px] shrink-0">
                      {t.cliAgentsDefault}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-[var(--vscode-descriptionForeground)] font-mono truncate">
                  {agent.id}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {agent.caps.map((cap) => (
                    <Badge key={cap} variant="outline" className="text-[10px]">
                      {cap}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant={isDefault ? "secondary" : "outline"}
                  disabled={isDefault}
                  onClick={() => handleSetDefault(agent.id)}
                >
                  {isDefault ? t.cliAgentsDefault : t.cliAgentsSetDefault}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemove(agent.id)}
                  disabled={agent.builtin /* 内置 23 项不可删，仅 custom 才允许 */}
                  title={agent.builtin ? t.cliAgentsBuiltinTooltip : t.cliAgentsRemoveTooltip}
                >
                  {t.cliAgentsRemove}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
