import { useState } from "react";

interface ThinkingItem {
  id: string;
  title: string;
  content: string;
  type: "observation" | "approach" | "reasoning" | "diagram" | "plan" | "step";
  status?: "pending" | "running" | "completed" | "failed";
}

interface Props {
  items: ThinkingItem[];
  planApproved?: boolean;
}

const typeIcons: Record<string, string> = {
  observation: "👁",
  approach: "🎯",
  reasoning: "🧠",
  diagram: "📊",
  plan: "📋",
  step: "→",
};

const ThinkingSection = ({ items, planApproved }: Props) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const isOpen = expanded.has(item.id);
        return (
          <div
            key={item.id}
            className={`rounded border ${
              item.type === "diagram" && isOpen
                ? "border-orange-500/50 bg-orange-500/5"
                : "border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)]"
            }`}
          >
            <button
              onClick={() => toggle(item.id)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
            >
              <span className="text-xs">{typeIcons[item.type] || "📌"}</span>
              <span className="text-xs font-medium flex-1 text-[var(--vscode-foreground)]">
                {item.title}
              </span>
              {item.status === "completed" && (
                <span className="text-green-400 text-[10px]">✓</span>
              )}
              {item.status === "running" && (
                <span className="text-blue-400 text-[10px] animate-pulse">●</span>
              )}
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 pt-1 text-xs text-[var(--vscode-descriptionForeground)] leading-relaxed border-t border-[var(--vscode-panel-border)]">
                <div className="whitespace-pre-wrap">{item.content}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ThinkingSection;
export type { ThinkingItem };
