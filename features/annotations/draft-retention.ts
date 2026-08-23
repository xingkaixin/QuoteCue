import { browser } from "wxt/browser";

import { isExpiredDraftEnvelope } from "./draft-storage-codec";
import {
  DRAFT_KEY_PREFIX,
  DRAFT_RETENTION_MS,
  ORPHANED_DRAFT_KEY_PREFIXES,
} from "./draft-storage-key";

export async function removeStoredDrafts(openConversationKeys: ReadonlySet<string>) {
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
