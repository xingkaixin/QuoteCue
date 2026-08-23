import { browser } from "wxt/browser";

import type { IdentifiedConversation } from "@/features/host-port/host-port";
import { isRecord } from "@/lib/is-record";
import { parseTextAnchor } from "@/lib/text-anchor";

import type { DraftAnnotation } from "./annotation";
import { draftMutationExceedsCapacity } from "./draft-capacity";
import { applyDraftMutation, type DraftMutation } from "./draft-mutation";

const DRAFT_KEY_PREFIX = "quotecue:draft:";
const LEGACY_DRAFT_KEY_PREFIX = "askgpt:draft:";
const ORPHANED_DRAFT_KEY_PREFIXES = [
  `${DRAFT_KEY_PREFIX}new-chat:`,
  `${LEGACY_DRAFT_KEY_PREFIX}new-chat:`,
];
const RENDERED_QUOTE_DRAFT_STORAGE_VERSION = 1;
const UNMARKED_ANCHOR_DRAFT_STORAGE_VERSION = 2;
const DRAFT_STORAGE_VERSION = 3;
const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

type DraftStorageVersion =
  | typeof RENDERED_QUOTE_DRAFT_STORAGE_VERSION
  | typeof UNMARKED_ANCHOR_DRAFT_STORAGE_VERSION
  | typeof DRAFT_STORAGE_VERSION;

type StoredDraftEnvelope = {
  version: typeof DRAFT_STORAGE_VERSION;
  annotations: DraftAnnotation[];
  updatedAt?: number;
};

type DecodedDraft = {
  annotations: DraftAnnotation[];
  hasUnreadableAnnotations: boolean;
  needsMigration: boolean;
};

type DecodedAnnotations = {
  annotations: DraftAnnotation[];
  hasDuplicateAnnotations: boolean;
  hasUnreadableAnnotations: boolean;
};

function draftStorageKey(prefix: string, conversationId: string) {
  return `${prefix}${conversationId}`;
}

function scopedDraftStorageKey(conversation: IdentifiedConversation) {
  return `${DRAFT_KEY_PREFIX}${conversation.siteId}:${conversation.id}`;
}

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

function emptyDecodedDraft(): DecodedDraft {
  return { annotations: [], hasUnreadableAnnotations: false, needsMigration: false };
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

function draftEnvelope(annotations: DraftAnnotation[]): StoredDraftEnvelope {
  return { version: DRAFT_STORAGE_VERSION, annotations, updatedAt: Date.now() };
}

function decodeStoredDraft(value: unknown): DecodedDraft {
  if (Array.isArray(value)) {
    const decoded = decodeAnnotations(value, RENDERED_QUOTE_DRAFT_STORAGE_VERSION);
    return {
      annotations: decoded.annotations,
      hasUnreadableAnnotations: decoded.hasUnreadableAnnotations,
      needsMigration: true,
    };
  }
  if (!isRecord(value) || !isDraftStorageVersion(value.version)) {
    throw new Error("Unsupported draft storage version");
  }
  if (!Array.isArray(value.annotations)) {
    throw new Error("Draft annotations must be an array");
  }

  const decoded = decodeAnnotations(value.annotations, value.version);
  return {
    annotations: decoded.annotations,
    hasUnreadableAnnotations: decoded.hasUnreadableAnnotations,
    needsMigration: value.version !== DRAFT_STORAGE_VERSION || decoded.hasDuplicateAnnotations,
  };
}

function decodeAnnotations(values: unknown[], version: DraftStorageVersion): DecodedAnnotations {
  const annotations: DraftAnnotation[] = [];
  const annotationIds = new Set<string>();
  let hasDuplicateAnnotations = false;
  let hasUnreadableAnnotations = false;

  for (const value of values) {
    const annotation = decodeAnnotation(value, version);
    if (!annotation) {
      hasUnreadableAnnotations = true;
      continue;
    }
    if (annotationIds.has(annotation.id)) {
      hasDuplicateAnnotations = true;
      continue;
    }
    annotationIds.add(annotation.id);
    annotations.push(annotation);
  }

  if (values.length > 0 && annotations.length === 0) {
    throw new Error("Draft contains no valid annotations");
  }
  return { annotations, hasDuplicateAnnotations, hasUnreadableAnnotations };
}

function decodeAnnotation(value: unknown, version: DraftStorageVersion): DraftAnnotation | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.comment !== "string") {
    return null;
  }
  const anchor = decodeTextAnchor(value.anchor, version);
  return anchor ? { id: value.id, anchor, comment: value.comment } : null;
}

function decodeTextAnchor(value: unknown, version: DraftStorageVersion) {
  if (version === DRAFT_STORAGE_VERSION) {
    return parseTextAnchor(value);
  }
  if (!isRecord(value)) {
    return null;
  }

  // Version 2 may contain version 1 data rewritten unchanged; only displayQuote proves exact capture.
  const format =
    version === UNMARKED_ANCHOR_DRAFT_STORAGE_VERSION && value.displayQuote !== undefined
      ? "exact"
      : "legacy-rendered";
  return parseTextAnchor({ ...value, format });
}

function isDraftStorageVersion(value: unknown): value is DraftStorageVersion {
  return (
    value === RENDERED_QUOTE_DRAFT_STORAGE_VERSION ||
    value === UNMARKED_ANCHOR_DRAFT_STORAGE_VERSION ||
    value === DRAFT_STORAGE_VERSION
  );
}

async function removeStoredDrafts(openConversationKeys: ReadonlySet<string>) {
  const storedKeys = await getStoredKeys();
  const orphanedKeys = storedKeys.filter((key) =>
    ORPHANED_DRAFT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
  const orphanedKeySet = new Set(orphanedKeys);
  const draftKeys = storedKeys.filter(
    (key) => key.startsWith(DRAFT_KEY_PREFIX) && !orphanedKeySet.has(key),
  );
  const storedDrafts = draftKeys.length > 0 ? await browser.storage.local.get(draftKeys) : {};
  const expiresBefore = Date.now() - DRAFT_RETENTION_MS;
  const expiredKeys = draftKeys.filter(
    (key) =>
      !openConversationKeys.has(key) && isExpiredDraftEnvelope(storedDrafts[key], expiresBefore),
  );
  const keysToRemove = [...orphanedKeys, ...expiredKeys];

  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }
  if (expiredKeys.length > 0) {
    console.info(
      `[QuoteCue] Removed ${expiredKeys.length} expired annotation ${
        expiredKeys.length === 1 ? "draft" : "drafts"
      }`,
    );
  }
}

async function getStoredKeys() {
  if (typeof browser.storage.local.getKeys === "function") {
    return browser.storage.local.getKeys();
  }
  return Object.keys(await browser.storage.local.get(null));
}

function isExpiredDraftEnvelope(value: unknown, expiresBefore: number) {
  return (
    isRecord(value) &&
    value.version === DRAFT_STORAGE_VERSION &&
    Array.isArray(value.annotations) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt) &&
    value.updatedAt <= expiresBefore
  );
}

async function removeMigratedDraftKeys(keys: readonly string[]) {
  try {
    await browser.storage.local.remove([...keys]);
  } catch (error: unknown) {
    console.error("[QuoteCue] Failed to remove migrated legacy draft", error);
  }
}
