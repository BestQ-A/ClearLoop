import { useI18n } from "../../i18n/I18nContext";
import { getVsCodeApi } from "../../utils/vscode";

/**
 * 简单 en / 中 切换。挂在 NavigationBar 右侧。
 *
 * 行为：
 * 1. 点击切换 locale（webview 内立即生效）
 * 2. 同时通过 vscode.postMessage 发 clearLoop-locale-set 给扩展，
 *    扩展会写回 VS Code setting `clearLoop.languagePreference`。
 *    设置变更后 ViewProvider 监听到，再 push 一条 clearLoop-locale 回所有 webview，
 *    保证下次启动 / 多 webview 一致。
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  const next = locale === "en" ? "zh-CN" : "en";
  const label = locale === "en" ? "中" : "EN";
  const aria = locale === "en" ? "Switch to Chinese" : "切换为英文";

  const handleClick = () => {
    setLocale(next);
    try {
      const api = getVsCodeApi();
      api.postMessage({ command: "clearLoop-locale-set", data: next });
    } catch (e) {
      console.warn("[LanguageSwitcher] postMessage failed:", e);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={aria}
      title={aria}
      className="px-1.5 h-6 rounded-md border border-border text-[11px] font-semibold leading-none cursor-pointer hover:bg-[var(--vscode-button-secondaryBackground)] transition-colors text-[var(--vscode-foreground)]"
    >
      {label}
    </button>
  );
}

export default LanguageSwitcher;
