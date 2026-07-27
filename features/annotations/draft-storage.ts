import { browser } from "wxt/browser";

import type { IdentifiedConversation } from "@/features/host-port/host-port";
import { parseTextAnchor } from "@/features/host-port/text-anchor";
import { isRecord } from "@/lib/is-record";

import type { DraftAnnotation } from "./annotation";
import type { DraftStore } from "./draft-store";

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

type BrowserDraftStoreState = {
  cleanup: Promise<void> | null;
  keyUseCounts: Map<string, number>;
};

class DraftStorageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftStorageFormatError";
  }
}

function draftStorageKey(prefix: string, conversationId: string) {
  return `${prefix}${conversationId}`;
}

export function createBrowserDraftStore(): DraftStore {
  const state: BrowserDraftStoreState = {
    cleanup: null,
    keyUseCounts: new Map(),
  };
  return {
    load: (conversation) => loadDraftAnnotations(state, conversation),
    save: (conversation, annotations) => saveDraftAnnotations(state, conversation, annotations),
  };
}

async function loadDraftAnnotations(
  state: BrowserDraftStoreState,
  conversation: IdentifiedConversation,
) {
  const key = draftStorageKey(DRAFT_KEY_PREFIX, conversation.id);
  const legacyKey = draftStorageKey(LEGACY_DRAFT_KEY_PREFIX, conversation.id);
  scheduleDraftCleanup(state, key);
  const result = await browser.storage.local.get([key, legacyKey]);
  const storedDraft = result[key];

  if (storedDraft !== undefined) {
    const decoded = decodeStoredDraft(storedDraft);
    if (decoded.needsMigration && !decoded.hasUnreadableAnnotations) {
      await browser.storage.local.set({ [key]: draftEnvelope(decoded.annotations) });
    }
    if (result[legacyKey] !== undefined) {
      await removeMigratedLegacyDraft(legacyKey);
    }
    return decoded.annotations;
  }

  const legacyDraft = result[legacyKey];
  if (legacyDraft === undefined) {
    return [];
  }

  const decoded = decodeStoredDraft(legacyDraft);
  if (decoded.hasUnreadableAnnotations) {
    return decoded.annotations;
  }
  await browser.storage.local.set({ [key]: draftEnvelope(decoded.annotations) });
  await removeMigratedLegacyDraft(legacyKey);
  return decoded.annotations;
}

async function saveDraftAnnotations(
  state: BrowserDraftStoreState,
  conversation: IdentifiedConversation,
  annotations: DraftAnnotation[],
) {
  const key = draftStorageKey(DRAFT_KEY_PREFIX, conversation.id);
  const legacyKey = draftStorageKey(LEGACY_DRAFT_KEY_PREFIX, conversation.id);
  const releaseDraftKey = retainDraftKey(state, key);

  try {
    if (annotations.length === 0) {
      await browser.storage.local.remove([key, legacyKey]);
      return;
    }

    await browser.storage.local.set({ [key]: draftEnvelope(annotations) });
    await browser.storage.local.remove(legacyKey);
  } finally {
    if (state.cleanup) {
      void state.cleanup.then(releaseDraftKey);
    } else {
      releaseDraftKey();
    }
  }
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
    throw new DraftStorageFormatError("Unsupported draft storage version");
  }
  if (!Array.isArray(value.annotations)) {
    throw new DraftStorageFormatError("Draft annotations must be an array");
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
    throw new DraftStorageFormatError("Draft contains no valid annotations");
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

function scheduleDraftCleanup(state: BrowserDraftStoreState, currentDraftKey: string) {
  const releaseDraftKey = retainDraftKey(state, currentDraftKey);
  void removeStoredDraftsOnce(state).then(releaseDraftKey);
}

function removeStoredDraftsOnce(state: BrowserDraftStoreState) {
  state.cleanup ??= removeStoredDrafts(state).catch((error: unknown) => {
    state.cleanup = null;
    console.error("[QuoteCue] Failed to clean stored drafts", error);
  });
  return state.cleanup;
}

async function removeStoredDrafts(state: BrowserDraftStoreState) {
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
      !state.keyUseCounts.has(key) && isExpiredDraftEnvelope(storedDrafts[key], expiresBefore),
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

function retainDraftKey(state: BrowserDraftStoreState, key: string) {
  state.keyUseCounts.set(key, (state.keyUseCounts.get(key) ?? 0) + 1);
  return () => {
    const nextUseCount = (state.keyUseCounts.get(key) ?? 1) - 1;
    if (nextUseCount === 0) {
      state.keyUseCounts.delete(key);
      return;
    }
    state.keyUseCounts.set(key, nextUseCount);
  };
}

async function removeMigratedLegacyDraft(legacyKey: string) {
  try {
    await browser.storage.local.remove(legacyKey);
  } catch (error: unknown) {
    console.error("[QuoteCue] Failed to remove migrated legacy draft", error);
  }
}
