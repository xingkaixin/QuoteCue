# QuoteCue 产品落地页

落地页使用 Astro 静态生成，React 负责交互演示与 Base UI 组件，Tailwind CSS 4 通过 Vite
插件构建。默认中文页面位于 `/`，英文页面位于 `/en/`，日语页面位于 `/ja/`。

## 本地开发

从仓库根目录运行：

```bash
pnpm site:dev
pnpm site:check
pnpm site:build
```

`site:check` 会执行 Astro 类型检查、生产构建，并验证 canonical、hreflang、JSON-LD、
sitemap、robots.txt、404、Umami 脚本与 CSP，以及 Cloudflare 部署产物。

## Umami 访问统计

生产构建在共用布局中加载自建 Umami 的 `https://umami.xingkaixin.me/script.js`，站点 ID 为
`7d43d6ea-7e27-4c6b-9037-917d977a9af3`，无需额外环境变量。`data-domains` 使用 Astro 配置的
正式域名 `quotecue.xingkaixin.me`，避免本地预览和其他部署域名的访问计入统计；开发模式不加载
脚本。`_headers` 仅在 `script-src` 和 `connect-src` 中放行该 Umami 来源。

统计只用于产品网站的页面访问，不添加自定义事件，不上报演示中的批注或输入内容，也不进入扩展
或 AI 宿主页面。扩展继续不收集使用统计；详见 [PRIVACY.md](../PRIVACY.md)。

## Cloudflare Web Analytics

页面支持 Cloudflare Web Analytics 手动 beacon。先在 Cloudflare Web Analytics 中添加
`quotecue.xingkaixin.me`，再把站点 token 配置为构建环境变量：

```bash
PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=<site-token>
```

token 是公开的站点标识，不是密钥。未配置时不输出 beacon，适合在 Cloudflare 控制台启用自动
注入；两种方式只启用一种，避免重复 snippet。`_headers` 已允许 beacon 脚本与上报地址，且没有
设置会阻止自动注入的 `Cache-Control: no-transform`。

## 部署到 Cloudflare Workers

`wrangler.jsonc` 将 `dist` 作为静态资源部署，并把 Worker 绑定到
`quotecue.xingkaixin.me` Custom Domain：

```bash
pnpm --dir website deploy
```

首次部署前需要登录 Wrangler，并确保 `xingkaixin.me` zone 已由同一 Cloudflare 账号管理。如果
目标 hostname 已有 CNAME，先在 Cloudflare 中移除该记录，否则无法创建 Custom Domain。

Cloudflare Workers Builds 可使用：

- Root directory: `/`
- Build command: `pnpm --dir website build`
- Deploy command: `pnpm --dir website exec wrangler deploy`

## SEO / AEO

- 中英文分别输出静态 HTML，并配置 canonical、双向 hreflang 与 `x-default`。
- `/sitemap.xml` 只包含三个 canonical 页面；404 返回独立页面并标记 `noindex`。
- JSON-LD 同步可见内容，包含 WebSite、Organization、SoftwareApplication、WebPage 和 FAQPage。
- 落地页提供面向用户的本地化产品更新记录，并同步最新版本、页面更新时间与 sitemap `lastmod`。
- `llms.txt` 提供可独立引用的产品、支持范围与隐私事实。
- Open Graph 与 Twitter Card 使用 1200×630 的品牌预览图。
