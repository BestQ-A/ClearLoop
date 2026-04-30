import { useState } from "react";
import type { VerificationThread, VerificationCommentFull, Severity, ReviewCategory, ThreadStatus } from "../../types/Homepage";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  threads: VerificationThread[];
  overallPassed: boolean;
  overallScore: number;
  promptForAgent: string;
  isLoading: boolean;
  onReVerify: () => void;
  onResolveComment: (threadId: string, commentId: string) => void;
  onCopyPrompt: () => void;
}

const severityColors: Record<Severity, { border: string; bg: string; text: string }> = {
  MINOR: { border: "border-yellow-500", bg: "bg-yellow-500/10", text: "text-yellow-400" },
  MAJOR: { border: "border-orange-500", bg: "bg-orange-500/10", text: "text-orange-400" },
  CRITICAL: { border: "border-red-500", bg: "bg-red-500/10", text: "text-red-400" },
};

const severityBadge: Record<Severity, string> = {
  MINOR: "bg-yellow-600 text-white",
  MAJOR: "bg-orange-600 text-white",
  CRITICAL: "bg-red-600 text-white",
};

const categoryColors: Record<ReviewCategory, string> = {
  BUG: "bg-red-500/20 text-red-400",
  SECURITY: "bg-purple-500/20 text-purple-400",
  PERFORMANCE: "bg-blue-500/20 text-blue-400",
  CLARITY: "bg-cyan-500/20 text-cyan-400",
  ARCHITECTURE: "bg-indigo-500/20 text-indigo-400",
};

const threadStatusStyle: Record<ThreadStatus, { dot: string }> = {
  open: { dot: "bg-red-500" },
  resolved: { dot: "bg-green-500" },
};

const EnhancedVerificationView = ({
  threads,
  overallPassed,
  overallScore,
  promptForAgent,
  isLoading,
  onReVerify,
  onResolveComment,
  onCopyPrompt,
}: Props) => {
  const { t } = useI18n();
  const threadStatusLabel: Record<ThreadStatus, string> = {
    open: t.verificationOpen,
    resolved: t.verificationResolved,
  };
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    new Set(threads.filter((t) => t.status === "open").map((t) => t.id))
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleThread = (threadId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  };

  const handleCopyCommentPrompt = (comment: VerificationCommentFull) => {
    navigator.clipboard.writeText(comment.prompt_for_ai_agent).then(() => {
      setCopiedId(comment.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleCopyAllPrompts = () => {
    const allPrompts = threads
      .flatMap((t) => t.comments)
      .filter((c) => !c.is_applied)
      .map((c) => c.prompt_for_ai_agent)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(allPrompts).then(() => {
      setCopiedId("all");
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const totalComments = threads.reduce((acc, t) => acc + t.comments.length, 0);
  const unresolvedCount = threads.filter((t) => t.status === "open").length;

  return (
    <div className="flex flex-col h-full">
      {/* Overall status bar */}
      <div className="px-3 pt-3 pb-2 border-b border-[var(--vscode-panel-border)] shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-sm font-bold text-[var(--vscode-foreground)]">{t.verificationTitle}</h2>
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${
            overallPassed
              ? "bg-green-600/20 text-green-400 border border-green-500"
              : "bg-red-600/20 text-red-400 border border-red-500"
          }`}>
            {overallPassed ? t.verificationPassed : t.verificationFailed} {(overallScore * 100).toFixed(0)}%
          </div>
        </div>
        <div className="flex items-center gap-3 text-[9px] text-[var(--vscode-descriptionForeground)]">
          <span>{threads.length} {threads.length !== 1 ? t.verificationThreads : t.verificationThread}</span>
          <span>{totalComments} {totalComments !== 1 ? t.verificationComments : t.verificationComment}</span>
          {unresolvedCount > 0 && (
            <span className="text-red-400 font-semibold">{unresolvedCount} {t.verificationUnresolved}</span>
          )}
        </div>

        {/* Score bar */}
        <div className="mt-2 w-full h-1.5 bg-[var(--vscode-input-background)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              overallPassed ? "bg-green-500" : "bg-red-500"
            }`}
            style={{ width: `${overallScore * 100}%` }}
          />
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
        {threads.length === 0 ? (
          <div className="text-center py-8 text-[10px] text-[var(--vscode-descriptionForeground)]">
            {isLoading ? t.verificationRunning : t.verificationNoThreads}
          </div>
        ) : (
          threads.map((thread) => {
            const isExpanded = expandedThreads.has(thread.id);
            const style = threadStatusStyle[thread.status];

            return (
              <div
                key={thread.id}
                className="border border-[var(--vscode-panel-border)] rounded overflow-hidden"
              >
                {/* Thread header */}
                <button
                  onClick={() => toggleThread(thread.id)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[var(--vscode-input-background)] cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                      {isExpanded ? "v" : ">"}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot} inline-block`} />
                    <span className="text-[10px] font-semibold text-[var(--vscode-foreground)]">
                      {t.verificationThreadHeader} ({thread.comments.length} {thread.comments.length !== 1 ? t.verificationComments : t.verificationComment})
                    </span>
                  </div>
                  <span className="text-[9px] text-[var(--vscode-descriptionForeground)]">
                    {threadStatusLabel[thread.status]}
                  </span>
                </button>

                {/* Thread comments */}
                {isExpanded && (
                  <div className="border-t border-[var(--vscode-panel-border)] space-y-0">
                    {thread.comments.map((comment) => {
                      const sev = severityColors[comment.severity];
                      return (
                        <div
                          key={comment.id}
                          className={`p-2.5 border-l-4 ${sev.border} ${sev.bg} ${
                            comment.is_applied ? "opacity-50" : ""
                          }`}
                        >
                          {/* Title + badges */}
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-semibold text-[var(--vscode-foreground)]">
                                {comment.title}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${severityBadge[comment.severity]}`}>
                                {comment.severity}
                              </span>
                              <span className={`text-[8px] font-semibold px-1 py-0.5 rounded ${categoryColors[comment.category]}`}>
                                {comment.category}
                              </span>
                            </div>
                          </div>

                          {/* Description */}
                          <div className="text-[10px] text-[var(--vscode-descriptionForeground)] leading-relaxed mb-1.5">
                            {comment.description}
                          </div>

                          {/* Referred files */}
                          {comment.referred_files.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mb-1.5">
                              {comment.referred_files.map((f, i) => (
                                <span
                                  key={i}
                                  className="text-[9px] px-1 py-0.5 rounded bg-[var(--vscode-textBlockQuote-background)] text-[var(--vscode-textLink-foreground)] cursor-pointer hover:underline"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Applied indicator */}
                          {comment.is_applied && (
                            <div className="flex items-center gap-1 mb-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                              <span className="text-[9px] text-green-400 font-semibold">{t.verificationApplied}</span>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 mt-1">
                            <button
                              onClick={() => handleCopyCommentPrompt(comment)}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] cursor-pointer hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
                            >
                              {copiedId === comment.id ? t.verificationCopied : t.verificationCopyFixPrompt}
                            </button>
                            {!comment.is_applied && (
                              <button
                                onClick={() => onResolveComment(thread.id, comment.id)}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] cursor-pointer hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
                              >
                                {t.verificationMarkResolved}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* AI Agent Prompt block */}
        {promptForAgent && (
          <div className="p-2.5 bg-[var(--vscode-textBlockQuote-background)] rounded border border-[var(--vscode-panel-border)]">
            <h4 className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] uppercase mb-1">
              {t.verificationCombinedPrompt}
            </h4>
            <p className="text-[10px] text-[var(--vscode-foreground)] leading-relaxed line-clamp-4">
              {promptForAgent}
            </p>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 px-3 py-2 border-t border-[var(--vscode-panel-border)] flex gap-1.5">
        <button
          onClick={onReVerify}
          disabled={isLoading}
          className="flex-1 px-2 py-1.5 text-[10px] font-semibold rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] cursor-pointer hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-40 transition-colors"
        >
          {isLoading ? t.verificationVerifying : t.verificationReVerify}
        </button>
        <button
          onClick={handleCopyAllPrompts}
          className="px-2 py-1.5 text-[10px] rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] cursor-pointer hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
        >
          {copiedId === "all" ? t.verificationCopied : t.verificationCopyAllFixes}
        </button>
        <button
          onClick={onCopyPrompt}
          className="px-2 py-1.5 text-[10px] rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] cursor-pointer hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
        >
          {t.verificationExportToAgent}
        </button>
      </div>
    </div>
  );
};

export default EnhancedVerificationView;
