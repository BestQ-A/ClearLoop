import type { Ticket, TicketStatus } from "../../../types/Homepage";
import { Button } from "../../ui/button";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../i18n/I18nContext";
import type { Translations } from "../../../i18n/locales/en";

/**
 * Ticket 列表项（对应 minified `Yu` / `Xu`）。
 * 一行 ghost-Button：状态点 + title + 状态文案。
 *
 * 状态为 BACKEND agent 提供的 3 态枚举：
 *   TICKET_TODO / TICKET_IN_PROGRESS / TICKET_DONE
 * 兼容当前 Homepage.ts 中的旧字符串（TODO/IN_PROGRESS/DONE 等）。
 */
interface Props {
  tickets: Ticket[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

interface StatusVisual {
  dot: string;
  label: string;
}

function statusVisual(status: TicketStatus | string, t: Translations): StatusVisual {
  const s = String(status).toUpperCase();
  if (s.includes("DONE")) {
    return { dot: "bg-green-500", label: t.ticketStatusDone };
  }
  if (s.includes("IN_PROGRESS") || s.includes("PROGRESS")) {
    return { dot: "bg-yellow-500", label: t.ticketStatusInProgress };
  }
  // TODO / 其他兜底
  return { dot: "bg-[var(--vscode-descriptionForeground)] opacity-60", label: t.ticketStatusTodo };
}

export default function TicketsList({ tickets, selectedId, onSelect }: Props) {
  const { t } = useI18n();
  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <p className="text-sm text-[var(--vscode-descriptionForeground)]">
          {t.ticketsEmpty}
        </p>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mt-1">
          {t.ticketsEmptyHint}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {tickets.map((ticket) => {
        const v = statusVisual(ticket.status, t);
        const selected = selectedId === ticket.id;
        return (
          <Button
            key={ticket.id}
            variant="ghost"
            size="sm"
            onClick={() => onSelect(ticket.id)}
            className={cn(
              "w-full justify-start gap-2 px-2 py-1.5 h-auto min-h-6",
              selected &&
                "bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]"
            )}
            title={ticket.title}
          >
            <span
              aria-hidden
              className={cn(
                "inline-block w-2 h-2 rounded-full shrink-0",
                v.dot
              )}
            />
            <span className="text-sm font-medium truncate flex-1 text-left">
              {ticket.title}
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
