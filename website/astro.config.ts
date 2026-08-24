import react from "@astrojs/react";
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
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
