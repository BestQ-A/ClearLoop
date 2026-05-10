import { useI18n } from "../../i18n/I18nContext";

interface Props {
  isLoading: boolean;
  onExecute: (agent: string) => void;
  onSkip: () => void;
  onValidate: () => void;
  showValidate?: boolean;
}

const agents = [
  { id: "local", name: "Local (ClearLoop)", icon: "⛵" },
  { id: "claude-code", name: "Claude Code", icon: "🤖" },
  { id: "codex", name: "Codex CLI", icon: "⚡" },
  { id: "cline", name: "Cline", icon: "🔧" },
];

const ExecutePanel = ({ isLoading, onExecute, onSkip, onValidate, showValidate }: Props) => {
  const { t } = useI18n();
  return (
    <div className="space-y-2 pt-2 border-t border-[var(--vscode-panel-border)]">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] uppercase">
          {t.executeIn}
        </span>
        <div className="flex gap-1 flex-wrap">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => onExecute(agent.id)}
              disabled={isLoading}
              className="px-2 py-1 text-[10px] rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] cursor-pointer hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <span>{agent.icon}</span>
              {agent.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {showValidate && (
          <button
            onClick={onValidate}
            disabled={isLoading}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded cursor-pointer hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-40 transition-colors"
          >
            {isLoading ? t.executeValidating : t.executeValidatePlan}
          </button>
        )}
        <button
          onClick={onSkip}
          disabled={isLoading}
          className="px-3 py-2 text-xs rounded bg-[var(--vscode-input-background)] text-[var(--vscode-descriptionForeground)] cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] disabled:opacity-40 transition-colors"
        >
          {t.executeSkip}
        </button>
      </div>
    </div>
  );
};

export default ExecutePanel;
