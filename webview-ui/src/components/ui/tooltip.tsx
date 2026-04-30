import * as React from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  type Placement,
} from "@floating-ui/react";
import { cn } from "../../lib/utils";

/**
 * Floating UI 实现的 Tooltip（替代 Radix）。
 * 用法（与 shadcn 同形）：
 *   <Tooltip>
 *     <TooltipTrigger>...</TooltipTrigger>
 *     <TooltipContent>提示文字</TooltipContent>
 *   </Tooltip>
 */
type TooltipContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  refs: ReturnType<typeof useFloating>["refs"];
  floatingStyles: ReturnType<typeof useFloating>["floatingStyles"];
  getReferenceProps: ReturnType<typeof useInteractions>["getReferenceProps"];
  getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltipContext() {
  const ctx = React.useContext(TooltipContext);
  if (!ctx) throw new Error("Tooltip components must be wrapped in <Tooltip>");
  return ctx;
}

export interface TooltipProps {
  children: React.ReactNode;
  placement?: Placement;
  delay?: number;
}

export function Tooltip({ children, placement = "top", delay = 200 }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, { delay: { open: delay, close: 0 }, move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  return (
    <TooltipContext.Provider
      value={{ open, setOpen, refs, floatingStyles, getReferenceProps, getFloatingProps }}
    >
      {children}
    </TooltipContext.Provider>
  );
}

// Provider 兼容（shadcn 习惯写法 <TooltipProvider>）—— 这里只是透明包裹。
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export interface TooltipTriggerProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  children: React.ReactElement;
}

export const TooltipTrigger = React.forwardRef<HTMLElement, TooltipTriggerProps>(
  ({ asChild: _asChild, children, ...props }, _forwardedRef) => {
    const ctx = useTooltipContext();
    return React.cloneElement(children, {
      ref: ctx.refs.setReference,
      ...ctx.getReferenceProps(props as Record<string, unknown>),
    } as Record<string, unknown>);
  }
);
TooltipTrigger.displayName = "TooltipTrigger";

export interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  sideOffset?: number;
}

export const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, children, ...props }, _ref) => {
    const ctx = useTooltipContext();
    if (!ctx.open) return null;
    return (
      <FloatingPortal>
        <div
          ref={ctx.refs.setFloating}
          style={ctx.floatingStyles}
          className={cn(
            "z-50 overflow-hidden rounded-md border border-[var(--vscode-panel-border,var(--vscode-input-border))]",
            "bg-[var(--vscode-editorHoverWidget-background,var(--vscode-editor-background))]",
            "px-2 py-1 text-xs text-[var(--vscode-editorHoverWidget-foreground,var(--vscode-foreground))]",
            "shadow-md",
            className
          )}
          {...ctx.getFloatingProps(props as Record<string, unknown>)}
        >
          {children}
        </div>
      </FloatingPortal>
    );
  }
);
TooltipContent.displayName = "TooltipContent";
