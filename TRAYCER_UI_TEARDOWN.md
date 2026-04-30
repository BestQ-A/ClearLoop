# Traycer commentNavigator UI Teardown

> 1:1 reverse-engineering of the Traycer VSCode extension's `commentNavigator` webview (sidebar).
> Source: `external/traycer/extracted/extension/traycer-views/dist/assets/{global.js, global.css, commentNavigator.js}`.
> All className strings are reproduced verbatim. All color/dimension values are taken raw from the bundle.

The `commentNavigator.js` bundle is a thin React Router shell:

```js
function Ae(){return M(),j(),O(),L(),v(),G(p.COMMENT_NAVIGATOR),P(),e.jsx(C,{})}
function Me(){return e.jsx(A,{children:e.jsx(Ae,{})})} // <Provider><AuthGate><Outlet/></AuthGate></Provider>
const router=createBrowserRouter([{element:<Me/>,children:[{path:"/",element:<RootLayout/>,errorElement:<ErrorBoundary/>,children:[
  {index:true,element:<LandingRoute/>}, // ROUTES.LANDING -> "Create new task"
  {path:"task",children:[
    {path:"view/:taskChainId/:phaseBreakdownId/:taskId",element:<TaskView/>},
    {path:"interview/:taskChainId",element:<InterviewView/>},
    {path:"kanban/:taskChainId/:phaseBreakdownId",element:<KanbanView/>},
    {path:"loading/:taskChainId",element:<LoadingView/>}]},
  {path:"history",element:<HistoryView/>},
  {path:"epic/chat/:epicId",element:<EpicChatView/>},
  {path:"mcp",element:<McpView/>},
  {path:"notifications",element:<NotificationsView source:COMMENT_NAVIGATOR/>},
  {path:"settings",children:[
    {index:true,redirect:"prompt-template"},
    {path:"prompt-template",element:<PromptTemplates/>},
    {path:"cli-agents",element:<CliAgents/>},
    {path:"workflows",element:<Workflows/>},
    {path:"git",element:<CommitScripts/>},
    {path:"model-profiles",element:<ModelProfiles/>}]}]}]);
```

Real UI lives in `global.js` (≈19 MB, 5376 lines minified). The webview type is enumerated as `WebViewTypes.COMMENT_NAVIGATOR = "commentNavigator"`.

---

## A. Top toolbar (`NavigationBarContainer` + `NavigationBar`)

The shell of the navbar is `NavigationBarContainer`:

```jsx
<nav className="py-1 flex items-center justify-between sticky top-0 border-b border-b-border z-10 gap-1.5">
  {children}
</nav>
```

Inside, `NavigationBar` lays out three blocks:

| Region | className |
|---|---|
| Container/inner | `flex min-w-0 flex-1 items-center truncate min-h-[32px]` |
| Back/forward group | `flex items-center gap-x-1` |
| Title block | `min-w-0 pl-2 flex flex-col truncate w-full` |
| Right tools | `ml-auto flex shrink-0 items-center gap-2 pr-1` |

| Token | Value |
|---|---|
| `--traycer-toolbar-height` | `50px` |
| Sticky pos | `sticky top-0 z-10` |
| Bottom border | `border-b border-b-border` (`--color-border`) |
| Vertical padding | `py-1` (`0.25rem`) |
| Min row height | `32px` |

### Brand
**There is no permanent "Traycer" brand in the toolbar.** The brand `TraycerLogoIcon` (340x340 SVG, rendered at `width:65 height:65`) only appears on the Landing page heading and the Sign-in screen. The toolbar shows the **page title** instead, derived from the route via `qt()` (see below).

```jsx
// Landing heading only:
<div className="flex flex-col items-center gap-2">
  <TraycerLogoIcon className="self-center" isDark={isDark} />
  <div className="mb-8 flex flex-col items-center gap-2">
    <span className="font-heading text-pretty text-center text-text-primary text-xl font-semibold">
      What can I help you build today?
    </span>
    <span className="text-balance text-center font-normal text-textSecondary">
      Create new code, add features, or fix issues—let's make it happen.
    </span>
  </div>
</div>
```

`TraycerLogoIcon` is a multi-path SVG mask. In dark mode `fill="#eeeeee"`, light `#333333`. The full path data is preserved verbatim in the bundle around offset 368989 (six `<path d="...">` elements inside two `<linearGradient>` defs).

### Title-resolver function
```js
qt = () => {
  if (path.includes("history"))               return "Task History";
  if (interview || kanban || taskView)        return taskChainTitle || "New Task";
  if (path.includes("epic/chat"))             return epicTitle || "New Epic";
  if (path.includes("settings/prompt-template")) return "Prompt Templates";
  if (path.includes("settings/workflows"))    return "Workflows";
  if (path.includes("settings/cli-agents"))   return "CLI Agents";
  if (path.includes("settings/git"))          return "Commit Scripts";
  if (path.includes("settings/model-profiles"))return "Model Profiles";
  if (path.includes("mcp"))                   return "Remote MCP Server";
  if (path.includes("notifications"))         return "Notifications";
  if (path === "/")                           return "Create new task";
};
```

### Editable title (chat / task / epic only)
```jsx
<EditableTitleViewer
  title={qt() || ""}
  onSave={...}
  textClassName="font-semibold truncate first-letter:capitalize"
  inputClassName="font-semibold h-auto py-0 px-1 min-w-[200px] w-full"
  placeholder="Enter title..."
/>
// Otherwise:
<div className="font-semibold truncate first-letter:capitalize">{qt()}</div>
```

### Left icon-buttons (Back / Forward)
Both use `IconButton$1`:

```jsx
<IconButton onClick={Kt} ariaLabel="Go Back" title={canGoBack ? "Go Back" : undefined}
  isBordered className="p-1!" isDisabled={!canGoBack}>
  <ChevronLeftIcon width={16} height={16} />
</IconButton>
<IconButton onClick={Lt} ariaLabel="Go Forward" title={canGoForward ? "Go Forward" : undefined}
  isBordered className="p-1!" isDisabled={!canGoForward}>
  <ChevronRight className="w-4 h-4" />
</IconButton>
```

Lucide icons. Tooltip via `<TooltipWrapper>`.

### Right toolbar items (conditional, in order)

| Component | When shown | Rendered as |
|---|---|---|
| `YoloModeProgressBadge` | task view + phaseBreakdownId | progress chip |
| `EpicConnectionStatusIndicator` | any epic route | live dot |
| `OpenBoardBadgeButton` | epic route, has board | `<Button variant="default" size="sm" className="shrink-0 border-border border rounded-md gap-1 px-1">` with `<SquareArrowOutUpRight className="size-2"/>` + `<span className="text-sm">Open Board</span>` |
| `SharePopover` (icon button) | epic chat route + epic loaded | `<Button variant="outline" size="icon" className="size-7 rounded-md border border-border" aria-label="Share epic" tooltip="Share epic"><Share2 className="size-4"/></Button>` |
| `NotificationPopover` | always | `NotificationBellButton` (see below) |

### `NotificationBellButton` definition
```jsx
<IconButton ariaLabel={ariaLabel} title={title} isBordered={true}
  className="inline-flex size-7 shrink-0 items-center justify-center p-0">
  <span className="relative inline-flex size-4 items-center justify-center">
    <Bell className="size-4" />
    {unreadCount > 0 && (
      <span aria-hidden="true"
        className="absolute -top-1.5 -right-2.5 flex min-w-4 items-center justify-center
                   rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground">
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    )}
  </span>
</IconButton>
```

`NotificationPopover` renders `<PopoverContent align="end" sideOffset={8} className="h-[min(20rem,calc(100vh-4rem))] w-[min(28rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-border p-0">`.

### `IconButton` base definition
```js
className: cn(
  "group p-1 rounded-md transition-all duration-150 border active:border-border",
  className,
  isActive  ? "bg-vscode-button-secondaryBackground border-border"
            : isBordered ? "border-border" : "border-transparent",
  isDisabled? "opacity-50 outline-none cursor-not-allowed"
            : "hover:bg-vscode-button-secondaryBackground cursor-pointer"
)
```

Default size = `p-1` + intrinsic icon (no `w/h` unless overridden). Common overrides: `size-7` (28px square), `p-1!` (force).

---

## B. Main chat input (`Editor` + `EmbeddedSendButton`)

### Editor invocation
```jsx
<Editor
  epicId={undefined}
  extensionTypeToBeUsed="traycer"
  ref={editorRef}
  initialContent={...}
  isEditable
  isDisabled={...}
  onSubmit={...}
  embeddedSendButton={...}
  placeholder="Type your message here (@mention for context)"
  showPlanArtifactTypeSwitcher={false}
  additionalContextTypes={PHASE_EDITOR_CONTEXT_TYPES}
  onContentStatusChange={...}
  onBlurContent={...}
  onDisabledClick={...}
  optionalDisabledTooltip="Click to switch to text mode and enable input box"
/>
```

The Editor is built on **TipTap** (`baseExtensions`, `createMentionExtension`, `createSlashCommandExtension`).

### Placeholders (verbatim)
| Context | placeholder |
|---|---|
| Main chat (Editor) | `Type your message here (@mention for context)` |
| Next-step quick reply | `Enter your query (@mention for context)` |
| Edit message | `Edit your message...` |
| Interview answer | `Type your answer...` |
| Generic doc | `Start typing...` / `Write something …` |
| Epic title input | `Enter title...` |
| Workflow name | `Enter workflow name` |
| Workflow desc | `Enter workflow description` |
| CLI agent name | `Enter CLI agent name` |
| Custom commit | `e.g., custom-commit` |
| Token | `Enter your token` |
| Mermaid | `Enter mermaid diagram code...` |
| Commit message | `Write a commit message...` |
| Search models | `Search models and profiles...` |
| Search options | `Search options...` |
| Search phases | `Search phases...` |
| Profile name | `Profile name` |
| Template name | `Enter template name` |

### Editor wrapper
```jsx
<section className="w-full flex flex-col gap-y-3 bg-vscode-editor-background rounded-md">
  <Editor ... />
</section>
```

### `minHeightConstraint`
- `taskChainMode === "plan"` → `85` (px)
- otherwise → `109` (px)
- Input box token: `--traycer-input-box-height: 30px` (used for outer chat-input wrapper)

### Send-button block (right side of editor)
```jsx
<div className="flex min-w-0 max-w-full items-center justify-end gap-1.5">
  <ModelSelector value={...} onChange={...} disabled={!Mt}/>
  <EmbeddedSendButton ... />
</div>
```

### `EmbeddedSendButton` definition (3 visual states)

```jsx
// IDLE / READY (default)
<Button variant="default" size="icon"
  className="ml-auto rounded-full border border-border"
  onClick={onSubmit} disabled={disabled}
  tooltip={<div className="flex items-center gap-1.5"><span>Send</span>{metaKey}</div>}
  aria-label="Send">
  <ArrowUp className="w-4 h-4" />
</Button>

// IN_PROGRESS
<Button variant="ghost" size="icon"
  className="ml-auto group rounded-full" tooltip="Stop"
  onClick={onStop} disabled={disabled}>
  <StopIcon className="w-4 h-4 shrink-0 group-hover:text-red-600 text-text-primary" />
</Button>

// ABORTING
<Button variant="ghost" size="icon"
  className="ml-auto group rounded-full" tooltip="Stopping..." disabled>
  <Loader className="w-4 h-4 group-hover:text-red-500 animate-spin" />
</Button>
```

The keyboard hint (`Send (⏎)` / `Send (⌘⏎)`) is rendered via `useMetaKeyLabel(sendKey)`, where `sendKey` from `taskSettings` is `"enter"` or `"ctrlEnter"`.

### `ContextUsageSpinner`
Circular SVG (size 16 default, stroke 2). When `usedContextTokens > totalContextWindowTokens` it switches to `var(--color-vscode-errorForeground)` and shows tooltip `Large context detected, performance may be degraded`. Default tooltip format: `${pct}% • ${used} / ${total} context used`. Token formatter: `>=1e6 → "1.2M"`, `>=1e3 → "12k"`.

### Slash-command popup (`SlashCommandList`)

Trigger: typing `/` in the Editor.

```jsx
{ReactDOM.createPortal(
  <TooltipProvider delayDuration={TOOLTIP_DELAY}>
    <div ref={floating}
      className={cn(
        "z-50 overflow-y-auto overflow-x-hidden rounded-md border border-vscode-focusBorder",
        "bg-vscode-dropdown-background p-1 text-vscode-dropdown-foreground shadow-lg",
        isDark && "traycer-dark-mode")}
      style={{position, top, left}}
      data-slash-command-menu="true">
      {showInfoBanner && <InfoBanner message={empty ? "No workflows available" : INFO_MESSAGE}/>}
      {empty ? null
        : noMatch ? <div className="p-2 text-sm text-muted-foreground">No commands match your query</div>
        : items.map(renderItem)}
    </div>
  </TooltipProvider>, document.body)}
```

Floating UI middleware: `offset(8), flip({padding:20}), size({maxWidth: min(300, availableWidth), maxHeight: min(window.innerHeight*0.4, availableHeight*0.8)})`.

#### Each item
```jsx
<MentionItem isActive={...} className="gap-2 rounded-sm px-3 py-2 text-sm"
  style={isActive ? { backgroundColor:"var(--vscode-list-activeSelectionBackground)",
                      color:"var(--vscode-list-activeSelectionForeground)"} : undefined}>
  <div className="flex min-w-0 flex-col gap-0.5">
    <div className="flex items-center gap-1.5">
      <span className="truncate font-medium">/{commandName}</span>
      {showWorkflowLabel && <span className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-sm",
        isActive ? "bg-vscode-list-activeSelectionForeground/12 text-vscode-list-activeSelectionForeground/80"
                 : "bg-muted/50 text-muted-foreground/70")}>{workflowName}</span>}
    </div>
    {description && <span className={cn("truncate text-sm",
      isActive ? "text-vscode-list-activeSelectionForeground/80"
               : "text-muted-foreground")}>{description}</span>}
  </div>
</MentionItem>
```

#### Slash command CSS (from global.css)
```css
.slash-command-node{padding:0 2px;border-radius:4px}
.slash-command-node-light{color:#a31515;background-color:#0000001a}
.slash-command-node-dark {color:#d7ba7d;background-color:#ffffff1a}

.slash-command-info-banner{
  display:flex;align-items:flex-start;gap:8px;
  padding:8px 10px;margin:4px 4px 8px;
  border-radius:4px;font-size:.75rem;line-height:1.4;
  background-color:#3b82f61a;border:1px solid rgba(59,130,246,.25);color:#2563eb}
.traycer-dark-mode .slash-command-info-banner{
  background-color:#60a5fa1a;border-color:#60a5fa40;color:#93c5fd}
.slash-command-info-icon{flex-shrink:0;margin-top:1px}
```

#### `InfoIcon` SVG inside info banner
```jsx
<svg className="slash-command-info-icon" width="14" height="14" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <line x1="12" y1="16" x2="12" y2="12"/>
  <line x1="12" y1="8" x2="12.01" y2="8"/>
</svg>
```

The slash-command list is workflow-driven; the list items are not hardcoded (`workflows.map(w => [w.entrypointCommand, ...w.commands])`). Each command provides `name`, `description`, `argumentHints[]`, `selectedAgent`. The label shown next to the command is the **workflow name**, only when more than one workflow is available.

Keyboard handling: `ArrowUp/ArrowDown` cycle, `Enter` selects, `Backspace/Delete` clear range and dismiss.

### Mention popup (`@`)

Triggers `ProviderSelectionMenu` → context-type providers (built-ins + MCP). Menu items:

```jsx
<MentionItem isActive={i===hoverIndex} className="w-full"
  onMouseEnter={...} onClick={...} title={displayName}>
  <span className="min-w-3.5 w-3.5">{provider.getIcon({className:"h-4 w-4"})}</span>
  <span className="min-w-0 truncate font-medium">{displayName}</span>
</MentionItem>
```

`MentionItem` base className:
```
group relative flex cursor-pointer select-none items-center gap-1.5 rounded-sm px-2.5 py-1.5
text-sm text-vscode-dropdown-foreground outline-none transition-colors active:opacity-90
[&_.text-muted]:text-muted-foreground
[&_.text-muted-foreground]:text-muted-foreground
[&_svg:not([class*='text-'])]:text-current
[&_svg]:shrink-0
// when active:
bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground
[&_.text-muted]:text-vscode-list-activeSelectionForeground/80!
[&_.text-muted-foreground]:text-vscode-list-activeSelectionForeground/80!
```

### Mention chip (rendered in Editor)
```css
.mention-chip{
  display:inline-flex;align-items:center;gap:4px;
  padding:0 4px;border-radius:4px;
  background-color:color-mix(in srgb,var(--vscode-charts-blue) 20%,transparent);
  vertical-align:middle;line-height:inherit;
  max-width:min(100%,300px);min-width:0;
  -webkit-user-select:none;user-select:none;
  font-size:var(--text-sm)}
.mention-chip-clickable{cursor:pointer}
.mention-chip-icon-wrapper{display:inline-flex;align-items:center;position:relative;flex-shrink:0}
.mention-chip-icon-size{width:1em;height:1em}
.mention-chip-selected{background-color:var(--vscode-editor-selectionBackground);outline:none}
.mention-chip-ghost{opacity:.5;cursor:default;pointer-events:none}
.mention-chip-no-access{
  opacity:.6;border:1px dashed var(--vscode-editorWidget-border);
  background-color:color-mix(in srgb,var(--vscode-errorForeground) 10%,transparent)}
```

---

## C. Workflow card grid (`TaskChainModeSwitcher` on Landing)

Four workflow modes, rendered via `TabSwitcher`:

| `value` | label | icon (lucide) | description |
|---|---|---|---|
| `epic` | **Epic** | `Sparkles` (`w-4 h-4`) | `Break down large initiatives into specs and tickets, managed end-to-end with AI.` |
| `phases` | **Phases** | `ListTree` (`w-4 h-4`) | `Start with a conversation to clarify intent, then break the task into manageable phases.` |
| `plan` | **Plan** | `ScrollText` (`w-4 h-4`) | `Get a detailed file-level plan, refine it with AI, and send it to the agent for execution.` |
| `review` | **Review** | `ScanEye` (`w-4 h-4`) | `Run a comprehensive review to identify issues and deviations and tighten the codebase with AI.` |

Epic gets a **`FreeBadge`** during the `EPIC_FREE_PROMOTION` window.

### Layout tokens

```js
DEFAULT_CONTAINER_CLS    = "grid grid-cols-2 w-full justify-center border-border rounded-lg gap-2"
DEFAULT_ITEM_CLS         = "p-4 flex flex-col gap-y-1 cursor-pointer transition-colors w-full text-center items-center h-full border-border border rounded-md"
DEFAULT_ITEM_DESC_CLS    = "text-sm text-left text-muted-foreground max-xs:hidden"
DEFAULT_ACTIVE_ITEM_CLS  = "bg-vscode-input-background text-vscode-input-foreground rounded-md"
```

`showCheckmark={true}` adds a `<CircleCheck className="size-4 text-green-500"/>` to the active card.

### Card row markup (per `TabSwitcher`)
```jsx
<div role="tab" tabIndex={0} aria-selected={isActive}
  className={cn("relative", DEFAULT_ITEM_CLS, isActive && DEFAULT_ACTIVE_ITEM_CLS)}
  onClick={...}>
  <div className={cn("flex flex-row items-center gap-x-2 w-full mt-2 mb-2",
    icon ? "justify-between" : "justify-center")}>
    <div className="flex flex-row items-center">
      {icon && <div className="mr-2">{icon}</div>}
      <div className="flex flex-row w-full justify-between items-center gap-1 flex-wrap">
        <span>{label}</span>
        {badge && badge}
      </div>
    </div>
    {isActive && showCheckmark && <CircleCheck className="size-4 text-green-500"/>}
  </div>
  {description && <span className={DEFAULT_ITEM_DESC_CLS}>{description}</span>}
</div>
```

### `FreeBadge` (Epic promo)
```jsx
<span className={cn(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-semibold cursor-help",
  isDark ? "bg-green-500/15" : "bg-green-500/30",
  isDark ? "text-green-400"   : "text-green-600")}>
  Free <Info className="w-3 h-3 font-semibold"/>
</span>
```

### Review suggestions panel (under Review-mode editor)
```jsx
<div className={cn("flex flex-col justify-center items-center w-full gap-1.5 bg-vscode-sideBar-background p-2 z-10")}>
  <span className="text-sm text-muted-foreground">✨ Review suggestions:</span>
  <div className="flex gap-2 flex-wrap items-center justify-center w-full">
    {suggestions.map(s =>
      <Button variant="outline" size="lg"
        className={cn("rounded-full shadow-sm px-3 border border-dashed border-border","text-sm")}>
        {s.label}
      </Button>)}
  </div>
</div>
```

Suggestion presets:
- `Review uncommitted changes`
- `Review against ${defaultBranch} branch`

---

## D. Conversation / Plan / Validation rendering

### `Accordion` (used for plan phases, thinking sections, etc.)

```jsx
<section className={cn("group/accordion transition-all duration-150",
  showLeftLine ? "" : "border border-border rounded-md p-2 bg-(--vscode-editor-background)",
  disabled ? "opacity-50 cursor-not-allowed" : "",
  className)} data-accordion={...}>
  <div className={cn(
    "flex justify-between items-center sticky top-0 z-20 py-1",
    showLeftLine ? "" : "bg-(--vscode-editor-background)",
    disabled ? "cursor-not-allowed" : "cursor-pointer")} onClick={...}>
    <div className="flex gap-x-2 flex-row justify-start flex-1 min-w-0">
      {showStatusIcon && <button className={cn(
        "min-w-[18px] w-[18px] h-[18px] rounded-full border shrink-0 flex items-center justify-center",
        hasFailed ? "bg-red-700 border-red-700"
        : isPaused ? "bg-yellow-600 border-yellow-600"
        : isRateLimitedOrCreditInsufficient ? "bg-orange-600 border-orange-600"
        : ...)}/>}
      ...
    </div>
  </div>
  {/* body */}
</section>
```

Status-icon size: **18px round button**. Color rules (precedence top→bottom):
| State | bg / border |
|---|---|
| `hasFailed` | `bg-red-700 border-red-700` |
| `isPaused` | `bg-yellow-600 border-yellow-600` |
| `isRateLimitedOrCreditInsufficient` | `bg-orange-600 border-...` |
| `isComplete` | (green, see remainder of file) |
| `isPlanGenerating` | (spinner) |
| `isSkipped` | (muted) |

### Severity / category badges

Mapping to badge color tokens (defined in `:root`):

```js
reviewBadgeSticker = {
  Bug         : "bg-badge-bug",
  Performance : "bg-badge-performance",
  Security    : "bg-badge-security",
  Clarity     : "bg-badge-clarity",
}
verificationBadgeSticker = {
  Critical : "bg-badge-critical",
  Major    : "bg-badge-major",
  Minor    : "bg-badge-minor",
  Outdated : "bg-badge-outdated",
}
reviewHoverBadgeBorder       = { Bug:"hover:border-badge-bug/60 border", Performance:"hover:border-badge-performance/60 border", Security:"hover:border-badge-security/60 border", Clarity:"hover:border-badge-clarity/60 border" }
verificationHoverBadgeBorder = { Critical:"hover:border-badge-critical/60 border", Major:"hover:border-badge-major/60 border", Minor:"hover:border-badge-minor/60 border", Outdated:"hover:border-badge-outdated/60 border" }
reviewActiveBadgeBorder      = { Bug:"border-badge-bug/50 border", Performance:"border-badge-performance/50 border", Security:"border-badge-security/50 border", Clarity:"border-badge-clarity/50 border" }
verificationActiveBadgeBorder= { Critical:"border-badge-critical/50 border", Major:"border-badge-major/50 border", Minor:"border-badge-minor/50 border", Outdated:"border-badge-outdated/50 border" }
```

Hex values from `:root`:

| Token | Hex |
|---|---|
| `--color-badge-bug` | `#f04438` |
| `--color-badge-performance` | `#17b26a` |
| `--color-badge-security` | `#026aa2` |
| `--color-badge-clarity` | `#5925dc` |
| `--color-badge-minor` | `#3bb3e6` |
| `--color-badge-major` | `#ffd60a` |
| `--color-badge-critical` | `#b42318` |
| `--color-badge-outdated` | `#8b8c89` |
| `--color-badge-completed` | `#067647` |
| `--color-badge-pending` | `#c29b0f` |
| `--color-badge-failed` | `#b42318` |

`SEVERITY_LABELS = { CRITICAL:"Critical", MAJOR:"Major", MINOR:"Minor" }`.
`CATEGORIES = { UNKNOWN:"Unknown", BUG:"Bug", CLARITY:"Clarity", PERFORMANCE:"Performance", SECURITY:"Security" }`.

### Search-match highlighting
| Token | Hex |
|---|---|
| `--color-search-match-current` | `#ea973366` |
| `--color-search-match-other` | `#ff851b4d` |

### Diff viewer (react-diff-view, configured in `:root` block #1)

```css
:root{
  --diff-background-color: var(--vscode-editor-background, var(--vscode-sideBar-background, rgb(30,30,30)));
  --diff-text-color: var(--vscode-editor-foreground);
  --diff-font-family: Consolas, Courier, monospace;
  --diff-selection-background-color: #b3d7ff;
  --diff-selection-text-color: var(--diff-text-color);
  --diff-gutter-insert-background-color: #3fb9504d;
  --diff-gutter-insert-text-color: var(--diff-text-color);
  --diff-gutter-delete-background-color: #f851494d;
  --diff-gutter-delete-text-color: var(--diff-text-color);
  --diff-gutter-selected-background-color: #fffce0;
  --diff-gutter-selected-text-color: var(--diff-text-color);
  --diff-code-insert-background-color: #2ea04326;
  --diff-code-insert-text-color: var(--diff-text-color);
  --diff-code-delete-background-color: #f8514926;
  --diff-code-delete-text-color: var(--diff-text-color);
  --diff-code-insert-edit-background-color: #2ea04326;
  --diff-code-insert-edit-text-color: var(--diff-text-color);
  --diff-code-delete-edit-background-color: #f8514926;
  --diff-code-delete-edit-text-color: var(--diff-text-color);
  --diff-code-selected-background-color: #fffce0;
  --diff-code-selected-text-color: var(--diff-text-color);
  --diff-omit-gutter-line-color: #cb2a1d
}
```

So: insert = green `#2ea04326` body, gutter `#3fb9504d`. Delete = red `#f8514926` body, gutter `#f851494d`. Selected line `#fffce0`.

### Sourced-quote badge (spec / ticket reference inside chat)
```jsx
<NodeViewWrapper className="sourced-quote-wrapper my-1">
  <div className={cn("sourced-quote-badge inline-flex items-center gap-1 px-2 py-0.5 mb-1 text-sm rounded select-none truncate bg-vscode-badge-background text-...")}>
    <span>{icon}</span><span>{label}: {title}</span>
  </div>
</NodeViewWrapper>
// label/icon table:
spec   → { label:"Spec",   icon:"📄" }
ticket → { label:"Ticket", icon:"🎫" }
*      → { label:"Quote",  icon:"📝" }
```

### Suggested next-steps panel (`NextStepsInner`)

```jsx
{nextSteps.length === 0 ? null :
  <div className="mt-4 py-2 border-t border-border">
    <div className="flex items-center gap-2 mb-3">
      <Sparkles className="w-4 h-4"/>
      <span className="font-medium">Suggested Next Steps</span>
    </div>
    <div className="flex flex-col gap-y-2">
      {nextSteps.map(step =>
        <div className="flex flex-col gap-y-2">
          {step.contentOutput && <QuotableContent><SmartMarkdownViewer content={step.contentOutput}/></QuotableContent>}
          {step.options.length > 0 &&
            <div className="flex flex-col w-full gap-2">
              {step.options.map(opt =>
                <div role="button" tabIndex={disabled?-1:0} aria-disabled={disabled}
                  className={cn(
                    "group/option relative w-full h-auto rounded-md border border-border bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground px-2 py-2 text-left text-sm shadow-sm",
                    "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
                    disabled ? "cursor-not-allowed opacity-60"
                             : "cursor-pointer hover:bg-vscode-button-secondaryHoverBackground hover:border-..."
                  )}>
                  ...
                </div>)}
            </div>}
        </div>)}
    </div>
  </div>}
```

---

## E. Epic / Spec / Ticket detail view

### Status enums

```js
TicketStatus = { TICKET_TODO:0, TICKET_IN_PROGRESS:1, TICKET_DONE:2 }
TICKET_STATUS_LABELS = { 0:"Todo", 1:"In Progress", 2:"Done" }
ArtifactOperation    = { ARTIFACT_CREATED:0, ARTIFACT_UPDATED:1, ARTIFACT_DELETED:2 }
VerificationThreadStatus = { RESOLVED:1, OUTDATED:2 }
PermissionRole = { OWNER:0, EDITOR:1, VIEWER:2 }
```

### Ticket status colors (CSS variables)
```css
--color-ticket-status-todo:        var(--color-badge-pending)   /* #c29b0f */
--color-ticket-status-in-progress: #3b82f6
--color-ticket-status-done:        var(--color-badge-completed) /* #067647 */
```

### `STATUS_CONFIG` map (used by `LinearStatusIcon`)
```js
{
  [TICKET_TODO]:        { cssVar:"var(--color-ticket-status-todo)",        label:"To Do" },
  [TICKET_IN_PROGRESS]: { cssVar:"var(--color-ticket-status-in-progress)", label:"In Progress" },
  [TICKET_DONE]:        { cssVar:"var(--color-ticket-status-done)",        label:"Done" }
}
```

### `LinearStatusIcon` SVG (Linear-style)

| State | Render |
|---|---|
| TODO | `<circle r=size/2-1 fill="none" stroke=color strokeWidth=1.5 strokeDasharray="2 2"/>` |
| IN_PROGRESS | outer circle (opacity .3) + arc (75% filled, dasharray) + inner dot (`r=size/4`) |
| DONE | outer circle + thick mid-ring (opacity .4) + inner dot |

Default size 16, stroke 1.5.

### Status preview (`+N more`)
```jsx
<div className="text-sm text-muted-foreground text-center py-2">
  +{count} more
</div>
```

### Title in toolbar (epic / chat) is editable via `EditableTitleViewer` (see section A).

### Spec / Ticket display labels
- `spec` → label `"Spec"`, emoji `📄`
- `ticket` → label `"Ticket"`, emoji `🎫`

---

## F. Settings / History / MCP / Model Profile / CLI Agents panels

### Supported agent IDs (for export / handoff dropdowns)

```js
SupportedAgentIDs = {
  CURSOR:                       "cursor",
  VISUALSTUDIOCODE:             "visualstudiocode",
  VISUALSTUDIOCODE_INSIDERS:    "visualstudiocode-insiders",
  CODE_SERVER:                  "code-server",
  WINDSURF:                     "windsurf",
  TRAE:                         "trae",
  CLAUDE_CODE:                  "claude-code",
  CLAUDE_CODE_EXTENSION:        "claude-code-extension",
  GEMINI:                       "gemini",
  CODEX:                        "codex",
  CODEX_EXTENSION:              "codex-extension",
  KILO_CODE:                    "kilo-code",
  ROO_CODE:                     "roo-code",
  CLINE:                        "cline",
  COPY:                         "copy",
  MARKDOWN_EXPORT:              "markdown-export",
  AUGMENT:                      "augment",
  ZENCODER:                     "zencoder",
  AMP:                          "amp",
  ANTIGRAVITY:                  "antigravity",
  TRAYCER_PHASES:               "traycer-phases",
  TRAYCER_PLAN:                 "traycer-plan",
  TRAYCER_REVIEW:               "traycer-review",
}

AgentType = { IDE:"ide", Terminal:"terminal", Extension:"extension", Utility:"utility", Native:"native" }
```

### `AGENT_METADATA` displayName table

| id | type | displayName |
|---|---|---|
| `claude-code` | terminal | Claude Code CLI |
| `gemini` | terminal | Gemini CLI |
| `codex` | terminal | Codex CLI |
| `cursor` | ide | Cursor |
| `visualstudiocode` | ide | VS Code |
| `visualstudiocode-insiders` | ide | VS Code Insiders |
| `code-server` | ide | Code Server |
| `windsurf` | ide | Windsurf |
| `trae` | ide | Trae |
| `augment` | ide | Augment |
| `antigravity` | ide | Antigravity |
| `kilo-code` | extension | Kilo Code |
| `roo-code` | extension | Roo Code |
| `cline` | extension | Cline |
| `claude-code-extension` | extension | Claude Code Extension |
| `codex-extension` | extension | Codex Extension |
| `zencoder` | extension | ZenCoder |
| `amp` | extension | Amp |
| `copy` | utility | Copy |
| `markdown-export` | utility | Export as Markdown |
| `traycer-phases` | native | Traycer Phases |
| `traycer-plan` | native | Traycer Plan |
| `traycer-review` | native | Traycer Review |

Icons: rendered through `agent-icons` SVG resources (under `extension/resources/assets/`); the bundle resolves them via dynamic `getIcon` calls. Each tile uses its agent ID as the lookup key.

### Footer (`NavigatorAppFooter`)
```jsx
<footer className={cn("fixed bottom-1 flex flex-row items-center justify-between w-[97vw] my-1 border-t border-border")}>
  ...
</footer>
```

### Account dropdown (sign-in menu inside footer)
```jsx
<div className="border-t border-border px-1 py-1">
  <a href={traycerInfo.platformWebsiteSettings} target="_blank" rel="noreferrer noopener"
    className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-sm text-foreground hover:bg-accent cursor-pointer outline-none focus:ring-0">
    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground"/>
    Manage Account
  </a>
  <button onClick={signOut}
    className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-sm text-red-400 hover:bg-red-500/10 cursor-pointer outline-none focus:ring-0">
    <LogOut className="w-3.5 h-3.5"/>
    Sign out
  </button>
</div>
```

### CLI-Agents settings (representative settings panel)
```jsx
<div className={cn("flex flex-col flex-1 h-full", className)}>
  <SectionHeader ref={ref} className="flex flex-col gap-1 mb-1.5">
    <div className="border-b border-border/50 flex items-center justify-between">
      <TabList ... />
      ...
    </div>
  </SectionHeader>
  <CLIAgentRow .../>
  <CLIAgentRow .../>
</div>
```
CLI agent row item:
```jsx
<div className="flex flex-col gap-1 truncate">
  <span className="text-base font-medium text-vscode-foreground truncate text-left">{name}</span>
  <span className="text-sm text-muted truncate text-left">{filePath}</span>
</div>
```
Action buttons in the row:
```jsx
<Button className="rounded-md" tooltip="Clone CLI agent" aria-label="Clone CLI agent">
  <CopyPlus className="h-4 w-4"/>
</Button>
```

### Sign-in screen layout (separate from comment-navigator routes but shares chrome)
```jsx
<main className="flex h-full w-full items-center justify-center px-4">
  <div className="flex w-full max-w-lg flex-col items-center justify-center gap-5 text-center">
    <TraycerLogoIcon isDark={isDark}/>
    <span className="text-3xl font-bold tracking-tight leading-tight">Complex Code Changes Made Simple</span>
    <span className="max-w-md text-base font-medium text-muted leading-relaxed">
      Turn hours of coding into minutes with an AI that plans, implements, and reviews every change.
    </span>
    <div className="flex w-full max-w-sm flex-col items-center gap-2">
      <PrimaryButton ...>...</PrimaryButton>
    </div>
  </div>
</main>
```

`PrimaryButton`:
```jsx
<Button variant="default" size={size /* default "lg" */}
  className={cn(
    "px-4 py-2.5 rounded-md border border-border font-medium text-md disabled:cursor-not-allowed disabled:pointer-events-auto",
    className)}>
```

---

## G. Global design tokens (`:root` + `:root,:host`)

### Layout / chrome heights (from `--traycer-*`)

| Var | Value |
|---|---|
| `--traycer-toolbar-height` | `50px` |
| `--traycer-input-box-height` | `30px` |
| `--traycer-search-input-height` | `34px` |
| `--traycer-tag-filter-height` | `40px` |
| `--traycer-tag-filter-xs-height` | `84px` |
| `--traycer-task-thread-switcher-height` | `40px` |
| `--traycer-trial-badge-height` | `45px` |
| `--traycer-taskchain-input-height` | `75px` |
| `--traycer-task-list-height` | `calc(100vh - var(--traycer-toolbar-height) - var(--intentional-margin))` |
| `--traycer-task-detail-height` | `calc(100vh - toolbar - taskThreadSwitcher - intentional - 4px)` |
| `--traycer-thread-list-height` | `calc(100vh - toolbar - searchInput - tagFilter - intentional - 50px)` |
| `--traycer-analysis-list-height` | `calc(100vh - toolbar - tagFilter - intentional - 16px)` |

`--intentional-margin` is set elsewhere; the body adds `padding:0 5px!important`.

### Typography scale

| Token | Value |
|---|---|
| `--traycer-font-size-body` | `14px` |
| `--traycer-font-size-prominent` | `calc(14px * 1.1) ≈ 15.4px` |
| `--traycer-font-size-secondary` | `max(12px, calc(14px * 0.92)) ≈ 12.88px` |
| `--text-xs` | `calc(--traycer-font-size-body * 0.85) ≈ 11.9px` |
| `--text-sm` | `--traycer-font-size-secondary` |
| `--text-base` | `--traycer-font-size-body` (14 px) |
| `--text-lg` | `--traycer-font-size-prominent` |
| `--text-xl` | `1.25rem` |
| `--text-2xl` | `1.5rem` |
| `--text-3xl` | `1.875rem` |
| `--font-weight-normal` | `400` |
| `--font-weight-medium` | `500` |
| `--font-weight-semibold` | `600` |
| `--font-weight-bold` | `700` |
| `--leading-tight` | `1.25` |
| `--leading-snug` | `1.375` |
| `--leading-relaxed` | `1.625` |
| `--default-font-family` | `var(--vscode-font-family)` |
| `--default-mono-font-family` | `var(--vscode-editor-font-family)` |

### Spacing / radius

| Token | Value |
|---|---|
| `--spacing` | `0.25rem` (Tailwind base; `p-1`=4px, `p-2`=8px, `p-3`=12px, `p-4`=16px, `p-5`=20px) |
| `--radius` | `0.5rem` |
| `--radius-xs` | `0.125rem` |
| `--radius-sm` | `calc(--radius - 4px) = 4px` |
| `--radius-md` | `calc(--radius - 2px) = 6px` |
| `--radius-lg` | `var(--radius) = 8px` |
| `--radius-xl` | `0.75rem` |

### Container widths
| Token | Value |
|---|---|
| `--container-xs` | `20rem` |
| `--container-sm` | `24rem` |
| `--container-md` | `28rem` |
| `--container-lg` | `32rem` |
| `--container-2xl` | `42rem` |

### Shadows / animations

| Token | Value |
|---|---|
| `--drop-shadow-sm` | `0 1px 2px #00000026` |
| `--ease-in-out` | `cubic-bezier(.4, 0, .2, 1)` |
| `--default-transition-duration` | `0.15s` |
| `--default-transition-timing-function` | `cubic-bezier(.4, 0, .2, 1)` |
| `--animate-spin` | `spin 1s linear infinite` |
| `--animate-pulse` | `pulse 2s cubic-bezier(.4, 0, .6, 1) infinite` |
| `--animate-shake` | `shake .4s ease-in-out` |
| `--blur-sm` | `8px` |

### Theme bridge tokens

```css
:root{
  --background:          var(--vscode-background);
  --foreground:          var(--vscode-foreground);
  --sidebar:             var(--vscode-textCodeBlock-background);
  --card:                var(--vscode-editor-background);
  --card-foreground:     var(--vscode-editor-foreground);
  --popover:             var(--vscode-dropdown-background, var(--vscode-editor-background));
  --popover-foreground:  var(--vscode-dropdown-foreground, var(--vscode-editor-foreground));
  --primary:             var(--vscode-button-background);
  --primary-foreground:  var(--vscode-button-foreground);
  --secondary:           var(--vscode-button-secondaryBackground);
  --secondary-foreground:var(--vscode-button-secondaryForeground);
  --muted:               color-mix(in srgb, var(--vscode-foreground) 60%, transparent);
  --muted-foreground:    var(--vscode-descriptionForeground);
  --accent:              var(--vscode-list-hoverBackground);
  --accent-foreground:   var(--vscode-list-hoverForeground);
  --destructive:         var(--vscode-errorForeground);
  --destructive-foreground:var(--vscode-button-foreground);
  --border:              var(--color-border);
  --input:               var(--vscode-input-background);
  --ring:                var(--vscode-input-border);
  --chart-1: var(--vscode-charts-red);
  --chart-2: var(--vscode-charts-blue);
  --chart-3: var(--vscode-charts-yellow);
  --chart-4: var(--vscode-charts-orange);
  --chart-5: var(--vscode-charts-green);
  --radius: 0.5rem;
}
body{ --vscode-input-border:var(--border); --color-border:#0000001a; padding:0 5px!important }
body.vscode-dark              { --color-border:#ffffff1a }
body.vscode-high-contrast     { --color-border:#fff }
body.vscode-high-contrast-light{ --color-border:#000 }
.smooth-height{transition:height .3s ease-in-out}
```

### VS Code variables actually consumed (full list)

```
--vscode-background
--vscode-badge-background, --vscode-badge-foreground
--vscode-banner-iconForeground
--vscode-button-background, --vscode-button-foreground
--vscode-button-hoverBackground
--vscode-button-secondaryBackground, --vscode-button-secondaryForeground
--vscode-button-secondaryHoverBackground
--vscode-charts-blue, --vscode-charts-green, --vscode-charts-orange,
--vscode-charts-red, --vscode-charts-yellow
--vscode-descriptionForeground
--vscode-dropdown-background (fallback editor-background)
--vscode-dropdown-border
--vscode-dropdown-foreground (fallback editor-foreground)
--vscode-editor-background (fallback sideBar-background, rgb(30,30,30))
--vscode-editor-font-family
--vscode-editor-foreground
--vscode-editor-selectionBackground
--vscode-editorHoverWidget-background, -border, -foreground
--vscode-editorInfo-foreground (fallback #75beff)
--vscode-editorWarning-foreground (fallback #e5a82e)
--vscode-editorWidget-background, -border (fallback #3c3c3c)
--vscode-errorForeground
--vscode-focusBorder
--vscode-font-family
--vscode-foreground
--vscode-input-background, -border (fallback #3c3c3c), -foreground
--vscode-inputValidation-infoBackground, -infoBorder, -infoForeground
--vscode-inputValidation-warningBackground, -warningBorder, -warningForeground
--vscode-list-activeSelectionBackground, -activeSelectionForeground
--vscode-list-focusBackground
--vscode-list-hoverBackground, -hoverForeground
--vscode-notifications-background
--vscode-panel-background, -border
--vscode-scrollbarSlider-activeBackground, -background, -hoverBackground
--vscode-sideBar-background, --vscode-sideBarTitle-background
--vscode-testing-iconFailed, -iconPassed
--vscode-textCodeBlock-background
--vscode-textLink-foreground
--vscode-toolbar-hoverBackground
--vscode-widget-border
```

### Tailwind palette (oklch, defined under `:root,:host`)

```
red:    50,100,200,300,400,500,600,700,950
orange: 100,300,500,600,800,900
amber:  50,200,300,400,500,600,700,950
yellow: 400,500,600,700
green:  50,100,300,400,500,600,700,800,900
emerald:50,100,300,400,500,600,800,900,950
teal:   100,300,800,900
blue:   100,300,400,500,600,800,900
indigo: 100,300,800,900
violet: 100,300,800,900
purple: 100,300,500,800,900
slate:  100,300,800,900
gray:   50,100,200,300,400,500,600,700,800,900
black:  #000
white:  #fff
```
(Each is `oklch(L% C H)` — values preserved verbatim in `global.css` around offset 6154.)

### Mono font stack
```
--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace
--diff-font-family: Consolas, Courier, monospace
```

---

## H. Animations & interaction details

### Defined keyframes (in `@layer base` block of global.css)
```css
@keyframes shine  { 0%{background-position:100%} }
@keyframes enter  { 0%{opacity:var(--tw-enter-opacity,1);transform:translate3d(...) scale3d(...) rotate(...)} }
@keyframes exit   {  to{opacity:var(--tw-exit-opacity,1);transform:...} }
@keyframes spin   { to{transform:rotate(360deg)} }
@keyframes pulse  { 50%{opacity:.5} }
@keyframes shake  { 0%,to{transform:translate(0)} 20%{translate(-4px)} 40%{translate(4px)} 60%{translate(-3px)} 80%{translate(3px)} }
@keyframes yolo-selection-to-running { 0%{opacity:1;transform:scale(1)} 50%{opacity:.8;transform:scale(1.2)} to{opacity:1;transform:scale(1)} }
```

### `lds-default` 12-dot loader (used as inline spinner)
```css
.lds-default{display:inline-block;position:relative;width:40px;height:40px}
.lds-default div{
  position:absolute;width:3.2px;height:3.2px;background:currentColor;border-radius:50%;
  animation:lds-default 1.2s linear infinite}
/* 12 children at angles, animation-delay 0 → -1.1s */
@keyframes lds-default{0%,20%,80%,to{transform:scale(1)} 50%{transform:scale(1.5)}}
```

### `BeatLoader` (react-spinners)
Used inside the sign-in primary button while `isAuthenticating`:
```jsx
<BeatLoader color="var(--vscode-button-foreground)" size={5}/>
```

### Streaming
Streaming content is driven by Redux state (`isStreaming` flag on specs/tickets, `streamingSpecContent[id]` snapshots). There is **no dedicated CSS streaming-cursor class** in the bundle; streaming is signaled by:
- The progress dot inside the `Accordion` status button (`min-w-[18px] w-[18px] h-[18px] rounded-full`) animating via `animate-pulse` when generating
- Token usage gauge color transitions (`text-green-500` → `text-yellow-500` / `text-blue-500` → `text-red-500`)
- The `Stop` button's `Loader` icon with `animate-spin` while aborting

### Typography progress rules (credit/context bars)
```js
yt = consumed / total * 100
vt = () => yt < 50 ? "text-green-500"
        : yt < 90 ? (hasBonus ? "text-blue-500" : "text-yellow-500")
        : "text-red-500"
```

### `Button$2` (the global button)
```js
buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer active:opacity-80",
  {
    variants: {
      variant: {
        default:    "border border-border bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:"bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:    "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary:  "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:      "hover:bg-accent hover:text-accent-foreground",
        link:       "text-vscode-banner-iconForeground underline-offset-4 hover:underline",
        combobox:   "border border-vscode-dropdown-border focus-visible:border-vscode-focusBorder bg-vscode-dropdown-background hover:bg-transparent text-vscode-dropdown-foreground font-normal"
      },
      size: {
        default: "h-7 px-3",
        sm:      "h-6 px-2 text-sm",
        lg:      "h-8 px-4 text-lg",
        icon:    "h-7 w-7"
      }
    },
    defaultVariants: { variant:"default", size:"default" }
  })
```

So **default button height is 28px (`h-7`)**, large is 32px (`h-8`), small is 24px (`h-6`). Icon-only is 28×28.

### Body padding
```css
body{ padding:0 5px!important; line-height:inherit }
```

### Tooltip system
`<TooltipWrapper>` wraps any control; uses Radix `Tooltip`. Default `delayDuration` is `TOOLTIP_DELAY` (constant defined in bundle). Side defaults: `top` (toolbar/buttons), `right` (slash-command items), `end` (notification popover content).

### Popover dimensions (notifications)
```
className: "h-[min(20rem,calc(100vh-4rem))] w-[min(28rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-border p-0"
```

### Smooth height utility
```css
.smooth-height{transition:height .3s ease-in-out}
```

### Drag/drop
Drag affordances are present in `epicView.js` (kanban). `commentNavigator` itself does not define drag-and-drop classes; only the kanban route (mounted at `task/kanban/...`) loads them via `epicView.js`.

---

## I. Quick reference — all reproduced verbatim strings

### Button copy
- `Send`, `Stop`, `Stopping...`, `Open Board`, `Share epic`, `Sign out`, `Manage Account`, `Signing in with Traycer`, `Notifications`, `Notifications (unread)`, `+N more`, `(N% used)`, `Free`, `To Do`, `In Progress`, `Done`

### Empty / informational
- `No commands match your query`
- `No workflows available`
- `Click to switch to text mode and enable input box`
- `Full context window is available`
- `Large context detected, performance may be degraded`
- `${pct}% • ${used} / ${total} context used`
- `Time left until the next artifact becomes available`
- `Resets ${date}`

### Headings
- `What can I help you build today?`
- `Create new code, add features, or fix issues—let's make it happen.`
- `Complex Code Changes Made Simple`
- `Turn hours of coding into minutes with an AI that plans, implements, and reviews every change.`
- `✨ Review suggestions:`
- `Suggested Next Steps`

### Page titles (from route)
- `Task History`, `New Task`, `New Epic`, `Prompt Templates`, `Workflows`, `CLI Agents`, `Commit Scripts`, `Model Profiles`, `Remote MCP Server`, `Notifications`, `Create new task`

### Workflow descriptions (verbatim, see Section C)
- `Break down large initiatives into specs and tickets, managed end-to-end with AI.`
- `Start with a conversation to clarify intent, then break the task into manageable phases.`
- `Get a detailed file-level plan, refine it with AI, and send it to the agent for execution.`
- `Run a comprehensive review to identify issues and deviations and tighten the codebase with AI.`

### Review suggestion presets
- `Review uncommitted changes`
- `Review against ${branch} branch`

### Notification messages (verbatim templates)
- `${actorName} invited you to ${"epic '"+title+"'" || "an epic"}`
- `${actorName} changed your role in ${...} to "${newRole}"`
- `${actorName} removed your access of ${...}`
- `${actorName} mentioned you in a comment on ${...}`
- `${actorName} replied in a comment thread on ${...}`
- `${actorName} resolved a comment thread on ${...}`

### Prompt template type labels
`Plan`, `Verification`, `Generic`, `Review`, `User Query`

### Severity labels
`Critical`, `Major`, `Minor`

### Category labels
`Unknown`, `Bug`, `Clarity`, `Performance`, `Security`

---

## J. File offsets for re-verification

| Component | global.js offset |
|---|---|
| `WebViewTypes` enum | 5558 |
| `TicketStatus` enum | 318821 |
| `TICKET_STATUS_LABELS` | 320285 |
| `SupportedAgentIDs` / `AGENT_METADATA` | 98800 – 102000 |
| `IconButton` definition | 604790 |
| `buttonVariants` / `Button$2` | 1755022 |
| `NotificationBellButton` | 1561394 |
| `NotificationPopover` | 1854028 |
| `NavigationBarContainer` / `NavigationBar` | 1932000 – 1935200 |
| `TraycerLogoIcon` | 368989 |
| `LandingHeading` | 6197921 |
| `getTaskChainModeOptions` (workflow cards) | 6202921 |
| `TabSwitcher` + tab item layout | 6201050 |
| `ReviewSuggestionsPanel` | ~6200500 |
| `EmbeddedSendButton` | 5249041 |
| `MentionItem` | 5249000 |
| `SlashCommandList` | 5259053 |
| `SourcedQuoteNodeView` | ~5263200 |
| `Accordion` | ~6727800 |
| `NextStepsInner` | 6084502 |
| `STATUS_CONFIG` / `LinearStatusIcon` | 6092927 |
| `ContextUsageSpinner` | 5246628 |
| `ModelSelector` | 2192052 |
| `NavigatorAppFooter` | ~1975600 |
| `CLIAgentsSettings` | ~2117000 |
| Badge color tokens (`:root` block) | global.css ≈18000 |
| Diff viewer tokens (`:root` block #1) | global.css 0 |
| Tailwind palette + scale (`:root,:host`) | global.css 6154 – 13000 |
| Theme bridge (`:root` w/ vscode mapping) | global.css 18864 |
| Slash-command + mention-chip CSS | global.css ~159700 |

---

## K. Implementation notes for 1:1 reproduction

1. **Webview-only**: this UI is intended to mount inside a VSCode webview. All chrome colors flow through `var(--vscode-*)`. Outside VSCode, you must inject equivalent CSS variables (use the dark/light defaults referenced as fallbacks in `global.css`, e.g. editor background `rgb(30,30,30)`).
2. **Body global**: `body{padding:0 5px!important}` and `body.vscode-dark{--color-border:#ffffff1a}`. Reproduce these classes on your shell.
3. **Tailwind**: the bundle uses Tailwind v4-style `@layer base` with `--text-*`, `--spacing`, `--radius-*`, `--color-*` tokens — reproduction must match this token set or the verbatim classNames will misrender.
4. **Toolbar height**: 50px (`--traycer-toolbar-height`) but the inner nav uses `min-h-[32px]` + `py-1` — actual rendered height depends on content.
5. **Brand**: do **not** put a "Traycer" word-mark in the toolbar — it is not present in the source. Title is the route-derived string.
6. **Workflow grid**: `grid grid-cols-2 gap-2 rounded-lg`. Selected tile uses `bg-vscode-input-background` with `<CircleCheck className="size-4 text-green-500"/>` in the corner.
7. **Send button**: rounded-full, **default-variant** when ready, **ghost-variant** when streaming, and uses `ArrowUp`/`StopIcon`/`Loader` (lucide).
8. **Status badges**: 11 hard-coded hex tokens — reproduce them exactly.
9. **Notification bell**: 28×28 outer, 16×16 bell, badge `-top-1.5 -right-2.5` on relative span, 10 px font, capped at `99+`.
10. **Slash-command popup**: Radix-style portal, FloatingUI placement `bottom-start`, max width 300, max height min(40 vh, 80% available).

---

End of teardown.
