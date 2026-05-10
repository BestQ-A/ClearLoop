import { useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { ArrowUp, Square, Loader2, Paperclip, AtSign, X } from "lucide-react";

import type { FilePath } from "../../types/Homepage";
import { Button } from "../ui/button";
import { buildExtensions, getSlashCommands } from "./editor/extensions";
import { useI18n } from "../../i18n/I18nContext";

/**
 * Traycer-style ChatInput（TipTap + Floating UI）。
 *
 * - placeholder verbatim：`Type your message here (@mention for context)`
 * - Send 按钮三态：default(ArrowUp) / loading(Square ghost) / aborting(Loader2 spin)
 * - slash popup 用 Floating UI，offset(8) + flip + size{maxW:300, maxH:min(40vh,80%avail)}
 * - @ mention 通过 TipTap mention extension + onAttachFile
 *
 * 与历史 Homepage.tsx 的 props 签名保持兼容。
 */

interface Props {
  files: FilePath[];
  selectedFiles: FilePath[];
  onAttachFile: (file: FilePath) => void;
  onRemoveFile: (file: FilePath) => void;
  onSend: (text: string) => void;
  onSlashCommand?: (cmd: string, args?: string) => void;
  isLoading: boolean;
  placeholder?: string;
  /** 流式中断：可选 */
  isAborting?: boolean;
  onAbort?: () => void;
}

const ChatInput = ({
  files,
  selectedFiles,
  onAttachFile,
  onRemoveFile,
  onSend,
  onSlashCommand,
  isLoading,
  placeholder,
  isAborting = false,
  onAbort,
}: Props) => {
  const { t } = useI18n();
  const DEFAULT_PLACEHOLDER = t.chatInputPlaceholder;
  // selectedFiles 在 mention items 中要被排除
  const selectedRef = useRef(selectedFiles);
  useEffect(() => {
    selectedRef.current = selectedFiles;
  }, [selectedFiles]);

  // files 引用始终最新，避免 closure 陈旧
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const slashCommands = useMemo(() => getSlashCommands(t), [t]);
  const extensions = useMemo(
    () => buildExtensions({ placeholder: placeholder ?? DEFAULT_PLACEHOLDER, slashCommands }),
    [placeholder, DEFAULT_PLACEHOLDER, slashCommands],
  );

  const editor = useEditor({
    extensions,
    content: "",
    editorProps: {
      attributes: {
        class:
          "tiptap-editor min-h-[34px] max-h-[40vh] overflow-y-auto px-3 py-2 outline-none text-[var(--traycer-font-size-body)] leading-snug",
      },
      handleKeyDown: (_view, event) => {
        // Enter 发送 / Shift+Enter 换行；suggestion plugin 已优先消费 Enter（见 SlashCommandList/MentionList）
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          submit();
          return true;
        }
        return false;
      },
    },
  });

  // 注入 storage：让 extensions 内部回调能访问宿主状态
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage as unknown as Record<string, unknown>;

    storage.slashCommandHandler = (cmd: string) => {
      if (onSlashCommand) {
        onSlashCommand(cmd);
      }
    };

    storage.mentionItemsProvider = (q: string): FilePath[] => {
      const query = q.trim().toLowerCase();
      const all = filesRef.current ?? [];
      const taken = new Set(selectedRef.current?.map((f) => f.path) ?? []);
      const pool = all.filter((f) => !taken.has(f.path));
      const filtered = query
        ? pool.filter((f) => f.name.toLowerCase().includes(query))
        : pool;
      return filtered.slice(0, 8);
    };

    storage.mentionHandler = (path: string) => {
      const file = filesRef.current?.find((f) => f.path === path);
      if (file) onAttachFile(file);
    };

    return () => {
      storage.slashCommandHandler = undefined;
      storage.mentionItemsProvider = undefined;
      storage.mentionHandler = undefined;
    };
  }, [editor, onAttachFile, onSlashCommand]);

  const submit = () => {
    if (!editor) return;
    if (isLoading) return;
    const text = editor.getText().trim();
    if (!text) return;

    // 解析显式斜杠命令（用户键入 "/cmd args" 但未走 popup）
    if (text.startsWith("/") && onSlashCommand) {
      const rest = text.slice(1);
      const spaceIdx = rest.indexOf(" ");
      const cmd = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx);
      const args =
        spaceIdx === -1 ? undefined : rest.slice(spaceIdx + 1).trim() || undefined;
      if (cmd) {
        onSlashCommand(cmd, args);
        editor.commands.clearContent();
        return;
      }
    }

    onSend(text);
    editor.commands.clearContent();
  };

  // 销毁
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  return (
    <div className="flex flex-col gap-1.5 px-0 py-0">
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {selectedFiles.map((f) => (
            <span
              key={f.path}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
              style={{
                backgroundColor: "var(--vscode-input-background)",
                color: "var(--vscode-foreground)",
                border: "1px solid var(--vscode-input-border, transparent)",
              }}
            >
              <span className="truncate max-w-[160px]">{f.name}</span>
              <button
                type="button"
                onClick={() => onRemoveFile(f)}
                className="flex items-center justify-center opacity-60 hover:opacity-100"
                aria-label={`${t.chatRemove} ${f.name}`}
                title={t.chatRemove}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <section
        className="w-full flex flex-col gap-y-1 overflow-hidden rounded-md bg-[var(--vscode-editor-background)]"
        style={{
          border: "1px solid var(--border)",
        }}
      >
        <EditorContent editor={editor} />

        <div className="flex min-w-0 max-w-full items-center justify-between gap-1.5 px-1.5 pb-1.5">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-md"
              title={t.chatAttachFile}
              aria-label={t.chatAttachFile}
              onClick={() => editor?.chain().focus().insertContent("@").run()}
            >
              <Paperclip className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-md"
              title={t.chatMentionFile}
              aria-label={t.chatMentionFile}
              onClick={() => editor?.chain().focus().insertContent("@").run()}
            >
              <AtSign className="size-4" />
            </Button>
          </div>

          <div className="flex min-w-0 max-w-full items-center justify-end gap-1.5">
            {isAborting ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto group rounded-full"
                disabled
                aria-label={t.chatStopping}
                title={t.chatStopping}
              >
                <Loader2 className="w-4 h-4 animate-spin" />
              </Button>
            ) : isLoading ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto group rounded-full"
                onClick={() => onAbort?.()}
                aria-label={t.chatStop}
                title={t.chatStop}
              >
                <Square className="w-4 h-4 shrink-0 group-hover:text-red-600" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="icon"
                className="ml-auto rounded-full border border-border"
                onClick={submit}
                aria-label={t.chatSend}
                title={t.chatSend}
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ChatInput;
