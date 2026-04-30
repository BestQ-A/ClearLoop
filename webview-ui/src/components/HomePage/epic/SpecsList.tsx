import { FileText, Layers, Boxes, FileCode } from "lucide-react";
import type { Spec, SpecType } from "../../../types/Homepage";
import { Button } from "../../ui/button";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../i18n/I18nContext";

/**
 * Spec 列表项（对应 minified `Bu`）。
 * 一行 ghost-Button：spec_type 图标 + title + updatedAt 时间。
 */
interface Props {
  specs: Spec[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

const specTypeIcon: Record<SpecType, typeof FileText> = {
  prd: FileText,
  technical: FileCode,
  architecture: Layers,
  custom: Boxes,
};

function formatUpdated(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

export default function SpecsList({ specs, selectedId, onSelect }: Props) {
  const { t } = useI18n();
  if (specs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <FileText className="h-10 w-10 text-[var(--vscode-descriptionForeground)] mb-3" />
        <p className="text-sm text-[var(--vscode-descriptionForeground)]">
          {t.specsEmpty}
        </p>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mt-1">
          {t.specsEmptyHint}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {specs.map((spec) => {
        const Icon = specTypeIcon[spec.spec_type] ?? FileText;
        const selected = selectedId === spec.id;
        return (
          <Button
            key={spec.id}
            variant="ghost"
            size="sm"
            onClick={() => onSelect(spec.id)}
            className={cn(
              "w-full justify-start gap-2 px-2 py-1.5 h-auto min-h-6",
              selected &&
                "bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]"
            )}
            title={spec.title}
          >
            <Icon className="h-4 w-4 shrink-0 text-[var(--vscode-foreground)]" />
            <span className="text-sm font-medium truncate flex-1 text-left">
              {spec.title}
            </span>
            <span className="ml-auto text-xs text-[var(--vscode-descriptionForeground)] shrink-0">
              {formatUpdated(spec.updated_at)}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
