import react from "@astrojs/react";
import sitemap, { ChangeFreqEnum } from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://quotecue.xingkaixin.me",
  output: "static",
  trailingSlash: "always",
  i18n: {
    defaultLocale: "zh-CN",
    locales: ["zh-CN", "en"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.endsWith("/404/"),
      i18n: {
        defaultLocale: "zh-CN",
        locales: {
          "zh-CN": "zh-CN",
          en: "en",
        },
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
