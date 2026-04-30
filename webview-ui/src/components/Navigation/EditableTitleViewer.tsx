import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * Traycer `EditableTitleViewer` 复刻。
 * 见 TRAYCER_UI_TEARDOWN.md A 节 "Editable title (chat / task / epic only)"。
 *
 * 行为：
 *  - 默认渲染 <div>，点击切换为 <input>
 *  - Enter / blur → onSave(newTitle)；Esc → 取消还原
 */
export interface EditableTitleViewerProps {
  title: string;
  onSave: (next: string) => void;
  textClassName?: string;
  inputClassName?: string;
  placeholder?: string;
}

export function EditableTitleViewer({
  title,
  onSave,
  textClassName,
  inputClassName,
  placeholder,
}: EditableTitleViewerProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // title 外部变化时同步 draft（仅在非编辑态）
  React.useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = React.useCallback(() => {
    const next = draft.trim();
    if (next.length > 0 && next !== title) {
      onSave(next);
    } else {
      setDraft(title);
    }
    setEditing(false);
  }, [draft, title, onSave]);

  const cancel = React.useCallback(() => {
    setDraft(title);
    setEditing(false);
  }, [title]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className={cn(inputClassName)}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={cn("cursor-text", textClassName)}
    >
      {title || placeholder || ""}
    </div>
  );
}

export default EditableTitleViewer;
