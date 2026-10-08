# Dependency overrides

The overrides live in `pnpm-workspace.yaml`. They apply to build, test, and website tooling and
are not bundled into the extension.

| Override                            | Consumers                         | Reason                                                                          | Removal condition                                            |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `nanoid` → `3.3.18`                 | `postcss` through Vite            | `nanoid@3.3.16` failed the audit gate.                                          | Remove when `postcss` resolves `nanoid >=3.3.18` without it. |
| `undici@>=8.0.0 <8.10.2` → `8.10.2` | jsdom, Astro's unifont dependency | Fixes GHSA-rfgv-xxqx-mfg5, GHSA-w293-vg96-wgc3, and GHSA-vp8m-p9jh-q5pm.        | Remove when the dependency chains resolve `undici >=8.10.2`. |
| `devalue@>=5.1.0 <5.9.3` → `5.9.3`  | Astro, `@astrojs/react`           | Fixes GHSA-j22f-vq7h-c4qm, GHSA-mcm9-63f2-9j32, and GHSA-x5rw-q4pp-hg5g in 5.x. | Remove when the dependency chains resolve `devalue >=5.9.3`. |

Every override needs a row here. When `pnpm why -r <package>` no longer finds a package, its
override is inert; remove it together with its row.

## Scoped audit exception

Reviewed on 2026-10-03: [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
affects `http-cache-semantics <=4.2.0` and has no published fix. It requires a shared
cache to honor a caller's `max-stale` request when reusing another user's response.

The only installed consumer is Astro 7.3.2's build-time remote-image cache in
`astro/dist/assets/build/remote.js`. It creates its own requests, does not forward
visitor headers, and calls `storable()` and `timeToLive()`, not the vulnerable
`satisfiesWithoutRevalidation()` method. QuoteCue uses local images and deploys
static files through Workers Static Assets; no Astro server or shared user-response
cache is deployed. The advisory therefore does not apply to this deployment.

Only this GHSA is excluded from the audit gate. Reassess the exception when changing
Astro, adding SSR, a Worker entrypoint, authenticated remote image fetching, or any
new consumer of `http-cache-semantics`. Remove it when a patched upstream release
is available. The build verification rejects a Worker entrypoint or server output
so the static-deployment assumption cannot silently change.

## TypeScript compatibility

The extension uses TypeScript 7. The website stays on TypeScript 6 because
`@astrojs/check@0.9.10` declares support for TypeScript 5 and 6 only. Upgrade the
website compiler when Astro's checker supports TypeScript 7.

## Audit gate

`pnpm audit:high` is the high-severity gate. It is deliberately kept out of `pnpm check`: it queries the registry advisory database, so it needs network access and its result changes over time independently of this repository's code. CI runs it as a separate step after `pnpm check`.
