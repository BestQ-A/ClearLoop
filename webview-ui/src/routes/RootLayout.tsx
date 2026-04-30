import { Outlet } from "react-router-dom";

/**
 * 根 Layout —— Traycer commentNavigator shell。
 * 顶部 NavigationBar / 底部 ChatInput 均由其他 agent 接入；本骨架只搭外框。
 */
export default function RootLayout() {
  return (
    <div className="flex flex-col h-screen bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
      {/* TODO(NAV agent): NavigationBar / NavigationBarContainer 在这里挂 */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
      {/* TODO(EDITOR agent): ChatInput / 底部 dock */}
    </div>
  );
}
