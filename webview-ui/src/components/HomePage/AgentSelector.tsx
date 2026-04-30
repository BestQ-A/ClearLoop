import { useState } from "react";
import type { AgentConfig, ExecutionAgentType } from "../../types/Homepage";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  agents: AgentConfig[];
  selectedAgent: string;
  onSelect: (agentId: string) => void;
  onRegister: (config: AgentConfig) => void;
  sendToExtension: (cmd: string, data?: any) => void;
}

/**
 * Traycer 完整 Supported Agent 注册表 —— 严格 23 项
 * 来源：external/CodeSail/TRAYCER_UI_TEARDOWN.md §F
 *   - SupportedAgentIDs（23 个 id）
 *   - AGENT_METADATA（type / displayName）
 *
 * type 取值与 Traycer 一致：ide / terminal / extension / utility / native
 * caps 标签来自 capability 维度（planning / coding / review / testing 等），
 * 与 Traycer 的 Workflow tag 保持语义一致。
 *
 * 注意：本地 type 用 string 而非 ExecutionAgentType（后者只有 10 个 union 值，
 * 改它会触动 types/Homepage.ts —— 不在本次领地内）。
 */
type AgentKind = "ide" | "terminal" | "extension" | "utility" | "native";

interface BuiltinAgent {
  id: string;
  displayName: string;
  icon: string;
  kind: AgentKind;
  caps: string[];
}

const builtinAgents: BuiltinAgent[] = [
  // terminal CLIs
  { id: "claude-code",                displayName: "Claude Code CLI",       icon: "CC", kind: "terminal",  caps: ["planning", "coding", "review", "testing"] },
  { id: "gemini",                     displayName: "Gemini CLI",            icon: "Ge", kind: "terminal",  caps: ["coding", "chat", "review"] },
  { id: "codex",                      displayName: "Codex CLI",             icon: "Cx", kind: "terminal",  caps: ["coding", "planning", "terminal"] },
  // IDE 集成
  { id: "cursor",                     displayName: "Cursor",                icon: "Cu", kind: "ide",       caps: ["coding", "autocomplete", "chat"] },
  { id: "visualstudiocode",           displayName: "VS Code",               icon: "VS", kind: "ide",       caps: ["coding", "extension"] },
  { id: "visualstudiocode-insiders",  displayName: "VS Code Insiders",      icon: "VI", kind: "ide",       caps: ["coding", "extension"] },
  { id: "code-server",                displayName: "Code Server",           icon: "CS", kind: "ide",       caps: ["coding", "remote"] },
  { id: "windsurf",                   displayName: "Windsurf",              icon: "Ws", kind: "ide",       caps: ["coding", "flow", "chat"] },
  { id: "trae",                       displayName: "Trae",                  icon: "Tr", kind: "ide",       caps: ["coding", "chat"] },
  { id: "augment",                    displayName: "Augment",               icon: "Au", kind: "ide",       caps: ["coding", "context", "chat"] },
  { id: "antigravity",                displayName: "Antigravity",           icon: "Ag", kind: "ide",       caps: ["coding", "chat"] },
  // extension 系
  { id: "kilo-code",                  displayName: "Kilo Code",             icon: "Ki", kind: "extension", caps: ["coding", "review"] },
  { id: "roo-code",                   displayName: "Roo Code",              icon: "Ro", kind: "extension", caps: ["coding", "review"] },
  { id: "cline",                      displayName: "Cline",                 icon: "Cl", kind: "extension", caps: ["coding", "planning", "terminal"] },
  { id: "claude-code-extension",      displayName: "Claude Code Extension", icon: "CE", kind: "extension", caps: ["coding", "review", "chat"] },
  { id: "codex-extension",            displayName: "Codex Extension",       icon: "Ce", kind: "extension", caps: ["coding", "chat"] },
  { id: "zencoder",                   displayName: "ZenCoder",              icon: "Zc", kind: "extension", caps: ["coding", "testing", "review"] },
  { id: "amp",                        displayName: "Amp",                   icon: "Am", kind: "extension", caps: ["coding", "planning", "terminal"] },
  // utility
  { id: "copy",                       displayName: "Copy",                  icon: "Cp", kind: "utility",   caps: ["export"] },
  { id: "markdown-export",            displayName: "Export as Markdown",    icon: "Md", kind: "utility",   caps: ["export"] },
  // native（Traycer 自家 phase agent）
  { id: "traycer-phases",             displayName: "Traycer Phases",        icon: "Tp", kind: "native",    caps: ["planning", "phases"] },
  { id: "traycer-plan",               displayName: "Traycer Plan",          icon: "Tl", kind: "native",    caps: ["planning"] },
  { id: "traycer-review",             displayName: "Traycer Review",        icon: "Tv", kind: "native",    caps: ["review"] },
];

/**
 * 把 capability 文本映射到 Traycer severity/category 调色板（CSS 变量）。
 * 颜色完全来自 traycer-tokens.css，不在此 hardcode hex。
 */
const capabilityColor = (cap: string): string => {
  const c = cap.toLowerCase();
  if (c.includes("review"))                                  return "var(--traycer-color-clarity)";
  if (c.includes("test"))                                    return "var(--traycer-color-performance)";
  if (c.includes("plan") || c.includes("phases"))            return "var(--traycer-color-security)";
  if (c.includes("terminal") || c.includes("remote"))        return "var(--traycer-color-major)";
  if (c.includes("autocomplete") || c.includes("flow"))      return "var(--traycer-color-minor)";
  if (c.includes("export"))                                  return "var(--traycer-color-bug)";
  // coding / chat / context / extension 等默认走 clarity 紫
  return "var(--traycer-color-clarity)";
};

const AgentSelector = ({ agents, selectedAgent, onSelect, onRegister, sendToExtension }: Props) => {
  const { t } = useI18n();
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCaps, setCustomCaps] = useState("");

  const handleRegisterCustom = () => {
    if (!customName.trim()) return;
    const config: AgentConfig = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      agent_type: "custom",
      capabilities: customCaps
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    };
    onRegister(config);
    sendToExtension("registerAgent", config);
    setCustomName("");
    setCustomCaps("");
    setShowCustomForm(false);
  };

  // 合并内置 23 项与用户注册的 custom agent
  // 注意：parent 传进来的 AgentConfig.agent_type 仍是 ExecutionAgentType（10 个 union），
  //       本地 builtinAgents 用的是完整 23 个 string id，所以匹配只对 union 内的 id 命中，
  //       union 外的 id（gemini / codex / vscode 等）不会有 registered counterpart——这与现状一致。
  const allAgents = [
    ...builtinAgents.map((b) => {
      const registered = agents.find((a) => (a.agent_type as string) === b.id);
      return {
        id: registered?.id || b.id,
        name: registered?.name || b.displayName,
        icon: b.icon,
        capabilities: registered?.capabilities || b.caps,
        agent_type: b.id,
        kind: b.kind,
      };
    }),
    ...agents
      .filter((a) => a.agent_type === "custom")
      .map((a) => ({
        id: a.id,
        name: a.name,
        icon: a.name.slice(0, 2).toUpperCase(),
        capabilities: a.capabilities,
        agent_type: a.agent_type as ExecutionAgentType,
        kind: "extension" as AgentKind,
      })),
  ];

  return (
    <div className="p-3 space-y-3">
      {/* Header — body 14px，标题 sm */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[var(--vscode-foreground)]">{t.agentSelectorTitle}</h2>
        <button
          onClick={() => setShowCustomForm(!showCustomForm)}
          className="text-xs px-2 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] cursor-pointer hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
        >
          {t.agentCustomAdd}
        </button>
      </div>

      {/* Custom agent form */}
      {showCustomForm && (
        <div className="p-2.5 bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-input-border)] space-y-1.5">
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={t.agentNamePlaceholder}
            className="w-full px-2 py-1 text-xs bg-[var(--vscode-editor-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:border-[var(--vscode-focusBorder)] outline-none"
            autoFocus
          />
          <input
            value={customCaps}
            onChange={(e) => setCustomCaps(e.target.value)}
            placeholder={t.agentCapsPlaceholder}
            className="w-full px-2 py-1 text-xs bg-[var(--vscode-editor-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:border-[var(--vscode-focusBorder)] outline-none"
          />
          <div className="flex gap-1">
            <button
              onClick={handleRegisterCustom}
              disabled={!customName.trim()}
              className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] cursor-pointer hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-40 transition-colors"
            >
              {t.agentRegister}
            </button>
            <button
              onClick={() => { setShowCustomForm(false); setCustomName(""); setCustomCaps(""); }}
              className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] cursor-pointer hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
            >
              {t.agentCancel}
            </button>
          </div>
        </div>
      )}

      {/* Agent grid —— 23 项全展示 */}
      <div className="grid grid-cols-2 gap-1.5">
        {allAgents.map((agent) => {
          const isSelected = selectedAgent === agent.id || selectedAgent === agent.agent_type;
          return (
            <button
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className={`p-2.5 rounded border text-left cursor-pointer transition-all ${
                isSelected
                  ? "bg-[var(--vscode-list-activeSelectionBackground)] border-[var(--vscode-focusBorder)] shadow-sm"
                  : "bg-[var(--vscode-input-background)] border-[var(--vscode-input-border)] hover:border-[var(--vscode-focusBorder)]"
              }`}
            >
              {/* Icon + Name —— body 14px，icon 12px badge */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-6 h-6 rounded bg-[var(--vscode-editor-background)] text-[10px] font-bold flex items-center justify-center text-[var(--vscode-foreground)] shrink-0">
                  {agent.icon}
                </span>
                <span className="text-sm font-medium text-[var(--vscode-foreground)] truncate">{agent.name}</span>
              </div>

              {/* kind 子标签（terminal/ide/extension/...） */}
              <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-1 capitalize">
                {agent.kind}
              </div>

              {/* Capabilities —— Traycer severity 调色板 */}
              <div className="flex flex-wrap gap-0.5">
                {agent.capabilities.slice(0, 3).map((cap, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1 py-0.5 rounded font-medium text-white"
                    style={{ backgroundColor: capabilityColor(cap) }}
                  >
                    {cap}
                  </span>
                ))}
                {agent.capabilities.length > 3 && (
                  <span className="text-[10px] px-1 py-0.5 text-[var(--vscode-descriptionForeground)]">
                    +{agent.capabilities.length - 3}
                  </span>
                )}
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="mt-1.5 text-xs font-semibold flex items-center gap-1" style={{ color: "var(--traycer-color-performance)" }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: "var(--traycer-color-performance)" }} />
                  {t.agentSelected}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Manage agents link */}
      <div className="pt-1 border-t border-[var(--vscode-panel-border)]">
        <button
          onClick={() => sendToExtension("openAgentSettings")}
          className="text-xs text-[var(--vscode-textLink-foreground)] cursor-pointer hover:underline"
        >
          {t.agentManageInSettings}
        </button>
      </div>
    </div>
  );
};

export default AgentSelector;
