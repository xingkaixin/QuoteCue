import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { messagesFor, resolveHostLocale, type SupportedLocale } from "./messages";

type I18nContextValue = {
  locale: SupportedLocale;
  messages: ReturnType<typeof messagesFor>;
};

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  messages: messagesFor("en"),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(detectedLocale);

  useEffect(() => {
    const updateLocale = () => setLocale(detectedLocale());
    const observer = new MutationObserver(updateLocale);

    observer.observe(document.documentElement, { attributeFilter: ["lang"], attributes: true });
    window.addEventListener("languagechange", updateLocale);
    return () => {
      observer.disconnect();
      window.removeEventListener("languagechange", updateLocale);
    };
  }, []);

  return (
    <I18nContext.Provider value={{ locale, messages: messagesFor(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

function detectedLocale() {
  return resolveHostLocale(document.documentElement.lang, [
    ...navigator.languages,
    navigator.language,
  ]);
}
