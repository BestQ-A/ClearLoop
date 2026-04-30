import * as React from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
  type Placement,
} from "@floating-ui/react";
import { cn } from "../../lib/utils";

/**
 * Floating UI 实现的 Popover（替代 Radix）。
 *   <Popover>
 *     <PopoverTrigger>...</PopoverTrigger>
 *     <PopoverContent align="end">...</PopoverContent>
 *   </Popover>
 */
type PopoverContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  refs: ReturnType<typeof useFloating>["refs"];
  floatingStyles: ReturnType<typeof useFloating>["floatingStyles"];
  context: ReturnType<typeof useFloating>["context"];
  getReferenceProps: ReturnType<typeof useInteractions>["getReferenceProps"];
  getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
};

const PopoverContext = React.createContext<PopoverContextValue | null>(null);
function usePopoverContext() {
  const ctx = React.useContext(PopoverContext);
  if (!ctx) throw new Error("Popover components must be wrapped in <Popover>");
  return ctx;
}

export interface PopoverProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: Placement;
}

export function Popover({
  children,
  open: controlledOpen,
  onOpenChange,
  placement = "bottom-start",
}: PopoverProps) {
  const [uncontrolled, setUncontrolled] = React.useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange]
  );

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  return (
    <PopoverContext.Provider
      value={{ open, setOpen, refs, floatingStyles, context, getReferenceProps, getFloatingProps }}
    >
      {children}
    </PopoverContext.Provider>
  );
}

export interface PopoverTriggerProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  children: React.ReactElement;
}

export const PopoverTrigger = React.forwardRef<HTMLElement, PopoverTriggerProps>(
  ({ asChild: _asChild, children, ...props }, _ref) => {
    const ctx = usePopoverContext();
    return React.cloneElement(children, {
      ref: ctx.refs.setReference,
      ...ctx.getReferenceProps(props as Record<string, unknown>),
    } as Record<string, unknown>);
  }
);
PopoverTrigger.displayName = "PopoverTrigger";

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, children, align: _align, sideOffset: _sideOffset, ...props }, _ref) => {
    const ctx = usePopoverContext();
    if (!ctx.open) return null;
    return (
      <FloatingPortal>
        <FloatingFocusManager context={ctx.context} modal={false}>
          <div
            ref={ctx.refs.setFloating}
            style={ctx.floatingStyles}
            className={cn(
              "z-50 rounded-md border border-[var(--vscode-panel-border,var(--vscode-input-border))]",
              "bg-[var(--vscode-dropdown-background,var(--vscode-editor-background))]",
              "p-3 text-[var(--vscode-dropdown-foreground,var(--vscode-foreground))] shadow-lg outline-none",
              className
            )}
            {...ctx.getFloatingProps(props as Record<string, unknown>)}
          >
            {children}
          </div>
        </FloatingFocusManager>
      </FloatingPortal>
    );
  }
);
PopoverContent.displayName = "PopoverContent";
