import { Plus } from "lucide-react";
import type { Epic } from "../../types/Homepage";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useI18n } from "../../i18n/I18nContext";

/**
 * Traycer Epic 列表（路由 `/history` 类比的 picker）。
 *
 * **不是 Kanban**——Traycer 的 Epic 列表是简单的纵向列表，每行点击后进入 EpicDetail。
 * 此前 dnd-kit + 5 列 Kanban + EpicStatus 全部推翻。
 */
interface Props {
  epics: Epic[];
  onSelectEpic: (epic: Epic) => void;
  onCreateEpic: () => void;
  // 保持向后兼容签名（Homepage.tsx 仍传入）
  sendToExtension: (cmd: string, data?: unknown) => void;
}

export default function EpicBoard({ epics, onSelectEpic, onCreateEpic }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--vscode-panel-border)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{t.epicBoardTitle}</span>
          <Badge variant="outline" className="rounded-full">
            {epics.length}
          </Badge>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={onCreateEpic}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{t.epicNewEpic}</span>
        </Button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-auto p-2">
        {epics.length === 0 && (
          <div className="text-center text-sm text-[var(--vscode-descriptionForeground)] mt-8">
            {t.epicNoEpicsTitle} {t.epicNoEpicsHint}{" "}
            <span className="font-medium">{t.epicNoEpicsAction}</span>{" "}
            {t.epicNoEpicsTail}
          </div>
        )}

        <div className="flex flex-col gap-1">
          {epics.map((epic) => (
            <Button
              key={epic.id}
              variant="ghost"
              onClick={() => onSelectEpic(epic)}
              className="w-full justify-start gap-2 px-3 py-2 h-auto"
              title={epic.title}
            >
              <div className="flex flex-col items-start truncate w-full text-left">
                <span className="font-medium truncate w-full">
                  {epic.title}
                </span>
                {epic.description && (
                  <span className="text-xs text-[var(--vscode-descriptionForeground)] truncate w-full">
                    {epic.description}
                  </span>
                )}
                <div className="flex items-center gap-2 text-xs mt-1 text-[var(--vscode-descriptionForeground)]">
                  <span>
                    {epic.specs.length}{" "}
                    {epic.specs.length === 1 ? t.epicSpecCount : t.epicSpecsCount}
                  </span>
                  <span>·</span>
                  <span>
                    {epic.tickets.length}{" "}
                    {epic.tickets.length === 1 ? t.epicTicketCount : t.epicTicketsCount}
                  </span>
                  <span>·</span>
                  <span>
                    {epic.executions.length}{" "}
                    {epic.executions.length === 1 ? t.epicRunCount : t.epicRunsCount}
                  </span>
                </div>
              </div>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
