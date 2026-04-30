import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * shadcn/ui Button — 复刻 Traycer `buttonVariants`（参见 TRAYCER_UI_TEARDOWN.md §H）。
 * 颜色全部走 VS Code variable / Tailwind theme 桥（traycer-tokens.css 提供）。
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vscode-focusBorder)] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer active:opacity-80",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--vscode-button-border,transparent)] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]",
        destructive:
          "bg-[var(--vscode-errorForeground)] text-[var(--vscode-button-foreground)] hover:opacity-90",
        outline:
          "border border-[var(--vscode-panel-border,var(--vscode-input-border))] bg-transparent hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-list-hoverForeground)]",
        secondary:
          "border border-[var(--vscode-panel-border,var(--vscode-input-border))] bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]",
        ghost:
          "hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-list-hoverForeground)]",
        link: "text-[var(--vscode-textLink-foreground)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 px-3",
        sm: "h-6 px-2 text-xs",
        lg: "h-8 px-4 text-base",
        icon: "h-7 w-7",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = "Button";
