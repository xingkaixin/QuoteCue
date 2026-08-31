# QuoteCue

QuoteCue 是一个 Chrome 扩展，用于在 ChatGPT、Claude、DeepSeek 和 Kimi 的回复中对选中文本
添加批注，并将这些批注编译为一条聚焦的追问消息发送出去。

## 环境要求

- Node.js 24.18.0，版本锁定在 `.node-version`（支持的最低版本为 22.12.0）
- pnpm 11.15.1，版本锁定在 `package.json`

如果已安装 Corepack，可通过以下命令安装锁定版本的包管理器和依赖：

```bash
corepack enable
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

Cloudflare Workers 部署、Web Analytics 与 SEO 配置见
[website/README.md](./website/README.md)。

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

## 发布检查清单

1. 从干净的检出开始，依次运行 `pnpm install --frozen-lockfile`、`pnpm check` 和 `pnpm zip`。
2. `pnpm check` 的最后一步是 `pnpm verify:manifest`，它会断言
   `.output/chrome-mv3/manifest.json` 只请求 `storage` 权限，以及 `https://chatgpt.com/*`、
   `https://claude.ai/*`、`https://chat.deepseek.com/*` 和 `https://www.kimi.com/*` 的访问
   权限，并且其 web-accessible resources 仅限于安全输入字段和生成的内容样式。任何范围扩大
   都会让门禁失败；只有在经过评审的权限变更中才应修改 `scripts/verify-manifest.ts`。
3. 确认 manifest 的行为仍然符合 [PRIVACY.md](./PRIVACY.md) 的描述，尤其是本地草稿存储、
   受支持的宿主访问范围、closed Shadow DOM 以及扩展来源的批注输入字段。
4. 在一个干净的 Chrome 配置文件中将 `.output/chrome-mv3` 作为未打包扩展加载，并完成下方的
   浏览器冒烟测试。
5. 上传生成的压缩包，不要在上传前重新构建或修改其内容。

### 浏览器冒烟测试

在受支持的 ChatGPT、Claude、DeepSeek 和 Kimi 界面上运行以下检查，且不要使用包含敏感信息
的对话数据：

- 选中助手回复文本，使用 QuoteCue 操作，创建并编辑一条批注，然后刷新页面确认草稿和高亮
  能够正确恢复。
- 在路径包含 `/g/<gizmo>/c/<conversation>` 的 ChatGPT custom GPT 对话中重复上述草稿恢复检查。
- 在新建或其他无法识别的对话页面上，确认批注在刷新前可用，刷新后被丢弃，而不是以页面会话
  标识符持久化保存。
- 离开无法识别的对话后，确认草稿独立保留；刷新页面前，手动恢复到目标对话或二次确认丢弃。
- 切换到另一个对话再切回来，确认草稿仍然按对话隔离。
- 在两个标签页打开同一对话，确认保存的编辑和发送确认后的清理会自动同步，无需刷新，且不影响
  其他对话的草稿。
- 在一个标签页编辑批注时，从另一个标签页移除它；确认未保存输入仍保留，可取消或明确另存为
  新批注。
- 发送一条带批注的消息，确认待处理状态只在匹配的用户消息出现后才会清除。模拟或观察一次
  发送失败，确认草稿仍可恢复。
- 删除一条批注并撤销，然后通过确认对话框清空全部批注。
- 测试纯键盘操作、Escape 与焦点恢复、亮色与暗色主题、浏览器缩放，以及 320px 宽的窄视口。
- 在页面控制台中确认 `document.querySelector("quotecue-ui")?.shadowRoot` 返回 `null`。
