# QuoteCue

QuoteCue 是一个 Chrome 扩展，用于在 ChatGPT、Claude、DeepSeek 和 Kimi 的回复中对选中文本
添加批注，并将这些批注编译为一条聚焦的追问消息发送出去。

## 环境要求

- Node.js 24.21.0（支持的最低版本为 22.12.0）
- pnpm 12.3.4

项目通过 `mise.toml` 锁定这两个工具的版本。通过以下命令安装工具和项目依赖：

```bash
mise install
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

## 开发

```bash
pnpm dev
```

若使用持久化的 Chrome 配置文件，将 `.output/chrome-mv3-dev` 作为未打包扩展加载。

## 产品落地页

Astro 落地页位于 `website/`，为 `https://quotecue.xingkaixin.me` 生成中文、英文和日文静态页面：

```bash
pnpm site:dev
pnpm site:check
pnpm site:build
```

Cloudflare Workers 部署、Umami 统计与 SEO 配置见
[website/README.md](./website/README.md)。统计只在产品网站运行，扩展不收集使用数据。

## 验证与打包

`pnpm check` 是本仓库代码的唯一质量门禁，包含格式检查、lint、类型检查、jsdom 与 Chromium
测试以及一次生产构建。完成上述浏览器安装后，门禁可以完全离线运行。

```bash
pnpm check
pnpm zip
```

依赖安全是一道独立门禁，因为它需要查询 registry 的 advisory 数据库：结果依赖网络访问，
并且会随时间变化，与本仓库的代码无关。

```bash
pnpm audit:high
```

CI 会同时运行两者。修改依赖或 `pnpm-workspace.yaml` 中的 overrides 时，请在本地运行
`pnpm audit:high`；参见 [docs/dependency-overrides.md](./docs/dependency-overrides.md)。

生产版扩展会输出到 `.output/chrome-mv3`，可分发的压缩包会输出到
`.output/quotecue-<version>-chrome.zip`。

## 文档

- [docs/architecture.md](./docs/architecture.md)：目标、非目标、模块边界与设计原则。
- [CONTEXT.md](./CONTEXT.md)：领域词汇表。
- [docs/release.md](./docs/release.md)：版本准备、发布检查清单与浏览器冒烟测试。
- [docs/dependency-overrides.md](./docs/dependency-overrides.md)：依赖 overrides 与审计例外。
- [docs/lint-policy.md](./docs/lint-policy.md)：lint 规则取舍与例外策略。
- [PRIVACY.md](./PRIVACY.md)：隐私政策。
- [website/README.md](./website/README.md)：产品落地页。

`docs/` 下的文档使用英文。
