import type { ValidationResult, ValidationComment, Severity } from "../../types/Homepage";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  result: ValidationResult;
  isLoading: boolean;
  onGenerate: () => void;
  onReValidate?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Markdown 描述渲染（与 PlanView 同款紧凑样式）                       */
/* ------------------------------------------------------------------ */

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
/*  Severity 主题（颜色 + 标签 + 圆点）                                  */
/* ------------------------------------------------------------------ */

const SEVERITY_THEME: Record<
  Severity,
  { color: string; bg: string }
> = {
  MINOR: {
    color: "var(--vscode-editorWarning-foreground, #cca700)",
    bg: "rgba(204, 167, 0, 0.08)",
  },
  MAJOR: {
    color: "var(--vscode-editorWarning-foreground, #d18616)",
    bg: "rgba(209, 134, 22, 0.10)",
  },
  CRITICAL: {
    color: "var(--vscode-errorForeground, #f14c4c)",
    bg: "rgba(241, 76, 76, 0.10)",
  },
};

/* ------------------------------------------------------------------ */
/*  SVG 指示符                                                          */
/* ------------------------------------------------------------------ */

const CheckCircle = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="12" fill="var(--vscode-testing-iconPassed, #73c991)" />
    <path
      d="M7 12l3.5 3.5L17 9"
      stroke="#fff"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const XCircle = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="12" fill="var(--vscode-testing-iconFailed, #f14c4c)" />
    <path
      d="M8 8l8 8M16 8l-8 8"
      stroke="#fff"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const SeverityDot = ({ severity }: { severity: Severity }) => {
  const theme = SEVERITY_THEME[severity];
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: 8, height: 8, background: theme.color }}
    />
  );
};

const CopyIcon = ({ copied }: { copied: boolean }) =>
  copied ? (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path
        d="M2 5l2.5 2.5L8 3"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1" fill="none" />
      <path
        d="M7 3V1.5A.5.5 0 006.5 1H1.5a.5.5 0 00-.5.5v5a.5.5 0 00.5.5H3"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );

/* ------------------------------------------------------------------ */
/*  工具函数                                                            */
/* ------------------------------------------------------------------ */

const buildFixPrompt = (comment: ValidationComment) => {
  const files = comment.referred_files.length > 0
    ? `\n\nReferred files:\n${comment.referred_files.map((f) => `- ${f}`).join("\n")}`
    : "";
  return [
    `Please fix the following ${comment.severity} issue identified during plan validation:`,
    "",
    `## ${comment.title}`,
    "",
    comment.description,
    files,
  ].join("\n");
};

const buildAllFixesPrompt = (result: ValidationResult) => {
  if (result.prompt_for_ai_agent) return result.prompt_for_ai_agent;
  const issues = result.comments
    .map(
      (c, i) =>
        `### ${i + 1}. [${c.severity}] ${c.title}\n${c.description}${
          c.referred_files.length > 0
            ? `\n\nReferred files:\n${c.referred_files.map((f) => `- ${f}`).join("\n")}`
            : ""
        }`,
    )
    .join("\n\n");
  return [
    "Please address the following issues identified during plan validation:",
    "",
    issues,
  ].join("\n");
};

/* ------------------------------------------------------------------ */
/*  评论卡片                                                            */
/* ------------------------------------------------------------------ */

const CommentCard = ({ comment }: { comment: ValidationComment }) => {
  const { t } = useI18n();
  const theme = SEVERITY_THEME[comment.severity] ?? SEVERITY_THEME.MINOR;
  const severityLabel: Record<Severity, string> = {
    MINOR: t.validationSeverityMinor,
    MAJOR: t.validationSeverityMajor,
    CRITICAL: t.validationSeverityCritical,
  };
  const [copied, setCopied] = useState(false);

  const handleCopyFix = () => {
    navigator.clipboard.writeText(buildFixPrompt(comment)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="rounded border-l-[3px]"
      style={{
        borderColor: theme.color,
        background: theme.bg,
      }}
    >
      <div className="px-3 py-2 space-y-1.5">
        {/* Severity 徽章 + 标题 */}
        <div className="flex items-center gap-2">
          <SeverityDot severity={comment.severity} />
          <span
            className="text-[9px] font-bold uppercase tracking-wide"
            style={{ color: theme.color }}
          >
            {severityLabel[comment.severity]}
          </span>
          <span className="text-[11px] font-bold text-[var(--vscode-foreground)] leading-tight flex-1">
            {comment.title}
          </span>
        </div>

        {/* 描述（Markdown） */}
        {comment.description && (
          <div className="text-[10px] leading-relaxed text-[var(--vscode-descriptionForeground)]">
            <Markdown>{comment.description}</Markdown>
          </div>
        )}

        {/* 引用文件 */}
        {comment.referred_files.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {comment.referred_files.map((f, i) => (
              <span
                key={i}
                className="text-[9px] font-mono px-1.5 py-[1px] rounded cursor-pointer truncate max-w-full"
                style={{
                  background: "var(--vscode-textBlockQuote-background)",
                  color: "var(--vscode-textLink-foreground)",
                  border: "1px solid var(--vscode-panel-border, #3c3c3c)",
                }}
                title={f}
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Copy Fix Prompt */}
        <div className="flex justify-end pt-0.5">
          <button
            type="button"
            onClick={handleCopyFix}
            className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded cursor-pointer"
            style={{
              background: "var(--vscode-button-secondaryBackground, #3a3d41)",
              color: "var(--vscode-button-secondaryForeground, #ccc)",
              border: "none",
            }}
          >
            <CopyIcon copied={copied} />
            {copied ? t.validationCopied : t.validationCopyFixPrompt}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  ValidationView 主体                                                 */
/* ------------------------------------------------------------------ */

const ValidationView = ({
  result,
  isLoading,
  onGenerate,
  onReValidate,
}: Props) => {
  const { t } = useI18n();
  const [copiedAll, setCopiedAll] = useState(false);

  const scorePct = Math.round(result.score * 100);
  const scoreColor = useMemo(() => {
    if (scorePct > 80) return "var(--vscode-testing-iconPassed, #73c991)";
    if (scorePct >= 60) return "var(--vscode-editorWarning-foreground, #cca700)";
    return "var(--vscode-testing-iconFailed, #f14c4c)";
  }, [scorePct]);

  const handleCopyAll = () => {
    navigator.clipboard.writeText(buildAllFixesPrompt(result)).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── 可滚动主区 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-3 space-y-2.5">
        {/* ── 头部卡片：通过/失败 + 评分进度条 ── */}
        <div
          className="rounded p-3 flex items-center gap-3"
          style={{
            background: "var(--vscode-input-background)",
            border: "1px solid var(--vscode-panel-border, #3c3c3c)",
          }}
        >
          {result.passed ? <CheckCircle /> : <XCircle />}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-bold text-[var(--vscode-foreground)]">
                {result.passed ? t.validationValidated : t.validationIssuesFound}
              </span>
              <span
                className="text-[11px] font-bold tabular-nums"
                style={{ color: scoreColor }}
              >
                {scorePct}%
              </span>
            </div>
            {/* 评分进度条 */}
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--vscode-progressBar-background, #2d2d2d)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(0, Math.min(100, scorePct))}%`,
                  background: scoreColor,
                }}
              />
            </div>
          </div>
        </div>

        {/* ── 评论列表 ── */}
        {result.comments.length > 0 ? (
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] uppercase">
              {t.validationFindings} ({result.comments.length})
            </h3>
            {result.comments.map((comment) => (
              <CommentCard key={comment.id} comment={comment} />
            ))}
          </div>
        ) : (
          <div
            className="rounded p-3 text-center text-[11px] text-[var(--vscode-descriptionForeground)]"
            style={{
              background: "var(--vscode-input-background)",
              border: "1px solid var(--vscode-panel-border, #3c3c3c)",
            }}
          >
            {t.validationNoIssues}
          </div>
        )}
      </div>

      {/* ── 底部 sticky 操作栏 ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{
          background: "var(--vscode-sideBar-background, var(--vscode-editor-background))",
          borderTop: "1px solid var(--vscode-panel-border, #3c3c3c)",
        }}
      >
        {onReValidate && (
          <button
            type="button"
            onClick={onReValidate}
            disabled={isLoading}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "var(--vscode-button-secondaryBackground, #3a3d41)",
              color: "var(--vscode-button-secondaryForeground, #ccc)",
              border: "none",
            }}
          >
            {t.validationReValidate}
          </button>
        )}

        {result.comments.length > 0 && (
          <button
            type="button"
            onClick={handleCopyAll}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded cursor-pointer"
            style={{
              background: "transparent",
              color: "var(--vscode-descriptionForeground)",
              border: "1px solid var(--vscode-panel-border, #3c3c3c)",
            }}
          >
            <CopyIcon copied={copiedAll} />
            {copiedAll ? t.validationCopied : t.validationCopyAllFixes}
          </button>
        )}

        {result.passed && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={isLoading}
            className="flex-1 text-[11px] font-semibold py-1.5 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
              border: "none",
            }}
          >
            {isLoading ? t.validationExecuting : t.validationExecutePlan}
          </button>
        )}
      </div>
    </div>
  );
};

export default ValidationView;
