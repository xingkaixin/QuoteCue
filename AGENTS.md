# QuoteCue Agent Guide

本文件适用于整个仓库。QuoteCue 是运行在 ChatGPT、Claude、DeepSeek、Kimi 页面上的 Chrome
MV3 扩展，用于给助手回复添加批注，并将批注编译为一次聚焦的追问。
仓库还包含 `website/` Astro 落地页和 `packages/shared/` 共享包。

- 领域术语与命名以 [`CONTEXT.md`](CONTEXT.md) 的词汇表为准；新增或改变术语时先更新它。
- 项目目标、非目标、模块职责、依赖方向和设计原则见
  [`docs/architecture.md`](docs/architecture.md)。新增模块、跨模块依赖、新增宿主、改变数据流
  或产品范围前先读它；与其中目标或非目标冲突时，先更新该文档并说明取舍。
- 其他文档索引见 [`README.md`](README.md#documentation)。

## 技术与命令

- Node.js 24.21.0（最低 22.12.0），pnpm 12.3.4；版本由项目级 `mise.toml` 管理。
- 扩展使用 WXT、React 19、TypeScript、Tailwind CSS 和 Base UI；落地页使用 Astro。
- 扩展开发：`pnpm dev`；落地页开发：`pnpm site:dev`；代码质量门禁：`pnpm check`；
  发布包：`pnpm zip`。
- 提交前必须运行与改动风险相称的测试；可交付改动必须通过 `pnpm check`。修改依赖或
  `pnpm-workspace.yaml` 中的 overrides 时，另运行 `pnpm audit:high`。

## 宿主改动流程

- 修改宿主 contract 时更新对应的去敏 fixture（`tests/fixtures/<site>-host.ts`）和
  `tests/host-contracts.test.ts`。
- 新增宿主时，在 `features/<site>` 提供 `SiteAdapter`，并更新
  `packages/shared/src/supported-sites.ts`、`features/host/site-registry.ts`、fixture 和 contract
  测试；manifest 权限由 `wxt.config.ts` 从站点目录派生。

## 不可破坏的行为

- QuoteCue UI 保持 closed Shadow DOM；批注输入保持 extension-origin frame 和隔离事件边界。
- 草稿按 conversation 隔离，读取时必须版本化并校验；发送失败时保留草稿，只有匹配的用户
  消息确认后才能清理。
- 文本锚点无法唯一恢复时必须 fail closed，不得猜测位置。
- 扩展不得把选中文本、批注、composer 内容或草稿写入日志或遥测，也不得发送到开发者控制的
  服务。草稿只按 `CONTEXT.md` 定义的生命周期保存在用户浏览器中；仅在用户明确发送时把
  编译后的消息交给当前 AI 服务。
- `.issues/` 是本地 issue 数据，禁止加入 Git。

## 修改原则

- 先找根因，避免增加重复状态、兜底 selector、localized string 探测或全页面额外 observer。
- 保持改动最小、函数职责单一、控制流平坦。
- 通用 UI primitive 放在 `components/ui`，优先复用现有组件和语义化 CSS token。
- UI 改动必须覆盖键盘、焦点、窄视口、缩放、light/dark 和 reduced motion。
- 权限、数据处理或发布行为变化时，同步检查 `PRIVACY.md`、`scripts/verify-manifest.ts` 与
  `docs/release.md`。
- 新增或移除依赖 override 时，同步更新 `docs/dependency-overrides.md`。
