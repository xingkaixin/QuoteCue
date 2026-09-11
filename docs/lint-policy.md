# Lint policy

QuoteCue owns its vendored anti-slop rules. Evaluate each rule by the maintenance
problem it prevents, then evaluate each diagnostic against the code's actual
responsibility. Existing violations are not automatically bugs or exemptions.

## Enabled checks

Keep the checks against accumulator copies, chained assertions, erased type
contracts, reflective access, module mocking, and unexplained assertions. A rule
with no current findings still protects future changes.

Two upstream policies are narrowed:

- Explicit object annotations can preserve discriminants and describe nullable
  mutable state. `no-known-value-widening` permits these while continuing to flag
  known values widened to broad types or open dictionaries.
- Consecutive short variable declarations may remain grouped, including exports.
  `require-readable-spacing` still separates other declarations and control flow.

`pnpm test:lint` protects these distinctions with RuleTester cases. Run it when
changing the vendored rules; `pnpm check` also includes it.

## React Compiler diagnostics

Oxlint 1.79 added React Compiler rules to the correctness category. On 1.82,
`react/globals`, `react/immutability`, `react/refs`, and `react/set-state-in-effect`
run as warnings while the existing error gates remain enabled.

These diagnostics cover test render probes, DOM synchronization, render-time ref
access, and effect-driven state resets. Review the findings against conversation
changes, send confirmation, and focus behavior before promoting these rules to
errors. The dependency upgrade does not establish that these findings are safe;
they remain visible for a separate behavioral migration.

## Disabled checks

| Rule                                 | Reason                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-array-filter-map`                | Two linear passes are not inherently a performance problem. Combining callbacks can change ordering and obscure intent; optimize measured hotspots.         |
| `no-conditional-empty-object-spread` | Conditional field omission is useful and explicit. Requiring later mutation does not establish a maintenance benefit.                                       |
| `no-runtime-typeof`                  | The syntax is necessary for boundary parsing, capability checks, and ordinary union narrowing. The rule cannot distinguish these from redundant validation. |
| `no-shape-in-symbol-names`           | A forbidden substring cannot establish whether a name fits the domain. Use the vocabulary in `CONTEXT.md`.                                                  |

Keep these rules explicitly disabled during upstream updates unless the project
revisits their policies.

## Boundary exceptions

Prefer an existing precise type or a checked value over a cast. Keep assertions
only where the compiler cannot express the actual invariant, and document that
invariant with `SAFETY:`. The marker does not replace evidence.

Use the smallest suppression scope for accepted exceptions, name the exact rule,
and explain why it does not apply. Unused directives fail lint. Do not exempt all
tests or disable unrelated checks to make a migration pass.

- Dedicated storage and secure-field decoders accept unknown input by design;
  only `no-unknown-parameters` is disabled for those exact modules. Other mixed
  modules use local exceptions for parsers or arbitrary error values.
- Raw storage and message fixtures must admit malformed input. They must not
  claim that unvalidated values already have domain types.
- Browser API and isolated-frame substitutes may use module mocks. App
  characterization mocks test orchestration, not the real UI integration;
  component, protocol, and E2E tests cover those separate contracts.
- Generic property-descriptor restoration accepts `object` because it does not
  depend on any domain fields.

Repeated exceptions with the same responsibility call for reviewing the rule's
scope. Do not invent aliases, interfaces, parameter names, or production injection
points solely to avoid a diagnostic.
