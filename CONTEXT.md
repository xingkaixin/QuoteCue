# QuoteCue Annotation Context

QuoteCue attaches private draft annotations to conversations on supported AI services and turns
them into a focused follow-up message.

## Language

**Conversation Identity**:
The result of resolving the current page to either an identified or unidentified conversation.
_Avoid_: Conversation key

**Identified Conversation**:
A conversation with a stable, host-provided identifier that can safely own a persistent draft.

**Unidentified Conversation**:
A conversation without a stable host-provided identifier; its draft exists only for the current
page session.
