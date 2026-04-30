import type { Execution, ExecutionStatus } from "../../../types/Homepage";
import { Button } from "../../ui/button";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../i18n/I18nContext";
import type { Translations } from "../../../i18n/locales/en";

/**
 * Execution 列表项（对应 minified `Uu`）。
 * 一行 ghost-Button：状态点 + title + 状态文案。
 *
 * BACKEND agent 提供的 ExecutionStatus 10 态颜色映射：
 *   NOT_STARTED              gray
 *   WAITING_FOR_EXECUTION    blue
 *   IN_PROGRESS              yellow
 *   ABORTING                 orange
 *   COMPLETED                green
 *   SKIPPED                  gray
 *   FAILED                   red
 *   RATE_LIMITED             red
 *   STEP_INSUFFICIENT_CREDITS         red
 *   STEP_ORG_BUNDLE_INSUFFICIENT      red
 *
 * 兼容当前 Homepage.ts 旧枚举（PENDING/RUNNING/VERIFYING/SUCCEEDED/FAILED/CANCELLED）。
 */
interface Props {
  executions: Execution[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

interface StatusVisual {
  dot: string;
  label: string;
}

function statusVisual(status: ExecutionStatus | string, t: Translations): StatusVisual {
  const s = String(status).toUpperCase();

  // Traycer 10 态
  switch (s) {
    case "NOT_STARTED":
      return { dot: "bg-gray-400", label: t.executionStatusNotStarted };
    case "WAITING_FOR_EXECUTION":
      return { dot: "bg-blue-500", label: t.executionStatusWaiting };
    case "IN_PROGRESS":
      return { dot: "bg-yellow-500", label: t.executionStatusInProgress };
    case "ABORTING":
      return { dot: "bg-orange-500", label: t.executionStatusAborting };
    case "COMPLETED":
      return { dot: "bg-green-500", label: t.executionStatusCompleted };
    case "SKIPPED":
      return { dot: "bg-gray-400", label: t.executionStatusSkipped };
    case "FAILED":
      return { dot: "bg-red-500", label: t.executionStatusFailed };
    case "RATE_LIMITED":
      return { dot: "bg-red-500", label: t.executionStatusRateLimited };
    case "STEP_INSUFFICIENT_CREDITS":
      return { dot: "bg-red-500", label: t.executionStatusInsufficientCredits };
    case "STEP_ORG_BUNDLE_INSUFFICIENT":
      return { dot: "bg-red-500", label: t.executionStatusBundleInsufficient };
  }

  // 兼容旧 6 态
  switch (s) {
    case "PENDING":
      return { dot: "bg-gray-400", label: t.executionStatusPending };
    case "RUNNING":
      return { dot: "bg-yellow-500", label: t.executionStatusRunning };
    case "VERIFYING":
      return { dot: "bg-blue-500", label: t.executionStatusVerifying };
    case "SUCCEEDED":
      return { dot: "bg-green-500", label: t.executionStatusSucceeded };
    case "CANCELLED":
      return { dot: "bg-gray-400", label: t.executionStatusCancelled };
  }

  return { dot: "bg-gray-400", label: s.toLowerCase() };
}

export default function ExecutionsList({
  executions,
  selectedId,
  onSelect,
}: Props) {
  const { t } = useI18n();
  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <p className="text-sm text-[var(--vscode-descriptionForeground)]">
          {t.executionsEmpty}
        </p>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mt-1">
          {t.executionsEmptyHint}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {executions.map((exec) => {
        const v = statusVisual(exec.status, t);
        const selected = selectedId === exec.id;
        // Execution 没有 title 字段 → 兜底用 ticket_id
        const title =
          (exec as { title?: string }).title ||
          `${t.executionRunPrefix} ${exec.ticket_id || exec.id.slice(0, 8)}`;
        return (
          <Button
            key={exec.id}
            variant="ghost"
            size="sm"
            onClick={() => onSelect(exec.id)}
            className={cn(
              "w-full justify-start gap-2 px-2 py-1.5 h-auto min-h-6 border border-[var(--vscode-panel-border)] rounded-md",
              selected &&
                "bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)] border-[var(--vscode-focusBorder)]"
            )}
            title={title}
          >
            <span
              aria-hidden
              className={cn(
                "inline-block w-2 h-2 rounded-full shrink-0",
                v.dot
              )}
            />
            <span className="text-sm font-medium truncate flex-1 text-left">
              {title}
            </span>
            <span className="ml-auto text-xs text-[var(--vscode-descriptionForeground)] shrink-0">
              {v.label}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
