# Release

## Prepare the version

Update these together in one release commit:

- `version` in `package.json`.
- A new entry in `CHANGELOG.md` and `CHANGELOG_zh.md`.
- The user-facing release notes in `website/src/i18n/product-updates.ts` for every locale.
- The version, date, and highlights in `website/public/llms.txt`.
- The expected version and dates in `website/scripts/verify-build.mjs`.

## Checklist

1. Start from a clean checkout and run `pnpm install --frozen-lockfile`, `pnpm check`, and
   `pnpm zip`.
2. `pnpm check` ends with `pnpm verify:manifest`, which asserts that
   `.output/chrome-mv3/manifest.json` requests only `storage` and access to
   `https://chatgpt.com/*`, `https://claude.ai/*`, `https://chat.deepseek.com/*`, and
   `https://www.kimi.com/*`, and that its web-accessible resources are limited to the secure field
   and the generated content styles. Widening any of these fails the gate; update
   `scripts/verify-manifest.ts` only as part of a reviewed permission change.
3. Confirm the manifest behavior still matches [PRIVACY.md](../PRIVACY.md), especially local draft
   storage, supported-host access, closed Shadow DOM, and extension-origin annotation fields.
4. Load `.output/chrome-mv3` as an unpacked extension in a clean Chrome profile and complete the
   browser smoke test below.
5. Upload the generated zip without rebuilding or modifying its contents.

## Browser smoke test

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
- Confirm drafts without a site identifier are not automatically restored or cleared by a
  conversation with the same ID; legacy AskGPT drafts may be restored only on ChatGPT.
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
