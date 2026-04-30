import { useState, useMemo } from "react";
import type { HistoryEntry } from "../../types/Homepage";
import { useI18n } from "../../i18n/I18nContext";
import type { Translations } from "../../i18n/locales";

type T = Translations;

interface Props {
  history: HistoryEntry[];
  sendToExtension: (command: string, data?: any) => void;
  onBack?: () => void;
}

/* ---- 工作流 badge 颜色映射（label 由 t.X 注入） ---- */
function makeWorkflowStyle(t: T): Record<string, { bg: string; fg: string; label: string }> {
  return {
    plan: {
      bg: "var(--vscode-charts-blue)",
      fg: "var(--vscode-editor-background)",
      label: t.historyWorkflowPlan,
    },
    review: {
      bg: "var(--vscode-charts-orange)",
      fg: "var(--vscode-editor-background)",
      label: t.historyWorkflowReview,
    },
    refactor: {
      bg: "var(--vscode-charts-purple)",
      fg: "var(--vscode-editor-background)",
      label: t.historyWorkflowRefactor,
    },
  };
}

function statusLabel(status: string, t: T): string {
  switch (status) {
    case "planned": return t.historyStatusPlanned;
    case "validated": return t.historyStatusValidated;
    case "generated": return t.historyStatusGenerated;
    case "needs_revision": return t.historyStatusNeedsRevision;
    default: return status;
  }
}

/* ---- 状态 badge 颜色映射 ---- */
const statusStyle: Record<string, { bg: string; fg: string }> = {
  planned: {
    bg: "rgba(59,130,246,0.15)",
    fg: "var(--vscode-charts-blue)",
  },
  validated: {
    bg: "rgba(34,197,94,0.15)",
    fg: "var(--vscode-charts-green)",
  },
  generated: {
    bg: "rgba(34,197,94,0.10)",
    fg: "var(--vscode-charts-green)",
  },
  needs_revision: {
    bg: "rgba(234,179,8,0.15)",
    fg: "var(--vscode-charts-yellow)",
  },
};

/* ---- 相对时间格式化 ---- */
function relativeTime(iso: string, t: T): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t.historyJustNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${t.historyMinutesAgo}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t.historyHoursAgo}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return t.historyYesterday;
  if (days < 30) return `${days}${t.historyDaysAgo}`;
  const months = Math.floor(days / 30);
  return `${months}${t.historyMonthsAgo}`;
}

const HistoryPanel = ({ history, sendToExtension }: Props) => {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return history;
    const q = search.toLowerCase();
    return history.filter(
      (e) =>
        e.task_name.toLowerCase().includes(q) ||
        e.prompt?.toLowerCase().includes(q)
    );
  }, [history, search]);

  return (
    <div className="flex flex-col h-full">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-[var(--vscode-widget-border)] flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-[var(--vscode-foreground)]">
          {t.historyTitle}
        </h2>
        <button
          onClick={() => sendToExtension("history")}
          title={t.historyRefresh}
          className="px-1.5 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
        >
          {t.historyRefresh}
        </button>
      </div>

      {/* 搜索 */}
      <div className="px-4 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.historyFilterPlaceholder}
          className="w-full px-2 py-1.5 text-[11px] rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
        />
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-4 pb-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
              {history.length === 0
                ? t.historyEmpty
                : t.historyNoMatch}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((entry) => {
              const workflowStyle = makeWorkflowStyle(t);
              const wf = workflowStyle[entry.workflow] ?? {
                bg: "var(--vscode-badge-background)",
                fg: "var(--vscode-badge-foreground)",
                label: entry.workflow,
              };
              const st = statusStyle[entry.status] ?? {
                bg: "rgba(128,128,128,0.12)",
                fg: "var(--vscode-descriptionForeground)",
              };
              const isSelected = selectedId === entry.id;

              return (
                <button
                  key={entry.id}
                  onClick={() =>
                    setSelectedId(isSelected ? null : entry.id)
                  }
                  className={`w-full text-left px-3 py-2 rounded cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[var(--vscode-list-activeSelectionBackground)]"
                      : "bg-[var(--vscode-input-background)] hover:bg-[var(--vscode-list-hoverBackground)]"
                  }`}
                >
                  {/* 第一行：任务名 + 时间 */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-[var(--vscode-foreground)] truncate mr-2">
                      {entry.task_name}
                    </span>
                    <span className="text-[10px] text-[var(--vscode-descriptionForeground)] whitespace-nowrap shrink-0">
                      {relativeTime(entry.created_at, t)}
                    </span>
                  </div>

                  {/* 第二行：badges */}
                  <div className="flex items-center gap-1.5">
                    {/* 工作流 badge */}
                    <span
                      className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: wf.bg,
                        color: wf.fg,
                      }}
                    >
                      {wf.label}
                    </span>
                    {/* 状态 badge */}
                    <span
                      className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: st.bg,
                        color: st.fg,
                      }}
                    >
                      {statusLabel(entry.status, t)}
                    </span>
                  </div>

                  {/* 展开时显示 prompt 摘要 */}
                  {isSelected && entry.prompt && (
                    <div className="mt-2 pt-2 border-t border-[var(--vscode-widget-border)] text-[10px] text-[var(--vscode-descriptionForeground)] leading-relaxed">
                      {entry.prompt}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;
