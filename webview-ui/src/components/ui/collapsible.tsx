import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * 简易 Collapsible（不依赖 Radix）。
 * 受控/非受控均支持：
 *   <Collapsible defaultOpen>
 *     <CollapsibleTrigger>...</CollapsibleTrigger>
 *     <CollapsibleContent>...</CollapsibleContent>
 *   </Collapsible>
 */
type CollapsibleContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);
function useCollapsibleContext() {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx) throw new Error("Collapsible components must be wrapped in <Collapsible>");
  return ctx;
}

export interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
  (
    { open: controlled, defaultOpen = false, onOpenChange, className, children, ...props },
    ref
  ) => {
    const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
    const open = controlled ?? uncontrolled;
    const setOpen = React.useCallback(
      (next: boolean) => {
        if (controlled === undefined) setUncontrolled(next);
        onOpenChange?.(next);
      },
      [controlled, onOpenChange]
    );

    return (
      <CollapsibleContext.Provider value={{ open, setOpen }}>
        <div ref={ref} className={cn(className)} data-state={open ? "open" : "closed"} {...props}>
          {children}
        </div>
      </CollapsibleContext.Provider>
    );
  }
);
Collapsible.displayName = "Collapsible";

export interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ asChild: _asChild, onClick, className, children, ...props }, ref) => {
    const ctx = useCollapsibleContext();
    return (
      <button
        ref={ref}
        type="button"
        aria-expanded={ctx.open}
        data-state={ctx.open ? "open" : "closed"}
        onClick={(e) => {
          ctx.setOpen(!ctx.open);
          onClick?.(e);
        }}
        className={cn(className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
CollapsibleTrigger.displayName = "CollapsibleTrigger";

export interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(
  ({ className, children, hidden: _hidden, ...props }, ref) => {
    const ctx = useCollapsibleContext();
    if (!ctx.open) return null;
    return (
      <div
        ref={ref}
        data-state={ctx.open ? "open" : "closed"}
        className={cn(className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CollapsibleContent.displayName = "CollapsibleContent";
