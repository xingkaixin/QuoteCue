# QuoteCue

QuoteCue is a Chrome extension for annotating selected text in ChatGPT responses before sending
one focused follow-up message.

## Requirements

- Node.js 24.18.0, as pinned in `.node-version` (the supported range starts at 22.12.0)
- pnpm 11.15.1, as pinned in `package.json`

With Corepack available, install the pinned package manager and dependencies with:

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Development

```bash
pnpm dev
```

Load `.output/chrome-mv3-dev` as an unpacked extension when using a persistent Chrome profile.

## Validation and packaging

`pnpm check` is the single local and CI quality gate. It checks formatting, lint, types, tests, and
a production build.

```bash
pnpm check
pnpm zip
```

The production extension is written to `.output/chrome-mv3`, and the distributable archive is
written to `.output/quotecue-<version>-chrome.zip`.

## Release checklist

1. Start from a clean checkout and run `pnpm install --frozen-lockfile`, `pnpm check`, and
   `pnpm zip`.
2. Inspect `.output/chrome-mv3/manifest.json`. It should request only `storage` and access to
   `https://chatgpt.com/*`; its web-accessible resources should be limited to the secure field and
   generated content styles required by the extension.
3. Confirm the manifest behavior still matches [PRIVACY.md](./PRIVACY.md), especially local draft
   storage, ChatGPT-only access, closed Shadow DOM, and extension-origin annotation fields.
4. Load `.output/chrome-mv3` as an unpacked extension in a clean Chrome profile and complete the
   browser smoke test below.
5. Upload the generated zip without rebuilding or modifying its contents.

### Browser smoke test

Run these checks against the currently supported ChatGPT UI with no sensitive conversation data:

- Select assistant text, use the QuoteCue action, create and edit an annotation, then reload and
  confirm that the draft and highlight return.
- Navigate to another conversation and back; confirm drafts remain isolated to their conversation.
- Send an annotated message and confirm the pending state clears only after the matching user
  message appears. Simulate or observe a send failure and confirm the draft remains recoverable.
- Delete an annotation and undo it, then clear all annotations through the confirmation dialog.
- Exercise keyboard-only use, Escape and focus restoration, light and dark themes, browser zoom,
  and a 320 px-wide viewport.
- In the page console, confirm `document.querySelector("quotecue-ui")?.shadowRoot` returns `null`.
