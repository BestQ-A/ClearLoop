import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../../lib/utils";

/**
 * Traycer-style 折叠分组（对应 minified `gn` 组件）。
 * 标题行：箭头 + 标题（uppercase muted） + 计数 Badge。
 * 展开时占据剩余高度（flex-1）；折叠时收起到 header 高度。
 */
export interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
  /** 段头右侧的辅助按钮（如 + Add Spec） */
  actionButton?: ReactNode;
}

export default function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
  actionButton,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "flex flex-col min-h-0 border-b border-[var(--vscode-panel-border)]",
        open && "flex-1"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)] transition-colors shrink-0 border-b border-transparent",
          open && "border-[var(--vscode-panel-border)]"
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 truncate flex-1 cursor-pointer self-stretch -my-2 py-2 text-left"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform shrink-0",
              !open && "-rotate-90"
            )}
          />
          <span className="text-sm font-semibold text-[var(--vscode-descriptionForeground)] uppercase truncate">
            {title}
          </span>
          {count > 0 && (
            <Badge variant="outline" className="rounded-full text-[10px]">
              {count}
            </Badge>
          )}
        </button>
        {actionButton && (
          <div className="flex items-center gap-1 shrink-0">{actionButton}</div>
        )}
      </div>
      {open && (
        <div className="flex-1 overflow-hidden min-h-0">
          <div className="h-full overflow-auto p-1.5">{children}</div>
        </div>
      )}
    </div>
  );
}
