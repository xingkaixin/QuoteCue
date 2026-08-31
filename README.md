# QuoteCue

QuoteCue is a Chrome extension for annotating selected text in ChatGPT, Claude, DeepSeek, and Kimi
responses before sending one focused follow-up message.

## Requirements

- Node.js 24.18.0, as pinned in `.node-version` (the supported range starts at 22.12.0)
- pnpm 11.15.1, as pinned in `package.json`

With Corepack available, install the pinned package manager and dependencies with:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

## Development

```bash
pnpm dev
```

Load `.output/chrome-mv3-dev` as an unpacked extension when using a persistent Chrome profile.

## Landing website

The Astro landing website lives in `website/` and generates localized static pages for
`https://quotecue.xingkaixin.me`:

```bash
pnpm site:dev
pnpm site:check
pnpm site:build
```

See [website/README.md](./website/README.md) for Cloudflare Workers deployment, self-hosted Umami,
Cloudflare Web Analytics, and SEO configuration. Analytics run only on the product website; the
extension does not collect usage analytics.

## Validation and packaging

`pnpm check` is the single quality gate for the code in this repository. It checks formatting,
lint, types, jsdom and Chromium tests, and a production build. After the browser installation above,
the gate runs entirely offline.

```bash
pnpm check
pnpm zip
```

Dependency security is a separate gate because it queries the registry advisory database, so its
result depends on network access and changes over time independently of this repository's code:

```bash
pnpm audit:high
```

CI runs both. Run `pnpm audit:high` locally whenever you change dependencies or the overrides in
`pnpm-workspace.yaml`; see [docs/dependency-overrides.md](./docs/dependency-overrides.md).

The production extension is written to `.output/chrome-mv3`, and the distributable archive is
written to `.output/quotecue-<version>-chrome.zip`.

## Release checklist

1. Start from a clean checkout and run `pnpm install --frozen-lockfile`, `pnpm check`, and
   `pnpm zip`.
2. `pnpm check` ends with `pnpm verify:manifest`, which asserts that
   `.output/chrome-mv3/manifest.json` requests only `storage` and access to
   `https://chatgpt.com/*`, `https://claude.ai/*`, `https://chat.deepseek.com/*`, and
   `https://www.kimi.com/*`, and that its web-accessible resources are limited to the secure field
   and the generated content styles. Widening any of these fails the gate; update
   `scripts/verify-manifest.ts` only as part of a reviewed permission change.
3. Confirm the manifest behavior still matches [PRIVACY.md](./PRIVACY.md), especially local draft
   storage, supported-host access, closed Shadow DOM, and extension-origin annotation fields.
4. Load `.output/chrome-mv3` as an unpacked extension in a clean Chrome profile and complete the
   browser smoke test below.
5. Upload the generated zip without rebuilding or modifying its contents.

### Browser smoke test

Run these checks against the supported ChatGPT, Claude, DeepSeek, and Kimi UIs with no sensitive
conversation data:

- Select assistant text, use the QuoteCue action, create and edit an annotation, then reload and
  confirm that the draft and highlight return.
- Repeat draft restoration in a ChatGPT custom GPT conversation whose path contains
  `/g/<gizmo>/c/<conversation>`.
- On a new or otherwise unidentified conversation page, confirm annotations work until reload and
  are then discarded instead of being persisted under a page-session identifier.
- Leave an unidentified conversation and confirm its draft is kept separate. Restore it explicitly
  into the chosen conversation, or discard it through confirmation, before reloading the page.
- Navigate to another conversation and back; confirm drafts remain isolated to their conversation.
- Open the same conversation in two tabs; confirm saved edits and confirmed-send cleanup appear
  in the other tab without reloading, while drafts in other conversations remain unchanged.
- While editing an annotation in one tab, remove it from the other tab; confirm the unfinished
  input remains available to cancel or explicitly save as a new annotation.
- Send an annotated message and confirm the pending state clears only after the matching user
  message appears. Simulate or observe a send failure and confirm the draft remains recoverable.
- Delete an annotation and undo it, then clear all annotations through the confirmation dialog.
- Exercise keyboard-only use, Escape and focus restoration, light and dark themes, browser zoom,
  and a 320 px-wide viewport.
- In the page console, confirm `document.querySelector("quotecue-ui")?.shadowRoot` returns `null`.
