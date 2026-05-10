import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { en, zhCN, type Translations } from "./locales";

export type Locale = "en" | "zh-CN";

const translations: Record<Locale, Translations> = {
  "en": en,
  "zh-CN": zhCN,
};

// 老 key 兼容（老组件可能写 "zh"）
function normalizeLocale(input: string | null | undefined): Locale {
  if (!input) return "en";
  if (input === "zh" || input === "zh-CN" || input.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en";
}

interface I18nContextValue {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  t: en,
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved =
      localStorage.getItem("clearLoop-locale") ||
      localStorage.getItem("traycer-locale") ||
      localStorage.getItem("codesail-locale");
    return normalizeLocale(saved);
  });

  const setLocale = useCallback((newLocale: Locale) => {
    const norm = normalizeLocale(newLocale);
    setLocaleState(norm);
    localStorage.setItem("clearLoop-locale", norm);
  }, []);

  // The public extension namespace is clearLoop.*, while old locale
  // messages remain accepted for archived webviews.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data;
      if (
        msg &&
        (msg.command === "clearLoop-locale" ||
          msg.command === "traycer-locale" ||
          msg.command === "codesail-locale") &&
        typeof msg.data === "string"
      ) {
        const norm = normalizeLocale(msg.data);
        setLocaleState(norm);
        localStorage.setItem("clearLoop-locale", norm);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const value: I18nContextValue = {
    locale,
    t: translations[locale],
    setLocale,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
