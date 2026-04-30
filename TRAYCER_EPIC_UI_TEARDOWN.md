# Traycer Epic Board UI 逆向分析

**版本**: traycer-vscode 2.16.3 (`package.json`)
**分析对象**: `traycer-views/dist/assets/epicView.js` (206 KB minified) + `epicView.css` (3.4 KB) + 共享 `global.js` / `global.css`
**命令入口**: `traycer.openEpicView` (`package.json` line 423)

---

## 0. 核心结论（先决于 A~I）

**Traycer Epic Board 不是 Kanban**。

这是一个 **左主区 + 右侧 Artifacts 抽屉** 的两栏布局。Artifacts 面板内部是 **三个垂直可折叠分组**（Specs / Tickets / Executions），各自渲染为单纯的列表（`Button variant="ghost"`），**没有列拖拽、没有看板列、没有 priority/labels/dependencies/effort 字段**，dnd-kit 虽然在 `package.json` 声明依赖，但**未在 webview bundle 中使用**（`epicView.js` + `global.js` 都搜不到 `@dnd-kit` / `useSortable` / `DragOverlay` / `PointerSensor`）。

Mermaid 在 `global.js` 中存在（通用 Mermaid 11 渲染器，含 kanban diagram 类型），但 Epic View 自己**不渲染依赖 Mermaid 图**。

下面 A~I 严格按 Traycer 实际实现描述；不存在的章节明确标注「不存在」。

---

## A. Epic Board 整体布局

### 顶层结构

```
<div className="h-screen flex flex-col">
  <Header />                                   ← 固定顶部，h ≈ 40px
  <div className="flex-1 overflow-hidden relative" style={{marginTop:"2.5rem"}}>
    <ResizablePanelGroup direction="horizontal" autoSaveId="epic-view-layout">
      <ResizablePanel defaultSize={80} minSize={50}>   ← 主区
        <ArtifactHeader/>                              ← Spec/Ticket 标题 + 助理 + 更新时间
        <div className="flex-1 overflow-auto p-3 relative">
          <Outlet/>                                    ← Spec/Ticket/Execution 内容
          <HandoffActionBar/>                          ← absolute bottom-0
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle={!isCollapsed}/>
      <ResizablePanel defaultSize={20} minSize={10}>   ← Artifacts 侧栏（可折叠）
        <ArtifactsPanel/>                              ← 内含 Specs/Tickets/Executions 三段
        <CommentRailPanel/>                            ← 评论 Rail（与 Artifacts 二选一显示）
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</div>
```

`autoSaveId="epic-view-layout"` 表示分屏比例本地持久化。

### Header（固定顶栏）

| 元素 | className / 属性 |
|---|---|
| 容器 | `fixed top-0 left-0 right-0 z-50 border-b border-border py-1.5 px-4 flex items-center gap-2 w-full justify-between min-h-10` |
| 后退键 | `Button variant="outline" size="icon" className="rounded-md border border-border size-7"` |
| 前进键 | 同上 |
| 标题 | `EditableTitle textClassName="font-semibold truncate first-letter:capitalize"`，可编辑（`canEditEpicTitle` 权限） |
| 工具区 | `ml-auto flex items-center gap-2` |
| Share | `size-7` outline icon button，图标 = `Vn`（Share）|
| Open Chat | `Button variant="outline" rounded-md border border-border` + 图标 + `<span className="text-sm">Open Chat</span>` |
| View History | `size-7` outline icon |
| Notifications | `NotificationsBell` 带 unreadCount Badge |

**没有 status badge**（Traycer Epic 没有 status 概念）。**没有「开始执行 / 验证 / 设置」操作按钮**——这些操作在执行（Execution）详情页内分步呈现。

### Artifacts 主区头部（在 `ArtifactsPanel` 顶部，不是页头）

```
<div className="px-3 py-2">
  <div className="flex items-center justify-between truncate">
    <div className="flex items-center gap-1">
      <span className="text-lg font-semibold truncate">Artifacts</span>
      <Badge variant="outline" className="rounded-full">{specs+tickets+executions}</Badge>
    </div>
    <Button variant={isInSelectionMode ? "destructive" : "secondary"} size="sm"
            className="rounded-md border border-border gap-2 truncate max-xs:w-full">
      {/* Cancel / Select 切换 */}
    </Button>
  </div>
</div>
<Separator/>
```

---

## B. Kanban 列

**不存在。**

Artifacts 面板用的是 **垂直三段折叠列表**，不是 Kanban 列。三段标题分别为：

| 段标题 | 来源符号 |
|---|---|
| `Specs` | `Qu` 组件，`gn(title="Specs", ...)` |
| `Tickets` | `em` 组件，`gn(title="Tickets", ...)` |
| `Executions` | `Wu` 组件，`gn(title="Executions", ...)` |

Ticket 自身有三种状态枚举但**未用于横向分列**：

```js
const _u = [ot.TICKET_TODO, ot.TICKET_IN_PROGRESS, ot.TICKET_DONE];
```

只在「Create Ticket」对话框的 Status 下拉里出现。

### 折叠分组组件 `gn`

```
<div className={"flex flex-col min-h-0 border-b border-border " + (m && "flex-1")}>
  <div className="flex items-center justify-between w-full px-3 py-2 hover:bg-accent transition-colors shrink-0 border-b border-transparent ${m && 'border-border'}">
    <button className="flex items-center gap-1 truncate flex-1 cursor-pointer self-stretch -my-2 py-2">
      <ChevronDown className="h-4 w-4 transition-transform ${!m && '-rotate-90'}"/>
      <span className="text-sm font-semibold text-muted-foreground uppercase truncate">{title}</span>
      {count>0 && <Badge variant="outline" className="rounded-full">{count}</Badge>}
    </button>
    <div className="flex items-center gap-1">
      {deleteAllButton}{actionButton}
    </div>
  </div>
  {open && (
    <div className="flex-1 overflow-hidden min-h-0">
      <ScrollArea className="h-full">
        <div className="p-1.5 ${count===0 && 'h-full'}">
          {count===0 ? emptyState : <div className="flex flex-col gap-1">{children}</div>}
        </div>
      </ScrollArea>
    </div>
  )}
</div>
```

要点：
- 段标题 **`text-sm font-semibold text-muted-foreground uppercase`**
- 计数 Badge 用 `variant="outline"` `rounded-full`
- 单段展开后占据剩余高度（`flex-1`），折叠时收起到 header 高度
- 段间用 `border-b border-border` 分隔
- 组件 props 中含 `shouldAutoOpen`（首次出现 ≥1 项时自动展开）和 `hideWhenEmpty`

---

## C. Ticket 卡片

Ticket 没有"卡片"，是**一行可点按钮**。组件 `Yu`（导出为 `Xu` memo）。

### 完整布局

```
<Button variant="ghost"
        className="w-full justify-start text-left h-auto py-1.5 px-2 group
                   ${isCurrentlySelected && 'bg-accent text-accent-foreground'}
                   ${isInSelectionMode && isSelectionChecked && 'bg-accent/50'}"
        onPointerEnter={()=>setHovered(true)}
        onPointerLeave={()=>setHovered(false)}
        tooltip={<TooltipContent/>}      // Updated 时间 + Assignee
        tooltipPosition="left">
  <div className="flex flex-col gap-1 w-full">
    <div className="flex items-center gap-2 w-full min-h-6">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isInSelectionMode
          ? <Checkbox checked={isSelectionChecked} className="shrink-0"/>
          : isStreaming
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin"/>
            : <TicketStatusIndicator ticketId={ticketId}
                                     currentStatus={ticket.status}
                                     readOnly={isStatusReadOnly}/>}
        <div className="flex items-center text-sm font-medium truncate">
          {isStreaming ? <ShimmerText> : <span className="font-medium truncate">{title}</span>}
        </div>
      </div>
      {/* hover-only 删除区（带二段确认） */}
      {canDeleteTicket && <div className="hidden shrink-0 group-hover:flex"><DeleteConfirm/></div>}
      {/* 头像（永久显示） */}
      <TicketAssigneeAvatar epicId={epicId} assigneeUserId={ticket.assignee}/>
    </div>
  </div>
</Button>
```

### 字段（实际存在的）

| 字段 | 是否显示在列表项 |
|---|---|
| `title` | ✅ `text-sm font-medium truncate` |
| `status` | ✅ 左侧状态点（见 TicketStatusIndicator）|
| `assignee` (userId) | ✅ 右侧头像 `size-5` |
| `isStreaming` | ✅ ShimmerText + 替换图标为 `Loader2 animate-spin` |
| `updatedAt` | ✅ 仅 tooltip 中：`Updated ${date}` |

**不存在的字段**: `priority` / `labels` / `dependencies` / `assigned_agent` / `estimated_effort` / `description`（描述要进入详情页才看得到）。`Grep` 在 `epicView.js` 中对这些 key 全部返回 0 hit。

### 状态指示器 `TicketStatusIndicator`（符号 `Br`，渲染时 `size={14}`）

源码层在 `global.js`，未直接看到颜色实现，但在「Create Ticket」对话框里用法是：

```js
<TicketStatusIndicator status={status} size={14}/>
<span>{ticketStatusToLabel(status)}</span>     // Tr(status)
```

枚举只有三个值：`TICKET_TODO` / `TICKET_IN_PROGRESS` / `TICKET_DONE`。

### Tooltip 内容（`C` 变量）

```jsx
<div className="flex flex-col">
  <span>{unassigned ? "Unassigned" : `Assignee: ${displayName}`}</span>
  <span>Updated ${date}</span>
</div>
```

### Hover-only 删除（`Cn` 组件，二段确认）

| 状态 | 元素 | className |
|---|---|---|
| 默认 hover | trash icon | `h-5 w-5 rounded hover:text-red-600 hover:bg-red-600/10 [&_svg]:size-2.5` |
| 点击后第一次确认 → 出现 ✓ / ✗ | ✓ | `h-5 w-5 bg-green-600/20 hover:bg-green-600/30 active:bg-green-600/40 rounded [&_svg]:size-2.5`，svg `text-green-600` |
| | ✗ | `h-5 w-5 bg-red-600/20 hover:bg-red-600/30 active:bg-red-600/40 rounded`，svg `text-red-600` |

### 选中态

- `isCurrentlySelected`（路由匹配）→ `bg-accent text-accent-foreground`
- 选择模式被勾中 → `bg-accent/50`
- `isStreaming` → 动态 ShimmerText 取代 title

### 三态汇总（hover / 选中 / dragging）

| 态 | 视觉 |
|---|---|
| hover | `Button variant="ghost"` 默认 hover，且暴露 `group-hover:flex` 删除按钮 |
| 选中 | `bg-accent text-accent-foreground`（路由匹配） |
| 选择模式选中 | `bg-accent/50` |
| **dragging** | **不存在**——Traycer Epic 不支持拖拽 |

### Spec 列表项（`Bu`，与 Ticket 几乎对称，组件略简）

差异：
- 状态点替换为 `<FileIcon className="h-4 w-4 shrink-0"/>` (`Be`)
- 没有 assignee 头像
- 没有状态枚举
- tooltip 仅显示 `Updated ${date}`

---

## D. Spec 区域

**Spec 不是 tab，不是抽屉，不是单独 panel**——Spec 是 Artifacts 侧栏第一段（折叠分组），点击列表项后**导航至 `/epic/:epicId/spec/:specId`** 的 React Router 子路由，主区 80% Panel 切换为 Spec 详情视图（`rs` 组件，参见 `epicView.js` 路由定义）。

### Spec 段（`Qu` 组件）

```jsx
<gn title="Specs" count={t.length}
    actionButton={
      <Button size="sm" variant="secondary" className="gap-0"
              aria-label="Create new spec" title="Create new spec">
        <Plus className="size-3.5"/>
        <span className="text-sm">Add Spec</span>
      </Button>
    }
    deleteAllButton={  /* size-7 trash with hover:text-red-600 hover:bg-destructive/10 */ }
    emptyState={
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <FileIcon className="h-10 w-10 text-muted-foreground mb-3"/>
        <p className="text-sm text-muted-foreground">No specs available</p>
        <p className="text-sm text-muted-foreground mt-1">Click the + button to create your first spec</p>
      </div>
    }>
  {specs.map(spec => <SpecListItem .../>)}
</gn>
```

### Spec 详情主区（路由 `spec/:specId`）

`am` / `om` 组件 + `nm`（标题区）。布局：

```
<ArtifactHeader>          ← px-4 py-3 shrink-0
  <FileIcon className="h-6 w-6 text-primary mt-1"/>
  <EditableTitle textClassName="text-xl font-bold truncate"
                 inputClassName="text-xl font-bold h-auto py-0 px-2"
                 placeholder="Enter spec title..."/>
  <div className="flex items-center gap-1 text-muted-foreground">
    <ClockIcon className="h-3 w-3"/>
    <span className="text-sm">Updated: {date}</span>
  </div>
</ArtifactHeader>
<Separator/>
<div className="flex-1 overflow-auto p-3 relative">
  <DocumentEditor/>                              ← Tiptap markdown 编辑器（共用 `Ks` 类型）
  <HandoffActionBar/>                            ← absolute bottom-0 left-1/2 -translate-x-1/2
</div>
```

### `spec_type` 视觉区分

**不存在**。`spec_type` / `prd` / `technical` / `architecture` / `custom` 这些字符串在 bundle 中**全无匹配**。Traycer 的 Spec 数据模型没有 type 字段；图标统一用 `FileIcon`（`Be`），颜色统一 `text-primary`。

### Spec 编辑器

是 **Tiptap + Markdown 序列化**编辑器（带协同编辑：见 `Yjs Doc` / `awareness` 引用，函数 `Tf` 从 `Y.Doc` 取 `content` 节点为 `Y.Text`）。`isEditable` 由 `canEditSpecs` 权限决定；Default workflow 为 read-only。

---

## E. Execution 区域

### Execution 列表项（`Uu`）

```jsx
<Button variant="ghost"
        className="w-full justify-start text-left h-auto py-1.5 px-2 group
                   border border-border rounded-md bg-vscode-sideBar-background/50
                   hover:bg-vscode-list-hoverBackground
                   ${a && !o && 'bg-accent text-accent-foreground border-vscode-focusBorder'}
                   ${o && m && 'bg-accent/50'}">
  <div className="flex flex-col gap-1 w-full">
    <div className="flex items-center gap-2 w-full min-h-6">
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {isInSelectionMode
          ? <Checkbox/>
          : <ExecutionStepsCompact compactMode className="ml-0 px-1 shrink-0"
                                   steps={c.steps} planArtifactType={c.planArtifactType}
                                   reverificationState={c.reverificationState}/>}
        <div className="flex items-center text-sm font-medium wrap-break-words truncate">
          {c.title || "Untitled Execution"}
        </div>
      </div>
      {/* group-hover 显示：删除 + Smart YOLO 启动 */}
    </div>
  </div>
</Button>
```

**特点**：与 Spec/Ticket 不同，Execution 项有显式 `border border-border rounded-md bg-vscode-sideBar-background/50`，更像「真卡片」，因为每行都需要展示步骤进度。

### ExecutionStatus 枚举（变量 `O`）

只在 plan/verification/commit 三个 step 上各自取值：

```
O.NOT_STARTED
O.WAITING_FOR_EXECUTION
O.IN_PROGRESS
O.ABORTING
O.COMPLETED
O.SKIPPED
O.FAILED
O.RATE_LIMITED
O.STEP_INSUFFICIENT_CREDITS
O.STEP_ORG_BUNDLE_INSUFFICIENT
```

**没有 PENDING/RUNNING/VERIFYING/SUCCEEDED/CANCELLED 这套词汇**——Traycer 用的是 `NOT_STARTED / IN_PROGRESS / COMPLETED / FAILED / SKIPPED / ABORTING`。

### Execution 详情页（路由 `execution/:executionId`）

组件 `hp`，主体是 **垂直 Accordion 列表**（`as` = `AccordionStep`），4 个固定步骤：

| stepKey | 标题 | 数据来源 |
|---|---|---|
| `userQuery` | `User Query` | `c.userQuery` |
| `planSpecification` | `Plan Specification` 或 `Review Summary`（依 `planArtifactType`） | `c.planGeneration` |
| `verification` | `Verification` | `c.verification` |
| `gitCommit` | `Git Commit` | `c.commit` |

```
<main className="flex flex-col overflow-x-hidden h-full mt-1">
  <section className="space-y-1 overflow-x-hidden overflow-y-auto flex-1 max-h-full pr-0.5 mt-1" ref={containerRef}>
    {steps.map(step => <AccordionStep .../>)}
  </section>
  <section className="flex-none sticky bottom-0 pt-2">
    <AbortControlsCluster/>     ← Stop plan / Stop Verification / Stop commit 等按钮
  </section>
</main>
```

每个 AccordionStep 头部含：
- 折叠箭头
- `title`：纯文本
- `description`：渲染 `<StepStateDescription stepState=... stepType=... customContent=.../>`（变量 `Ls`，根据 `O.*` 枚举切换状态文案 + spinner）
- `headerActions`：hover 时出现 `Discard` icon button（`hover:text-red-700 p-1 rounded-md hover:bg-red-600/10`），icon 为 `<TrashIcon/>`（`Fs`）
- 子内容 `children`：分别渲染各 step 的具体 UI

### Failed 态视觉

```jsx
{hasFailed && commitError && (
  <div className="p-2 rounded-md bg-red-500/10 border border-red-500/20">
    <p className="text-sm text-red-500">{commitError}</p>
  </div>
)}
```

### Committed 态

```jsx
<div className="text-sm font-semibold">Committed</div>
<div className="text-sm text-muted-foreground">{commitHash}</div>
<div className="text-sm">{commitMessage}</div>
<Button variant="outline" size="sm">View Diff</Button>
```

### 时间显示

仅看到 `bn(updatedAt)` / `Updated ${date}` 形式调用 `Date.toLocaleString()`，**没有 `started_at` / `completed_at` / `duration_ms`** 字段；进度状态由步骤的 spinner 表达。

### Agent type 图标

执行步骤里**没有 agent type 图标切换**。`selectedAgent` 仅出现在 Workflow Command 编辑（`We.PLANNER` / `We.REVIEWER`），不在 Epic Execution。

### 日志 / 输出展示

```jsx
{generatedPlan?.implementationPlan?.output ?? generatedPlan?.reviewOutput?.markdown}
```
通过 `description={<StepStateDescription customContent={...}/>}` 注入到 step header；`logs` 列表则在 step 子区域以 `MCP toolCall` / `codeExploration` 描述行显示。

---

## F. Verification Thread 区域

> Traycer 的 Verification 有两层：
> 1. **执行内验证**（在 Execution 详情页 `Verification` step 里）——含 retry/skip/re-verify/ignore 按钮
> 2. **协同评论 Thread**（comment rail）——附着在 Spec / Ticket / Execution 文档上

### F.1 协同评论 Thread Rail

由 `vf` 组件（`CommentRail`）提供，**抽屉式**——Artifacts 面板（右侧 ResizablePanel 20%）的 children 在 `isCommentsOpen` 时切换：

```jsx
<div className={"flex-1 overflow-hidden " + (isCommentsOpen && "hidden")}>
  <ArtifactsPanel/>
</div>
<div ref={commentRailRef} className={"flex-1 overflow-hidden flex flex-col " + (!isCommentsOpen && "hidden")}/>
```

### Rail Header（`df`）

```jsx
<div className="shrink-0 border-b border-border">
  <div className="flex items-center justify-between px-3 py-2">
    <span className="text-base font-semibold">Comments</span>
    <Button size="icon" variant="ghost" className="h-6 w-6" tooltip="Close">
      <X className="h-3.5 w-3.5"/>
    </Button>
  </div>
  <div className="flex items-center gap-2 px-3 pb-2 flex-wrap">
    <Select>     {/* statusFilter */}
      <SelectTrigger className="h-7 text-xs">
        <SelectItem value="open">Open ({openCount})</SelectItem>
        <SelectItem value="resolved">Resolved ({resolvedCount})</SelectItem>
      </SelectTrigger>
    </Select>
    <Select>     {/* sortMode */}
      <SelectTrigger className="h-7 text-xs">
        <SelectItem value="document-order">Document order</SelectItem>
        <SelectItem value="recent-activity">Recent activity</SelectItem>
        <SelectItem value="newest-created">Created date</SelectItem>
      </SelectTrigger>
    </Select>
  </div>
</div>
```

### Thread Status

代码里只有 **`open` 与 `resolved`** 两值。**没有 `UNRESOLVED` / `OUTDATED` 三态**——「outdated」概念以 `isDetached` (`a`) 表达：

```jsx
{a && (
  <div className="flex items-center gap-1 text-xs text-muted-foreground/60 mb-1">
    <WarningIcon className="h-3 w-3 text-(--vscode-editorWarning-foreground)"/>
    <span>Original text was modified</span>
  </div>
)}
```

### Thread 卡片（`bf`）

```jsx
<div className={ae(
  "group/card relative px-2.5 py-2 cursor-default transition-colors rounded border",
  isSelected ? "border-[var(--vscode-focusBorder)] bg-accent/10"
             : "border-border/40 hover:bg-accent/5",
  isDetached && "opacity-60"
)}>
  {/* 顶右角浮动操作（hover 出现） */}
  <div className={ae(
    "absolute top-1 right-1 z-10 flex items-center gap-0.5 rounded-md border border-border bg-vscode-editor-background px-0.5 py-0.5 shadow-sm transition-opacity",
    visible ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 focus-within:opacity-100"
  )}>
    {resolved ? <ReopenButton/> : <ResolveButton/>}      {/* size-5 ghost icon */}
    <DeleteButton className="h-5 w-5 text-destructive hover:text-destructive"/>
  </div>

  {/* 折叠态：单行预览（CommentThreadPreview / Cf） */}
  {!isSelected && (
    <div className="space-y-0.5">
      {quotedText && <p className="text-xs text-muted-foreground/70 border-l border-muted-foreground/20 pl-2 line-clamp-1">{quotedText}</p>}
      <div className="flex items-center gap-1.5 mt-1">
        <Avatar size-4/>
        <span className="text-xs font-medium truncate">{displayName}</span>
        <span className="text-xs text-muted-foreground/60">· {timeAgo}</span>
      </div>
      <p className="text-xs line-clamp-2 wrap-break-word pl-[22px]">{firstComment}</p>
      {replies>0 && <span className="text-xs text-muted-foreground/60 pl-[22px]">{replies} {replies===1?"reply":"replies"}</span>}
    </div>
  )}

  {/* 展开态：所有 comment + Reply */}
  {isSelected && (
    <>
      {quotedText && <p className="...border-l border-muted-foreground/20 pl-2 line-clamp-2 mb-2">...</p>}
      <div className="max-h-[400px] overflow-y-auto mt-2 divide-y divide-border/30">
        {comments.map(c => <CommentItem .../>)}      {/* 单条评论：gf */}
      </div>
      {showReply && <CommentEditor placeholder="Reply…"/>}
    </>
  )}
</div>
```

### 单条评论（`gf` 组件）

```jsx
<div className="flex min-w-0 items-center gap-1.5">
  <Avatar className="size-5 shrink-0" fallbackClassName="text-[9px]"/>
  <span className="text-xs font-medium truncate">{displayName}</span>
  <span className="text-xs text-muted-foreground/60 shrink-0">· {timeAgo}</span>
  {edited && <span className="text-xs text-muted-foreground/50 shrink-0">(edited)</span>}
  <div className="flex-1"/>
  {/* 自己的评论：edit / delete 按钮（h-5 w-5 ghost） */}
</div>
<div className="pl-[26px]">
  {longContent && !expanded
    ? <p className="mt-0.5 text-xs whitespace-pre-wrap wrap-break-word">{truncated}</p>
    : <ReadonlyTiptap content={comment.content}/>}
  {longContent && <Button size="sm" variant="ghost" className="mt-0.5 h-5 px-0 text-xs">Show more / less</Button>}
</div>
```

文字截断阈值：`os = 260` 字符；超过时折叠并加 `…`，按钮控制展开。

### 浮动评论 Popover（`sf`，hover 文档高亮区时弹出）

```jsx
<div data-comment-popover
     className="comment-floating-surface absolute z-30 w-56 rounded-md cursor-pointer hover:bg-accent/30 transition-colors"
     style={{left, top}}>
  <div className="p-3">
    <div className="flex items-center gap-1.5 mb-1">
      <Avatar className="size-4" fallbackClassName="text-[8px]"/>
      <span className="text-xs font-medium truncate">{displayName}</span>
    </div>
    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{firstCommentText}</p>
    {replies>0 && <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
      <CommentIcon className="h-3 w-3"/>
      <span>{replies} {replies===1?"reply":"replies"}</span>
    </div>}
  </div>
</div>
```

300 ms hover 延迟（`setTimeout(...,300)`）才显示。

### Severity / Category 分类

**不存在**。Traycer Comment 模型只有 `author / content / createdAt / updatedAt`，**没有 `severity` / `category` / `MINOR/MAJOR/CRITICAL` / `BUG/SECURITY/...` 字段**（Grep 在整个 `epicView.js` 中匹配 0）。

### `promptForAIAgent` / `isApplied`

**不存在**。代码中没有 `promptForAIAgent` / `applied` 字段。最接近的是 Verification step 的 `verificationOutput.comments`（用 `au()` 聚合为摘要 `{status: "pending" | ...}`）和 step 上的 `Discard verification` 按钮。

### F.2 执行内 Verification（在 Execution AccordionStep 下）

```jsx
<AccordionStep title="Verification"
               description={<StepStateDescription
                              customContent={isComplete && <VerificationSummary summary={P}/>}
                              isReverification={!!reverificationState}/>}
               isPaused={summary.status === "pending"}
               isComplete={c.verification === O.COMPLETED}
               hasFailed={c.verification === O.FAILED}
               headerActions={<DiscardButton/>}>
  <VerificationStepBody execution={d}
                        onVerify={T} onSkip={k} onReverify={j}
                        onIgnore={handleIgnoreVerification}
                        retryCallback={N}
                        onDiscardComment={handleDiscardVerificationComments}
                        isReadOnly={r}/>
</AccordionStep>
```

按钮组：`Verify / Skip / Re-verify / Ignore / Discard`，文案随 `reverificationState` 切换：`"Stop Verification"` ↔ `"Stop re-verification"`。

中断按钮（`Jt` 组件 → `qd` 容器）：
- `IN_PROGRESS / ABORTING / WAITING_FOR_EXECUTION` 时显示停止按钮
- 含倒计时控件 `Yd`（`retryAfterTimestamp` 用于 rate-limit retry-after）

---

## G. Mermaid 依赖图

**Epic Board 顶部不展示 Mermaid 依赖图。**

证据：
- `epicView.js` 无 `mermaid` / `Mermaid` 匹配（Grep count = 0）
- `global.js` 中 Mermaid 11 完整存在（含 `kanbanRenderer` / `sankeyRenderer` / `gitGraph` / `flowchart` 等），主题选项存在 `default / dark / forest / neutral / base`，但只在 Spec/Ticket Markdown 文档内（Tiptap / `<pn content=...>` 渲染器）渲染——即 spec 正文里写 ` ```mermaid ` 代码块时才会用到。

也就是说：**Mermaid 是「文档内可嵌入」能力，不是 Epic 仪表盘的固有依赖图**。容器大小 / 缩放由 Tiptap markdown render path 决定，未在 Epic Board 层级出现。

---

## H. dnd-kit 集成

**未启用。**

| 检查 | 结果 |
|---|---|
| `package.json` 依赖 | `@dnd-kit/core ^6.3.1` / `@dnd-kit/modifiers ^9.0.0` / `@dnd-kit/sortable ^10.0.0`（声明） |
| `epicView.js` 内 `@dnd-kit` / `useSortable` / `DragOverlay` / `PointerSensor` / `useDroppable` | **0 匹配** |
| `global.js` 内 `@dnd-kit` / `dnd-kit` | **0 匹配** |
| `global.js` 内 `PointerSensor` 等具体 hook | **0 匹配** |
| Activation distance / DragOverlay style | **不存在** |
| Collision detection 策略 | **不存在** |

> 推论：dnd-kit 可能是预留依赖、被 tree-shake 出 webview bundle，或仅在 extension host (`out/extension.js` 是 obfuscated 8MB 文件) 中使用——但 webview 视图层确实没有拖拽 UI。

---

## I. 颜色 / 字号 / 间距 token

### Epic 视图特有 token（在 commentNavigator 之外新增的）

| 类别 | token | 出现位置 |
|---|---|---|
| 高度 | `min-h-10`（top header） | 顶栏 |
| 高度 | `min-h-6`（list 行内容） | Spec/Ticket/Execution 行 |
| 高度 | `min-h-[28px]`（input/select cell） | Hint / NextSteps |
| 高度 | `size-7`（header icon button） | 顶栏圆角 outline 按钮 |
| 高度 | `size-5`（assignee avatar）/ `size-6`（hover popover avatar）/ `size-4`（comment avatar）/ `size-[20px]`（command popover avatar） | 各处头像 |
| 头部固定值 | `bm = "2.5rem"`（marginTop） | 主区让位顶栏 |
| 文档面板初始尺寸 | `defaultSize={80}` / `minSize={50}`（左主） | ResizablePanelGroup |
| Artifacts 面板初始尺寸 | `defaultSize={20}` / `minSize={10}` | ResizablePanelGroup |
| Comment 截断阈值 | `os = 260` 字符 | 长评论折叠 |
| Comment 内容上限 | `ff = 1000`（编辑后认定 edited 阈值 ms） | gf 组件 |
| Hover 弹 popover 延迟 | `300ms` | sf 组件 |
| Reply popover 高度上限 | `max-h-[400px]` | bf 展开态 |
| Account / Search popover 宽 | `w-[304px] max-w-[90vw]` / `w-56 max-h-[248px]` | 协作者搜索 / 评论 popover |
| 段标题 | `text-sm font-semibold text-muted-foreground uppercase` | gn 组件 header |
| Artifacts 总标题 | `text-lg font-semibold` | ArtifactsPanel header |
| Spec/Ticket 详情标题 | `text-xl font-bold` | nm 组件 |
| Epic 标题输入 | `font-semibold truncate first-letter:capitalize` + `min-w-[200px] max-w-md` | 顶栏 |
| Tooltip 时间 | `Updated ${date}` 通过 `bn(updatedAt, "Never")`（`Date.toLocaleString()`） | 多处 |

### 主题色 token（直接命中）

| token | 用法 |
|---|---|
| `var(--vscode-focusBorder, #007fd4)` | Selected thread border / animation border |
| `--vscode-editorWarning-foreground` (#e5a82e) | "Original text was modified" 警告 + selection animation 黄色 |
| `--vscode-editorInfo-foreground` (#75beff) | selection animation 蓝色阶段 |
| `text-primary` | Spec/Ticket 详情 header 大图标 |
| `bg-vscode-charts-yellow/10` + `text-vscode-charts-yellow` | "Default workflow read-only" 警示条 |
| `bg-(--vscode-charts-blue)/10 border-(--vscode-charts-blue)/30 text-(--vscode-charts-blue)` | "Entrypoint" Badge |
| `bg-vscode-sideBar-background/50` | Execution 列表项卡片底色 |
| `hover:bg-vscode-list-hoverBackground` | Execution 列表项 hover |
| `bg-accent` / `bg-accent/50` / `bg-accent/30` / `bg-accent/10` / `bg-accent/5` | 选中态 / 选择模式选中 / hover popover / selected thread bg / hover bg |
| `bg-muted/30` / `bg-muted/50` | Workflow header / Default-workflow banner |
| `text-destructive` / `bg-red-500/10 border-red-500/20` / `bg-red-600/20` | 删除按钮 / Failed 错误框 / 二段确认背景 |
| `bg-green-600/20 hover:bg-green-600/30 active:bg-green-600/40` | 二段确认的 ✓ |
| `text-green-600` | 命令名 valid 提示 |

### Cloud-sync 警示色（**显式 hex**）

```jsx
<div className="shrink-0 rounded px-2 py-1 mt-1"
     style={{backgroundColor:"#3a2a00", color:"#e8a000"}}>
  <span>⚠</span>
  <strong>Cloud sync failed</strong>
  <span>Showing last known data. Click Refresh to retry.</span>
</div>
```

### 间距体系（典型）

| 场景 | className |
|---|---|
| 顶栏 | `py-1.5 px-4 gap-2` |
| Section header | `px-3 py-2` |
| 列表项 | `py-1.5 px-2`，`gap-2`（图标↔文字），`min-h-6` |
| 列表项目竖向间隔 | `flex flex-col gap-1`（外层） + ScrollArea `p-1.5` |
| Comment 卡片 | `px-2.5 py-2`，`gap-0.5` 顶部操作组 |
| Comment 编辑器尾部按钮 | `gap-1 mt-1.5`，按钮 `h-6 px-2 text-xs` |
| Tooltip header bag | `gap-1.5 mb-1` |

### CFA 占位动画（`epicView.css` 全部内容）

`epicView.css` 不提供 Kanban/Spec/Ticket 样式——它只声明 **Comments-First Animation** 的占位符动画（`cfa-stage` / `cfa-cursor` / `cfa-selection` / `cfa-popover` / `cfa-comment-btn` / `cfa-input` / `cfa-placeholder` / `cfa-typing` / `cfa-typing-cursor` / `cfa-post-btn`）。这是「Empty Threads」时显示的**演示动画**（`cf` 组件，文案 `Select text to start a discussion`）。

```
@keyframes cfa-stage / cfa-cursor / cfa-selection / cfa-popover ...
.cfa-stage{animation:cfa-stage 10s ease-in-out infinite}
@media(prefers-reduced-motion:reduce){
  .cfa-stage{display:none!important}
  .cfa-static-fallback{display:flex!important}
}
```

---

## 附录：Epic View 路由表（`xp` createBrowserRouter）

```js
[
  {path:"/", element:<App/>, errorElement:<ErrorBoundary/>, children:[
    {index:true, element:<Navigate to=HISTORY replace/>},
    {path:"/history", element:<HistoryPage/>},                           // go = epic 列表
    {path:"/notifications", element:<NotificationsPage source=EPIC_PANEL/>},
    {path:"/epic", children:[
      {path:":epicId", element:<EpicLayout/>, children:[                  // im
        {index:true, element:<EmptyArtifact/>},                            // rs
        {path:"spec/:specId", element:<EmptyArtifact/>},
        {path:"ticket/:ticketId", element:<EmptyArtifact/>},
        {path:"execution/:executionId", element:<ExecutionView/>},         // Ho
      ]},
    ]},
    {path:"/workflow", children:[
      {path:":workflowId", element:<WorkflowLayout/>, children:[           // ef
        {index:true, element:<WorkflowFileEditor/>},                       // Ks
        {path:"command/:commandName", element:<WorkflowFileEditor/>},
      ]},
    ]},
  ]}
]
```

---

## 关键源符号速查（minified → 含义）

| Symbol | 含义 |
|---|---|
| `gn` | 折叠分组容器（`CollapsibleSection`）|
| `Qu` / `em` / `Wu` | Specs / Tickets / Executions 段 |
| `Bu` / `Yu` / `Uu` | Spec / Ticket / Execution 单行 |
| `Br` | TicketStatusIndicator |
| `Ku` / `qu` | Ticket assignee avatar / picker（Combobox） |
| `Cn` | 二段删除确认 |
| `tm` | ArtifactsPanel（汇总三段 + 选择模式 toolbar） |
| `nm` / `am` / `om` | ArtifactHeader / ArtifactBody / HandoffActionBar |
| `im` | EpicLayout（ResizablePanelGroup 主框架）|
| `dm` | TopHeader |
| `vf` (memo `Sf`) | CommentRail panel |
| `bf` / `gf` / `Cf` / `sf` | ThreadCard / CommentItem / ThreadPreview / FloatingPopover |
| `cf` | CFA 演示动画组件 |
| `df` | Rail 头（filter + sort 下拉） |
| `Nn` | CommentEditor（Tiptap-based） |
| `hp` | ExecutionDetailPage |
| `as` | AccordionStep |
| `Jt` / `qd` / `Yd` | AbortControls / 容器 / 倒计时 |
| `O` | ExecutionStepStatus 枚举（`O.IN_PROGRESS` 等） |
| `ot` | TicketStatus 枚举（`ot.TICKET_TODO` / `IN_PROGRESS` / `DONE`）|
| `je` | 路由常量集合（`je.HISTORY`, `je.EPIC.ROOT`, ...）|
| `we.EPIC_PANEL` | 来源标识，用于 telemetry |
