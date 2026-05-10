import { useState } from "react";
import type { ProviderInfo } from "../../types/Homepage";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  providers: ProviderInfo[];
  sendToExtension: (command: string, data?: any) => void;
  onBack?: () => void;
}

type ProviderMode = "local" | "codex" | "remote";

const CODEX_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2",
];

const LANGUAGE_VALUES = ["en", "zh-CN", "ja", "ko", "es", "fr", "de"] as const;

const OUTPUT_LEVELS = ["error", "warn", "info", "debug"];

const AGENTS = [
  "claude-code",
  "codex-cli",
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
  // 默认 codex：复用用户已登录的 ChatGPT 配额，无需 endpoint/apiKey
  const [mode, setMode] = useState<ProviderMode>("codex");
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("gpt-5.5");
  const [apiKey, setApiKey] = useState("");

  const [language, setLanguage] = useState("en");
  const [outputLevel, setOutputLevel] = useState("info");
  const [streaming, setStreaming] = useState(true);

  const [defaultAgent, setDefaultAgent] = useState("claude-code");
  const [maxRetries, setMaxRetries] = useState(3);

  const [saved, setSaved] = useState(false);

  const localProvider = providers.find((p) => p.is_local);

  const handleSave = () => {
    const provider =
      mode === "local" ? "ollama" : mode === "codex" ? "codex" : "openai";
    sendToExtension("setProvider", {
      provider,
      model,
      // codex 不需要 endpoint / apiKey，传空让后端用默认值
      endpoint: mode === "codex" ? undefined : endpoint,
      apiKey: mode === "codex" ? undefined : apiKey || undefined,
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
    } else if (next === "codex") {
      setEndpoint("");
      setModel("gpt-5.5");
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
            {(["local", "codex", "remote"] as const).map((m) => (
              <button
                key={m}
                onClick={() => handleModeSwitch(m)}
                className={`flex-1 py-1.5 text-[11px] font-medium cursor-pointer transition-colors ${
                  mode === m
                    ? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]"
                    : "bg-[var(--vscode-input-background)] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
                }`}
              >
                {m === "local"
                  ? t.settingsModeLocal
                  : m === "codex"
                  ? "Codex"
                  : t.settingsModeRemote}
              </button>
            ))}
          </div>

          {/* Endpoint：codex 模式不需要 endpoint */}
          {mode !== "codex" && (
            <>
              <label className={fieldLabel}>{t.settingsEndpoint}</label>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className={`${inputBase} mb-2`}
              />
            </>
          )}

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
          ) : mode === "codex" ? (
            <>
              {/* Codex 模式：复用 codex CLI 已登录的 ChatGPT 配额 */}
              <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-2 leading-relaxed">
                复用本机 codex CLI 已登录的 ChatGPT 订阅额度。需先在终端跑过{" "}
                <code>codex login</code>。
              </div>
              <label className={fieldLabel}>{t.settingsModel}</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={selectBase}
              >
                {CODEX_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
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
