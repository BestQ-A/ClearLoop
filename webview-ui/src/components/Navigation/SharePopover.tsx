import * as React from "react";
import { Share2 } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

/**
 * Traycer `SharePopover` 占位实现。
 * 见 TRAYCER_UI_TEARDOWN.md A 节 "SharePopover" 行。
 *
 * 注：完整版应基于 @radix-ui/react-popover；当前依赖未装，先用受控
 * 绝对定位面板做最小可用版（不破坏 build），后续可无痛替换为 Radix Popover。
 */
export interface SharePopoverProps {
  onCopyLink?: () => void;
}

export function SharePopover({ onCopyLink }: SharePopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  // 点击外部关闭
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleCopy = () => {
    onCopyLink?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant="outline"
        size="icon"
        aria-label="Share epic"
        title="Share epic"
        onClick={() => setOpen((v) => !v)}
        className="size-7 rounded-md border border-border"
      >
        <Share2 className="size-4" />
      </Button>
      {open && (
        <div
          role="dialog"
          className={cn(
            "absolute right-0 top-[calc(100%+8px)] z-20 w-64 rounded-lg border border-border p-3",
            "bg-[var(--vscode-editor-background)] shadow-lg"
          )}
        >
          <div className="text-xs font-semibold mb-2">Share epic</div>
          <div className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-2">
            Copy invite link to share this epic.
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            className="w-full"
          >
            {copied ? "Copied!" : "Copy invite link"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default SharePopover;
