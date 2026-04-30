import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useI18n } from "../../../i18n/I18nContext";

/**
 * Slash command popup（Traycer SlashCommandList 1:1 复刻）。
 * 通过 TipTap suggestion plugin 调用，由 ReactRenderer 挂到 Floating UI 容器中。
 *
 * - ↑↓ 高亮
 * - Enter 选择
 * - Esc 关闭（由 suggestion plugin 自然处理）
 */

export interface SlashCommandItem {
  name: string;
  description: string;
}

interface Props {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface SlashCommandListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashCommandList = forwardRef<SlashCommandListHandle, Props>(
  ({ items, command }, ref) => {
    const { t } = useI18n();
    const [selectedIndex, setSelectedIndex] = useState(0);

    // items 变化时重置高亮
    useEffect(() => setSelectedIndex(0), [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % Math.max(1, items.length));
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % Math.max(1, items.length));
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="p-2 text-sm text-[var(--vscode-descriptionForeground)]">
          {t.slashEmpty}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-0.5 p-1">
        {items.map((item, idx) => {
          const isActive = idx === selectedIndex;
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => selectItem(idx)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className="flex flex-col gap-0.5 rounded-sm px-3 py-2 text-left text-sm transition-colors"
              style={{
                backgroundColor: isActive
                  ? "var(--vscode-list-activeSelectionBackground)"
                  : "transparent",
                color: isActive
                  ? "var(--vscode-list-activeSelectionForeground)"
                  : "var(--vscode-dropdown-foreground, var(--vscode-foreground))",
              }}
            >
              <span className="truncate font-medium">/{item.name}</span>
              {item.description && (
                <span
                  className="truncate text-sm"
                  style={{
                    color: isActive
                      ? "var(--vscode-list-activeSelectionForeground)"
                      : "var(--vscode-descriptionForeground)",
                    opacity: isActive ? 0.85 : 1,
                  }}
                >
                  {item.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  },
);

SlashCommandList.displayName = "SlashCommandList";

export default SlashCommandList;
