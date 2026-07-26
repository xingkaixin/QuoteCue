import { browser } from "wxt/browser";

import type { IdentifiedConversation } from "@/features/host-port/host-port";

import { parseTextAnchor, type DraftAnnotation } from "./annotation";

const DRAFT_KEY_PREFIX = "quotecue:draft:";
const LEGACY_DRAFT_KEY_PREFIX = "askgpt:draft:";
const ORPHANED_DRAFT_KEY_PREFIXES = [
  `${DRAFT_KEY_PREFIX}new-chat:`,
  `${LEGACY_DRAFT_KEY_PREFIX}new-chat:`,
];
const LEGACY_DRAFT_STORAGE_VERSION = 1;
const DRAFT_STORAGE_VERSION = 2;
let orphanedDraftCleanup: Promise<void> | null = null;

type StoredDraftEnvelope = {
  version: typeof DRAFT_STORAGE_VERSION;
  annotations: DraftAnnotation[];
};

type DecodedDraft = {
  annotations: DraftAnnotation[];
  needsMigration: boolean;
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

export async function loadDraftAnnotations(conversation: IdentifiedConversation) {
  await removeOrphanedDraftsOnce();
  const key = draftStorageKey(DRAFT_KEY_PREFIX, conversation.id);
  const legacyKey = draftStorageKey(LEGACY_DRAFT_KEY_PREFIX, conversation.id);
  const result = await browser.storage.local.get([key, legacyKey]);
  const storedDraft = result[key];

  if (storedDraft !== undefined) {
    const decoded = decodeStoredDraft(storedDraft);
    if (decoded.needsMigration) {
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
  await browser.storage.local.set({ [key]: draftEnvelope(decoded.annotations) });
  await removeMigratedLegacyDraft(legacyKey);
  return decoded.annotations;
}

export async function saveDraftAnnotations(
  conversation: IdentifiedConversation,
  annotations: DraftAnnotation[],
) {
  const key = draftStorageKey(DRAFT_KEY_PREFIX, conversation.id);
  const legacyKey = draftStorageKey(LEGACY_DRAFT_KEY_PREFIX, conversation.id);

  if (annotations.length === 0) {
    await browser.storage.local.remove([key, legacyKey]);
    return;
  }

  await browser.storage.local.set({ [key]: draftEnvelope(annotations) });
  await browser.storage.local.remove(legacyKey);
}

function draftEnvelope(annotations: DraftAnnotation[]): StoredDraftEnvelope {
  return { version: DRAFT_STORAGE_VERSION, annotations };
}

function decodeStoredDraft(value: unknown): DecodedDraft {
  if (Array.isArray(value)) {
    return { annotations: decodeAnnotations(value), needsMigration: true };
  }
  if (
    !isRecord(value) ||
    (value.version !== LEGACY_DRAFT_STORAGE_VERSION && value.version !== DRAFT_STORAGE_VERSION)
  ) {
    throw new DraftStorageFormatError("Unsupported draft storage version");
  }
  if (!Array.isArray(value.annotations)) {
    throw new DraftStorageFormatError("Draft annotations must be an array");
  }

  const annotations = decodeAnnotations(value.annotations);
  return {
    annotations,
    needsMigration:
      value.version === LEGACY_DRAFT_STORAGE_VERSION ||
      annotations.length !== value.annotations.length,
  };
}

function decodeAnnotations(values: unknown[]) {
  const annotations: DraftAnnotation[] = [];
  const annotationIds = new Set<string>();

  for (const value of values) {
    const annotation = decodeAnnotation(value);
    if (!annotation || annotationIds.has(annotation.id)) {
      continue;
    }
    annotationIds.add(annotation.id);
    annotations.push(annotation);
  }

  if (values.length > 0 && annotations.length === 0) {
    throw new DraftStorageFormatError("Draft contains no valid annotations");
  }
  return annotations;
}

function decodeAnnotation(value: unknown): DraftAnnotation | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.comment !== "string") {
    return null;
  }
  const anchor = parseTextAnchor(value.anchor);
  return anchor ? { id: value.id, anchor, comment: value.comment } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function removeOrphanedDraftsOnce() {
  orphanedDraftCleanup ??= removeOrphanedDrafts().catch((error: unknown) => {
    orphanedDraftCleanup = null;
    throw error;
  });
  return orphanedDraftCleanup;
}

async function removeOrphanedDrafts() {
  const storedValues = await browser.storage.local.get(null);
  const orphanedKeys = Object.keys(storedValues).filter((key) =>
    ORPHANED_DRAFT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
  if (orphanedKeys.length > 0) {
    await browser.storage.local.remove(orphanedKeys);
  }
}

async function removeMigratedLegacyDraft(legacyKey: string) {
  try {
    await browser.storage.local.remove(legacyKey);
  } catch (error: unknown) {
    console.error("[QuoteCue] Failed to remove migrated legacy draft", error);
  }
}
