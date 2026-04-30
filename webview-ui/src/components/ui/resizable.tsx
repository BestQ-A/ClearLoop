import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator as RrpSeparator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps as RrpSeparatorProps,
} from "react-resizable-panels";
import { cn } from "../../lib/utils";

/**
 * shadcn/ui Resizable —— 基于 react-resizable-panels v4。
 * v4 API：`Group` / `Panel` / `Separator`（v2 旧名 PanelGroup/PanelResizeHandle 已移除）。
 * 用于 Epic Board 主区/Artifacts 抽屉两栏布局。
 */
export type ResizablePanelGroupProps = GroupProps;
export const ResizablePanelGroup = ({ className, ...props }: ResizablePanelGroupProps) => (
  <Group
    className={cn(
      "flex h-full w-full data-[orientation=vertical]:flex-col",
      className
    )}
    {...props}
  />
);

export type ResizablePanelProps = PanelProps;
export const ResizablePanel = ({ className, ...props }: ResizablePanelProps) => (
  <Panel className={cn("flex flex-col min-h-0 min-w-0", className as string)} {...props} />
);

export interface ResizableHandleProps extends RrpSeparatorProps {
  withHandle?: boolean;
  className?: string;
}

export const ResizableHandle = ({ withHandle, className, ...props }: ResizableHandleProps) => (
  <RrpSeparator
    className={cn(
      "relative flex w-px items-center justify-center bg-[var(--vscode-panel-border,var(--vscode-input-border))]",
      "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vscode-focusBorder)]",
      "data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full",
      "data-[orientation=vertical]:after:left-0 data-[orientation=vertical]:after:h-1 data-[orientation=vertical]:after:w-full data-[orientation=vertical]:after:translate-x-0 data-[orientation=vertical]:after:-translate-y-1/2",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-[var(--vscode-panel-border,var(--vscode-input-border))] bg-[var(--vscode-editor-background)]">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </RrpSeparator>
);
