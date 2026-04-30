import { Outlet, NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n/I18nContext";

/**
 * SettingsLayout —— Traycer 5 子页 settings shell。
 * 顶部 horizontal tab nav + 主区 <Outlet />。
 *
 * 路由由上层（SCAFFOLD agent）配置，路径：
 *   /settings/prompt-template
 *   /settings/cli-agents
 *   /settings/workflows
 *   /settings/git
 *   /settings/model-profiles
 *
 * 视觉规范：颜色全部走 VS Code variable 桥，不 hardcode hex。
 */
export default function SettingsLayout() {
  const { t } = useI18n();
  const TABS: Array<{ to: string; label: string }> = [
    { to: "prompt-template", label: t.settingsTabPromptTemplates },
    { to: "cli-agents", label: t.settingsTabCliAgents },
    { to: "workflows", label: t.settingsTabWorkflows },
    { to: "git", label: t.settingsTabCommitScripts },
    { to: "model-profiles", label: t.settingsTabModelProfiles },
  ];
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar —— 横向滚动避免窄面板溢出 */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--vscode-panel-border)] overflow-x-auto shrink-0">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors",
                isActive
                  ? "bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]"
                  : "text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* 主区 —— 子页内容（每个子页在自身内部走 spacing） */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <Outlet />
      </div>
    </div>
  );
}
