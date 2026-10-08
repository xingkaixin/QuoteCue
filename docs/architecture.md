# Architecture

QuoteCue lets a reader point at exact passages in an AI response, attach a note to each, and send
them as one focused follow-up through the AI service's own composer. Terms in this document follow
[`CONTEXT.md`](../CONTEXT.md).

Use this document to judge whether a change fits the product. A change that conflicts with a goal
or crosses a non-goal needs an explicit decision recorded here before the code changes.

## Goals

1. **Precise reference.** An annotation points at one passage in one assistant message and returns
   to that passage after reloads, navigation, and host re-rendering.
2. **Unsent work survives.** A draft survives reloads, navigation, other tabs, and failed sends. It
   loses annotations only through send confirmation or an explicit discard.
3. **One focused follow-up.** The draft compiles into one Compiled Prompt, sent through the user's
   existing session with the host's own send gesture.
4. **Native on each supported site.** QuoteCue follows the host's send control, layout, theme, and
   keyboard behavior instead of adding a parallel workflow.
5. **Private by construction.** Annotation data stays in the user's browser until the user sends it
   to the active AI service. Permissions stay at `storage` plus the supported hosts.
6. **New sites are cheap.** Supporting a site means adding a Site Adapter and its fixtures, not
   forking engine behavior.

## Non-goals

- **No QuoteCue backend.** No server, account, cross-device sync, telemetry, or extension analytics.
  The website's analytics are separate and never run in the extension.
- **No archive.** Annotations are working state for the next message. Sent annotations are not
  kept, and stored drafts expire after 30 days without an update.
- **No automatic sending or generation.** QuoteCue never sends without a trusted user send gesture
  and never calls an AI service API or intercepts its network traffic. It works only through the
  page's composer and send control.
- **No guessing.** When a text anchor does not identify exactly one range, the annotation stays
  unresolved. QuoteCue does not approximate its position.
- **No general web annotation.** QuoteCue runs only on the sites in
  `packages/shared/src/supported-sites.ts`.
- **No changes to conversation content.** QuoteCue may highlight text and adjust the composer layout
  to make room for its controls, but it does not edit assistant or user messages.

## System overview

```text
Supported AI page
└─ Content script (entrypoints/content)
   ├─ Host Engine + Site Adapter (features/host, features/<site>)   reads and drives host DOM
   │     └─ exposed only through Host Port (features/host-port)
   ├─ Annotation Workspace (features/annotations)                   closed Shadow DOM UI
   │     └─ comment input in the secure field frame (entrypoints/secure-field)
   └─ Draft store client ── runtime messages ──► Draft owner (entrypoints/background)
                                                    └─ chrome.storage.local

packages/shared   supported sites and prompt compilation, also used by website/
```

## Modules

| Module                            | Owns                                                                                                                      | Must not                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `entrypoints/content`             | Choosing the active host, mounting the closed Shadow DOM, and wiring providers.                                           | Contain selectors, page observers, or domain rules.                      |
| `entrypoints/background`          | The Draft owner: the only writer of draft storage. It serializes mutations per conversation and runs retention cleanup.   | Touch host pages or UI.                                                  |
| `entrypoints/secure-field`        | The extension-origin frame used for annotation text entry.                                                                | Expose field values through host-page DOM events.                        |
| `features/host`                   | The Host Engine: composer driver, send pipeline, composer layout, selection anchoring, visuals, reveal, and page signals. | Import `features/annotations` (enforced by lint).                        |
| `features/<site>`                 | One Site Adapter per site: selectors, message identity, composer access, conversation paths, and presentation mode.       | Contain engine logic or their own observers.                             |
| `features/host-port`              | The site-neutral `Host` contract and its React provider.                                                                  | Know any site's DOM or import `features/annotations` (enforced by lint). |
| `features/annotations`            | Annotation and draft domain, anchor restoration, draft runtime and persistence, send interception, and the annotation UI. | Import `features/host` or read host DOM directly.                        |
| `features/conversation`           | Conversation Identity.                                                                                                    | Depend on other features.                                                |
| `components/ui`, `features/theme` | Shared UI primitives, semantic tokens, and host accent mapping.                                                           | Hold annotation behavior.                                                |
| `packages/shared`                 | Facts the extension and website must agree on: supported sites and Compiled Prompt compilation.                           | Depend on browser APIs or UI.                                            |
| `website`                         | The Astro landing page and interactive demo.                                                                              | Copy logic that belongs in `packages/shared`.                            |

Dependencies point toward the Host Port: annotations and the host engine both depend on it, and
neither depends on the other. Site adapters depend on the engine's adapter types; the site registry
in `features/host` connects them.

## Core flows

**Annotate.** The engine captures a selection as an Anchored Selection: a Text Anchor plus screen
geometry. The user writes the comment in the secure field. The resulting draft mutation goes to the
Draft owner for an identified conversation, or stays in memory for an unidentified one.

**Restore.** On load and on host content invalidation, the workspace restores each Text Anchor
against its message. A unique match yields a highlight and badge. Any other result yields an
Unresolved Annotation that remains in the draft.

**Send.** A trusted Enter key or send-button click reaches the send pipeline. When the draft has
annotations, QuoteCue claims the event, compiles the Compiled Prompt with the composer text as the
Supplemental Question, writes it into the composer, and replays the host's send. Send confirmation
requires a new user message matching the prompt. Only that confirmation removes the sent snapshot.
A failure restores the composer text and keeps the draft.

**Synchronize.** All writes go through the Draft owner. Other tabs showing the same conversation
reload from `storage.onChanged`.

## Design principles

### Host layer

- The adapter supplies site facts; the engine owns mechanics. The engine branches on adapter
  capabilities, not on site IDs.
- Host behavior relies on structural selectors. Do not probe localized text or add fallback
  selector chains; update the adapter and its fixture when the host changes.
- Page-wide DOM changes reach features only through the shared signals in `host-signals.ts`. Other
  observers stay scoped to one element, such as the composer or send control. Do not add another
  observer on the page body.
- Only trusted browser events start a send. Host page scripts cannot trigger an annotated send.

### Annotation domain

- Anchor restoration fails closed. Ambiguity produces an Unresolved Annotation, never a guess.
- Drafts are scoped to a Conversation Identity. Identified drafts persist; unidentified drafts live
  in memory and join another conversation only through explicit restoration.
- Stored drafts are versioned and validated on read. Unreadable data is surfaced to the user and is
  never silently dropped or rewritten.
- Drafts are bounded: annotation count, comment, selection, and prompt length limits live in
  `features/annotations/draft-capacity.ts`, and stored drafts expire after 30 days.
- Pure algorithms take data, not host DOM. Host capabilities arrive through the Host Port.

### UI

- The UI lives in a closed Shadow DOM with isolated events. Annotation text entry stays in the
  extension-origin frame.
- Colors come from semantic tokens mapped to each host's accent, so the UI follows the host in light
  and dark themes.
- Every UI change covers keyboard use, focus restoration, narrow viewports, zoom, light and dark
  themes, and reduced motion.

### Privacy and permissions

- Selected text, comments, composer content, and drafts never reach logs, telemetry, or a
  developer-controlled service.
- Manifest permissions derive from the supported-site list, and `pnpm verify:manifest` rejects any
  widening. Permission or data-handling changes update [`PRIVACY.md`](../PRIVACY.md) in the same
  change.
