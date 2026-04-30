import { useState } from "react";
import type { Epic } from "../../../types/Homepage";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Separator } from "../../ui/separator";
import { useI18n } from "../../../i18n/I18nContext";
import CollapsibleSection from "./CollapsibleSection";
import SpecsList from "./SpecsList";
import TicketsList from "./TicketsList";
import ExecutionsList from "./ExecutionsList";

/**
 * Traycer-style Artifacts 抽屉（对应 minified `tm`）。
 * 头部：标题 "Artifacts" + 总数 Badge + Select 切换。
 * 主体：三段折叠（Specs / Tickets / Executions）。
 *
 * **不分列、不拖拽。**
 */
export type ArtifactKind = "spec" | "ticket" | "execution";

interface Props {
  epic: Epic;
  selected?: { kind: ArtifactKind; id: string } | null;
  onSelect: (kind: ArtifactKind, id: string) => void;
}

export default function ArtifactsPanel({ epic, selected, onSelect }: Props) {
  const { t } = useI18n();
  const [selectionMode, setSelectionMode] = useState(false);
  const total =
    epic.specs.length + epic.tickets.length + epic.executions.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 头部 */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center justify-between truncate">
          <div className="flex items-center gap-1">
            <span className="text-lg font-semibold truncate">{t.artifactsTitle}</span>
            <Badge variant="outline" className="rounded-full">
              {total}
            </Badge>
          </div>
          <Button
            variant={selectionMode ? "destructive" : "secondary"}
            size="sm"
            className="rounded-md gap-2 truncate"
            onClick={() => setSelectionMode((s) => !s)}
          >
            {selectionMode ? t.artifactsCancel : t.artifactsSelect}
          </Button>
        </div>
      </div>
      <Separator />

      {/* 三段折叠 */}
      <div className="flex-1 overflow-auto flex flex-col min-h-0">
        <CollapsibleSection
          title={t.artifactsSpecs}
          count={epic.specs.length}
          defaultOpen
        >
          <SpecsList
            specs={epic.specs}
            selectedId={selected?.kind === "spec" ? selected.id : null}
            onSelect={(id) => onSelect("spec", id)}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title={t.artifactsTickets}
          count={epic.tickets.length}
          defaultOpen
        >
          <TicketsList
            tickets={epic.tickets}
            selectedId={selected?.kind === "ticket" ? selected.id : null}
            onSelect={(id) => onSelect("ticket", id)}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title={t.artifactsExecutions}
          count={epic.executions.length}
        >
          <ExecutionsList
            executions={epic.executions}
            selectedId={selected?.kind === "execution" ? selected.id : null}
            onSelect={(id) => onSelect("execution", id)}
          />
        </CollapsibleSection>
      </div>
    </div>
  );
}
