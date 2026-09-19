import { WEBSITE_LOCALE_CONFIG, type Locale } from "./locales";
import { LATEST_PRODUCT_UPDATE_DATE } from "./product-updates";

export const WEBSITE_PAGES = {
  home: {
    suffix: "",
    modified: LATEST_PRODUCT_UPDATE_DATE > "2026-09-19" ? LATEST_PRODUCT_UPDATE_DATE : "2026-09-19",
  },
  guide: { suffix: "guides/getting-started/", modified: "2026-09-19" },
} as const;

export type WebsitePage = keyof typeof WEBSITE_PAGES;

export function websitePagePath(locale: Locale, page: WebsitePage = "home") {
  return `${WEBSITE_LOCALE_CONFIG[locale].path}${WEBSITE_PAGES[page].suffix}`;
}
