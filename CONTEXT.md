# QuoteCue Annotation Context

QuoteCue attaches private draft annotations to conversations on supported AI services and turns
them into a focused follow-up message.

## Language

**Annotation**:
A private user note attached to text in an assistant message. An annotation remains part of the
draft until its matching send is confirmed or the user explicitly discards it.

**Text Anchor**:
Persistable evidence for restoring selected text inside one assistant message. Exact anchors store
DOM text; legacy-rendered anchors retain older rendered text. Restoration fails closed when the
evidence does not identify one range.

**Unresolved Annotation**:
An annotation whose text anchor cannot be restored to one unique range. It remains in the draft
and can be explicitly discarded from the annotation list, but it has no highlight, badge, or
editable source position.

**Anchored Selection**:
A transient selection snapshot containing a text anchor and screen geometry. It exists only between
selection capture and annotation creation; it is not a draft.

**Selection Capture**:
An anchored selection plus the host action geometry needed to present annotation creation at the
selection site.

**Draft**:
The conversation-scoped collection of annotations that have neither left after send confirmation
nor been explicitly discarded. Drafts for identified conversations may be persisted; drafts for
unidentified conversations remain in memory.

**Retained Draft**:
An unidentified conversation's draft kept apart after leaving that conversation. It joins an
identified conversation's draft only through explicit user restoration.

**Deferred Deletion**:
An explicit discard request that immediately hides annotations and commits after a five-second undo
window. Undo or a conversation change cancels the pending request, leaving the draft unchanged.

**Annotation Workspace**:
The top-level annotation UI aggregate that coordinates the draft, selection capture, projection,
editing, deferred deletion, and sending.

**Conversation Identity**:
The result of resolving the current page to either an identified or unidentified conversation.
_Avoid_: Conversation key

**Identified Conversation**:
A conversation scoped by its supported site and a stable, host-provided identifier so it can safely
own a persistent draft in extension-wide storage.

**Unidentified Conversation**:
A conversation without a stable host-provided identifier; its draft exists only for the current
page session.

**Compiled Prompt**:
The exact outgoing text compiled from an annotation snapshot and an optional supplemental question.
Host submission sends it, and send confirmation matches it.

**Supplemental Question**:
The user's original composer text, included as an optional final section of the compiled prompt.

**Send Confirmation**:
Evidence that the host rendered a new user message matching the compiled prompt. Only confirmation
can remove the matching annotation snapshot without an explicit user discard.
_Avoid_: Accepted send

**Send Attempt**:
A single QuoteCue-owned submission of one annotation snapshot. It ends in either send confirmation
or failure; failure itself never removes the snapshot from the draft.

**Host Port**:
The site-neutral boundary through which annotation code uses host capabilities and exchanges host
data without depending on a site's DOM.

**Host**:
The site-neutral capabilities QuoteCue uses for conversation identity, composer access, layout,
selection, and send confirmation.

**Host Engine**:
Reusable mechanics that implement the Host capabilities from a Site Adapter.

**Site Adapter**:
The site-specific contract for selectors, message identity, composer behavior, conversation paths,
and presentation choices.
