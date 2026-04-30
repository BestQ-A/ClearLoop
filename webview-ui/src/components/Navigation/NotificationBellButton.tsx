import { Bell } from "lucide-react";
import IconButton from "./IconButton";

/**
 * Traycer `NotificationBellButton` 1:1 复刻。
 * 见 TRAYCER_UI_TEARDOWN.md A 节 "NotificationBellButton definition"。
 *
 * 注：badge 颜色用 VS Code button background/foreground 桥接（Traycer 原文是 bg-primary，
 * 在我们 token 体系里 primary 落到 vscode button background，与 IconButton 写法一致）。
 */
export interface NotificationBellButtonProps {
  unreadCount: number;
  ariaLabel: string;
  title: string;
  onClick?: () => void;
}

export function NotificationBellButton({
  unreadCount,
  ariaLabel,
  title,
  onClick,
}: NotificationBellButtonProps) {
  return (
    <IconButton
      ariaLabel={ariaLabel}
      title={title}
      isBordered
      onClick={onClick}
      className="inline-flex size-7 shrink-0 items-center justify-center p-0"
    >
      <span className="relative inline-flex size-4 items-center justify-center">
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-2.5 flex min-w-4 items-center justify-center rounded-full bg-[var(--vscode-button-background)] px-1 text-[10px] font-medium leading-4 text-[var(--vscode-button-foreground)]"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </span>
    </IconButton>
  );
}

export default NotificationBellButton;
