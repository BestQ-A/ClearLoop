import { useState } from "react";
import { ChevronLeft, Share2, MessageSquare, History, Bell } from "lucide-react";
import type { Epic } from "../../types/Homepage";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "../ui/resizable";
import { Button } from "../ui/button";
import ArtifactsPanel, { type ArtifactKind } from "./epic/ArtifactsPanel";
import HandoffActionBar from "./epic/HandoffActionBar";
import { useI18n } from "../../i18n/I18nContext";

/**
 * Traycer Epic 详情视图（对应 minified `im` EpicLayout）。
 *
 * 布局：
 *   - 顶部 fixed Header（Back + 标题 + Share/Open Chat/History/Bell 占位）
 *   - 主体 ResizablePanelGroup（左主区 80% + 右 Artifacts 抽屉 20%，autoSave="epic-view-layout"）
 *
 * **关键**：
 *   - Header 不带 status badge（Traycer Epic 无 status）
 *   - 没有 Tab、没有 Kanban、没有 dnd-kit
 *   - Artifacts 是三段折叠列表（Specs / Tickets / Executions）
 */
interface Props {
  epic: Epic;
  onBack: () => void;
  sendToExtension: (cmd: string, data?: unknown) => void;
  embedded?: boolean;
}

export default function EpicDetail({ epic, onBack, sendToExtension, embedded = false }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<{
    kind: ArtifactKind;
    id: string;
  } | null>(null);

  const handleHandoff = () => {
    const ticketId = selected?.kind === "ticket" ? selected.id : epic.tickets[0]?.id;
    if (!ticketId) return;
    sendToExtension("startExecution", { epic_id: epic.id, ticket_id: ticketId });
  };
  const handleVerify = () => {
    sendToExtension("verifyEpic", { epic_id: epic.id });
  };

  // 选中的 artifact 详情（占位渲染——具体 markdown / log 由后续 PR 接入）
  const renderSelected = () => {
    if (!selected) {
      return (
        <div className="text-sm text-[var(--vscode-descriptionForeground)]">
          {t.epicSelectArtifact}
        </div>
      );
    }
    if (selected.kind === "spec") {
      const spec = epic.specs.find((s) => s.id === selected.id);
      if (!spec) return null;
      return (
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-bold truncate">{spec.title}</h2>
            <div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">
              {spec.spec_type} · {t.specUpdated}{" "}
              {spec.updated_at
                ? new Date(spec.updated_at).toLocaleString()
                : "—"}
            </div>
          </div>
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
            {spec.content || t.specEmptyContent}
          </pre>
        </div>
      );
    }
    if (selected.kind === "ticket") {
      const ticket = epic.tickets.find((t) => t.id === selected.id);
      if (!ticket) return null;
      return (
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-bold truncate">{ticket.title}</h2>
            <div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">
              {String(ticket.status)}
            </div>
          </div>
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
            {ticket.description || t.ticketNoDescription}
          </pre>
        </div>
      );
    }
    if (selected.kind === "execution") {
      const exec = epic.executions.find((e) => e.id === selected.id);
      if (!exec) return null;
      return (
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-bold truncate">
              {t.executionTitlePrefix} {exec.id.slice(0, 8)}
            </h2>
            <div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">
              {String(exec.status)} · {t.executionAgentLabel}: {exec.agent}
            </div>
          </div>
          <div className="text-sm text-[var(--vscode-descriptionForeground)]">
            {t.executionDetailFollowup}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full flex flex-col relative">
      {!embedded && (
        <div className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--vscode-panel-border)] py-1.5 px-4 flex items-center gap-2 w-full justify-between min-h-10 bg-[var(--vscode-editor-background)]">
          <Button
            variant="outline"
            size="icon"
            onClick={onBack}
            className="rounded-md size-7"
            aria-label={t.commonBack}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-semibold truncate first-letter:capitalize flex-1 ml-2">
            {epic.title}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-md size-7"
              aria-label={t.navShare}
              onClick={() => sendToExtension("shareEpic", { epic_id: epic.id })}
            >
              <Share2 className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-md gap-1.5"
              onClick={() => sendToExtension("openEpicChat", { epic_id: epic.id })}
            >
              <MessageSquare className="size-3.5" />
              <span className="text-sm">{t.epicOpenChat}</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-md size-7"
              aria-label={t.navHistory}
              onClick={() => sendToExtension("openHistory")}
            >
              <History className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-md size-7"
              aria-label={t.navNotifications}
              onClick={() => sendToExtension("openNotifications")}
            >
              <Bell className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 主体：左 80% + 右 20% */}
      <div
        className="flex-1 overflow-hidden relative"
        style={{ marginTop: embedded ? 0 : "2.5rem" }}
      >
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="epic-view-layout"
        >
          <ResizablePanel defaultSize={80} minSize={50}>
            <div className="flex-1 overflow-auto p-3 relative h-full pb-16">
              {renderSelected()}
              <HandoffActionBar
                onHandoff={handleHandoff}
                onVerify={handleVerify}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={20} minSize={10}>
            <ArtifactsPanel
              epic={epic}
              selected={selected}
              onSelect={(kind, id) => setSelected({ kind, id })}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
