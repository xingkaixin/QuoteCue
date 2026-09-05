import type { IdentifiedConversation } from "@/features/conversation/conversation-identity";

export const DRAFT_KEY_PREFIX = "quotecue:draft:";
export const LEGACY_DRAFT_KEY_PREFIX = "askgpt:draft:";
export const ORPHANED_DRAFT_KEY_PREFIXES = [
  `${DRAFT_KEY_PREFIX}new-chat:`,
  `${LEGACY_DRAFT_KEY_PREFIX}new-chat:`,
];
export const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export function scopedDraftStorageKey(conversation: IdentifiedConversation) {
  return `${DRAFT_KEY_PREFIX}${conversation.siteId}:${conversation.id}`;
}
