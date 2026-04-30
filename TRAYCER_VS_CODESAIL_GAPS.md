# CodeSail vs Traycer — 1:1 差距对照清单

> 基于四份 Traycer 拆解（PROTO / EPIC_UI / UI / WORKFLOWS）逐项比对 CodeSail 当前实现。
> 每条目标注：**类型 / 严重度 / 修复方向**。
> 类型分三类：
> - **虚构（Fabricated）**：CodeSail 造了 Traycer 根本没有的概念/字段/UI
> - **缺失（Missing）**：Traycer 有但 CodeSail 没做或漏做
> - **错配（Misaligned）**：双方都有但语义/结构/视觉不一致

---

## 0. 总体结论

CodeSail 当前同时存在 **过度复杂化** 和 **过度简化** 两类垃圾：

- **过度复杂化（虚构）**：dnd-kit Kanban、TicketPriority、5 态 EpicStatus、Severity/Category/promptForAIAgent 强行塞进 EpicBoard …
- **过度简化（错配）**：toolbar word-mark `CODESAIL`、字号 `text-[10px] / text-[11px]`、placeholder 自创、缺 NotificationBell/Back-Forward、缺 ResizablePanelGroup、缺 TipTap 编辑器…

两边都需要推倒。

---

## 1. 顶部 Toolbar — 错配（严重）

| 项 | Traycer 真实 | CodeSail 当前 |
|---|---|---|
| 容器 | `<nav py-1 flex items-center justify-between sticky top-0 border-b border-b-border z-10 gap-1.5>`，`--traycer-toolbar-height: 50px`，内部 `min-h-[32px]` | `flex items-center justify-between px-3 py-2 border-b` 自定容器，无 50px 标准 |
| 左侧品牌 | **没有** Traycer word-mark；左侧是 Back / Forward IconButton（Lucide `ChevronLeftIcon` / `ChevronRight`，`width:16 height:16`） | `CODESAIL` 字母 word-mark `text-[11px] font-bold tracking-widest uppercase`（虚构） |
| 中间标题 | `EditableTitle`，路由派生：`Create new task` / `New Task` / `New Epic` / `Notifications` / `Prompt Templates` / `Workflows` / `CLI Agents` / `Commit Scripts` / `Model Profiles` / `Remote MCP Server` / `Task History` | 无（被 word-mark 占了位） |
| 右侧 | 条件性序列：`YoloModeProgressBadge` / `EpicConnectionStatusIndicator` / `OpenBoardBadgeButton`（`<SquareArrowOutUpRight class="size-2"/>` + `Open Board`）/ `SharePopover`（`Share2` size-4 in `size-7` rounded-md outline）/ `NotificationBellButton`（`size-7`，铃铛 `size-4`，未读 badge `-top-1.5 -right-2.5 min-w-4 rounded-full bg-primary px-1 text-[10px]`，`99+` 上限） | 4 个 SVG icon button，没有任何条件路由感知 |
| Logo | `TraycerLogoIcon` 340×340 mask SVG（dark `#eeeeee` / light `#333333`），**只在 Landing heading + Sign-in 出现**，不在 toolbar | 无 |

**修复方向**：完全推翻 `Homepage.tsx` 顶部块。需要：
1. 引入 React Router（Traycer 用 `createBrowserRouter`，CodeSail 当前是 `viewMode` state 切换 —— 完全不同）
2. 实现 `qt()` 路由→标题映射函数
3. 实现 `IconButton`（base classes 见 TRAYCER_UI_TEARDOWN.md A 节）
4. 实现 `NotificationBellButton`
5. 删 `CODESAIL` word-mark

---

## 2. WorkflowSelector — 虚构 + 错配（严重）

| 项 | Traycer 真实 | CodeSail 当前 |
|---|---|---|
| 卡片数量 | **4 张**：Epic / **Phases** / Plan / Review | 4 张：Epic / Plan / Review / **Refactor** |
| 卡片名错位 | 第二张是 `Phases`（agile workflow 的别名） | 第二张被改成 Plan（重复），第四张被改成 Refactor（不存在于首页选项） |
| 卡片 ID 映射 | 各 workflow.json UUID | 4 张里 2 张映到 `plan`（hard-coded bug） |
| 标题字号 | 推断 ≈ body 14px | `text-[15px] font-semibold` |
| 描述字号 | 推断 ≈ 12px | `text-[10px]`（过度简化） |
| Padding | `p-4 border-border rounded-md` | `p-3 rounded-lg`（错配） |
| 激活态 | `bg-vscode-input-background` + 右上 `CircleCheck size-4 text-green-500` | 自绘绿色 SVG check（不是 lucide） |
| Epic 促销徽章 | 促销期带绿色 `Free` 徽章 | 无 |
| 标题文案 | `What can I help you build today?` ✅ 一致 | ✅ |
| 副标题 | `Create new code, add features, or fix issues—let's make it happen.`（**`—` 是 em dash 不是空格 hyphen 空格**） | `Create new code, add features, or fix issues — let's make it happen.`（用了空格 hyphen 空格，错） |

**修复方向**：删 Refactor 卡，换成 Phases；4 卡 ID 改为 `epic / phases / plan / review`；副标题改 em dash；字号改 12-14px；图标用 lucide CircleCheck。

---

## 3. ChatInput / Editor — 虚构 + 缺失（严重）

| 项 | Traycer 真实 | CodeSail 当前 |
|---|---|---|
| 编辑器内核 | **TipTap** 富文本（`baseExtensions, createMentionExtension, createSlashCommandExtension`） | `<textarea>` 普通文本 + 自写 popup |
| Placeholder | `Type your message here (@mention for context)` | `Describe your task... (@ to mention files, / for commands)` |
| Send 按钮 | `rounded-full Button[variant=default size=icon]` 内嵌 `ArrowUp` lucide；**三态**：默认 / 中断态切 ghost + `StopIcon` / aborting 切 `Loader animate-spin` | 蓝色单态圆形按钮 |
| Slash popup | Floating UI（`offset(8) flip size{maxW:300, maxH:min(40vh,80%avail)}`），深色态切 `traycer-dark-mode` 类 | 自写 popup 定位 |
| @ mention | TipTap mention extension + 上下文类型 `PHASE_EDITOR_CONTEXT_TYPES` | 自写 popup |
| 禁用提示 | `optionalDisabledTooltip="Click to switch to text mode and enable input box"` | 无 |

**修复方向**：装 `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-mention` + `@floating-ui/react`；改 placeholder；Send 按钮改三态。

---

## 4. Workflow 协议结构 — 错配（架构级）

| 项 | Traycer 真实 | CodeSail 当前 |
|---|---|---|
| `workflow.json` 角色 | **注册表**：`{ id, name, description, entrypointCommand, commands: [...md filenames] }` | **DAG**：`{ id, name, steps: [{id,name,prompt_template}], edges: [{from,to,condition: "always"|"on_pass"|"on_fail"}] }` |
| step 编排位置 | 每个 `.md` 文件 YAML frontmatter 的 `nextSteps: [{name}]`（多分支供用户选） | JSON `edges` 数组 |
| 条件 edge | **不存在**。通过/失败由 prompt 文本里 "Path A/B/C" 等分支语言，由 LLM 自行解释 | `condition: on_pass / on_fail / always` 显式枚举 |
| `selectedAgent` | 仅 validation step 标 `REVIEWER`，其余默认 planner/architect | 无 |
| `argumentHints` | YAML frontmatter 字段，给用户填 `/$command <args>` | 无 |
| Workflow 数量 | **3 个**：Plan / Refactoring / Agile | **4 个**：plan / review / refactor / agile（多了 review） |
| Plan workflow steps | 8 个：trigger + plan + plan-validation + ticket-breakdown + execute + implementation-validation + revise-requirements + cross-artifact-validation | 6 个：trigger / plan / validation / breakdown / execute / impl_validation（少 revise-requirements + cross-artifact-validation） |
| Refactoring 特色 | `refactoring-analysis.md` + `refactoring-approach.md` 双文档 + 4 类 invariants（行为/契约/性能/数据） | 无（4 个简化 step） |
| Agile 双轨 | PM 写 epic-brief + core-flows，Architect 写 tech-plan | 不存在 agile.json 内部结构 |

**修复方向**：
1. 删 `review.json`（Traycer 没有独立 review workflow）
2. 把 `steps[] + edges[]` 改成 `entrypointCommand + commands[]`
3. 把每个 step 的 prompt 拆到独立 `.md` 文件，加 YAML frontmatter（id/name/description/argumentHints/selectedAgent/nextSteps）
4. 删 `condition: on_pass/on_fail`，改在 prompt 文本里写"Path A/B/C"
5. 补全 plan 缺的 2 个 step + refactoring 双文档 + agile PM/Architect 双轨

---

## 5. Epic Board UI — 虚构（彻底推翻）

| 项 | Traycer 真实 | CodeSail 当前 |
|---|---|---|
| 整体布局 | `<ResizablePanelGroup direction="horizontal" autoSaveId="epic-view-layout">` 左主区 80% + 右 Artifacts 抽屉 20% | dnd-kit 横向 5 列 Kanban |
| Artifacts 面板 | 右侧抽屉，三段折叠：`Specs` / `Tickets` / `Executions`，每段 `Button variant="ghost"` 单行列表 | 不存在（被 Kanban 替代） |
| 拖拽 | `package.json` 声明 `@dnd-kit/*` 但 bundle **零匹配**，UI 无拖拽 | 5px activation distance + DragOverlay 全套 dnd-kit |
| Mermaid 依赖图 | global.js 含 Mermaid 11，Epic UI **不主动渲染**依赖图（仅 Spec/Ticket Markdown 内可嵌） | 无（也对） |
| Header | `fixed top-0 left-0 right-0 z-50 border-b py-1.5 px-4 flex items-center gap-2 min-h-10` + Back/Forward + EditableTitle + Share `size-7` outline + `Open Chat` button + History + NotificationsBell | 自绘 epic 顶 bar，无 EditableTitle、无 ResizablePanel |
| Status badge | **无**。Epic 在 Traycer 没有 status 字段 | 5 列 status：DRAFT/PLANNING/IN_PROGRESS/REVIEW/DONE |

**修复方向**：完全推翻 `EpicBoard.tsx`：
1. 装 `react-resizable-panels`（Traycer 用的库）
2. 删 dnd-kit 用法（保留依赖也无意义，可一并删）
3. 删 5 列 Kanban
4. 实现 ArtifactsPanel（三段折叠 + ghost-Button 列表）
5. Header 改 `fixed top-0 z-50` + EditableTitle

---

## 6. 数据字段虚构 — 严重

### 6.1 Ticket — 虚构

| 字段 | Traycer | CodeSail |
|---|---|---|
| `title` | ✅ | ✅ |
| `status` | `TICKET_TODO / TICKET_IN_PROGRESS / TICKET_DONE`（**3 态**） | `TODO/IN_PROGRESS/IN_REVIEW/DONE/BLOCKED/CANCELLED`（**6 态，虚构 4 个**） |
| `assignee` | ✅ | `assigned_agent`（重命名错配） |
| `isStreaming` | ✅（Traycer 有） | ❌（缺失） |
| `updatedAt` | ✅ | `updated_at` |
| `priority` | **不存在** | `LOW/MEDIUM/HIGH/CRITICAL`（**完全虚构**） |
| `dependencies[]` | **不存在** | 有（虚构） |
| `labels[]` | **不存在** | 有（虚构） |
| `estimated_effort` | **不存在** | 有（虚构） |

**修复**：删 `priority / dependencies / labels / estimated_effort` 字段；TicketStatus 改 3 态；加 `isStreaming`；`assigned_agent` 改 `assignee`。

### 6.2 ExecutionStatus — 错配（命名完全不同）

Traycer 真实（`O.*` 枚举）：
```
NOT_STARTED / WAITING_FOR_EXECUTION / IN_PROGRESS / ABORTING /
COMPLETED / SKIPPED / FAILED / RATE_LIMITED /
STEP_INSUFFICIENT_CREDITS / STEP_ORG_BUNDLE_INSUFFICIENT
```

CodeSail 当前：
```
PENDING / RUNNING / VERIFYING / SUCCEEDED / FAILED / CANCELLED
```

**修复**：完整重写枚举（10 个值，Traycer 命名）。

### 6.3 EpicStatus — 错配

Traycer：proto 中是裸 `string`，**非强类型**。Epic 没有可枚举的 status 字段。
CodeSail：`DRAFT/PLANNING/IN_PROGRESS/REVIEW/DONE/ARCHIVED` 强类型枚举。

**修复**：改成 `Option<String>` 或彻底移除。

### 6.4 TicketPriority — 完全虚构

**直接删除整个枚举类型 + 所有引用。**

---

## 7. VerificationThread / VerificationComment — 错配（位置错了）

| 项 | Traycer | CodeSail |
|---|---|---|
| Thread 状态 | `open ↔ resolved` **二态** + `isDetached` 警示 | `UNRESOLVED / RESOLVED / OUTDATED` 三态 |
| Comment 严重度 | proto 中存在（属于 ReviewComment）：bug/perf/security/clarity/minor/major/critical 7 类 hex 颜色 | 有（位置错） |
| Comment 字段 | proto 中有 `severity / category / promptForAIAgent / isApplied`（属 ReviewComment 模型） | 有（位置错） |
| **关键**：渲染位置 | 这些字段渲染在 **CommentNavigator UI**（侧边栏 review 流），**不在 Epic Board** | 被错放到 EpicBoard 上 |

**修复**：proto 字段保留；UI 渲染位置移出 EpicBoard，改放到 CommentNavigator 路由（这是 Traycer 主路由名称的来源）。

### Severity hex（必须照抄，不要自创）

| Token | Hex |
|---|---|
| bug | `#f04438` |
| performance | `#17b26a` |
| security | `#026aa2` |
| clarity | `#5925dc` |
| architecture | （Traycer 中类似 architecture 走 review category 体系） |
| minor | `#3bb3e6` |
| major | `#ffd60a` |
| critical | `#b42318` |
| diff insert bg | `#2ea04326` |
| diff delete bg | `#f8514926` |

---

## 8. Backend 协议 — 错配（架构级，需决策）

| 项 | Traycer 真实 | CodeSail 当前 |
|---|---|---|
| 传输 | gRPC 双向流 over HTTP/2 | JSON-RPC 2.0 over stdio |
| 服务 | 1 个 `CodeDebugService`，1 条流 method `Stream(stream AgentToServer)→stream ServerToAgent` 承载全部 plan/verify/thinking + 反向 RPC | 30+ unary methods（initialize/listProviders/plan/validate/createEpic/yoloRun…），每个独立 |
| 大消息分片 | `ChunkedMessage`（双向） | 无 |
| 心跳 | `Ping/Pong` | 无 |
| 反向调用 | **19 个 ReverseRPC**：8 IDE/FS（Read/List/Regex/LSP/Glob/Diagnostics/GitDiff/GitInfo）+ 5 Spec + 5 Ticket + 1 Workflow + 2 Execution | 无（云端无法借扩展能力） |
| RPCRequest 分支 | 21 个 oneof：Plan/PlanChat/Verification/ReVerification/PhaseGen/PhaseIter/EpicChat/ContinueEpicChat + Epic Execution 4 个变体 + Ticket 持久化 5 个 | 无 oneof 概念，命名也不同 |
| ResponseField 双形 | `EpicResponseField`（流式）vs `EpicConversationResponseField`（持久化，artifact 用 ID 引用） | 无双形概念 |
| ArtifactIdentifier | 11 类 oneof（Phase/Task/Plan/Verification/Epic/EpicChat/Spec/Ticket/Workflow/EpicExecution + 4 子标识符） | 无统一 Identifier 体系 |

**修复决策点**（需用户拍板）：
- **方案 A（重型，1:1）**：切到 `tonic`（Rust gRPC）+ `prost`（proto），引入 ChunkedMessage / Ping/Pong / 19 个 ReverseRPC / 完整 ArtifactIdentifier 体系。改造量极大，但才是真 1:1。
- **方案 B（中型）**：保留 JSON-RPC stdio，**结构上模仿**：单条 stream-id 通道承载所有事件，引入 oneof 风格 envelope（`{type: "..." , payload: ...}`），实现 ReverseRPC 反向调用（扩展也能 read_file / list_dir / git_diff）。
- **方案 C（轻型）**：保持当前 unary，只补 ReverseRPC 反向能力（最少必要）。

---

## 9. 视觉/字体 token — 错配

| Token | Traycer | CodeSail |
|---|---|---|
| `--traycer-font-size-body` | **14px** | 多处用 `text-[10px]` / `text-[11px]` / `text-[12px]`（过度简化） |
| `--radius` | `0.5rem`（8px） | 混用 `rounded` / `rounded-md` / `rounded-lg` 无统一 |
| `--spacing` | `0.25rem` | Tailwind 默认 |
| 颜色源 | 全部桥接 `var(--vscode-*)`，**68 个独立变量** | 部分 `var(--vscode-*)`，部分硬编码 hex |
| Body 全局 | `padding: 0 5px !important`（VSCode 边距裁切） | 无 |
| 深色模式 | 全局 `.traycer-dark-mode` 类切换 | 无（全靠 VSCode CSS variable 自动） |

**修复**：CodeSail 全局 CSS 加 `body { padding: 0 5px !important; --radius: 0.5rem; --spacing: 0.25rem; }`；所有 `text-[10px]` / `text-[11px]` 全部审计后升到 `text-xs` 或 `text-sm`（除非 Traycer 明确用 `text-[10px]`，目前确认 only badge `text-[10px]`）。

---

## 10. Settings 子页 — 缺失

Traycer 5 个 settings 子页（路由 `/settings/*`）：

| 路由 | 组件 | CodeSail |
|---|---|---|
| `/settings/prompt-template` | `PromptTemplates` | ❌ 不存在 |
| `/settings/cli-agents` | `CliAgents` | 部分（AgentSelector 但不在 settings 路由） |
| `/settings/workflows` | `Workflows` | ❌ |
| `/settings/git` | `CommitScripts` | ❌ |
| `/settings/model-profiles` | `ModelProfiles` | ❌ |

CodeSail 当前只有 1 个 `SettingsPanel.tsx`，混在 viewMode 里，不是路由。

**修复**：实现 5 个独立 settings 子页 + 路由。

---

## 11. 路由结构 — 缺失

Traycer 完整路由（`createBrowserRouter`）：
- `/` → LandingRoute（"Create new task"）
- `/task/view/:taskChainId/:phaseBreakdownId/:taskId` → TaskView
- `/task/interview/:taskChainId` → InterviewView
- `/task/kanban/:taskChainId/:phaseBreakdownId` → KanbanView（注：这才是 `kanban`，不在 Epic Board，是 phase task 内部）
- `/task/loading/:taskChainId` → LoadingView
- `/history` → HistoryView
- `/epic/chat/:epicId` → EpicChatView
- `/mcp` → McpView
- `/notifications` → NotificationsView
- `/settings/*`（见上）

**关键发现**：Traycer 有一个 **`/task/kanban`** 路由 —— 但它是 **phase 内的 task 看板**，**不是 Epic Board**。也就是说 Kanban 视图在 Traycer 中确实存在，但属于 **Phase 任务分解后的 task 列表展示**，不是 Epic 顶层组织视图。CodeSail 把它放错了位置。

CodeSail 当前用 `viewMode` state（home / plan / validation / settings / history / epic / epicDetail / verification / agents / yolo / mcp）切换，不是真路由。

**修复**：引入 `react-router-dom`，按 Traycer 路由表重做。

---

## 12. CodeSail 自创视图 — 可能多余

CodeSail 自创但 Traycer 不存在的 viewMode：

| ViewMode | Traycer 对应 | 处理 |
|---|---|---|
| `plan` | 不是独立视图，是 EpicChat conversation 内的一个 ResponseField | 删除独立路由，融进 conversation |
| `validation` | 同上 | 同上 |
| `verification` | 部分对应 CommentNavigator review 流 | 移到 review 路由 |
| `agents` | 应在 `/settings/cli-agents` | 移到 settings |
| `yolo` | 在 model-profiles + workflow config 内，不是独立面板 | 拆解 |

**修复**：删 5 个独立 viewMode，重组到 Traycer 路由结构内。

---

## 13. CLI Agent 列表 — 缺失

Traycer 23 个 agent ID：
```
claude-code, gemini, codex, cursor, windsurf, cline, roo-code, augment, zencoder, amp,
antigravity, traycer-phases, traycer-plan, traycer-review, kilo-code, ide,
copy, traycer-export-md, ...（待补全到 23 个）
```

CodeSail 当前 ~10 个：
```
claude-code, cursor, copilot, cline, roo-code, augment, zencoder, amp, windsurf, custom
```

**修复**：补到 23 个 + displayName。

---

## 14. 其他缺失基础组件

| 组件 | 用途 | CodeSail 状态 |
|---|---|---|
| `IconButton$1` | 通用 icon button base | 自实现，class 不一致 |
| `EditableTitle / EditableTitleViewer` | inline 标题编辑 | 不存在 |
| `ResizablePanelGroup / ResizablePanel / ResizableHandle` | Epic 左右分栏（含 autoSave）| 不存在 |
| `Badge` (variant outline / default) | 通用徽章 | 自写，class 不一致 |
| `TooltipWrapper` | hover tooltip | 部分 |
| `PopoverContent` (with align / sideOffset) | 通用 popover | 不存在 |
| `CollapsibleSection` (`gn`) | 可折叠分组 | 不存在 |
| `FloatingUI` integration | mention/slash popup 定位 | 自写定位 |
| `TipTap` editor | 主输入框 | 普通 textarea |

**修复**：装 `shadcn/ui` 全套（Traycer 风格几乎是 shadcn 默认）+ `@floating-ui/react` + `@tiptap/*`。

---

## 修复优先级建议（如要做 1:1）

**P0（架构骨架，先做）：**
1. 引入 `react-router-dom` + 重写路由表（task #11）
2. 装 `shadcn/ui` + Lucide + Floating UI + TipTap（task #14）
3. 顶部 NavigationBar 重做（task #1）
4. WorkflowSelector 4 卡修正（task #2）
5. ChatInput 改 TipTap（task #3）

**P1（数据/协议，前端正确性依赖于此）：**
6. 删虚构字段（Ticket priority/labels/dependencies/effort，task #6）
7. ExecutionStatus 10 态重写（task #6.2）
8. workflow.json 改注册表 + .md frontmatter（task #4）
9. VerificationComment 移到 CommentNavigator（task #7）

**P2（重型重做）：**
10. EpicBoard 推翻重做 ResizablePanelGroup + ArtifactsPanel（task #5）
11. Settings 5 子页拆开（task #10）
12. 23 个 agent + displayName（task #13）

**P3（架构决策）：**
13. proto 协议方案 A/B/C 选择（task #8）—— 需用户拍板
14. ReverseRPC 反向能力（task #8）

---

## 附：交叉引用

- 所有 className verbatim：见 `TRAYCER_UI_TEARDOWN.md` / `TRAYCER_EPIC_UI_TEARDOWN.md`
- 所有 proto schema：见 `TRAYCER_PROTO_TEARDOWN.md`
- 所有 workflow 全文 prompt：见 `TRAYCER_WORKFLOW_PLAN.md` / `TRAYCER_WORKFLOW_REFACTORING.md` / `TRAYCER_WORKFLOW_AGILE.md`

**文档全部在** `e:\1_agents_space\9_AGI\BestQ-A\external\CodeSail\` 根目录，不要再读 minified bundle 了 —— 这五份就是全部蓝图。
