import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * Traycer `IconButton$1` 复刻。
 * 来源：TRAYCER_UI_TEARDOWN.md A 节 "IconButton base definition"。
 *
 * className 串严格 verbatim，不要改。
 */
export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  ariaLabel: string;
  /** 原 Traycer 把 title 字符串传给 TooltipWrapper；这里直接落到 native title */
  title?: string;
  isBordered?: boolean;
  isActive?: boolean;
  isDisabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      ariaLabel,
      title,
      isBordered = false,
      isActive = false,
      isDisabled = false,
      className,
      children,
      onClick,
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        title={title}
        disabled={isDisabled}
        onClick={isDisabled ? undefined : onClick}
        className={cn(
          "group p-1 rounded-md transition-all duration-150 border active:border-border",
          className,
          isActive
            ? "bg-[var(--vscode-button-secondaryBackground)] border-border"
            : isBordered
            ? "border-border"
            : "border-transparent",
          isDisabled
            ? "opacity-50 outline-none cursor-not-allowed"
            : "hover:bg-[var(--vscode-button-secondaryBackground)] cursor-pointer"
        )}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = "IconButton";

export default IconButton;
