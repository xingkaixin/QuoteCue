import { browser } from "wxt/browser";

import type { IdentifiedConversation } from "@/features/conversation/conversation-identity";

import type { DraftAnnotation } from "./annotation";
import { draftMutationExceedsCapacity } from "./draft-capacity";
import { applyDraftMutation, type DraftMutation } from "./draft-mutation";
import { removeStoredDrafts } from "./draft-retention";
import {
  decodeStoredDraft,
  draftEnvelope,
  emptyDecodedDraft,
  isExpiredDraftEnvelope,
} from "./draft-storage-codec";
import {
  DRAFT_KEY_PREFIX,
  DRAFT_RETENTION_MS,
  LEGACY_DRAFT_KEY_PREFIX,
  draftStorageKey,
  scopedDraftStorageKey,
} from "./draft-storage-key";

/**
 * The single writer for draft storage. Extension contexts share `storage.local`, so a queue that
 * lives in one content script cannot order writes made by another. Read-modify-write operations
 * are ordered per conversation, while startup cleanup briefly coordinates all conversations.
 */
export function createDraftOwner() {
  const conversationChains = new Map<string, Promise<unknown>>();
  let cleanup: Promise<void> | null = null;
  let cleanupScheduled = false;
  // A conversation loaded during this owner's life has a context open on it, so retention must
  // not delete it out from under that context even once it looks expired.
  const openConversationKeys = new Set<string>();

  function serialize<T>(conversation: IdentifiedConversation, operation: () => Promise<T>) {
    const key = scopedDraftStorageKey(conversation);
    const previous = conversationChains.get(key) ?? Promise.resolve();
    const run = async () => {
      await cleanup;
      return operation();
    };
    const result = previous.then(run, run);
    const settled = result.catch(() => undefined);
    conversationChains.set(key, settled);
    void settled.finally(() => {
      if (conversationChains.get(key) === settled) {
        conversationChains.delete(key);
      }
    });
    return result;
  }

  function scheduleCleanup(after: Promise<unknown>) {
    if (cleanupScheduled) {
      return;
    }
    cleanupScheduled = true;
    const startCleanup = () => {
      cleanup = removeStoredDrafts(openConversationKeys)
        .catch((error: unknown) => {
          console.error("[QuoteCue] Failed to clean stored drafts", error);
        })
        .finally(() => {
          cleanup = null;
        });
    };
    void after.then(startCleanup, startCleanup);
  }

  return {
    load(conversation: IdentifiedConversation) {
      openConversationKeys.add(scopedDraftStorageKey(conversation));
      const draft = serialize(conversation, () => readDraft(conversation));
      scheduleCleanup(draft);
      return draft.then(({ annotations }) => annotations);
    },
    mutate(conversation: IdentifiedConversation, mutations: readonly DraftMutation[]) {
      openConversationKeys.add(scopedDraftStorageKey(conversation));
      return serialize(conversation, async () => {
        const decoded = await readDraft(conversation);
        const current = decoded.annotations;
        let next: readonly DraftAnnotation[] = current;
        let hasUnreadableAnnotations = decoded.hasUnreadableAnnotations;
        for (const mutation of mutations) {
          if (draftMutationExceedsCapacity(next, mutation)) {
            throw new RangeError("Draft mutation exceeds QuoteCue capacity");
          }
          const mutated = applyDraftMutation(next, mutation);
          if (mutated === null || mutated === next) {
            continue;
          }
          if (hasUnreadableAnnotations && mutation.kind !== "clear") {
            throw new Error("Draft contains unreadable annotations");
          }
          next = mutated;
          if (mutation.kind === "clear") {
            hasUnreadableAnnotations = false;
          }
        }
        if (next === current) {
          return current;
        }
        const annotations = [...next];
        await writeDraft(conversation, annotations);
        return annotations;
      });
    },
  };
}

export type DraftOwner = ReturnType<typeof createDraftOwner>;

async function readDraft(conversation: IdentifiedConversation) {
  const key = scopedDraftStorageKey(conversation);
  const unscopedKey = draftStorageKey(DRAFT_KEY_PREFIX, conversation.id);
  const legacyKey = draftStorageKey(LEGACY_DRAFT_KEY_PREFIX, conversation.id);
  const result = await browser.storage.local.get([key, unscopedKey, legacyKey]);
  const storedDraft = result[key];

  if (storedDraft !== undefined) {
    if (isExpiredDraftEnvelope(storedDraft, Date.now() - DRAFT_RETENTION_MS)) {
      await writeDraft(conversation, []);
      return emptyDecodedDraft();
    }
    const decoded = decodeStoredDraft(storedDraft);
    if (decoded.needsMigration && !decoded.hasUnreadableAnnotations) {
      await browser.storage.local.set({ [key]: draftEnvelope(decoded.annotations) });
    }
    if (result[unscopedKey] !== undefined || result[legacyKey] !== undefined) {
      await removeMigratedDraftKeys([unscopedKey, legacyKey]);
    }
    return decoded;
  }

  const legacyDraft = result[unscopedKey] ?? result[legacyKey];
  if (legacyDraft === undefined) {
    return emptyDecodedDraft();
  }

  const decoded = decodeStoredDraft(legacyDraft);
  if (decoded.hasUnreadableAnnotations) {
    return decoded;
  }
  await browser.storage.local.set({ [key]: draftEnvelope(decoded.annotations) });
  await removeMigratedDraftKeys([unscopedKey, legacyKey]);
  return decoded;
}

async function writeDraft(conversation: IdentifiedConversation, annotations: DraftAnnotation[]) {
  const key = scopedDraftStorageKey(conversation);
  const unscopedKey = draftStorageKey(DRAFT_KEY_PREFIX, conversation.id);
  const legacyKey = draftStorageKey(LEGACY_DRAFT_KEY_PREFIX, conversation.id);

  if (annotations.length === 0) {
    await browser.storage.local.remove([key, unscopedKey, legacyKey]);
    return;
  }

  await browser.storage.local.set({ [key]: draftEnvelope(annotations) });
  await browser.storage.local.remove([unscopedKey, legacyKey]);
}

async function removeMigratedDraftKeys(keys: readonly string[]) {
  try {
    await browser.storage.local.remove([...keys]);
  } catch (error: unknown) {
    console.error("[QuoteCue] Failed to remove migrated legacy draft", error);
  }
}
