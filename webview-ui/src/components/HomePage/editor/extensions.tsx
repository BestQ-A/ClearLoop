import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import {
  computePosition,
  flip,
  offset,
  shift,
  size,
  autoUpdate,
} from "@floating-ui/dom";
import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";

import SlashCommandList, {
  type SlashCommandItem,
  type SlashCommandListHandle,
} from "./SlashCommandList";
import MentionList, { type MentionListHandle } from "./MentionList";
import type { FilePath } from "../../../types/Homepage";
import type { Translations } from "../../../i18n/locales";

/**
 * Traycer-style TipTap extensions（A 类，Editor 内核）。
 *
 * - StarterKit：基础富文本
 * - Placeholder：空态文案（verbatim "Type your message here (@mention for context)"）
 * - Mention（@）：插入文件 mention chip
 * - SlashCommand（/）：触发斜杠命令选择
 *
 * Floating UI 配置遵循 TRAYCER_UI_TEARDOWN.md §B：
 *   offset(8) + flip + size{ maxWidth: 300, maxHeight: min(40vh, 80% available) }
 */

// ---------- 斜杠命令清单（verbatim，与历史 SLASH_COMMANDS 一致） ----------

export function getSlashCommands(t: Translations): SlashCommandItem[] {
  return [
    { name: "plan", description: t.slashPlanDesc },
    { name: "refactoring", description: t.slashRefactoringDesc },
    { name: "agile", description: t.slashAgileDesc },
    { name: "verify", description: t.slashVerifyDesc },
    { name: "epic", description: t.slashEpicDesc },
    { name: "yolo", description: t.slashYoloDesc },
    { name: "palette", description: t.slashPaletteDesc },
    { name: "clear", description: t.slashClearDesc },
    { name: "help", description: t.slashHelpDesc },
  ];
}

// ---------- Floating UI helper ----------

interface SuggestionPopupController<H> {
  destroy: () => void;
  update: (clientRect: (() => DOMRect | null) | null | undefined, props: unknown) => void;
  ref: { current: H | null };
}

/**
 * 创建一个 Floating UI 浮层，把 ReactRenderer 渲染的组件挂到 document.body。
 * 自动跟随 caret（virtual reference）位置。
 */
function createFloatingPopup<R, P extends Record<string, any>>(
  component: React.ComponentType<R>,
  initialProps: P,
  editor: Editor,
  initialClientRect: (() => DOMRect | null) | null | undefined,
): SuggestionPopupController<R extends { ref?: React.Ref<infer H> } ? H : unknown> {
  const renderer = new ReactRenderer(component as never, {
    props: initialProps,
    editor,
  });

  const floating = document.createElement("div");
  floating.style.position = "absolute";
  floating.style.top = "0";
  floating.style.left = "0";
  floating.style.zIndex = "1000";
  floating.style.background = "var(--vscode-dropdown-background, var(--vscode-editor-background))";
  floating.style.color = "var(--vscode-dropdown-foreground, var(--vscode-foreground))";
  floating.style.border = "1px solid var(--vscode-focusBorder, var(--vscode-widget-border, transparent))";
  floating.style.borderRadius = "6px";
  floating.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
  floating.style.overflowY = "auto";
  floating.style.overflowX = "hidden";
  floating.appendChild(renderer.element);
  document.body.appendChild(floating);

  let currentClientRect = initialClientRect ?? null;
  let cleanupAutoUpdate: (() => void) | null = null;

  const virtualReference = {
    getBoundingClientRect: (): DOMRect => {
      const rect = currentClientRect?.();
      if (rect) return rect;
      return new DOMRect(0, 0, 0, 0);
    },
  };

  const reposition = () => {
    void computePosition(virtualReference, floating, {
      placement: "bottom-start",
      middleware: [
        offset(8),
        flip({ padding: 20 }),
        shift({ padding: 8 }),
        size({
          apply({ availableHeight, elements }) {
            Object.assign(elements.floating.style, {
              maxWidth: "300px",
              maxHeight: `min(40vh, ${Math.max(120, availableHeight * 0.8)}px)`,
            });
          },
        }),
      ],
    }).then(({ x, y }) => {
      Object.assign(floating.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });
  };

  cleanupAutoUpdate = autoUpdate(virtualReference as never, floating, reposition);

  return {
    destroy: () => {
      cleanupAutoUpdate?.();
      cleanupAutoUpdate = null;
      renderer.destroy();
      floating.remove();
    },
    update: (clientRect, props) => {
      currentClientRect = clientRect ?? null;
      renderer.updateProps(props as Record<string, unknown>);
      reposition();
    },
    ref: renderer.ref as never,
  };
}

// ---------- Slash command extension ----------

const SlashCommandPluginKey = new PluginKey("slashCommand");

function createSlashCommandExtension(commands: SlashCommandItem[]) {
  return Mention.extend({
    name: "slashCommand",
  }).configure({
    HTMLAttributes: {
      class: "slash-command-node",
    },
    suggestion: {
      char: "/",
      pluginKey: SlashCommandPluginKey,
      // 仅当 / 出现在行首/空白后才触发
      allowedPrefixes: [" ", "\n"],
      startOfLine: false,
      command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashCommandItem }) => {
        // 把 "/xxx" 替换为空，转交宿主组件处理 onSlashCommand
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .run();
        const handler = (editor.storage as unknown as Record<string, unknown>)
          .slashCommandHandler as ((cmd: string) => void) | undefined;
        handler?.(props.name);
      },
      items: ({ query }: { query: string }): SlashCommandItem[] => {
        const q = query.toLowerCase();
        if (!q) return commands;
        return commands.filter((c) => c.name.toLowerCase().startsWith(q));
      },
      render: () => {
        let popup: SuggestionPopupController<SlashCommandListHandle> | null = null;

        return {
          onStart: (props) => {
            popup = createFloatingPopup<unknown, Record<string, unknown>>(
              SlashCommandList as never,
              {
                items: props.items as SlashCommandItem[],
                command: props.command,
              },
              props.editor,
              props.clientRect ?? null,
            ) as SuggestionPopupController<SlashCommandListHandle>;
          },
          onUpdate: (props) => {
            popup?.update(props.clientRect ?? null, {
              items: props.items as SlashCommandItem[],
              command: props.command,
            });
          },
          onKeyDown: (props) => {
            if (props.event.key === "Escape") {
              popup?.destroy();
              popup = null;
              return true;
            }
            return popup?.ref.current?.onKeyDown({ event: props.event }) ?? false;
          },
          onExit: () => {
            popup?.destroy();
            popup = null;
          },
        };
      },
    },
  });
}

// ---------- @ mention extension ----------

const MentionPluginKey = new PluginKey("mention");

function createMentionExtension() {
  return Mention.configure({
    HTMLAttributes: {
      class: "mention-chip",
    },
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
    suggestion: {
      char: "@",
      pluginKey: MentionPluginKey,
      command: ({ editor, range, props }) => {
        const id = props.id ?? "";
        const label = props.label ?? id;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: "mention",
              attrs: { id, label },
            },
            { type: "text", text: " " },
          ])
          .run();

        const handler = (editor.storage as unknown as Record<string, unknown>)
          .mentionHandler as ((path: string) => void) | undefined;
        if (id) handler?.(id);
      },
      items: ({ query, editor }: { query: string; editor: Editor }) => {
        const provider = (editor.storage as unknown as Record<string, unknown>)
          .mentionItemsProvider as ((q: string) => FilePath[]) | undefined;
        return provider?.(query) ?? [];
      },
      render: () => {
        let popup: SuggestionPopupController<MentionListHandle> | null = null;

        return {
          onStart: (props) => {
            popup = createFloatingPopup<unknown, Record<string, unknown>>(
              MentionList as never,
              {
                items: props.items as FilePath[],
                command: props.command,
              },
              props.editor,
              props.clientRect ?? null,
            ) as SuggestionPopupController<MentionListHandle>;
          },
          onUpdate: (props) => {
            popup?.update(props.clientRect ?? null, {
              items: props.items as FilePath[],
              command: props.command,
            });
          },
          onKeyDown: (props) => {
            if (props.event.key === "Escape") {
              popup?.destroy();
              popup = null;
              return true;
            }
            return popup?.ref.current?.onKeyDown({ event: props.event }) ?? false;
          },
          onExit: () => {
            popup?.destroy();
            popup = null;
          },
        };
      },
    },
  });
}

// ---------- Editor 扩展工厂 ----------

export interface EditorExtensionsOptions {
  placeholder: string;
  slashCommands: SlashCommandItem[];
}

export function buildExtensions({ placeholder, slashCommands }: EditorExtensionsOptions) {
  return [
    StarterKit.configure({
      // 单行/多行均支持；保留默认行为
    }),
    Placeholder.configure({
      placeholder,
      showOnlyWhenEditable: true,
      showOnlyCurrent: false,
    }),
    createMentionExtension(),
    createSlashCommandExtension(slashCommands),
  ];
}
