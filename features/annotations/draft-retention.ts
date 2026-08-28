import { browser } from "wxt/browser";

import { isExpiredDraftEnvelope } from "./draft-storage-codec";
import {
  DRAFT_KEY_PREFIX,
  DRAFT_RETENTION_MS,
  ORPHANED_DRAFT_KEY_PREFIXES,
} from "./draft-storage-key";

export async function removeStoredDrafts(
  serialize: (key: string, operation: () => Promise<boolean>) => Promise<boolean>,
) {
  const { orphanedKeys, expiredKeys } = await collectExpiredDraftKeys();
  if (orphanedKeys.length > 0) {
    // Temporary conversation keys no longer have a writer to coordinate with.
    await browser.storage.local.remove(orphanedKeys);
  }
  const removals = await Promise.all(
    expiredKeys.map((key) => serialize(key, () => removeExpiredDraft(key))),
  );
  const removedCount = removals.filter(Boolean).length;
  if (removedCount > 0) {
    console.info(
      `[QuoteCue] Removed ${removedCount} expired annotation ${
        removedCount === 1 ? "draft" : "drafts"
      }`,
    );
  }
}

async function collectExpiredDraftKeys() {
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
  const expiredKeys = draftKeys.filter((key) =>
    isExpiredDraftEnvelope(storedDrafts[key], expiresBefore),
  );
  return { orphanedKeys, expiredKeys };
}

async function removeExpiredDraft(key: string) {
  const current = await browser.storage.local.get([key]);
  if (!isExpiredDraftEnvelope(current[key], Date.now() - DRAFT_RETENTION_MS)) {
    return false;
  }
  await browser.storage.local.remove(key);
  return true;
}

async function getStoredKeys() {
  if (typeof browser.storage.local.getKeys === "function") {
    return browser.storage.local.getKeys();
  }
  return Object.keys(await browser.storage.local.get(null));
}
