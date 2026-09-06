# QuoteCue Agent Guide

本文件适用于整个仓库。QuoteCue 是运行在 ChatGPT、Claude、DeepSeek、Kimi 页面上的 Chrome
MV3 扩展，用于给助手回复添加批注，并将批注编译为一次聚焦的追问。
仓库还包含 `website/` Astro 落地页和 `packages/shared/` 共享包。

领域术语与命名以 [`CONTEXT.md`](CONTEXT.md) 的词汇表为准。

## 技术与命令

- Node.js 24.20.0（最低 22.12.0），pnpm 12.3.4；版本由项目级 `mise.toml` 管理。
- 扩展使用 WXT、React 19、TypeScript、Tailwind CSS 和 Base UI；落地页使用 Astro。
- 扩展开发：`pnpm dev`；落地页开发：`pnpm site:dev`；代码质量门禁：`pnpm check`；
  发布包：`pnpm zip`。
- 提交前必须运行与改动风险相称的测试；可交付改动必须通过 `pnpm check`。修改依赖或
  `pnpm-workspace.yaml` 中的 overrides 时，另运行 `pnpm audit:high`。

## 关键边界

- `packages/shared` 只放扩展与落地页共同使用、且不依赖浏览器或 UI 的领域代码。
- `website` 负责落地页和交互演示；需要与扩展保持一致的共享站点目录和 Compiled Prompt
  编译逻辑放在 `packages/shared`，不要在两端复制。
- `entrypoints/content` 负责扩展挂载和应用编排，不放宿主 selector 或页面观察逻辑。
- `features/host/dom-host.ts` 是通用宿主引擎；每个站点（现有 `features/chatgpt`、
  `features/claude`、`features/deepseek`、`features/kimi`）提供 `SiteAdapter`（selector、
  composer 类型、会话路径等），`features/host/active-host.ts` 按 hostname 选择宿主。
  composer 操作、导航监听或确认信号变化必须在引擎/适配器里收敛。新增或修改宿主 contract
  时更新对应的去敏 fixture（`tests/fixtures/<site>-host.ts`）和
  `tests/host-contracts.test.ts`。新增宿主还需更新 `packages/shared/src/supported-sites.ts` 和
  `features/host/site-registry.ts`；manifest 权限由 `wxt.config.ts` 从站点目录派生。
- `features/annotations` 负责批注领域、锚点算法、草稿持久化和 UI 状态；纯算法不要反向依赖
  任何宿主 DOM，宿主能力通过 `features/host-port` 使用。
- 通用 UI primitive 放在 `components/ui`，优先复用现有组件和语义化 CSS token。

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
- 保持改动最小、函数职责单一、控制流平坦；新增宿主 contract 场景使用对应站点的
  `tests/fixtures/<site>-host.ts`。
- UI 改动必须覆盖键盘、焦点、窄视口、缩放、light/dark 和 reduced motion。
- 权限、数据处理或发布行为变化时，同步检查 `PRIVACY.md`、manifest 与 `README.md`。
