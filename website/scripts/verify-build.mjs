import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const distUrl = new URL("../dist/", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, distUrl), "utf8");
}

function occurrences(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

function readStructuredData(html) {
  const match = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
  assert(match, "JSON-LD is missing");
  return JSON.parse(match[1]);
}

const pages = [
  {
    path: "index.html",
    lang: "zh-CN",
    canonical: "https://quotecue.xingkaixin.me/",
    marker: "现在就试一遍",
  },
  {
    path: "en/index.html",
    lang: "en",
    canonical: "https://quotecue.xingkaixin.me/en/",
    marker: "Try the whole flow",
  },
  {
    path: "ja/index.html",
    lang: "ja",
    canonical: "https://quotecue.xingkaixin.me/ja/",
    marker: "一連の流れを試す",
  },
];

for (const page of pages) {
  const html = await read(page.path);
  assert.match(html, new RegExp(`<html lang="${page.lang}"`));
  assert.match(html, new RegExp(`<link rel="canonical" href="${page.canonical}"`));
  assert(html.includes(page.marker), `${page.path} must contain localized landing copy`);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large">/);
  assert.match(html, /<link rel="alternate" hreflang="zh-CN"/);
  assert.match(html, /<link rel="alternate" hreflang="en"/);
  assert.match(html, /<link rel="alternate" hreflang="ja"/);
  assert.match(html, /<link rel="alternate" hreflang="x-default"/);
  assert.match(html, /<link rel="sitemap" href="\/sitemap\.xml">/);
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/quotecue\.xingkaixin\.me\/og-cover\.png">/,
  );
  assert.equal(occurrences(html, /<h1\b/g), 1, `${page.path} must contain one h1`);

  const umamiScripts = html.match(
    /<script\b[^>]*\bsrc="https:\/\/umami\.xingkaixin\.me\/script\.js"[^>]*><\/script>/g,
  );
  assert.equal(umamiScripts?.length, 1, `${page.path} must load Umami exactly once`);
  assert.match(umamiScripts[0], /\bdefer(?:\s|>)/);
  assert.match(umamiScripts[0], /data-website-id="7d43d6ea-7e27-4c6b-9037-917d977a9af3"/);
  assert.match(umamiScripts[0], /data-domains="quotecue\.xingkaixin\.me"/);

  const structuredData = readStructuredData(html);
  const graph = structuredData["@graph"];
  assert(Array.isArray(graph), `${page.path} JSON-LD must use @graph`);
  const types = new Set(graph.map((entry) => entry["@type"]));
  for (const type of ["WebSite", "Organization", "SoftwareApplication", "WebPage", "FAQPage"]) {
    assert(types.has(type), `${page.path} is missing ${type} schema`);
  }
  const faq = graph.find((entry) => entry["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, 5, `${page.path} FAQ schema must match visible questions`);
}

const notFound = await read("404.html");
assert.match(notFound, /<meta name="robots" content="noindex, nofollow">/);
assert.equal(occurrences(notFound, /<h1\b/g), 1);

const sitemap = await read("sitemap.xml");
assert.match(sitemap, /<loc>https:\/\/quotecue\.xingkaixin\.me\/<\/loc>/);
assert.match(sitemap, /<loc>https:\/\/quotecue\.xingkaixin\.me\/en\/<\/loc>/);
assert.match(sitemap, /<loc>https:\/\/quotecue\.xingkaixin\.me\/ja\/<\/loc>/);
assert.match(sitemap, /hreflang="x-default" href="https:\/\/quotecue\.xingkaixin\.me\/"/);
assert.doesNotMatch(sitemap, /404/);
assert.equal(occurrences(sitemap, /<url>/g), 3);
assert.equal(occurrences(sitemap, /hreflang="x-default"/g), 3);

const robots = await read("robots.txt");
assert.match(robots, /^User-agent: \*\nAllow: \//);
assert.match(robots, /Sitemap: https:\/\/quotecue\.xingkaixin\.me\/sitemap\.xml/);

const manifest = JSON.parse(await read("site.webmanifest"));
assert.equal(manifest.name, "QuoteCue");
assert.equal(manifest.icons.length, 2);

const headers = await read("_headers");
assert.match(headers, /Content-Security-Policy:/);
assert.match(headers, /static\.cloudflareinsights\.com/);
assert.match(headers, /script-src[^;]* https:\/\/umami\.xingkaixin\.me(?:\s|;)/);
assert.match(headers, /connect-src[^;]* https:\/\/umami\.xingkaixin\.me(?:\s|;)/);
assert.doesNotMatch(headers, /no-transform/);

const llms = await read("llms.txt");
assert.match(llms, /^# QuoteCue/m);
assert.match(llms, /## Privacy facts/);

const socialImage = await stat(new URL("og-cover.png", distUrl));
assert(socialImage.size > 10_000, "Social preview image is unexpectedly small");

console.log("Verified landing SEO, analytics, and deployment artifacts");
