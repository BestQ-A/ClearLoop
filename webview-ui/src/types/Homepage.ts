import { Eye, FileText, List, RefreshCw, Settings, History, Zap } from "lucide-react";

export interface MenuItem {
  id: number;
  value: string;
  title: string;
  description: string;
  icon: string;
  isSelected: boolean;
}

export interface FilePath {
  path: string;
  name: string;
  extension: string;
  icon: string;
}

// --- Workflow types (mirror Rust protocol) ---

export type WorkflowType = "plan" | "refactoring" | "agile";

export type StepStatus = "pending" | "running" | "completed" | "failed";

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  status: StepStatus;
}

export interface WorkflowInfo {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
}

// --- Plan types ---

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  dependencies: string[];
}

export interface PlanResult {
  id: string;
  workflow: WorkflowType;
  task_name: string;
  problem_context: string;
  user_experience: string;
  technical_approach: string;
  steps: PlanStep[];
  file_changes: FileChange[];
  clarification?: Clarification | null;
}

// --- Validation types ---

export type Severity = "MINOR" | "MAJOR" | "CRITICAL";

export interface ValidationComment {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  referred_files: string[];
  is_applied: boolean;
}

export interface ValidationResult {
  plan_id: string;
  passed: boolean;
  score: number;
  comments: ValidationComment[];
  prompt_for_ai_agent: string;
}

// --- Analysis (legacy) ---

export interface ThinkingStep {
  step_number: number;
  step_title: string;
  step_description: string;
}

export interface AnalysisResponse {
  task_name: string;
  thinking_steps: ThinkingStep[];
  pr_title: string;
  pr_description: string;
  file_changes: FileChange[];
  clarification?: Clarification;
}

export interface FileChange {
  file_status: "new" | "modified" | "deleted";
  file_path: string;
  file_content?: string;
}

export interface Clarification {
  message: string;
  questions: string[];
}

// --- Provider types ---

export interface ProviderInfo {
  id: string;
  name: string;
  models: string[];
  is_local: boolean;
}

// --- History types ---

export interface HistoryEntry {
  id: string;
  workflow: WorkflowType;
  task_name: string;
  prompt: string;
  file_path: string;
  created_at: string;
  status: string;
}

// === Epic types ===
//
// 1:1 对齐 Traycer proto 真实模型。
//   - Epic.status：proto 是裸 string，不是强枚举
//   - TicketStatus：3 态（TICKET_TODO/TICKET_IN_PROGRESS/TICKET_DONE）
//   - ExecutionStatus：10 态
//   - ThreadStatus：2 态（open ↔ resolved，小写）
//   - 删除虚构字段：TicketPriority、Ticket.dependencies/labels/estimated_effort
//   - 字段重命名：assigned_agent → assignee
//   - 新增 isStreaming / isDetached（Traycer 真有）

export type SpecType = "prd" | "technical" | "architecture" | "custom";
export type SpecStatus = "DRAFT" | "REVIEW" | "APPROVED" | "OUTDATED";
export type TicketStatus = "TICKET_TODO" | "TICKET_IN_PROGRESS" | "TICKET_DONE";
export type ExecutionStatus =
  | "NOT_STARTED"
  | "WAITING_FOR_EXECUTION"
  | "IN_PROGRESS"
  | "ABORTING"
  | "COMPLETED"
  | "SKIPPED"
  | "FAILED"
  | "RATE_LIMITED"
  | "STEP_INSUFFICIENT_CREDITS"
  | "STEP_ORG_BUNDLE_INSUFFICIENT";
export type ExecutionAgentType = "claude-code" | "cursor" | "copilot" | "cline" | "roo-code" | "augment" | "zencoder" | "amp" | "windsurf" | "custom";
export type ReviewCategory = "BUG" | "SECURITY" | "PERFORMANCE" | "CLARITY" | "ARCHITECTURE";
export type ThreadStatus = "open" | "resolved";

export interface Epic {
  id: string;
  title: string;
  description: string;
  /** Traycer proto 中 Epic.status 是裸 string，可空 */
  status: string | null;
  specs: Spec[];
  tickets: Ticket[];
  executions: Execution[];
  created_at: string;
  updated_at: string;
}

export interface Spec {
  id: string;
  epic_id: string;
  title: string;
  content: string;
  spec_type: SpecType;
  status: SpecStatus;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  epic_id: string;
  title: string;
  description: string;
  status: TicketStatus;
  /** Traycer 字段名（legacy schema called this assigned_agent） */
  assignee: string | null;
  /** Traycer 流式 UI 标识 */
  isStreaming: boolean;
  created_at: string;
  updated_at: string;
}

export interface Execution {
  id: string;
  epic_id: string;
  ticket_id: string;
  agent: ExecutionAgentType;
  status: ExecutionStatus;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface VerificationThread {
  id: string;
  plan_id: string;
  comments: VerificationCommentFull[];
  status: ThreadStatus;
  /** Traycer 警示位：是否已与原始 plan/spec 脱离 */
  isDetached: boolean;
  created_at: string;
}

/**
 * VerificationCommentFull
 *
 * 注：`severity` / `category` / `prompt_for_ai_agent` / `is_applied` 这几个字段在
 * Traycer proto 中属于 ReviewComment 模型（用于 CommentNavigator 侧边栏 review 流），
 * **不应在 EpicBoard 上渲染**。这里保留它们是为了序列化兼容 CommentNavigator UI 的输入。
 */
export interface VerificationCommentFull {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  category: ReviewCategory;
  referred_files: string[];
  prompt_for_ai_agent: string;
  is_applied: boolean;
  created_at: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  agent_type: ExecutionAgentType;
  capabilities: string[];
}

export interface StreamEvent {
  type: string;
  data: any;
  timestamp: string;
}

export interface YoloConfig {
  skip_plan: boolean;
  auto_approve: boolean;
  disable_verification: boolean;
  severity_threshold: Severity;
  max_retries: number;
  auto_fix: boolean;
  execution_agent: string;
  timeout_minutes: number;
  auto_commit: boolean;
}

// === MCP server registry ===

export type McpScope = "user" | "workspace" | "organization";

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  scope: McpScope;
  disabled: boolean;
}

// --- Conversation types (Traycer-style "chat with the plan") ---

export type TurnRole = "user" | "assistant" | "system";

export interface ConversationTurn {
  id: string;
  role: TurnRole;
  content: string;          // markdown 内容
  plan?: PlanResult;        // role=assistant 且生成了 plan 时
  validation?: ValidationResult;
  timestamp: string;
  workflow?: WorkflowType;
}

export interface Conversation {
  id: string;
  turns: ConversationTurn[];
  createdAt: string;
  updatedAt: string;
}

// --- UI state ---

export type ViewMode = "home" | "plan" | "validation" | "settings" | "history" | "epic" | "epicDetail" | "verification" | "agents" | "yolo" | "mcp";

export const lucideIcons = { List, FileText, Eye, RefreshCw, Settings, History, Zap } as const;

// =====================================================================
// Epic Chat 多轮对话协议
//
// 与 Rust agent 完全对齐（不要随意改字段名/可选性）：
//   - EpicChatRequest / Turn        ：webview → extension → Rust
//   - EpicOutput / OrderedField     ：Rust → extension → webview（流式聚合后的最终结果）
//   - StreamEvent.type 扩展三个 epic 专用事件：
//       "epicFieldAppend"  增量追加（markdown 流式 token）
//       "epicFieldAdded"   一个 ordered field 新增并锁定
//       "epicFinal"        本轮所有 fields 完成
//
// 注意：这里的 Turn 与上面 ConversationTurn 是两套独立模型并存。
//   - ConversationTurn：旧 plan / validation 链路使用
//   - Turn（这里）    ：epic chat 多轮对话使用，直接对齐 Rust 协议
// =====================================================================

/** Epic chat 多轮对话单轮消息（与 Rust 协议字段名对齐） */
export interface Turn {
  role: "user" | "assistant";
  /** workflow step 标识（如 "trigger" / "tech-plan" / "epic-brief"） */
  step: string;
  /** turn 主体内容，markdown 文本 */
  markdown: string;
  /** ISO 时间戳 */
  timestamp: string;
}

/** webview → extension：发起一轮 epic chat 流式请求 */
export interface EpicChatRequest {
  /** 第一次发起时缺省，由 Rust 生成；后续轮次必须回传 */
  conversationId?: string;
  workflow: "plan" | "refactoring" | "agile";
  currentStep: string;
  userPrompt: string;
  previousTurns: Turn[];
}

/** 用户问答交互项 */
export interface Question {
  id: string;
  title: string;
  description?: string;
  options: string[];
  multiselect: boolean;
}

/** Next-step 选项（assistant 推荐下一步） */
export interface NextStepOption {
  name: string;
  description?: string;
}

/**
 * Handoff 请求：把 ticket 派发给某个 agent 执行。
 *
 * 注：webview-ui 既有 Execution / ExecutionAgentType 模型偏向 epic kanban 视角，
 * Rust 协议里的 HandoffRequest 是 epic chat 流里 ordered field 的载荷，独立保留。
 */
export interface HandoffRequest {
  id: string;
  ticketId?: string;
  agent?: string;
  status?: string;
}

/** 一个 epic chat 输出由有序 field 列表组成，UI 按顺序流式 append/render。 */
export type OrderedField =
  | { type: "markdown"; content: string }
  | { type: "interview"; question: Question }
  | { type: "ticketsGroup"; tickets: Ticket[] }
  | { type: "nextSteps"; options: NextStepOption[] }
  | { type: "executionRequests"; requests: HandoffRequest[] };

/** Rust → webview：本轮 epic chat 完整输出（流结束时的聚合视图） */
export interface EpicOutput {
  conversationId: string;
  step: string;
  orderedFields: OrderedField[];
}

/** Epic chat 流事件 type 子集（StreamEvent.type 是 string，这里仅为常量收敛） */
export type EpicStreamEventType =
  | "epicFieldAppend"
  | "epicFieldAdded"
  | "epicFinal";
