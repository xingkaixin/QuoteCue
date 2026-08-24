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
sitemap、robots.txt、404 和 Cloudflare 部署产物。

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
- `llms.txt` 提供可独立引用的产品、支持范围与隐私事实。
- Open Graph 与 Twitter Card 使用 1200×630 的品牌预览图。
