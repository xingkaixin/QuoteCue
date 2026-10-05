# Dependency overrides

The scoped entries live in `pnpm-workspace.yaml`, apply to local browser and website tooling, and are not bundled into the extension.

| Override                        | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Removal condition                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `fx-runner>shell-quote@1.10.0`  | `fx-runner@1.4.0` pins a version affected by GHSA-w7jw-789q-3m8p and GHSA-395f-4hp3-45gv.                                                                                                                                                                                                                                                                                                                                                                                               | Remove when WXT's `web-ext-run` path resolves `shell-quote` to a non-vulnerable version without an override. |
| `web-ext-run>tmp@0.2.7`         | `web-ext-run@0.2.4` pins a version affected by GHSA-ph9p-34f9-6g65.                                                                                                                                                                                                                                                                                                                                                                                                                     | Remove when `web-ext-run` depends on `tmp >=0.2.6`.                                                          |
| `firefox-profile>adm-zip@0.6.0` | `firefox-profile@4.7.0` allows only the vulnerable 0.5 line affected by GHSA-xcpc-8h2w-3j85.                                                                                                                                                                                                                                                                                                                                                                                            | Remove when `firefox-profile` supports `adm-zip >=0.6.0` upstream.                                           |
| `web-ext-run>multimatch@8.0.0`  | `web-ext-run@0.2.4` pins `multimatch@6`, whose `minimatch@3` reaches `brace-expansion@1.1.16`, affected by GHSA-mh99-v99m-4gvg. Only `brace-expansion >=5.0.8` is patched, and overriding it directly breaks `minimatch@3`, which calls the module as a default function while the 5.x CommonJS build exports a named `expand`. `multimatch@8` keeps the ESM default-function export `web-ext-run` imports and resolves `minimatch@10`, which depends on the patched `brace-expansion`. | Remove when `web-ext-run` depends on a `multimatch` version that resolves `brace-expansion >=5.0.8`.         |

## Website tooling

`undici@>=8.0.0 <8.10.2` is constrained to `8.10.2` for jsdom and Astro's unifont
dependency. This fixes GHSA-rfgv-xxqx-mfg5, GHSA-w293-vg96-wgc3, and
GHSA-vp8m-p9jh-q5pm.
`devalue@>=5.1.0 <5.9.3` is constrained to `5.9.3` for Astro and its React integration,
fixing GHSA-j22f-vq7h-c4qm, GHSA-mcm9-63f2-9j32, and GHSA-x5rw-q4pp-hg5g within 5.x.
Remove these constraints when the dependency chains resolve patched versions without them.

### Scoped audit exception

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

When changing the WXT browser-runner entries, run `pnpm audit:high`, `pnpm check`, and Chrome and Firefox zip builds, and exercise the Firefox profile API before committing the new lockfile.
