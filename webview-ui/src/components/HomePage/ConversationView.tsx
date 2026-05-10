import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ConversationTurn,
  PlanResult,
  ValidationResult,
  StreamEvent,
  OrderedField,
  NextStepOption,
} from "../../types/Homepage";
import PlanView from "./PlanView";
import { useI18n } from "../../i18n/I18nContext";
import NextStepsPicker from "./NextStepsPicker";
import ClarificationCard from "./ClarificationCard";

// =====================================================================
// Props
// =====================================================================

interface Props {
  turns: ConversationTurn[];
  isStreaming: boolean;
  streamEvents: StreamEvent[]; // 当前流式 turn 的事件流
  onValidate: () => void;
  onGenerate: (agent: string) => void;
  /**
   * epicChat 多轮对话的有序字段流：MarkdownTurn / Interview / TicketsGroup /
   * NextSteps / ExecutionRequests 等。来自 reducer，按顺序渲染在 turns 之后。
   */
  streamingFields?: OrderedField[];
  /** 用户从 NextStepsPicker 选了某个选项的回调（name 由 server 决定） */
  onPickNextStep?: (name: string) => void;
  /** 用户回答 ClarificationCard 的回调 */
  onAnswerInterview?: (questionId: string, selected: string[]) => void;
}

// =====================================================================
// 紧凑型 Markdown 渲染（与 PlanView 保持一致风格）
// =====================================================================

const Markdown = ({ children }: { children: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      code: ({ children, ...props }) => (
        <code
          className="bg-[var(--vscode-textCodeBlock-background)] px-1 py-0.5 rounded text-[10px] font-mono"
          {...props}
        >
          {children}
        </code>
      ),
      pre: ({ children, ...props }) => (
        <pre
          className="bg-[var(--vscode-textCodeBlock-background)] p-2 rounded overflow-x-auto text-[10px]"
          {...props}
        >
          {children}
        </pre>
      ),
      a: ({ children, ...props }) => (
        <a
          className="text-[var(--vscode-textLink-foreground)] underline cursor-pointer"
          {...props}
        >
          {children}
        </a>
      ),
      ul: ({ children, ...props }) => (
        <ul className="list-disc list-inside ml-2 space-y-0.5" {...props}>
          {children}
        </ul>
      ),
      ol: ({ children, ...props }) => (
        <ol className="list-decimal list-inside ml-2 space-y-0.5" {...props}>
          {children}
        </ol>
      ),
      p: ({ children, ...props }) => (
        <p className="text-[11px] leading-relaxed mb-1" {...props}>
          {children}
        </p>
      ),
      strong: ({ children, ...props }) => (
        <strong className="font-semibold" {...props}>
          {children}
        </strong>
      ),
      blockquote: ({ children, ...props }) => (
        <blockquote
          className="border-l-2 border-[var(--vscode-textBlockQuote-border)] pl-2 italic"
          {...props}
        >
          {children}
        </blockquote>
      ),
    }}
  >
    {children}
  </ReactMarkdown>
);

// =====================================================================
// 时间戳格式化
// =====================================================================

const formatTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

// =====================================================================
// 子组件：Plan 紧凑卡片（assistant turn 内嵌）
// =====================================================================

interface PlanCardProps {
  plan: PlanResult;
  onValidate: () => void;
  onGenerate: (agent: string) => void;
}

const PlanCard = ({ plan, onValidate, onGenerate }: PlanCardProps) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const stepCount = plan.steps?.length ?? 0;
  const fileCount = plan.file_changes?.length ?? 0;

  return (
    <div
      className="rounded border mt-1.5"
      style={{
        background: "var(--vscode-input-background)",
        borderColor: "var(--vscode-panel-border)",
      }}
    >
      {/* 头部摘要 */}
      <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* 文档图标 */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ color: "var(--vscode-textLink-foreground)" }}
            className="shrink-0"
          >
            <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0h6.586a1.5 1.5 0 0 1 1.06.44l2.415 2.414A1.5 1.5 0 0 1 15 3.914V14.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 14.5v-13zM4.5 1a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V4h-2.5A1.5 1.5 0 0 1 10 2.5V1H4.5z" />
          </svg>
          <span
            className="text-[11px] font-semibold truncate"
            title={plan.task_name}
          >
            {plan.task_name}
          </span>
          <span
            className="shrink-0 text-[8px] font-bold px-1.5 py-[1px] rounded-full uppercase"
            style={{
              background: "var(--vscode-badge-background)",
              color: "var(--vscode-badge-foreground)",
            }}
          >
            {plan.workflow}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[9px] text-[var(--vscode-descriptionForeground)]">
            {stepCount} {stepCount === 1 ? t.convStep : t.convSteps}
            {fileCount > 0 && ` • ${fileCount} ${fileCount === 1 ? t.convFile : t.convFiles}`}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer"
            style={{
              background: "var(--vscode-button-secondaryBackground, #3a3d41)",
              color: "var(--vscode-button-secondaryForeground, #ccc)",
            }}
          >
            {expanded ? t.convPlanHide : t.convPlanView}
          </button>
        </div>
      </div>

      {/* 展开后嵌入完整 PlanView */}
      {expanded && (
        <div
          className="border-t"
          style={{ borderColor: "var(--vscode-panel-border)" }}
        >
          <PlanView
            plan={plan}
            isLoading={false}
            onValidate={onValidate}
            onGenerate={onGenerate}
          />
        </div>
      )}
    </div>
  );
};

// =====================================================================
// 子组件：Validation 紧凑卡片
// =====================================================================

const ValidationCard = ({ validation }: { validation: ValidationResult }) => {
  const { t } = useI18n();
  const passed = validation.passed;
  const score = Math.round((validation.score ?? 0) * 100);
  const commentCount = validation.comments?.length ?? 0;

  return (
    <div
      className="rounded border mt-1.5 px-2.5 py-1.5 flex items-center justify-between gap-2"
      style={{
        background: "var(--vscode-input-background)",
        borderColor: passed
          ? "var(--vscode-testing-iconPassed, #73c991)"
          : "var(--vscode-testing-iconFailed, #f14c4c)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {passed ? (
          <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
            <circle
              cx="6"
              cy="6"
              r="6"
              fill="var(--vscode-testing-iconPassed, #73c991)"
            />
            <path
              d="M3.5 6l2 2 3-4"
              stroke="#fff"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
            <circle
              cx="6"
              cy="6"
              r="6"
              fill="var(--vscode-testing-iconFailed, #f14c4c)"
            />
            <path
              d="M4 4l4 4M8 4l-4 4"
              stroke="#fff"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        )}
        <span className="text-[11px] font-semibold">
          {passed ? t.convValidationPassed : t.convValidationFailed}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[9px] text-[var(--vscode-descriptionForeground)] shrink-0">
        <span>{t.convScoreLabel} {score}%</span>
        <span>
          {commentCount} {commentCount === 1 ? t.verificationComment : t.verificationComments}
        </span>
      </div>
    </div>
  );
};

// =====================================================================
// 子组件：单个对话气泡
// =====================================================================

interface TurnBubbleProps {
  turn: ConversationTurn;
  onValidate: () => void;
  onGenerate: (agent: string) => void;
}

const TurnBubble = ({ turn, onValidate, onGenerate }: TurnBubbleProps) => {
  const isUser = turn.role === "user";
  const isSystem = turn.role === "system";

  if (isSystem) {
    return (
      <div className="w-full flex justify-center my-1">
        <div
          className="text-[9px] italic px-2 py-0.5 rounded text-[var(--vscode-descriptionForeground)]"
          style={{ background: "var(--vscode-input-background)" }}
        >
          {turn.content}
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="w-full flex justify-end mb-2">
        <div className="flex flex-col items-end max-w-[80%]">
          <div
            className="rounded px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap break-words"
            style={{
              background: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
            }}
          >
            {turn.content}
          </div>
          <span className="text-[8px] text-[var(--vscode-descriptionForeground)] mt-0.5 mr-0.5">
            {formatTime(turn.timestamp)}
          </span>
        </div>
      </div>
    );
  }

  // Assistant turn
  return (
    <div className="w-full mb-2">
      <div className="flex flex-col items-start max-w-full">
        <div className="text-[var(--vscode-foreground)] w-full">
          {turn.content && <Markdown>{turn.content}</Markdown>}
          {turn.plan && (
            <PlanCard
              plan={turn.plan}
              onValidate={onValidate}
              onGenerate={onGenerate}
            />
          )}
          {turn.validation && <ValidationCard validation={turn.validation} />}
        </div>
        <span className="text-[8px] text-[var(--vscode-descriptionForeground)] mt-0.5">
          {formatTime(turn.timestamp)}
        </span>
      </div>
    </div>
  );
};

// =====================================================================
// 子组件：流式中的占位 turn（带光标动画）
// =====================================================================

const StreamingTurn = ({ events }: { events: StreamEvent[] }) => {
  const { t } = useI18n();
  // 把所有文本类事件拼起来作为预览
  const preview = events
    .filter((e) =>
      ["text", "delta", "thinking", "content"].includes(String(e.type)),
    )
    .map((e) => {
      if (typeof e.data === "string") return e.data;
      if (e.data?.text) return String(e.data.text);
      if (e.data?.content) return String(e.data.content);
      return "";
    })
    .join("")
    .slice(-400); // 只显示尾部 400 字符避免过长

  return (
    <div className="w-full mb-2">
      <div className="flex flex-col items-start max-w-full w-full">
        <div className="text-[var(--vscode-foreground)] w-full">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--vscode-descriptionForeground)] mb-1">
            <svg
              className="animate-spin h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-20"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-70"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8h8a8 8 0 01-8 8 8 8 0 01-8-8z"
              />
            </svg>
            <span>{t.convThinking}</span>
          </div>
          {preview && (
            <div className="text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[var(--vscode-descriptionForeground)]">
              {preview}
              <span
                className="inline-block w-[6px] h-[11px] ml-0.5 align-middle animate-pulse"
                style={{ background: "var(--vscode-foreground)" }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// 子组件：OrderedField 渲染派发
// =====================================================================

interface OrderedFieldRendererProps {
  field: OrderedField;
  onPickNextStep?: (name: string) => void;
  onAnswerInterview?: (questionId: string, selected: string[]) => void;
}

const OrderedFieldRenderer = ({
  field,
  onPickNextStep,
  onAnswerInterview,
}: OrderedFieldRendererProps) => {
  switch (field.type) {
    case "markdown":
      // 流式 markdown：保持光标动效
      return (
        <div className="text-[var(--vscode-foreground)] w-full mb-2">
          <Markdown>{field.content}</Markdown>
          <span
            className="inline-block w-[6px] h-[11px] ml-0.5 align-middle animate-pulse"
            style={{ background: "var(--vscode-foreground)" }}
          />
        </div>
      );
    case "interview":
      return (
        <ClarificationCard
          question={field.question}
          onAnswer={(selected) =>
            onAnswerInterview?.(field.question.id, selected)
          }
        />
      );
    case "nextSteps":
      return (
        <NextStepsPicker
          options={field.options}
          onPick={(name) => onPickNextStep?.(name)}
        />
      );
    case "ticketsGroup":
      // 占位：agent D 后续替换为 TicketCard 列表
      return (
        <div
          className="rounded mt-1.5 px-2.5 py-1.5 text-[11px]"
          style={{
            background: "var(--vscode-input-background)",
            border: "1px solid var(--vscode-panel-border)",
            color: "var(--vscode-descriptionForeground)",
          }}
        >
          {field.tickets.length} tickets
        </div>
      );
    case "executionRequests":
      // 占位
      return (
        <div
          className="rounded mt-1.5 px-2.5 py-1.5 text-[11px]"
          style={{
            background: "var(--vscode-input-background)",
            border: "1px solid var(--vscode-panel-border)",
            color: "var(--vscode-descriptionForeground)",
          }}
        >
          {field.requests.length} execution requests
        </div>
      );
    default:
      return null;
  }
};

// =====================================================================
// 主组件：ConversationView
// =====================================================================

const ConversationView = ({
  turns,
  isStreaming,
  streamEvents,
  onValidate,
  onGenerate,
  streamingFields,
  onPickNextStep,
  onAnswerInterview,
}: Props) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 新 turn 到达、流式更新或 streamingFields 增长时自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    turns.length,
    isStreaming,
    streamEvents.length,
    streamingFields?.length ?? 0,
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {turns.map((turn) => (
          <TurnBubble
            key={turn.id}
            turn={turn}
            onValidate={onValidate}
            onGenerate={onGenerate}
          />
        ))}
        {isStreaming && <StreamingTurn events={streamEvents} />}
        {streamingFields && streamingFields.length > 0 && (
          <div className="w-full">
            {streamingFields.map((field, idx) => (
              <OrderedFieldRenderer
                key={`field-${idx}`}
                field={field}
                onPickNextStep={onPickNextStep}
                onAnswerInterview={onAnswerInterview}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default ConversationView;
