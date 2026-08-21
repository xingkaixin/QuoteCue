import react from "@astrojs/react";
import sitemap, { ChangeFreqEnum } from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import { DEFAULT_WEBSITE_LOCALE, WEBSITE_LOCALES } from "./src/i18n/locales";

export default defineConfig({
  site: "https://quotecue.xingkaixin.me",
  output: "static",
  trailingSlash: "always",
  i18n: {
    defaultLocale: DEFAULT_WEBSITE_LOCALE,
    locales: WEBSITE_LOCALES,
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.endsWith("/404/"),
      i18n: {
        defaultLocale: DEFAULT_WEBSITE_LOCALE,
        locales: Object.fromEntries(WEBSITE_LOCALES.map((locale) => [locale, locale])),
      },
      namespaces: {
        image: false,
        news: false,
        video: false,
      },
      serialize(item) {
        item.changefreq = ChangeFreqEnum.MONTHLY;
        item.lastmod = "2026-08-07";
        return item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
