import { SquareArrowOutUpRight } from "lucide-react";
import { Button } from "../ui/button";

/**
 * Traycer `OpenBoardBadgeButton`。
 * 见 TRAYCER_UI_TEARDOWN.md A 节右侧工具区表格行。
 */
export interface OpenBoardBadgeButtonProps {
  onClick?: () => void;
}

export function OpenBoardBadgeButton({ onClick }: OpenBoardBadgeButtonProps) {
  return (
    <Button
      variant="default"
      size="sm"
      onClick={onClick}
      className="shrink-0 border-border border rounded-md gap-1 px-1"
    >
      <SquareArrowOutUpRight className="size-2" />
      <span className="text-sm">Open Board</span>
    </Button>
  );
}

export default OpenBoardBadgeButton;
