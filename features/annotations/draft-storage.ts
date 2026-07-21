import { browser } from "wxt/browser";

import type { DraftAnnotation } from "./annotation";

const DRAFT_KEY_PREFIX = "quotecue:draft:";
const LEGACY_DRAFT_KEY_PREFIX = "askgpt:draft:";

function draftStorageKey(prefix: string, conversationKey: string) {
  return `${prefix}${conversationKey}`;
}

export async function loadDraftAnnotations(conversationKey: string) {
  const key = draftStorageKey(DRAFT_KEY_PREFIX, conversationKey);
  const legacyKey = draftStorageKey(LEGACY_DRAFT_KEY_PREFIX, conversationKey);
  const result = await browser.storage.local.get([key, legacyKey]);
  const storedAnnotations = result[key];

  if (Array.isArray(storedAnnotations)) {
    return storedAnnotations as DraftAnnotation[];
  }

  const legacyAnnotations = result[legacyKey];
  if (!Array.isArray(legacyAnnotations)) {
    return [];
  }

  await browser.storage.local.set({ [key]: legacyAnnotations });
  await browser.storage.local.remove(legacyKey);
  return legacyAnnotations as DraftAnnotation[];
}

export async function saveDraftAnnotations(
  conversationKey: string,
  annotations: DraftAnnotation[],
) {
  const key = draftStorageKey(DRAFT_KEY_PREFIX, conversationKey);
  const legacyKey = draftStorageKey(LEGACY_DRAFT_KEY_PREFIX, conversationKey);

  if (annotations.length === 0) {
    await browser.storage.local.remove([key, legacyKey]);
    return;
  }

  await browser.storage.local.set({ [key]: annotations });
  await browser.storage.local.remove(legacyKey);
}
