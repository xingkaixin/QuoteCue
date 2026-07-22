# QuoteCue Agent Guide

本文件适用于整个仓库。QuoteCue 是运行在 ChatGPT 页面上的 Chrome MV3 扩展，用于给助手
回复添加批注，并将批注编译为一次聚焦的追问。

## 技术与命令

- Node.js 24.18.0（最低 22.12.0），pnpm 11.15.1。
- WXT、React 19、TypeScript、Tailwind CSS、Base UI、Vitest、oxlint、oxfmt。
- 开发：`pnpm dev`；完整门禁：`pnpm check`；发布包：`pnpm zip`。
- 提交前必须运行与改动风险相称的测试；可交付改动必须通过 `pnpm check`。

## 关键边界

- `entrypoints/content` 负责扩展挂载和应用编排，不放 ChatGPT selector 或页面观察逻辑。
- `features/chatgpt/chatgpt-host.ts` 是 ChatGPT DOM contract 的唯一生产入口。宿主 selector、
  composer 操作、导航监听或确认信号变化必须在这里收敛，并更新去敏 fixture 测试。
- `features/annotations` 负责批注领域、锚点算法、草稿持久化和 UI 状态；纯算法不要反向依赖
  ChatGPT DOM。
- 通用 UI primitive 放在 `components/ui`，优先复用现有组件和语义化 CSS token。

## 不可破坏的行为

- QuoteCue UI 保持 closed Shadow DOM；批注输入保持 extension-origin frame 和隔离事件边界。
- 草稿按 conversation 隔离，读取时必须版本化并校验；发送失败时保留草稿，只有匹配的用户
  消息确认后才能清理。
- 文本锚点无法唯一恢复时必须 fail closed，不得猜测位置。
- 不记录或上报选中文本、批注内容、composer 内容及其他用户数据。
- `.issues/` 是本地 issue 数据，禁止加入 Git。

## 修改原则

- 先找根因，避免增加重复状态、兜底 selector、localized string 探测或全页面额外 observer。
- 保持改动最小、函数职责单一、控制流平坦；新增宿主 contract 场景使用
  `tests/fixtures/chatgpt-host.ts`。
- UI 改动必须覆盖键盘、焦点、窄视口、缩放、light/dark 和 reduced motion。
- 权限、数据处理或发布行为变化时，同步检查 `PRIVACY.md`、manifest 与 `README.md`。
