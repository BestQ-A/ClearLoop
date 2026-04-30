import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * shadcn/ui Badge — Traycer `Badge` 复刻（4 个 variant）。
 */
export const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--vscode-focusBorder)]",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]",
        secondary:
          "border-transparent bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]",
        destructive:
          "border-transparent bg-[var(--vscode-errorForeground)] text-[var(--vscode-button-foreground)]",
        outline:
          "border-[var(--vscode-panel-border,var(--vscode-input-border))] text-[var(--vscode-foreground)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
