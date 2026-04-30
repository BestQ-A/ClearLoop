import { useState } from "react";
import type { ProviderInfo } from "../../types/Homepage";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  providers: ProviderInfo[];
  sendToExtension: (command: string, data?: any) => void;
  onBack?: () => void;
}

type ProviderMode = "local" | "remote";

const LANGUAGE_VALUES = ["en", "zh-CN", "ja", "ko", "es", "fr", "de"] as const;

const OUTPUT_LEVELS = ["error", "warn", "info", "debug"];

const AGENTS = [
  "claude-code",
  "cursor",
  "copilot",
  "cline",
  "roo-code",
  "augment",
  "zencoder",
  "amp",
  "windsurf",
];

const SettingsPanel = ({ providers, sendToExtension }: Props) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<ProviderMode>("local");
  const [endpoint, setEndpoint] = useState("http://localhost:11434");
  const [model, setModel] = useState("qwen2.5-coder");
  const [apiKey, setApiKey] = useState("");

  const [language, setLanguage] = useState("en");
  const [outputLevel, setOutputLevel] = useState("info");
  const [streaming, setStreaming] = useState(true);

  const [defaultAgent, setDefaultAgent] = useState("claude-code");
  const [maxRetries, setMaxRetries] = useState(3);

  const [saved, setSaved] = useState(false);

  const localProvider = providers.find((p) => p.is_local);

  const handleSave = () => {
    sendToExtension("setProvider", {
      provider: mode === "local" ? "ollama" : "openai",
      model,
      endpoint,
      apiKey: apiKey || undefined,
      language,
      outputLevel,
      streaming,
      defaultAgent,
      maxRetries,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleModeSwitch = (next: ProviderMode) => {
    setMode(next);
    if (next === "local") {
      setEndpoint("http://localhost:11434");
      setModel("qwen2.5-coder");
      setApiKey("");
    } else {
      setEndpoint("https://api.openai.com");
      setModel("gpt-4o");
    }
  };

  /* ---- 共用样式 ---- */
  const sectionTitle =
    "text-[10px] font-semibold uppercase tracking-wider text-[var(--vscode-descriptionForeground)] mb-2";
  const fieldLabel =
    "text-[11px] text-[var(--vscode-foreground)] mb-1 block";
  const inputBase =
    "w-full px-2 py-1.5 text-[11px] rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]";
  const selectBase = inputBase;
  const divider = "border-t border-[var(--vscode-widget-border)] my-3";

  return (
    <div className="flex flex-col h-full">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-[var(--vscode-widget-border)]">
        <h2 className="text-[13px] font-semibold text-[var(--vscode-foreground)]">
          {t.settingsTitle}
        </h2>
      </div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {/* ---- Provider ---- */}
        <section>
          <div className={sectionTitle}>{t.settingsProvider}</div>

          {/* 模式切换 */}
          <div className="flex rounded overflow-hidden border border-[var(--vscode-input-border)] mb-3">
            {(["local", "remote"] as const).map((m) => (
              <button
                key={m}
                onClick={() => handleModeSwitch(m)}
                className={`flex-1 py-1.5 text-[11px] font-medium cursor-pointer transition-colors ${
                  mode === m
                    ? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]"
                    : "bg-[var(--vscode-input-background)] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
                }`}
              >
                {m === "local" ? t.settingsModeLocal : t.settingsModeRemote}
              </button>
            ))}
          </div>

          {/* Endpoint */}
          <label className={fieldLabel}>{t.settingsEndpoint}</label>
          <input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            className={`${inputBase} mb-2`}
          />

          {/* 本地模式：模型下拉 */}
          {mode === "local" ? (
            <>
              <label className={fieldLabel}>{t.settingsModel}</label>
              {localProvider && localProvider.models.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className={selectBase}
                >
                  {localProvider.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={t.settingsModelPlaceholderLocal}
                  className={inputBase}
                />
              )}
            </>
          ) : (
            <>
              {/* 远程模式：API Key + Model 输入 */}
              <label className={fieldLabel}>{t.settingsApiKey}</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className={`${inputBase} mb-2`}
              />
              <label className={fieldLabel}>{t.settingsModel}</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t.settingsModelPlaceholderRemote}
                className={inputBase}
              />
            </>
          )}
        </section>

        <div className={divider} />

        {/* ---- Preferences ---- */}
        <section>
          <div className={sectionTitle}>{t.settingsPreferences}</div>

          <label className={fieldLabel}>{t.settingsLanguage}</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={`${selectBase} mb-2`}
          >
            {LANGUAGE_VALUES.map((v) => {
              const label =
                v === "en" ? t.settingsLangEn :
                v === "zh-CN" ? t.settingsLangZhCN :
                v === "ja" ? t.settingsLangJa :
                v === "ko" ? t.settingsLangKo :
                v === "es" ? t.settingsLangEs :
                v === "fr" ? t.settingsLangFr :
                t.settingsLangDe;
              return (
                <option key={v} value={v}>
                  {label}
                </option>
              );
            })}
          </select>

          <label className={fieldLabel}>{t.settingsOutputLevel}</label>
          <select
            value={outputLevel}
            onChange={(e) => setOutputLevel(e.target.value)}
            className={`${selectBase} mb-2`}
          >
            {OUTPUT_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          {/* Streaming 开关 */}
          <div className="flex items-center justify-between py-1">
            <span className="text-[11px] text-[var(--vscode-foreground)]">
              {t.settingsEnableStreaming}
            </span>
            <button
              onClick={() => setStreaming(!streaming)}
              className={`relative w-8 h-[18px] rounded-full cursor-pointer transition-colors ${
                streaming
                  ? "bg-[var(--vscode-button-background)]"
                  : "bg-[var(--vscode-input-border)]"
              }`}
            >
              <span
                className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                  streaming ? "left-[16px]" : "left-[2px]"
                }`}
              />
            </button>
          </div>
        </section>

        <div className={divider} />

        {/* ---- Execution ---- */}
        <section>
          <div className={sectionTitle}>{t.settingsExecution}</div>

          <label className={fieldLabel}>{t.settingsDefaultAgent}</label>
          <select
            value={defaultAgent}
            onChange={(e) => setDefaultAgent(e.target.value)}
            className={`${selectBase} mb-2`}
          >
            {AGENTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <label className={fieldLabel}>{t.settingsYoloMaxRetries}</label>
          <input
            type="number"
            min={0}
            max={20}
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
            className={inputBase}
          />
        </section>

        <div className={divider} />

        {/* ---- About ---- */}
        <section>
          <div className={sectionTitle}>{t.settingsAbout}</div>
          <div className="text-[11px] text-[var(--vscode-descriptionForeground)] space-y-0.5">
            <div>
              {t.settingsVersion}{" "}
              <span className="text-[var(--vscode-foreground)]">2.0.0</span>
            </div>
            <div>{t.settingsPoweredBy}</div>
          </div>
        </section>
      </div>

      {/* 底部保存按钮 */}
      <div className="px-4 py-3 border-t border-[var(--vscode-widget-border)]">
        <button
          onClick={handleSave}
          className="w-full py-1.5 text-[11px] font-medium rounded cursor-pointer bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
        >
          {saved ? t.settingsSaved : t.settingsSave}
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
