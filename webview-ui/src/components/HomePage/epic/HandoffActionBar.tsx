import { Play, ShieldCheck } from "lucide-react";
import { Button } from "../../ui/button";
import { useI18n } from "../../../i18n/I18nContext";

/**
 * Traycer 主区底部 absolute 操作条（对应 minified `om`）。
 * 占位实现：Hand off / Verify。具体回调由 EpicDetail 持有 sendToExtension 注入。
 */
interface Props {
  onHandoff?: () => void;
  onVerify?: () => void;
  disabled?: boolean;
}

export default function HandoffActionBar({
  onHandoff,
  onVerify,
  disabled,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] flex items-center gap-2">
      <Button
        variant="default"
        size="sm"
        onClick={onHandoff}
        disabled={disabled}
        className="gap-2"
      >
        <Play className="h-3.5 w-3.5" />
        <span>{t.epicHandoff}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onVerify}
        disabled={disabled}
        className="gap-2"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>{t.epicVerify}</span>
      </Button>
    </div>
  );
}
