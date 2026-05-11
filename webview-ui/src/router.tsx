import { createMemoryRouter } from "react-router-dom";
import RootLayout from "./routes/RootLayout";
import LandingRoute from "./routes/LandingRoute";
import TaskView from "./routes/task/TaskView";
import InterviewView from "./routes/task/InterviewView";
import KanbanView from "./routes/task/KanbanView";
import LoadingView from "./routes/task/LoadingView";
import ChatView from "./routes/task/ChatView";
import HistoryView from "./routes/HistoryView";
import EpicChatView from "./routes/EpicChatView";
import McpView from "./routes/McpView";
import RunLedgerView from "./routes/RunLedgerView";
import MemoryReviewsView from "./routes/MemoryReviewsView";
import NotificationsView from "./routes/NotificationsView";
import SettingsLayout from "./routes/settings/SettingsLayout";
import PromptTemplatesView from "./routes/settings/PromptTemplatesView";
import CliAgentsView from "./routes/settings/CliAgentsView";
import WorkflowsView from "./routes/settings/WorkflowsView";
import CommitScriptsView from "./routes/settings/CommitScriptsView";
import ModelProfilesView from "./routes/settings/ModelProfilesView";

/**
 * Traycer commentNavigator 路由表（参见 TRAYCER_UI_TEARDOWN.md §0）。
 * 使用 createMemoryRouter（webview 无浏览器 history API）。
 */
export const router = createMemoryRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <LandingRoute /> },
      { path: "task/view/:taskChainId/:phaseBreakdownId/:taskId", element: <TaskView /> },
      { path: "task/interview/:taskChainId", element: <InterviewView /> },
      { path: "task/kanban/:taskChainId/:phaseBreakdownId", element: <KanbanView /> },
      { path: "task/loading/:taskChainId", element: <LoadingView /> },
      { path: "task/chat", element: <ChatView /> },
      { path: "history", element: <HistoryView /> },
      { path: "runs", element: <RunLedgerView /> },
      { path: "epic/chat/:epicId", element: <EpicChatView /> },
      { path: "mcp", element: <McpView /> },
      { path: "memory-reviews", element: <MemoryReviewsView /> },
      { path: "notifications", element: <NotificationsView /> },
      {
        path: "settings",
        element: <SettingsLayout />,
        children: [
          { index: true, element: <PromptTemplatesView /> },
          { path: "prompt-template", element: <PromptTemplatesView /> },
          { path: "cli-agents", element: <CliAgentsView /> },
          { path: "workflows", element: <WorkflowsView /> },
          { path: "git", element: <CommitScriptsView /> },
          { path: "model-profiles", element: <ModelProfilesView /> },
        ],
      },
    ],
  },
]);
