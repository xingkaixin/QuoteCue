import type { APIRoute } from "astro";

import { DEFAULT_WEBSITE_LOCALE, WEBSITE_LOCALES } from "../i18n/locales";
import { WEBSITE_PAGES, websitePagePath, type WebsitePage } from "../i18n/pages";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error("Astro site URL is required to generate sitemap.xml");
  }

  // SAFETY: WebsitePage is derived from the exact keys of WEBSITE_PAGES.
  const entries = (Object.keys(WEBSITE_PAGES) as WebsitePage[])
    .map((page) => {
      const localizedUrls = WEBSITE_LOCALES.map((locale) => ({
        locale,
        url: new URL(websitePagePath(locale, page), site).href,
      }));

      const defaultUrl = new URL(websitePagePath(DEFAULT_WEBSITE_LOCALE, page), site).href;

      const alternateLinks = localizedUrls
        .map(
          ({ locale, url }) =>
            `    <xhtml:link rel="alternate" hreflang="${locale}" href="${url}" />`,
        )
        .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${defaultUrl}" />`)
        .join("\n");

      return localizedUrls
        .map(
          ({ url }) => `  <url>
    <loc>${url}</loc>
    <lastmod>${WEBSITE_PAGES[page].modified}</lastmod>
${alternateLinks}
  </url>`,
        )
        .join("\n");
    })
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    },
  );
};
