import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { getVsCodeApi } from "../../utils/vscode";
import { useI18n } from "../../i18n/I18nContext";

/**
 * CommitScriptsView —— Traycer §F Commit Scripts 子页。
 *
 * 让用户挂自定义 commit 脚本到生命周期事件上：
 *   - after_yolo     —— YOLO 自动 commit 完成时跑
 *   - after_handoff  —— phase handoff 完成时跑
 *   - never          —— 仅手动触发
 *
 * 后端契约：
 *   - request: { command: "commitScripts.add",    payload: CommitScript }
 *   - request: { command: "commitScripts.delete", scriptId }
 *   - request: { command: "commitScripts.list" }（response: commitScripts.list 返回数组）
 */

type TriggerOn = "after_yolo" | "after_handoff" | "never";

interface CommitScript {
  id: string;
  name: string;
  path: string;
  triggerOn: TriggerOn;
}

export default function CommitScriptsView() {
  const { t } = useI18n();
  const TRIGGER_LABELS: Record<TriggerOn, string> = {
    after_yolo: t.commitScriptsTriggerAfterYolo,
    after_handoff: t.commitScriptsTriggerAfterHandoff,
    never: t.commitScriptsTriggerNever,
  };
  const [scripts, setScripts] = useState<CommitScript[]>([]);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [triggerOn, setTriggerOn] = useState<TriggerOn>("after_yolo");

  const canAdd = name.trim().length > 0 && path.trim().length > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    const next: CommitScript = {
      id: `script-${Date.now()}`,
      name: name.trim(),
      path: path.trim(),
      triggerOn,
    };
    setScripts((prev) => [...prev, next]);
    getVsCodeApi().postMessage({ command: "commitScripts.add", payload: next });
    setName("");
    setPath("");
    setTriggerOn("after_yolo");
  };

  const handleDelete = (id: string) => {
    setScripts((prev) => prev.filter((s) => s.id !== id));
    getVsCodeApi().postMessage({ command: "commitScripts.delete", scriptId: id });
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--vscode-foreground)]">{t.settingsTabCommitScripts}</h2>
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">
            {t.commitScriptsDesc}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {scripts.length} {t.commitScriptsConfigured}
        </Badge>
      </header>

      <Separator />

      {/* 添加 form */}
      <div className="p-3 border border-[var(--vscode-panel-border)] rounded-md space-y-2">
        <div className="text-sm font-semibold text-[var(--vscode-foreground)]">{t.commitScriptsAddTitle}</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">{t.commitScriptsName}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.commitScriptsNamePlaceholder}
              className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">{t.commitScriptsPath}</span>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={t.commitScriptsPathPlaceholder}
              className="w-full px-2 py-1.5 text-sm font-mono rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">{t.commitScriptsTriggerOn}</span>
            <select
              value={triggerOn}
              onChange={(e) => setTriggerOn(e.target.value as TriggerOn)}
              className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
            >
              <option value="after_yolo">{TRIGGER_LABELS.after_yolo}</option>
              <option value="after_handoff">{TRIGGER_LABELS.after_handoff}</option>
              <option value="never">{TRIGGER_LABELS.never}</option>
            </select>
          </label>
        </div>

        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={handleAdd} disabled={!canAdd}>
            {t.commitScriptsAdd}
          </Button>
        </div>
      </div>

      {/* 列表 */}
      <div className="space-y-2">
        {scripts.length === 0 ? (
          <div className="p-3 border border-dashed border-[var(--vscode-panel-border)] rounded-md text-sm text-[var(--vscode-descriptionForeground)] text-center">
            {t.commitScriptsEmpty}
          </div>
        ) : (
          scripts.map((s) => (
            <div
              key={s.id}
              className="p-3 border border-[var(--vscode-panel-border)] rounded-md flex items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--vscode-foreground)] truncate">{s.name}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {TRIGGER_LABELS[s.triggerOn]}
                  </Badge>
                </div>
                <div className="mt-1 text-xs font-mono text-[var(--vscode-descriptionForeground)] truncate">
                  {s.path}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}>
                {t.commitScriptsDelete}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
