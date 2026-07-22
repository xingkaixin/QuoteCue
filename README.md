# QuoteCue

A Chrome extension for annotating selected text in AI responses before sending one focused follow-up
message.

## Development

```bash
pnpm install
pnpm dev
```

Load `.output/chrome-mv3-dev` as an unpacked extension when using a persistent Chrome profile.

## Validation

```bash
pnpm check
```

For a privacy smoke test on ChatGPT:

1. Confirm `document.querySelector("quotecue-ui")?.shadowRoot` returns `null` in the page console.
2. Create and edit an annotation; verify the secure field focuses, saves, cancels, and keeps its
   tooltip inside the QuoteCue UI.
3. Send annotations and confirm the pending state resolves only after the matching user message
   appears.
