# Vendored anti-slop

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit
`c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`.

Installed on 2026-09-11 from the local `install-anti-slop` skill's bundled
`assets/anti-slop/` directory. Before the local adaptation below, every copied
file was compared byte-for-byte with
`skills/install-anti-slop/assets/anti-slop/` at that commit; no differences were
found. This revision identifies the copied assets, not just the upstream HEAD.

## Installed paths

- Generic plugin: `tools/oxlint/anti-slop/index.ts`.
- Generic rules and helpers: `tools/oxlint/anti-slop/{rules,shared}/`.
- Optional Effect plugin: `tools/oxlint/anti-slop/effect/index.ts`, retained but
  not enabled because no workspace package declares an Effect dependency.
- Vendored ESLint Stylistic implementation:
  `tools/oxlint/anti-slop/vendor/eslint-stylistic/`. Its separate `LICENSE` and
  `UPSTREAM.md` are retained unchanged.
- Upstream root MIT license: `tools/oxlint/anti-slop/LICENSE`, copied verbatim
  from the same commit.

The pristine plugin can be recovered from the source commit and directory above.

## Local adaptations

- In `shared/dictionary-types.ts`, coalesce the guarded array lookup
  `unsafeMembers[0]` to `null` to satisfy the repository's
  `noUncheckedIndexedAccess` setting. The existing nonempty-array condition
  ensures this does not change the rule's result for valid AST input.
- Allow explicit non-indexed object types in `no-known-value-widening`; these
  annotations can preserve discriminants or describe mutable nullable state.
- Allow adjacent single-line variable declarations, including exports, in
  `require-readable-spacing`. Other declaration and control-flow spacing remains.
- Add 20 focused RuleTester cases in `tests/local-policy.test.ts`; `pnpm test:lint`
  runs them through the installed Oxlint runtime and is part of `pnpm check`.
- Add this provenance record and the upstream root license.

## Repository integration

- `.oxlintrc.json` enables 14 generic anti-slop rules and native
  `oxc/no-accumulating-spread` at error severity. Four rules remain explicitly
  disabled; see `docs/lint-policy.md` for the decisions and exception policy.
- `@oxlint/plugins` is pinned to `1.82.0`, matching installed Oxlint `1.82.0`.
  Update these packages together.
- Lint and formatter ignore the vendored plugin and local agent assets. The
  plugin remains included in the repository's TypeScript check.
- The extension stylesheet excludes the plugin from Tailwind source scanning
  so rule implementation strings cannot generate unused utility classes.
- Only dedicated draft/protocol decoders have a file override for unknown
  parameters. Other accepted boundaries use scoped, explained suppressions.
  Unused suppression directives fail lint.
- Application migration uses separate commits for whitespace and code changes.
