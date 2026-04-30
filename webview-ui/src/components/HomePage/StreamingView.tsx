import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronRight,
  Loader2,
  X,
  AlertCircle,
  Copy,
  Check,
  Wrench,
} from "lucide-react";
import type { StreamEvent } from "../../types/Homepage";
import { useI18n } from "../../i18n/I18nContext";

// =====================================================================
// Props & 内部数据结构
// =====================================================================

interface Props {
  events: StreamEvent[];
  isStreaming: boolean;
  onCancel?: () => void;
}

/** 工具调用记录 */
interface ToolCall {
  id: string;
  tool: string;
  params?: unknown;
  result?: unknown;
}

/** 思考节点（树状结构） */
interface ThinkingNode {
  id: string;
  parentId?: string;
  title: string;
  content: string;
  toolCalls: ToolCall[];
  children: ThinkingNode[];
  /** true = 仍在累积；false = 已 thinking_end */
  streaming: boolean;
}

interface ProgressInfo {
  phase: string;
  percent: number;
  message?: string;
}

interface DerivedState {
  thinkingNodes: ThinkingNode[];
  markdownContent: string;
  progress: ProgressInfo;
  errors: string[];
  done: boolean;
}

// =====================================================================
// 事件流 -> 派生状态（纯函数，可在 useMemo 内调用）
// =====================================================================

function deriveState(
  events: StreamEvent[],
  labels: { stepPrefix: string; toolPrefix: string },
): DerivedState {
  const roots: ThinkingNode[] = [];
  const nodeMap = new Map<string, ThinkingNode>();
  const stack: ThinkingNode[] = []; // 当前打开的思考块栈
  let markdown = "";
  let progress: ProgressInfo = { phase: "", percent: 0 };
  const errors: string[] = [];
  let done = false;
  let autoIdSeq = 0;

  const nextId = (prefix: string) => `${prefix}_${autoIdSeq++}`;

  for (const event of events) {
    const data = event.data;

    switch (event.type) {
      case "token": {
        markdown += typeof data === "string" ? data : String(data ?? "");
        break;
      }

      case "thinking_start": {
        const title =
          typeof data === "string"
            ? data
            : data?.title || `${labels.stepPrefix} ${roots.length + stack.length + 1}`;
        const explicitParentId =
          typeof data === "object" && data !== null ? data.parent_id : undefined;
        const id =
          typeof data === "object" && data !== null && data.id
            ? String(data.id)
            : nextId("think");

        const parent =
          (explicitParentId && nodeMap.get(String(explicitParentId))) ||
          stack[stack.length - 1];

        const node: ThinkingNode = {
          id,
          parentId: parent?.id,
          title,
          content: "",
          toolCalls: [],
          children: [],
          streaming: true,
        };

        nodeMap.set(id, node);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
        stack.push(node);
        break;
      }

      case "thinking_content": {
        const chunk = typeof data === "string" ? data : String(data ?? "");
        const current = stack[stack.length - 1];
        if (current) {
          current.content += chunk;
        }
        break;
      }

      case "thinking_end": {
        const closed = stack.pop();
        if (closed) closed.streaming = false;
        break;
      }

      case "tool_call": {
        const current = stack[stack.length - 1];
        const call: ToolCall = {
          id: nextId("tool"),
          tool:
            (typeof data === "object" && data !== null && (data.tool || data.name)) ||
            "tool",
          params:
            typeof data === "object" && data !== null
              ? data.params ?? data.arguments
              : undefined,
          result:
            typeof data === "object" && data !== null
              ? data.result ?? data.output
              : undefined,
        };
        if (current) {
          current.toolCalls.push(call);
        } else {
          // 没有 thinking 上下文时，挂一个虚拟节点承载工具调用
          const synthetic: ThinkingNode = {
            id: nextId("think"),
            title: `${labels.toolPrefix}: ${call.tool}`,
            content: "",
            toolCalls: [call],
            children: [],
            streaming: false,
          };
          nodeMap.set(synthetic.id, synthetic);
          roots.push(synthetic);
        }
        break;
      }

      case "progress": {
        if (typeof data === "object" && data !== null) {
          progress = {
            phase: data.phase || data.label || progress.phase,
            percent:
              typeof data.percent === "number" ? data.percent : progress.percent,
            message: data.message,
          };
        }
        break;
      }

      case "error": {
        errors.push(typeof data === "string" ? data : JSON.stringify(data));
        break;
      }

      case "done": {
        done = true;
        // 关闭所有未关闭的 thinking 块
        while (stack.length > 0) {
          const n = stack.pop();
          if (n) n.streaming = false;
        }
        break;
      }

      default:
        break;
    }
  }

  return { thinkingNodes: roots, markdownContent: markdown, progress, errors, done };
}

// =====================================================================
// 工具：参数 / 结果预览（截断）
// =====================================================================

function formatPreview(value: unknown, max = 80): string {
  if (value === undefined || value === null) return "";
  let s: string;
  if (typeof value === "string") {
    s = value;
  } else {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  }
  s = s.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// =====================================================================
// 子组件：代码块（带复制按钮）
// =====================================================================

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

const CodeBlock = ({ className, children }: CodeBlockProps) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").replace(/\n$/, "");
  const lang = (className || "").replace(/^language-/, "");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 忽略复制失败 */
    }
  };

  return (
    <div className="group relative my-1.5">
      {lang && (
        <div className="px-2 py-0.5 text-[9px] uppercase tracking-wide text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-textCodeBlock-background)] border-b border-[var(--vscode-panel-border)] rounded-t">
          {lang}
        </div>
      )}
      <pre
        className={`bg-[var(--vscode-textCodeBlock-background)] p-2 ${
          lang ? "rounded-b" : "rounded"
        } overflow-x-auto text-[10.5px] leading-relaxed font-[var(--vscode-editor-font-family,_monospace)] text-[var(--vscode-foreground)]`}
      >
        <code className={className}>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] text-[var(--vscode-button-secondaryForeground,#cccccc)]"
        title={copied ? t.streamCopied : t.streamCopy}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </div>
  );
};

// =====================================================================
// 子组件：思考节点（递归）
// =====================================================================

interface ThinkingNodeViewProps {
  node: ThinkingNode;
  depth: number;
  isStreaming: boolean;
}

const ThinkingNodeView = ({ node, depth, isStreaming }: ThinkingNodeViewProps) => {
  // 默认：根节点折叠；正在流式的节点自动展开（便于实时观察）
  const [expanded, setExpanded] = useState(node.streaming);

  // 当节点从 streaming 变为 done 时不强制折叠，保持用户当前选择
  useEffect(() => {
    if (node.streaming) setExpanded(true);
  }, [node.streaming]);

  const isStreamingThis = node.streaming && isStreaming;
  const dim = !node.streaming;

  return (
    <div
      className={`${dim ? "opacity-70" : "opacity-100"} transition-opacity`}
      style={{ marginLeft: depth === 0 ? 0 : 12 }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-1.5 px-1.5 py-1 rounded hover:bg-[var(--vscode-list-hoverBackground)] transition-colors text-left"
      >
        <ChevronRight
          size={11}
          className={`mt-[2px] shrink-0 text-[var(--vscode-descriptionForeground)] transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
        {isStreamingThis ? (
          <Loader2
            size={11}
            className="mt-[2px] shrink-0 text-[var(--vscode-progressBar-background,#0078d4)] animate-spin"
          />
        ) : null}
        <span className="text-[11px] font-medium text-[var(--vscode-foreground)] leading-relaxed break-words">
          {node.title}
        </span>
      </button>

      {expanded && (
        <div className="ml-[14px] mt-0.5 border-l border-[var(--vscode-panel-border)] pl-2">
          {node.content && (
            <div className="text-[11px] text-[var(--vscode-descriptionForeground)] leading-relaxed whitespace-pre-wrap py-1">
              {node.content}
              {isStreamingThis && (
                <span className="inline-block w-[5px] h-[10px] align-[-1px] ml-0.5 bg-[var(--vscode-foreground)] opacity-70 animate-pulse" />
              )}
            </div>
          )}

          {node.toolCalls.map((call) => (
            <ToolCallView key={call.id} call={call} />
          ))}

          {node.children.map((child) => (
            <ThinkingNodeView
              key={child.id}
              node={child}
              depth={depth + 1}
              isStreaming={isStreaming}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// =====================================================================
// 子组件：工具调用展示
// =====================================================================

const ToolCallView = ({ call }: { call: ToolCall }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const paramsPreview = formatPreview(call.params);
  const resultPreview = formatPreview(call.result);
  const hasDetails = paramsPreview || resultPreview;

  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={`w-full flex items-start gap-1.5 px-1.5 py-1 rounded text-left bg-[var(--vscode-input-background)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors ${
          hasDetails ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <Wrench
          size={10}
          className="mt-[2px] shrink-0 text-[var(--vscode-symbolIcon-functionForeground,#dcdcaa)]"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-mono text-[var(--vscode-foreground)] truncate">
            {call.tool}
            {paramsPreview && (
              <span className="text-[var(--vscode-descriptionForeground)]">
                ({paramsPreview})
              </span>
            )}
          </div>
          {!expanded && resultPreview && (
            <div className="text-[10px] text-[var(--vscode-descriptionForeground)] truncate">
              → {resultPreview}
            </div>
          )}
        </div>
      </button>

      {expanded && hasDetails && (
        <div className="ml-[14px] mt-0.5 space-y-1 text-[10.5px] font-mono">
          {paramsPreview && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
                {t.streamParams}
              </div>
              <pre className="whitespace-pre-wrap break-all p-1.5 rounded bg-[var(--vscode-textCodeBlock-background)] text-[var(--vscode-foreground)]">
                {typeof call.params === "string"
                  ? call.params
                  : JSON.stringify(call.params, null, 2)}
              </pre>
            </div>
          )}
          {resultPreview && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
                {t.streamResult}
              </div>
              <pre className="whitespace-pre-wrap break-all p-1.5 rounded bg-[var(--vscode-textCodeBlock-background)] text-[var(--vscode-foreground)]">
                {typeof call.result === "string"
                  ? call.result
                  : JSON.stringify(call.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =====================================================================
// 主组件
// =====================================================================

const StreamingView = ({ events, isStreaming, onCancel }: Props) => {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 派生状态：所有展示数据都是事件序列的纯函数
  const { thinkingNodes, markdownContent, progress, errors, done } = useMemo(
    () => deriveState(events, { stepPrefix: t.streamStepPrefix, toolPrefix: t.streamToolPrefix }),
    [events, t.streamStepPrefix, t.streamToolPrefix]
  );

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 使用 scrollTop 比 scrollIntoView 更可靠（避免影响外部容器）
    el.scrollTop = el.scrollHeight;
  }, [markdownContent, thinkingNodes, errors, isStreaming]);

  const showCursor = isStreaming && !done;

  // ---- Markdown 渲染器配置（VS Code 主题色 + 紧凑尺寸） -------------
  const markdownComponents = useMemo(
    () => ({
      // 代码：行内 vs 块级
      code(props: any) {
        const { inline, className, children } = props;
        if (inline) {
          return (
            <code className="bg-[var(--vscode-textCodeBlock-background)] px-1 rounded text-[10.5px] font-[var(--vscode-editor-font-family,_monospace)] text-[var(--vscode-foreground)]">
              {children}
            </code>
          );
        }
        return <CodeBlock className={className}>{children}</CodeBlock>;
      },
      // pre 不再单独包裹 —— 由 CodeBlock 接管
      pre({ children }: any) {
        return <>{children}</>;
      },
      h1({ children }: any) {
        return (
          <h1 className="text-[14px] font-bold text-[var(--vscode-foreground)] mt-2 mb-1">
            {children}
          </h1>
        );
      },
      h2({ children }: any) {
        return (
          <h2 className="text-[13px] font-bold text-[var(--vscode-foreground)] mt-2 mb-1">
            {children}
          </h2>
        );
      },
      h3({ children }: any) {
        return (
          <h3 className="text-[12px] font-bold text-[var(--vscode-foreground)] mt-1.5 mb-0.5">
            {children}
          </h3>
        );
      },
      p({ children }: any) {
        return (
          <p className="text-[11px] text-[var(--vscode-foreground)] leading-relaxed my-1">
            {children}
          </p>
        );
      },
      ul({ children }: any) {
        return (
          <ul className="text-[11px] text-[var(--vscode-foreground)] leading-relaxed list-disc pl-4 my-1 space-y-0.5">
            {children}
          </ul>
        );
      },
      ol({ children }: any) {
        return (
          <ol className="text-[11px] text-[var(--vscode-foreground)] leading-relaxed list-decimal pl-4 my-1 space-y-0.5">
            {children}
          </ol>
        );
      },
      li({ children }: any) {
        return <li className="text-[11px] leading-relaxed">{children}</li>;
      },
      a({ href, children }: any) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--vscode-textLink-foreground)] underline hover:text-[var(--vscode-textLink-activeForeground)]"
          >
            {children}
          </a>
        );
      },
      blockquote({ children }: any) {
        return (
          <blockquote className="border-l-2 border-[var(--vscode-textBlockQuote-border)] pl-2 my-1 text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-textBlockQuote-background)]">
            {children}
          </blockquote>
        );
      },
      table({ children }: any) {
        return (
          <div className="overflow-x-auto my-1">
            <table className="text-[10.5px] border-collapse w-full">
              {children}
            </table>
          </div>
        );
      },
      th({ children }: any) {
        return (
          <th className="border border-[var(--vscode-panel-border)] px-1.5 py-0.5 bg-[var(--vscode-input-background)] font-semibold text-left">
            {children}
          </th>
        );
      },
      td({ children }: any) {
        return (
          <td className="border border-[var(--vscode-panel-border)] px-1.5 py-0.5">
            {children}
          </td>
        );
      },
      hr() {
        return <hr className="border-t border-[var(--vscode-panel-border)] my-2" />;
      },
    }),
    []
  );

  return (
    <div className="relative flex flex-col h-full">
      {/* ============== 顶部：进度指示 ============== */}
      {isStreaming && (
        <div className="shrink-0 px-3 pt-2 pb-1.5">
          <div className="flex items-center justify-between mb-1 gap-2">
            <span className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] uppercase tracking-wide truncate">
              {progress.phase || t.streamPhaseDefault}
              {progress.message ? ` · ${progress.message}` : ""}
            </span>
            {progress.percent > 0 && (
              <span className="text-[9px] text-[var(--vscode-descriptionForeground)] tabular-nums shrink-0">
                {Math.min(100, Math.round(progress.percent))}%
              </span>
            )}
          </div>
          <div className="w-full h-px bg-[var(--vscode-input-background)] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--vscode-progressBar-background,#0078d4)] via-[var(--vscode-textLink-foreground,#3794ff)] to-[var(--vscode-progressBar-background,#0078d4)] transition-all duration-300 streaming-progress-bar"
              style={
                progress.percent > 0
                  ? { width: `${Math.min(100, progress.percent)}%` }
                  : { width: "100%", animation: "streaming-shimmer 2s linear infinite" }
              }
            />
          </div>
        </div>
      )}

      {/* ============== 内容滚动区 ============== */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 leading-relaxed"
      >
        {/* —— 思考树（位于 markdown 之上） —— */}
        {thinkingNodes.length > 0 && (
          <div className="mb-2 space-y-0.5">
            {thinkingNodes.map((node) => (
              <ThinkingNodeView
                key={node.id}
                node={node}
                depth={0}
                isStreaming={isStreaming}
              />
            ))}
          </div>
        )}

        {/* —— 错误块 —— */}
        {errors.length > 0 && (
          <div className="space-y-1 mb-2">
            {errors.map((err, idx) => (
              <div
                key={idx}
                className="flex items-start gap-1.5 p-2 rounded border-l-2 bg-[var(--vscode-inputValidation-errorBackground,#5a1d1d)] border-[var(--vscode-errorForeground)]"
              >
                <AlertCircle
                  size={12}
                  className="mt-[1px] shrink-0 text-[var(--vscode-errorForeground)]"
                />
                <div className="text-[11px] text-[var(--vscode-errorForeground)] whitespace-pre-wrap break-words leading-relaxed">
                  {err}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* —— Markdown 主体 —— */}
        {markdownContent ? (
          <div className="markdown-body text-[11px]">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {markdownContent}
            </ReactMarkdown>
            {showCursor && (
              <span
                className="inline-block w-[6px] h-[12px] align-[-2px] ml-0.5 bg-[var(--vscode-foreground)] animate-pulse"
                aria-hidden
              >
                ▌
              </span>
            )}
          </div>
        ) : (
          // 空态
          !isStreaming &&
          events.length === 0 && (
            <div className="text-center py-8 text-[10px] text-[var(--vscode-descriptionForeground)]">
              {t.streamWaiting}
            </div>
          )
        )}

        {/* —— 完成指示 —— */}
        {!isStreaming && events.length > 0 && (
          <div className="flex items-center gap-1.5 pt-2 mt-2 border-t border-[var(--vscode-panel-border)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-testing-iconPassed,#73c991)] inline-block" />
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              {t.streamCompleted}
            </span>
          </div>
        )}
      </div>

      {/* ============== 浮动 Cancel 按钮 ============== */}
      {isStreaming && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          title={t.streamCancel}
          aria-label={t.streamCancelStreaming}
          className="absolute bottom-3 right-3 w-7 h-7 rounded-full flex items-center justify-center bg-[var(--vscode-button-background,#0e639c)] hover:bg-[var(--vscode-button-hoverBackground,#1177bb)] text-[var(--vscode-button-foreground,#ffffff)] shadow-md transition-colors"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      )}

      {/* 内联样式：进度条 shimmer 动画（避免污染全局 CSS 文件） */}
      <style>{`
        @keyframes streaming-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default StreamingView;
