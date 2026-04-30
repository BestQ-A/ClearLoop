import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * 极简 ScrollArea —— 仅 overflow-auto 包装。
 * VS Code webview 已有原生滚动条样式（var(--vscode-scrollbarSlider-*)），无需 Radix。
 */
export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "vertical" | "horizontal" | "both";
}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, orientation = "vertical", ...props }, ref) => {
    const overflowClass =
      orientation === "horizontal"
        ? "overflow-x-auto overflow-y-hidden"
        : orientation === "both"
        ? "overflow-auto"
        : "overflow-y-auto overflow-x-hidden";
    return (
      <div
        ref={ref}
        className={cn("relative h-full w-full", overflowClass, className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ScrollArea.displayName = "ScrollArea";

export interface ScrollBarProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "vertical" | "horizontal";
}

/** Radix 兼容 placeholder——VS Code 原生滚动条已存在，留空即可。 */
export const ScrollBar = React.forwardRef<HTMLDivElement, ScrollBarProps>(() => null);
ScrollBar.displayName = "ScrollBar";
