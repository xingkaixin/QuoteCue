import type { APIRoute } from "astro";

import { DEFAULT_WEBSITE_LOCALE, WEBSITE_LOCALE_CONFIG, WEBSITE_LOCALES } from "../i18n/locales";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error("Astro site URL is required to generate sitemap.xml");
  }

  const localizedUrls = WEBSITE_LOCALES.map((locale) => ({
    locale,
    url: new URL(WEBSITE_LOCALE_CONFIG[locale].path, site).href,
  }));
  const defaultUrl = new URL(WEBSITE_LOCALE_CONFIG[DEFAULT_WEBSITE_LOCALE].path, site).href;
  const alternateLinks = localizedUrls
    .map(
      ({ locale, url }) => `    <xhtml:link rel="alternate" hreflang="${locale}" href="${url}" />`,
    )
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${defaultUrl}" />`)
    .join("\n");
  const entries = localizedUrls
    .map(
      ({ url }) => `  <url>
    <loc>${url}</loc>
${alternateLinks}
  </url>`,
    )
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
