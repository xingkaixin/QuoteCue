# QuoteCue Annotation Context

QuoteCue attaches private draft annotations to conversations on supported AI services and turns
them into a focused follow-up message.

## Language

**Annotation**:
A private user note attached to text in an assistant message. An annotation remains part of the
draft until its send is confirmed.

**Text Anchor**:
Persistable evidence for restoring selected text inside one assistant message. Exact anchors store
DOM text; legacy-rendered anchors retain older rendered text. Restoration fails closed when the
evidence does not identify one range.

**Unresolved Annotation**:
An annotation whose text anchor cannot be restored to one unique range. It remains in the draft
and can be deleted from the annotation list, but it has no highlight, badge, or editable source
position.

**Anchored Selection**:
A transient selection snapshot containing a text anchor and screen geometry. It exists only between
selection capture and annotation creation; it is not a draft.

**Draft**:
The conversation-scoped collection of annotations whose send has not been confirmed. Drafts for
identified conversations may be persisted; drafts for unidentified conversations remain in memory.

**Conversation Identity**:
The result of resolving the current page to either an identified or unidentified conversation.
_Avoid_: Conversation key

**Identified Conversation**:
A conversation with a stable, host-provided identifier that can safely own a persistent draft.

**Unidentified Conversation**:
A conversation without a stable host-provided identifier; its draft exists only for the current
page session.

**Send Confirmation**:
Evidence that the host rendered a new user message matching the compiled send. Only confirmation
allows the matching annotation snapshot to leave the draft.
_Avoid_: Accepted send

**Send Attempt**:
A single QuoteCue-owned submission of one annotation snapshot. It ends in either send confirmation
or a failure that leaves the snapshot in the draft.

**Host**:
The site-neutral capabilities QuoteCue uses for conversation identity, composer access, layout,
selection, and send confirmation.

**Host Engine**:
Reusable mechanics that implement the Host capabilities from a Site Adapter.

**Site Adapter**:
The site-specific contract for selectors, message identity, composer behavior, conversation paths,
and presentation choices.
