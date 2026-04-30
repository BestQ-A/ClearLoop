import { useLocation } from "react-router-dom";
import { useI18n } from "../../i18n/I18nContext";

/**
 * 路由 → 标题映射 hook（1:1 抄 Traycer commentNavigator 的 qt() 函数）。
 * 见 TRAYCER_UI_TEARDOWN.md A 节 "Title-resolver function"。
 *
 * 所有标题走 i18n（en / zh-CN）；动态标题（taskChainTitle / epicTitle）暂返静态 fallback，
 * 后续接 backend 时调用方可以覆盖 NavigationBar 的 title prop。
 */
export function usePageTitle(): string {
  const { pathname } = useLocation();
  const { t } = useI18n();

  if (pathname.includes("history")) return t.navTaskHistory;
  if (
    pathname.includes("/task/interview") ||
    pathname.includes("/task/kanban") ||
    pathname.includes("/task/view")
  ) {
    return t.navNewTask;
  }
  if (pathname.includes("epic/chat")) return t.navNewEpic;
  if (pathname.includes("settings/prompt-template")) return t.navPromptTemplates;
  if (pathname.includes("settings/workflows")) return t.navWorkflows;
  if (pathname.includes("settings/cli-agents")) return t.navCliAgents;
  if (pathname.includes("settings/git")) return t.navCommitScripts;
  if (pathname.includes("settings/model-profiles")) return t.navModelProfiles;
  if (pathname.includes("mcp")) return t.navRemoteMcpServer;
  if (pathname.includes("notifications")) return t.navNotifications;
  if (pathname === "/") return t.navCreateNewTask;
  return "";
}

export default usePageTitle;
