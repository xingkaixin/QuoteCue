export const WEBSITE_LOCALE_CONFIG = {
  "zh-CN": {
    label: "中文",
    ogLocale: "zh_CN",
    path: "/",
  },
  en: {
    label: "EN",
    ogLocale: "en_US",
    path: "/en/",
  },
  ja: {
    label: "日本語",
    ogLocale: "ja_JP",
    path: "/ja/",
  },
} as const;

export type Locale = keyof typeof WEBSITE_LOCALE_CONFIG;

export const DEFAULT_WEBSITE_LOCALE: Locale = "zh-CN";
export const WEBSITE_LOCALES = Object.keys(WEBSITE_LOCALE_CONFIG) as Locale[];
