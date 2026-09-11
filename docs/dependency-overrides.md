# Dependency overrides

The scoped entries live in `pnpm-workspace.yaml`, apply to local browser and website tooling, and are not bundled into the extension.

| Override                        | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Removal condition                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `fx-runner>shell-quote@1.10.0`  | `fx-runner@1.4.0` pins a version affected by GHSA-w7jw-789q-3m8p and GHSA-395f-4hp3-45gv.                                                                                                                                                                                                                                                                                                                                                                                               | Remove when WXT's `web-ext-run` path resolves `shell-quote` to a non-vulnerable version without an override. |
| `web-ext-run>tmp@0.2.7`         | `web-ext-run@0.2.4` pins a version affected by GHSA-ph9p-34f9-6g65.                                                                                                                                                                                                                                                                                                                                                                                                                     | Remove when `web-ext-run` depends on `tmp >=0.2.6`.                                                          |
| `firefox-profile>adm-zip@0.6.0` | `firefox-profile@4.7.0` allows only the vulnerable 0.5 line affected by GHSA-xcpc-8h2w-3j85.                                                                                                                                                                                                                                                                                                                                                                                            | Remove when `firefox-profile` supports `adm-zip >=0.6.0` upstream.                                           |
| `web-ext-run>multimatch@8.0.0`  | `web-ext-run@0.2.4` pins `multimatch@6`, whose `minimatch@3` reaches `brace-expansion@1.1.16`, affected by GHSA-mh99-v99m-4gvg. Only `brace-expansion >=5.0.8` is patched, and overriding it directly breaks `minimatch@3`, which calls the module as a default function while the 5.x CommonJS build exports a named `expand`. `multimatch@8` keeps the ESM default-function export `web-ext-run` imports and resolves `minimatch@10`, which depends on the patched `brace-expansion`. | Remove when `web-ext-run` depends on a `multimatch` version that resolves `brace-expansion >=5.0.8`.         |

## Website tooling

`miniflare>sharp@0.35.4` replaces the vulnerable `sharp@0.35.2` pinned by
`miniflare@5.20260908.0-alpha` through `website > wrangler`. This fixes
[GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), which affects
AVIF decoding through libheif. The override is limited to Miniflare's dependency;
Astro already resolves a patched Sharp version.

Remove this override when the installed Wrangler/Miniflare dependency chain resolves
`sharp >=0.35.4` without it. Validate changes with `pnpm audit:high`, `pnpm check`, and
an AVIF encode/decode smoke check using Miniflare's resolved Sharp package.

`miniflare>undici@7.29.1` updates Miniflare's pinned `undici@7.29.0` within its
existing major version. Remove this override when Miniflare resolves `undici >=7.29.1`
without it.

## TypeScript compatibility

The extension uses TypeScript 7. The website stays on TypeScript 6 because
`@astrojs/check@0.9.10` declares support for TypeScript 5 and 6 only. Upgrade the
website compiler when Astro's checker supports TypeScript 7.

## Audit gate

`pnpm audit:high` is the high-severity gate. It is deliberately kept out of `pnpm check`: it queries the registry advisory database, so it needs network access and its result changes over time independently of this repository's code. CI runs it as a separate step after `pnpm check`.

When changing the WXT browser-runner entries, run `pnpm audit:high`, `pnpm check`, and Chrome and Firefox zip builds, and exercise the Firefox profile API before committing the new lockfile.
