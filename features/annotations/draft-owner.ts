import { browser } from "wxt/browser";

import type { IdentifiedConversation } from "@/features/conversation/conversation-identity";

import type { DraftAnnotation } from "./annotation";
import type { DraftMutationResult, DraftRejectionReason } from "./draft-store";
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
  DRAFT_RETENTION_MS,
  LEGACY_DRAFT_KEY_PREFIX,
  scopedDraftStorageKey,
} from "./draft-storage-key";

/**
 * The single writer for draft storage. Extension contexts share `storage.local`, so a queue that
 * lives in one content script cannot order writes made by another. Read-modify-write operations
 * and cleanup deletions are ordered per conversation; the startup scan stays outside those queues.
 */
export function createDraftOwner() {
  const conversationChains = new Map<string, Promise<unknown>>();
  let cleanupScheduled = false;

  function serialize<T>(key: string, operation: () => Promise<T>) {
    const previous = conversationChains.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
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
    const startCleanup = () =>
      removeStoredDrafts(serialize).catch((error: unknown) => {
        console.error("[QuoteCue] Failed to clean stored drafts", error);
      });
    void after.then(startCleanup, startCleanup);
  }

  return {
    load(conversation: IdentifiedConversation) {
      const draft = serialize(scopedDraftStorageKey(conversation), () => readDraft(conversation));
      scheduleCleanup(draft);
      return draft.then(({ annotations, hasUnreadableAnnotations }) => ({
        annotations,
        hasUnreadableAnnotations,
      }));
    },
    mutate(conversation: IdentifiedConversation, mutations: readonly DraftMutation[]) {
      const key = scopedDraftStorageKey(conversation);
      return serialize(key, async (): Promise<DraftMutationResult> => {
        const decoded = await readDraft(conversation);
        const current = decoded.annotations;
        let next: readonly DraftAnnotation[] = current;
        let hasUnreadableAnnotations = decoded.hasUnreadableAnnotations;
        let reason: DraftRejectionReason | undefined;
        for (const mutation of mutations) {
          if (draftMutationExceedsCapacity(next, mutation)) {
            reason = "capacity";
            continue;
          }
          const mutated = applyDraftMutation(next, mutation);
          if (
            mutated === null ||
            (mutated === next && !(hasUnreadableAnnotations && mutation.kind === "clear"))
          ) {
            continue;
          }
          if (hasUnreadableAnnotations && mutation.kind !== "clear") {
            reason = "unreadable";
            continue;
          }
          next = mutated;
          if (mutation.kind === "clear") {
            hasUnreadableAnnotations = false;
          }
        }
        const annotations = [...next];
        if (next !== current || hasUnreadableAnnotations !== decoded.hasUnreadableAnnotations) {
          await writeDraft(conversation, annotations);
        }
        const snapshot = { annotations, hasUnreadableAnnotations };
        return reason ? { ...snapshot, status: "rejected", reason } : { ...snapshot, status: "ok" };
      });
    },
  };
}

async function readDraft(conversation: IdentifiedConversation) {
  const key = scopedDraftStorageKey(conversation);
  const legacyKey = legacyDraftKey(conversation);
  const result = await browser.storage.local.get(legacyKey ? [key, legacyKey] : [key]);
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
    if (legacyKey && result[legacyKey] !== undefined) {
      await removeMigratedDraftKey(legacyKey);
    }
    return decoded;
  }

  if (!legacyKey || result[legacyKey] === undefined) {
    return emptyDecodedDraft();
  }

  const decoded = decodeStoredDraft(result[legacyKey]);
  if (decoded.hasUnreadableAnnotations) {
    return decoded;
  }
  await browser.storage.local.set({ [key]: draftEnvelope(decoded.annotations) });
  await removeMigratedDraftKey(legacyKey);
  return decoded;
}

async function writeDraft(conversation: IdentifiedConversation, annotations: DraftAnnotation[]) {
  const key = scopedDraftStorageKey(conversation);
  const legacyKey = legacyDraftKey(conversation);

  if (annotations.length === 0) {
    await browser.storage.local.remove(legacyKey ? [key, legacyKey] : [key]);
    return;
  }

  await browser.storage.local.set({ [key]: draftEnvelope(annotations) });
  if (legacyKey) {
    await browser.storage.local.remove([legacyKey]);
  }
}

function legacyDraftKey(conversation: IdentifiedConversation) {
  // AskGPT predates multi-site support. Unscoped QuoteCue keys were shared by multiple
  // sites, so neither migration nor conversation-local cleanup can infer their owner.
  return conversation.siteId === "chatgpt" ? `${LEGACY_DRAFT_KEY_PREFIX}${conversation.id}` : null;
}

async function removeMigratedDraftKey(key: string) {
  try {
    await browser.storage.local.remove([key]);
  } catch (error: unknown) {
    console.error("[QuoteCue] Failed to remove migrated legacy draft", error);
  }
}
