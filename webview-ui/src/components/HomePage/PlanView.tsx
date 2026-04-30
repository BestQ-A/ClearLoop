import type { PlanResult, FileChange } from "../../types/Homepage";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  plan: PlanResult;
  isLoading: boolean;
  onValidate: () => void;
  onGenerate: (agent: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Markdown 渲染器（统一 VS Code 主题）                                */
/* ------------------------------------------------------------------ */

/** 紧凑型 Markdown 渲染组件 — 用于上下文卡片 / 步骤描述 */
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
        <ol className="list-disc list-inside ml-2 space-y-0.5" {...props}>
          {children}
        </ol>
      ),
      p: ({ children, ...props }) => (
        <p className="text-[10px] leading-relaxed mb-1" {...props}>
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

/* ------------------------------------------------------------------ */
/*  小组件                                                              */
/* ------------------------------------------------------------------ */

/** 可折叠上下文卡片（左侧灰蓝边框） */
const ContextCard = ({
  title,
  content,
  defaultOpen = false,
}: {
  title: string;
  content: string;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="border-l-[3px] rounded-r bg-[var(--vscode-editor-background)]"
      style={{ borderColor: "var(--vscode-textLink-foreground, #3794ff)" }}
    >
      <button
        type="button"
        className="w-full flex items-center gap-1.5 px-3 py-2 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        {/* 折叠箭头 */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="shrink-0 transition-transform"
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            fill: "var(--vscode-descriptionForeground)",
          }}
        >
          <path d="M3 1l5 4-5 4V1z" />
        </svg>
        <span className="text-[11px] font-semibold text-[var(--vscode-foreground)]">
          {title}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 text-[10px] leading-relaxed text-[var(--vscode-descriptionForeground)]">
          <Markdown>{content}</Markdown>
        </div>
      )}
    </div>
  );
};

/** 步骤状态指示器 */
const StepStatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case "completed":
      return (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <circle cx="6" cy="6" r="6" fill="var(--vscode-testing-iconPassed, #73c991)" />
          <path d="M3.5 6l2 2 3-4" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "running":
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" className="animate-pulse">
          <circle cx="6" cy="6" r="6" fill="var(--vscode-textLink-foreground, #3794ff)" />
          <circle cx="6" cy="6" r="2.5" fill="#fff" />
        </svg>
      );
    case "failed":
      return (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <circle cx="6" cy="6" r="6" fill="var(--vscode-testing-iconFailed, #f14c4c)" />
          <path d="M4 4l4 4M8 4l-4 4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    default:
      /* pending */
      return (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <circle cx="6" cy="6" r="5" fill="none" stroke="var(--vscode-descriptionForeground, #888)" strokeWidth="1.2" />
        </svg>
      );
  }
};

/** 文件状态标签 */
const FileStatusBadge = ({ status }: { status: FileChange["file_status"] }) => {
  const { t } = useI18n();
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    new: {
      label: t.planFileNew,
      bg: "var(--vscode-gitDecoration-untrackedResourceForeground, #73c991)",
      fg: "#fff",
    },
    modified: {
      label: t.planFileModified,
      bg: "var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d)",
      fg: "#1e1e1e",
    },
    deleted: {
      label: t.planFileDeleted,
      bg: "var(--vscode-gitDecoration-deletedResourceForeground, #c74e39)",
      fg: "#fff",
    },
  };
  const s = map[status] ?? map.modified;
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-[1px] rounded uppercase shrink-0"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/*  PlanView 主体                                                       */
/* ------------------------------------------------------------------ */

const PlanView = ({ plan, isLoading, onValidate, onGenerate }: Props) => {
  const { t } = useI18n();
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Record<number, boolean>>({});

  const handleCopy = (content: string, idx: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const toggleFile = (idx: number) =>
    setExpandedFiles((prev) => ({ ...prev, [idx]: !prev[idx] }));

  return (
    <div className="flex flex-col h-full">
      {/* ── 头部：任务名 + 工作流徽章 ── */}
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2">
        <h2
          className="font-bold text-[var(--vscode-foreground)] leading-snug break-words min-w-0"
          style={{ fontSize: 13 }}
        >
          {plan.task_name}
        </h2>
        <span
          className="shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase"
          style={{
            background: "var(--vscode-badge-background)",
            color: "var(--vscode-badge-foreground)",
          }}
        >
          {plan.workflow}
        </span>
      </div>

      {/* ── 可滚动内容区 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2.5">
        {/* ── 上下文卡片 ── */}
        {plan.problem_context && (
          <ContextCard title={t.planProblemContext} content={plan.problem_context} />
        )}
        {plan.user_experience && (
          <ContextCard title={t.planUserImpact} content={plan.user_experience} />
        )}
        {plan.technical_approach && (
          <ContextCard title={t.planTechnicalApproach} content={plan.technical_approach} />
        )}

        {/* ── 实施步骤时间线 ── */}
        {plan.steps.length > 0 && (
          <div className="mt-1">
            <h3 className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] uppercase mb-2">
              {t.planImplementationSteps}
            </h3>
            <div className="relative pl-5">
              {/* 左侧竖线 */}
              <div
                className="absolute left-[7px] top-[8px] w-[2px] rounded"
                style={{
                  bottom: 8,
                  background: "var(--vscode-panel-border, #3c3c3c)",
                }}
              />

              {plan.steps.map((step, i) => (
                <div key={step.id} className="relative flex gap-2.5 pb-3 last:pb-0">
                  {/* 圆形编号 */}
                  <div
                    className="absolute -left-5 flex items-center justify-center shrink-0 rounded-full text-[9px] font-bold"
                    style={{
                      width: 16,
                      height: 16,
                      background: "var(--vscode-badge-background)",
                      color: "var(--vscode-badge-foreground)",
                      top: 0,
                    }}
                  >
                    {i + 1}
                  </div>

                  {/* 步骤内容 */}
                  <div className="min-w-0 pt-[1px]">
                    <div className="flex items-center gap-1.5">
                      <StepStatusIcon status={step.status} />
                      <span className="text-[11px] font-bold text-[var(--vscode-foreground)] leading-tight">
                        {step.title}
                      </span>
                    </div>
                    {step.description && (
                      <div className="mt-0.5 text-[10px] leading-relaxed text-[var(--vscode-descriptionForeground)]">
                        <Markdown>{step.description}</Markdown>
                      </div>
                    )}
                    {step.dependencies.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {step.dependencies.map((dep) => (
                          <span
                            key={dep}
                            className="text-[8px] px-1.5 py-[1px] rounded-full"
                            style={{
                              background: "var(--vscode-badge-background)",
                              color: "var(--vscode-badge-foreground)",
                              opacity: 0.8,
                            }}
                          >
                            {t.planDependsOn}: {dep}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 文件变更 diff 列表 ── */}
        {plan.file_changes.length > 0 && (
          <div className="mt-1 space-y-1.5">
            <h3 className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] uppercase">
              {t.planFileChanges} ({plan.file_changes.length})
            </h3>
            {plan.file_changes.map((change, idx) => (
              <div
                key={idx}
                className="rounded overflow-hidden"
                style={{ background: "var(--vscode-input-background)" }}
              >
                {/* 文件头 */}
                <div className="flex items-center justify-between px-3 py-1.5 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileStatusBadge status={change.file_status} />
                    <button
                      type="button"
                      className="text-[11px] text-[var(--vscode-foreground)] truncate cursor-pointer hover:underline bg-transparent border-none p-0"
                      onClick={() => toggleFile(idx)}
                      title={change.file_path}
                    >
                      {change.file_path}
                    </button>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {change.file_content && (
                      <button
                        type="button"
                        onClick={() => handleCopy(change.file_content!, idx)}
                        className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded cursor-pointer"
                        style={{
                          background: "var(--vscode-button-secondaryBackground, #3a3d41)",
                          color: "var(--vscode-button-secondaryForeground, #ccc)",
                        }}
                      >
                        {copiedIdx === idx ? (
                          /* 复制成功勾号 */
                          <svg width="10" height="10" viewBox="0 0 10 10">
                            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          /* 复制图标 */
                          <svg width="10" height="10" viewBox="0 0 10 10">
                            <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1" fill="none" />
                            <path d="M7 3V1.5A.5.5 0 006.5 1H1.5a.5.5 0 00-.5.5v5a.5.5 0 00.5.5H3" stroke="currentColor" strokeWidth="1" fill="none" />
                          </svg>
                        )}
                        {copiedIdx === idx ? t.planCopied : t.planCopy}
                      </button>
                    )}
                    {change.file_content && (
                      <button
                        type="button"
                        onClick={() => toggleFile(idx)}
                        className="flex items-center text-[9px] px-1 py-0.5 rounded cursor-pointer"
                        style={{
                          background: "transparent",
                          color: "var(--vscode-descriptionForeground)",
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          className="transition-transform"
                          style={{
                            transform: expandedFiles[idx] ? "rotate(180deg)" : "rotate(0deg)",
                            fill: "currentColor",
                          }}
                        >
                          <path d="M2 3.5l3 4 3-4H2z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* 可展开代码块 */}
                {change.file_content && expandedFiles[idx] && (
                  <pre
                    className="px-3 py-2 text-[10px] leading-relaxed overflow-auto"
                    style={{
                      background: "var(--vscode-editor-background)",
                      borderTop: "1px solid var(--vscode-panel-border, #3c3c3c)",
                      maxHeight: "15rem", /* max-h-60 */
                    }}
                  >
                    <code>{change.file_content}</code>
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── 需要澄清的部分 ── */}
        {plan.clarification && (
          <div
            className="mt-1 p-3 border-l-4 rounded text-[11px]"
            style={{
              background: "var(--vscode-inputValidation-warningBackground, #3d3a1d)",
              borderColor: "var(--vscode-editorWarning-foreground, #cca700)",
            }}
          >
            <div className="font-semibold mb-1 text-[var(--vscode-foreground)]">
              {t.planClarificationNeeded}
            </div>
            <div className="text-[var(--vscode-descriptionForeground)]">
              {plan.clarification.message}
            </div>
            {plan.clarification.questions.length > 0 && (
              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[var(--vscode-descriptionForeground)]">
                {plan.clarification.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── 操作栏 ── */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={onValidate}
            className="flex-1 text-[11px] font-semibold py-1.5 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "var(--vscode-button-secondaryBackground, #3a3d41)",
              color: "var(--vscode-button-secondaryForeground, #ccc)",
              border: "none",
            }}
          >
            {t.planValidate}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onGenerate(plan.workflow)}
            className="flex-1 text-[11px] font-semibold py-1.5 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
              border: "none",
            }}
          >
            {t.planExecute}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanView;
