# Changelog

Notable changes to QuoteCue are documented in this file.

## [0.3.0] - 2026-08-24

### Added

- Add Japanese localization across the extension and localized landing website.
- Launch the QuoteCue website with an interactive demo, localized product guidance, and install links.
- Bound draft size and expire inactive drafts after 30 days to keep local storage predictable.

### Changed

- Reduce host-page work by scoping message scans, composer layout refreshes, and anchor projection to the content that actually changed.
- Strengthen automated release coverage with Chromium extension smoke tests and production manifest verification.

### Fixed

- Preserve pending edits, retry context, and unreadable data across failed saves and sends while keeping every attempt isolated to its site and conversation.
- Track SPA navigation and new messages more reliably, rejecting duplicate message identities and stale conversation state.
- Improve host compatibility, including Japanese annotations and stable send controls on Claude and stricter assistant-message filtering on DeepSeek.
- Clear only the matching source draft after confirmation so concurrent conversations and retries cannot remove unrelated work.
- Patch audited dependency vulnerabilities and stabilize the landing page demo across hydration, independent examples, and send/remove transitions.

## [0.2.0] - 2026-07-23

### Added

- Support Claude, DeepSeek, and Kimi as annotation hosts alongside ChatGPT, each with its own theme-following accent color.
- Make annotation deletion reversible with an undo countdown.
- Add an overlay selection action mode as an alternative to the native selection menu.
- Expose unresolved anchors and a recoverable send status so failed matches and sends can be retried.

### Changed

- Extract a generic DOM host engine and generalize send controls so new hosts share one integration path instead of host-specific code.
- Batch anchor projection for smoother annotation rendering on large responses.
- Turn the annotation summary into an accessible popover.

### Fixed

- Confirm sends reliably across hosts: transactional replay, matching-message confirmation, optimistic message confirmation, empty-composer takeover, line-break reflow, synthetic-paste composer replacement, and whitespace-insensitive match on Kimi.
- Scope drafts to their conversation, isolate new-chat persistence, and version/validate stored draft data to prevent cross-conversation leakage and corruption.
- Isolate annotation input events and close the QuoteCue shadow root to strengthen page isolation.
- Reject ambiguous text matches and correctly anchor long selections and structured selections.
- Fix numerous annotation editor and UI issues: offscreen edit targets, empty comment UI, compact editor sizing, softened surfaces, popup anchoring, secure field focus, dirty-dismissal warnings, hover details, themed tooltips, modal stacking, and badges hidden behind host overlays.
- Respect unsupported host locales in i18n fallback.
- Patch WXT runner dependency vulnerabilities.

## [0.1.0] - 2026-07-22

Initial release.

- Annotate selected text in ChatGPT assistant responses with optional comments.
- Restore text anchors and annotation highlights when response markup changes.
- Create, edit, inspect, delete, and clear annotations from an integrated composer interface.
- Persist unfinished drafts locally and isolate them by ChatGPT conversation.
- Compile annotations and the existing composer text into one focused follow-up message.
- Send through the native ChatGPT composer and clear drafts after the send is accepted.
- Provide English, Simplified Chinese, and Traditional Chinese interfaces.
- Limit extension access to local storage and `https://chatgpt.com/*`.
