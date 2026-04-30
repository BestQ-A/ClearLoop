import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { FilePath } from "../../../types/Homepage";
import { useI18n } from "../../../i18n/I18nContext";

/**
 * @ mention popup（Traycer ProviderSelectionMenu 风格的文件选择子集）。
 *
 * - ↑↓ 高亮
 * - Enter 选择
 * - 选择后插入 mention chip（id=path, label=name）
 */

interface Props {
  items: FilePath[];
  command: (item: { id: string; label: string }) => void;
}

export interface MentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef<MentionListHandle, Props>(
  ({ items, command }, ref) => {
    const { t } = useI18n();
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    const selectItem = (index: number) => {
      const file = items[index];
      if (file) command({ id: file.path, label: file.name });
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
          {t.mentionEmpty}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-0.5 p-1">
        {items.map((file, idx) => {
          const isActive = idx === selectedIndex;
          const dir = file.path.split(/[/\\]/).slice(-2, -1).join("/");
          return (
            <button
              key={file.path}
              type="button"
              onClick={() => selectItem(idx)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className="flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors"
              style={{
                backgroundColor: isActive
                  ? "var(--vscode-list-activeSelectionBackground)"
                  : "transparent",
                color: isActive
                  ? "var(--vscode-list-activeSelectionForeground)"
                  : "var(--vscode-dropdown-foreground, var(--vscode-foreground))",
              }}
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {file.name}
              </span>
              {dir && (
                <span
                  className="shrink-0 truncate text-xs"
                  style={{
                    color: isActive
                      ? "var(--vscode-list-activeSelectionForeground)"
                      : "var(--vscode-descriptionForeground)",
                    opacity: isActive ? 0.85 : 1,
                  }}
                >
                  {dir}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  },
);

MentionList.displayName = "MentionList";

export default MentionList;
