# QuoteCue

QuoteCue is a Chrome extension for annotating selected text in ChatGPT, Claude, DeepSeek, and Kimi
responses before sending one focused follow-up message.

## Requirements

- Node.js 24.21.0 (the supported range starts at 22.12.0)
- pnpm 12.3.4

The project pins both tools in `mise.toml`. Install them and the project dependencies with:

```bash
mise install
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
Umami analytics, and SEO configuration. Analytics run only on the product website; the
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

## Documentation

- [docs/architecture.md](./docs/architecture.md): goals, non-goals, module boundaries, and design
  principles.
- [CONTEXT.md](./CONTEXT.md): domain vocabulary.
- [docs/release.md](./docs/release.md): release preparation, checklist, and browser smoke test.
- [docs/dependency-overrides.md](./docs/dependency-overrides.md): dependency overrides and audit
  exceptions.
- [docs/lint-policy.md](./docs/lint-policy.md): lint rule decisions and exception policy.
- [PRIVACY.md](./PRIVACY.md): privacy policy.
- [website/README.md](./website/README.md): landing website (Chinese).
