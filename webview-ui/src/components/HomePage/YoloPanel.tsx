import type { YoloConfig, Severity } from "../../types/Homepage";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  config: YoloConfig;
  onConfigChange: (config: YoloConfig) => void;
  onStart: () => void;
  isRunning: boolean;
  results: any[];
  sendToExtension: (cmd: string, data?: any) => void;
}

const agentOptions = [
  "claude-code", "codex-cli", "cursor", "copilot", "cline", "roo-code",
  "augment", "zencoder", "amp", "windsurf",
];

const severityOptions: Severity[] = ["MINOR", "MAJOR", "CRITICAL"];

const YoloPanel = ({ config, onConfigChange, onStart, isRunning, results, sendToExtension }: Props) => {
  const { t } = useI18n();
  const update = <K extends keyof YoloConfig>(key: K, value: YoloConfig[K]) => {
    onConfigChange({ ...config, [key]: value });
  };

  const handleStart = () => {
    sendToExtension("startYolo", config);
    onStart();
  };

  // 获取正在运行时的状态信息
  const currentResult = results.length > 0 ? results[results.length - 1] : null;

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[var(--vscode-foreground)]">{t.yoloTitle}</h2>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-semibold">
          {t.yoloAutomationBadge}
        </span>
      </div>

      <div className="text-[10px] text-[var(--vscode-descriptionForeground)] leading-relaxed">
        {t.yoloIntro}
      </div>

      {/* Configuration */}
      <div className="space-y-2.5">
        <div className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] uppercase">
          {t.yoloConfiguration}
        </div>

        {/* Toggle group */}
        <div className="space-y-1">
          {/* Skip Plan */}
          <label className="flex items-center justify-between p-2 bg-[var(--vscode-input-background)] rounded cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
            <div>
              <div className="text-[11px] text-[var(--vscode-foreground)]">{t.yoloSkipPlan}</div>
              <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">{t.yoloSkipPlanHint}</div>
            </div>
            <input
              type="checkbox"
              checked={config.skip_plan}
              onChange={(e) => update("skip_plan", e.target.checked)}
              className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--vscode-focusBorder)]"
            />
          </label>

          {/* Auto Approve */}
          <label className="flex items-center justify-between p-2 bg-[var(--vscode-input-background)] rounded cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
            <div>
              <div className="text-[11px] text-[var(--vscode-foreground)]">{t.yoloAutoApprove}</div>
              <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">{t.yoloAutoApproveHint}</div>
            </div>
            <input
              type="checkbox"
              checked={config.auto_approve}
              onChange={(e) => update("auto_approve", e.target.checked)}
              className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--vscode-focusBorder)]"
            />
          </label>

          {/* Disable Verification */}
          <label className="flex items-center justify-between p-2 bg-[var(--vscode-input-background)] rounded cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
            <div>
              <div className="text-[11px] text-[var(--vscode-foreground)]">{t.yoloDisableVerification}</div>
              <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">{t.yoloDisableVerificationHint}</div>
            </div>
            <input
              type="checkbox"
              checked={config.disable_verification}
              onChange={(e) => update("disable_verification", e.target.checked)}
              className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--vscode-focusBorder)]"
            />
          </label>

          {/* Auto Fix */}
          <label className="flex items-center justify-between p-2 bg-[var(--vscode-input-background)] rounded cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
            <div>
              <div className="text-[11px] text-[var(--vscode-foreground)]">{t.yoloAutoFix}</div>
              <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">{t.yoloAutoFixHint}</div>
            </div>
            <input
              type="checkbox"
              checked={config.auto_fix}
              onChange={(e) => update("auto_fix", e.target.checked)}
              className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--vscode-focusBorder)]"
            />
          </label>

          {/* Auto Commit */}
          <label className="flex items-center justify-between p-2 bg-[var(--vscode-input-background)] rounded cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
            <div>
              <div className="text-[11px] text-[var(--vscode-foreground)]">{t.yoloAutoCommit}</div>
              <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">{t.yoloAutoCommitHint}</div>
            </div>
            <input
              type="checkbox"
              checked={config.auto_commit}
              onChange={(e) => update("auto_commit", e.target.checked)}
              className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--vscode-focusBorder)]"
            />
          </label>
        </div>

        {/* Dropdown / number inputs */}
        <div className="space-y-1.5">
          {/* Severity Threshold */}
          <div className="p-2 bg-[var(--vscode-input-background)] rounded">
            <label className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] block mb-1">
              {t.yoloSeverityThreshold}
            </label>
            <select
              value={config.severity_threshold}
              onChange={(e) => update("severity_threshold", e.target.value as Severity)}
              className="w-full px-2 py-1 text-xs bg-[var(--vscode-editor-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
            >
              {severityOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Max Retries */}
          <div className="p-2 bg-[var(--vscode-input-background)] rounded">
            <label className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] block mb-1">
              {t.yoloMaxRetries}
            </label>
            <input
              type="number"
              min={0}
              max={10}
              value={config.max_retries}
              onChange={(e) => update("max_retries", Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))}
              className="w-full px-2 py-1 text-xs bg-[var(--vscode-editor-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
            />
          </div>

          {/* Execution Agent */}
          <div className="p-2 bg-[var(--vscode-input-background)] rounded">
            <label className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] block mb-1">
              {t.yoloExecutionAgent}
            </label>
            <select
              value={config.execution_agent}
              onChange={(e) => update("execution_agent", e.target.value)}
              className="w-full px-2 py-1 text-xs bg-[var(--vscode-editor-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
            >
              {agentOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Timeout */}
          <div className="p-2 bg-[var(--vscode-input-background)] rounded">
            <label className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] block mb-1">
              {t.yoloTimeout}
            </label>
            <input
              type="number"
              min={1}
              max={120}
              value={config.timeout_minutes}
              onChange={(e) => update("timeout_minutes", Math.min(120, Math.max(1, parseInt(e.target.value) || 10)))}
              className="w-full px-2 py-1 text-xs bg-[var(--vscode-editor-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
            />
          </div>
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={isRunning}
        className={`w-full px-3 py-2.5 text-xs font-bold rounded cursor-pointer transition-colors ${
          isRunning
            ? "bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] opacity-60"
            : "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
        }`}
      >
        {isRunning ? t.yoloRunning : t.yoloStart}
      </button>

      {/* Running status */}
      {isRunning && currentResult && (
        <div className="p-2.5 bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-input-border)] space-y-1">
          <div className="flex items-center gap-1.5">
            <svg className="animate-spin h-3 w-3 text-[var(--vscode-foreground)] opacity-50" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-70" fill="currentColor" d="M4 12a8 8 0 018-8v8h8a8 8 0 01-8 8 8 8 0 01-8-8z" />
            </svg>
            <span className="text-[10px] font-semibold text-[var(--vscode-foreground)]">
              {currentResult.ticket_title || t.yoloProcessing}
            </span>
          </div>
          {currentResult.phase && (
            <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">
              {t.yoloPhase}: {currentResult.phase} | {t.yoloAttempt}: {currentResult.attempt || 1}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] uppercase">
            {t.yoloResults} ({results.length})
          </div>
          {results.map((result, idx) => (
            <div key={idx} className="p-2 bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-input-border)]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--vscode-foreground)]">
                  {result.ticket_title || `${t.yoloExecutionPrefix} ${idx + 1}`}
                </span>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                  result.status === "SUCCEEDED"
                    ? "bg-green-500/20 text-green-400"
                    : result.status === "FAILED"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-yellow-500/20 text-yellow-400"
                }`}>
                  {result.status || "PENDING"}
                </span>
              </div>
              {result.error && (
                <div className="mt-1 text-[9px] text-[var(--vscode-errorForeground)]">
                  {result.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default YoloPanel;
