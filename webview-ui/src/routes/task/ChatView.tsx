import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type {
  EpicChatRequest,
  EpicOutput,
  HandoffRequest,
  NextStepOption,
  OrderedField,
  Question,
  StreamEvent,
  Turn,
  WorkflowType,
} from "../../types/Homepage";
import { getVsCodeApi } from "../../utils/vscode";
import NextStepsPicker from "../../components/HomePage/NextStepsPicker";
import ClarificationCard from "../../components/HomePage/ClarificationCard";

/**
 * ChatView —— ClearLoop epic chat 多轮对话页。
 *
 * 路由：`/task/chat?workflow=plan&step=trigger&conversationId=xxx`
 *
 * 角色定位：
 *   - 接住 LandingRoute 选定 workflow 卡片后的导航
 *   - 维护 ChatState（reducer 管理 turns / streaming fields / step / conversationId）
 *   - 通过 `getVsCodeApi().postMessage({ command: "epicChatStream", data: EpicChatRequest })`
 *     发起一轮请求；通过 window message 监听三个 epic 流事件并 dispatch 到 reducer
 *   - **本组件不渲染 ordered field UI 细节**：渲染交给 ChatConversationView
 *     （由 agent C 在后续 PR 实现），这里只串接 props
 */

// =====================================================================
// State + reducer
// =====================================================================

interface ChatState {
  conversationId?: string;
  workflow: WorkflowType;
  currentStep: string;
  /** 已完成的轮次（user + assistant 全文） */
  turns: Turn[];
  /**
   * 正在流式产出的 ordered fields（assistant 当前回合）。
   * 每收到 `epicFieldAdded` 时推入；`epicFieldAppend` 时合并最后一个 markdown field 的 content。
   */
  streamingFields: OrderedField[];
  isStreaming: boolean;
}

type ChatAction =
  | { type: "USER_SEND"; userPrompt: string; timestamp: string }
  | {
      type: "STREAM_FIELD_APPEND";
      /** 目标 field 索引；缺省视为最后一个 field */
      fieldIndex?: number;
      delta: string;
    }
  | { type: "STREAM_FIELD_ADDED"; field: OrderedField }
  | { type: "STREAM_FINAL"; output: EpicOutput }
  | { type: "STEP_CHANGE"; nextStep: string }
  | { type: "RESET"; workflow: WorkflowType; currentStep: string };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "USER_SEND": {
      const userTurn: Turn = {
        role: "user",
        step: state.currentStep,
        markdown: action.userPrompt,
        timestamp: action.timestamp,
      };
      return {
        ...state,
        turns: [...state.turns, userTurn],
        streamingFields: [],
        isStreaming: true,
      };
    }

    case "STREAM_FIELD_APPEND": {
      if (state.streamingFields.length === 0) return state;
      const idx =
        typeof action.fieldIndex === "number"
          ? action.fieldIndex
          : state.streamingFields.length - 1;
      if (idx < 0 || idx >= state.streamingFields.length) return state;
      const target = state.streamingFields[idx];
      // 仅 markdown 类型支持流式 append
      if (target.type !== "markdown") return state;
      const next = state.streamingFields.slice();
      next[idx] = { ...target, content: target.content + action.delta };
      return { ...state, streamingFields: next };
    }

    case "STREAM_FIELD_ADDED": {
      return {
        ...state,
        streamingFields: [...state.streamingFields, action.field],
      };
    }

    case "STREAM_FINAL": {
      // 把本轮 assistant 输出落盘成一个 Turn（markdown 拼接所有 markdown field）
      const markdown = action.output.orderedFields
        .filter((f): f is { type: "markdown"; content: string } => f.type === "markdown")
        .map((f) => f.content)
        .join("\n\n");
      const assistantTurn: Turn = {
        role: "assistant",
        step: action.output.step,
        markdown,
        timestamp: new Date().toISOString(),
      };
      return {
        ...state,
        conversationId: action.output.conversationId,
        currentStep: action.output.step,
        turns: [...state.turns, assistantTurn],
        streamingFields: action.output.orderedFields, // 保留作为已完成 turn 的结构化视图
        isStreaming: false,
      };
    }

    case "STEP_CHANGE": {
      return { ...state, currentStep: action.nextStep };
    }

    case "RESET": {
      return {
        conversationId: undefined,
        workflow: action.workflow,
        currentStep: action.currentStep,
        turns: [],
        streamingFields: [],
        isStreaming: false,
      };
    }

    default:
      return state;
  }
}

// =====================================================================
// Placeholder ConversationView（agent C 将实现完整渲染）
//
// 本占位仅展示已完成的 turns 与 streamingFields 的最小可视，确保 build 通过、
// 路由跳进来不会白屏。agent C 在下个 PR 替换为正式的 ChatConversationView，
// 接收同样的 props 即可。
// =====================================================================

interface ChatConversationViewProps {
  turns: Turn[];
  streamEvents: StreamEvent[];
  pendingFields: OrderedField[];
  isStreaming: boolean;
  /** Next-step 选项被点击。agent C 实现 UI 后调用 */
  onClickNextStep: (option: NextStepOption) => void;
  /** Interview 卡片回答提交。agent C 实现 UI 后调用 */
  onAnswerInterview: (questionId: string, answers: string[]) => void;
}

function PlaceholderConversationView({
  turns,
  pendingFields,
  isStreaming,
  onClickNextStep,
  onAnswerInterview,
}: ChatConversationViewProps) {
  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      {turns.map((turn, i) => (
        <article
          key={`${turn.timestamp}-${i}`}
          className={[
            "rounded-md border border-border p-3 text-sm leading-relaxed",
            turn.role === "user"
              ? "ml-6 bg-[var(--vscode-input-background)]"
              : "mr-6 bg-[var(--vscode-editor-background)]",
          ].join(" ")}
        >
          <div className="mb-1 text-[10px] font-medium uppercase text-[var(--vscode-descriptionForeground)]">
            {turn.role} - {turn.step}
          </div>
          <div className="whitespace-pre-wrap">{turn.markdown}</div>
        </article>
      ))}

      {(isStreaming || pendingFields.length > 0) && (
        <div className="mr-6 rounded-md border border-border p-3 text-sm">
          <div className="mb-1 text-[10px] font-medium uppercase text-[var(--vscode-descriptionForeground)]">
            assistant {isStreaming ? "(streaming)" : ""}
          </div>
          <div className="flex flex-col gap-2">
            {pendingFields.map((field, idx) => (
              <FieldPlaceholder
                key={idx}
                field={field}
                onPickNextStep={onClickNextStep}
                onAnswerInterview={onAnswerInterview}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface FieldRendererProps {
  field: OrderedField;
  onPickNextStep: (option: NextStepOption) => void;
  onAnswerInterview: (questionId: string, answers: string[]) => void;
}

function FieldPlaceholder({
  field,
  onPickNextStep,
  onAnswerInterview,
}: FieldRendererProps) {
  switch (field.type) {
    case "markdown":
      return <div className="whitespace-pre-wrap text-sm">{field.content}</div>;
    case "interview":
      return (
        <ClarificationCard
          question={field.question}
          onAnswer={(selected) => onAnswerInterview(field.question.id, selected)}
        />
      );
    case "ticketsGroup":
      return (
        <div className="text-xs italic text-[var(--vscode-descriptionForeground)]">
          [ticketsGroup placeholder] {field.tickets.length} tickets
        </div>
      );
    case "nextSteps":
      return (
        <NextStepsPicker
          options={field.options}
          onPick={(name) => {
            const option =
              field.options.find((o) => o.name === name) ?? { name };
            onPickNextStep(option);
          }}
        />
      );
    case "executionRequests":
      return (
        <div className="text-xs italic text-[var(--vscode-descriptionForeground)]">
          [executionRequests placeholder] {field.requests.length} requests
        </div>
      );
    default:
      return null;
  }
}

// =====================================================================
// Minimal ChatInput（不依赖 TipTap 全功能）
//
// LandingRoute 跳进来后用户立即输入第一轮 prompt。这里写一个最小的发送框。
// RootLayout 底部的全局 ChatInput 仍存在，但 ChatView 自带一个内部输入便于
// 路由内独立测试；后续 agent C 可以替换为复用 ChatInput 组件。
// =====================================================================

interface InlineChatInputProps {
  isStreaming: boolean;
  onSend: (prompt: string) => void;
}

function InlineChatInput({ isStreaming, onSend }: InlineChatInputProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const submit = () => {
    const el = ref.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text) return;
    onSend(text);
    el.value = "";
  };
  return (
    <div className="border-t border-border bg-[var(--vscode-editor-background)] px-3 py-2">
      <textarea
        ref={ref}
        rows={2}
        disabled={isStreaming}
        placeholder="Type your message and press Cmd/Ctrl+Enter to send"
        className="w-full resize-none rounded-md border border-border bg-[var(--vscode-input-background)] px-2 py-1.5 text-sm text-[var(--vscode-foreground)] outline-none disabled:opacity-60"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={isStreaming}
          className="rounded-md border border-border bg-[var(--vscode-button-background)] px-3 py-1 text-xs text-[var(--vscode-button-foreground)] hover:opacity-90 disabled:opacity-50"
        >
          {isStreaming ? "Streaming..." : "Send"}
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// 主组件 ChatView
// =====================================================================

function parseQuery(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

function isWorkflow(value: string | null): value is WorkflowType {
  return value === "plan" || value === "refactoring" || value === "agile";
}

export default function ChatView() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = useMemo(() => parseQuery(search), [search]);

  const initialWorkflow: WorkflowType = isWorkflow(params.get("workflow"))
    ? (params.get("workflow") as WorkflowType)
    : "plan";
  const initialStep = params.get("step") || "trigger";
  const initialConversationId = params.get("conversationId") || undefined;

  const [state, dispatch] = useReducer(chatReducer, {
    conversationId: initialConversationId,
    workflow: initialWorkflow,
    currentStep: initialStep,
    turns: [],
    streamingFields: [],
    isStreaming: false,
  });

  // streamEvents 仅作为 prop 透传给 ChatConversationView（agent C 可能需要原始事件流）
  const streamEventsRef = useRef<StreamEvent[]>([]);

  const sendEpicChat = useCallback(
    (userPrompt: string) => {
      const timestamp = new Date().toISOString();
      const previousTurns = state.turns;

      const request: EpicChatRequest = {
        conversationId: state.conversationId,
        workflow: state.workflow,
        currentStep: state.currentStep,
        userPrompt,
        previousTurns,
      };

      dispatch({ type: "USER_SEND", userPrompt, timestamp });
      streamEventsRef.current = [];

      try {
        getVsCodeApi().postMessage({ command: "epicChatStream", data: request });
      } catch (err) {
        // postMessage 失败时回滚 streaming 状态
        // eslint-disable-next-line no-console
        console.error("epicChatStream postMessage failed", err);
      }
    },
    [state.conversationId, state.currentStep, state.turns, state.workflow],
  );

  // window message 监听 epic 流事件
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data ?? {};
      const command: string | undefined = msg.command;

      // 直接走 streamEvent 通道（MessageHandler 把 epic 事件包成 streamEvent）
      if (command === "streamEvent" && msg.data) {
        const evt = msg.data as StreamEvent;
        streamEventsRef.current = [...streamEventsRef.current, evt];

        // Rust 端把 epic 流事件包成 StreamEvent::Custom
        // 形态：{ type: "Custom", data: { eventType: "epicFieldAppend"|..., payload: {...} } }
        // 这里解包后转成与下方"直发命令"路径一致的 dispatch
        let eventType: string | undefined;
        let payload: any;
        if (evt.type === "Custom") {
          const inner: any = (evt as any).data ?? {};
          eventType = inner.eventType;
          payload = inner.payload ?? {};
        } else {
          eventType = evt.type;
          payload = (evt as any).data ?? {};
        }

        switch (eventType) {
          case "epicFieldAppend": {
            // 兼容 textDelta（Rust）+ delta（契约描述）两种字段名
            const delta =
              typeof payload?.textDelta === "string"
                ? payload.textDelta
                : typeof payload?.delta === "string"
                ? payload.delta
                : "";
            dispatch({
              type: "STREAM_FIELD_APPEND",
              fieldIndex:
                typeof payload?.fieldIndex === "number"
                  ? payload.fieldIndex
                  : undefined,
              delta,
            });
            break;
          }
          case "epicFieldAdded": {
            const field = payload?.field as OrderedField | undefined;
            if (field) {
              dispatch({ type: "STREAM_FIELD_ADDED", field });
            }
            break;
          }
          case "epicFinal": {
            // payload 即 EpicOutput 全文
            const output = payload as EpicOutput | undefined;
            if (output && output.orderedFields) {
              dispatch({ type: "STREAM_FINAL", output });
            }
            break;
          }
          default:
            break;
        }
        return;
      }

      // 直发的 epic 事件命令（兼容 MessageHandler 直接 post 的形式）
      if (command === "epicFieldAppend") {
        const data = msg.data ?? {};
        dispatch({
          type: "STREAM_FIELD_APPEND",
          fieldIndex:
            typeof data.fieldIndex === "number" ? data.fieldIndex : undefined,
          delta: typeof data.delta === "string" ? data.delta : "",
        });
      } else if (command === "epicFieldAdded") {
        const field = msg.data?.field as OrderedField | undefined;
        if (field) dispatch({ type: "STREAM_FIELD_ADDED", field });
      } else if (command === "epicFinal") {
        const output = msg.data as EpicOutput | undefined;
        if (output) dispatch({ type: "STREAM_FINAL", output });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // URL conversationId / workflow / step 变更 → 重置 state（如用户从 Landing 重新跳进来）
  useEffect(() => {
    if (
      state.conversationId === initialConversationId &&
      state.workflow === initialWorkflow &&
      state.currentStep === initialStep
    ) {
      return;
    }
    if (!initialConversationId && state.turns.length === 0) {
      // 全新会话：保持 reducer 初值；workflow/step 跟随 URL
      dispatch({
        type: "RESET",
        workflow: initialWorkflow,
        currentStep: initialStep,
      });
    }
    // 否则不做事，避免对话过程中 URL 变化清空历史
  }, [initialConversationId, initialStep, initialWorkflow]); // eslint-disable-line react-hooks/exhaustive-deps

  // 占位回调，agent C 替换 ChatConversationView 后会真正调用
  const onClickNextStep = useCallback(
    (option: NextStepOption) => {
      // 触发下一步：以 option.name 作为下一轮的 currentStep + userPrompt
      dispatch({ type: "STEP_CHANGE", nextStep: option.name });
      sendEpicChat(option.description ? option.description : option.name);
    },
    [sendEpicChat],
  );

  const onAnswerInterview = useCallback(
    (questionId: string, answers: string[]) => {
      // 把 interview 答案以结构化文本形式作为 prompt 提交，agent C 后续可定制
      const payload = JSON.stringify({ questionId, answers });
      sendEpicChat(payload);
    },
    [sendEpicChat],
  );

  // 顶部头条：当前 workflow / step / conversation 状态摘要
  const headerSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(`workflow=${state.workflow}`);
    parts.push(`step=${state.currentStep}`);
    if (state.conversationId) parts.push(`conv=${state.conversationId.slice(0, 8)}`);
    parts.push(`turns=${state.turns.length}`);
    return parts.join("  |  ");
  }, [state.conversationId, state.currentStep, state.turns.length, state.workflow]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div className="text-xs text-[var(--vscode-descriptionForeground)]">
          {headerSummary}
        </div>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-md border border-border bg-transparent px-2 py-0.5 text-[10px] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
        >
          Back to Landing
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <PlaceholderConversationView
          turns={state.turns}
          streamEvents={streamEventsRef.current}
          pendingFields={state.streamingFields}
          isStreaming={state.isStreaming}
          onClickNextStep={onClickNextStep}
          onAnswerInterview={onAnswerInterview}
        />
      </main>

      <InlineChatInput isStreaming={state.isStreaming} onSend={sendEpicChat} />
    </div>
  );
}

// 导出 props 类型，便于 agent C 在替换 PlaceholderConversationView 时保持签名一致
export type { ChatConversationViewProps };

// 导出 reducer 与 ChatState，便于 agent D（MessageHandler 桥接）单测复用
export { chatReducer };
export type { ChatState, ChatAction, HandoffRequest, Question, NextStepOption };
