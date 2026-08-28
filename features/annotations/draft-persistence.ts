import {
  conversationIdentityKey,
  type IdentifiedConversation,
} from "@/features/conversation/conversation-identity";

import { applyDraftMutations, type DraftMutation } from "./draft-mutation";
import type { DraftMutationResult, DraftStore } from "./draft-store";

export type DraftPersistenceEvent =
  | {
      status: "failed";
      conversationIdentity: IdentifiedConversation;
      error: unknown;
    }
  | {
      status: "saved";
      conversationIdentity: IdentifiedConversation;
      result: DraftMutationResult;
      pendingMutations: readonly DraftMutation[];
    };

type PendingDraftSave = {
  activeSave: Promise<void> | null;
  conversationIdentity: IdentifiedConversation;
  hasFailed: boolean;
  mutations: DraftMutation[];
};

type DraftPersistenceListener = (event: DraftPersistenceEvent) => void;

export function createDraftPersistence(draftStore: DraftStore) {
  const pendingSaves = new Map<string, PendingDraftSave>();
  const listeners = new Set<DraftPersistenceListener>();

  async function load(conversation: IdentifiedConversation) {
    const key = conversationIdentityKey(conversation);
    await pendingSaves.get(key)?.activeSave;
    const draft = await draftStore.load(conversation);
    const pending = pendingSaves.get(key);
    const pendingMutations = pending?.mutations ?? [];
    return {
      hasUnreadableAnnotations: draft.hasUnreadableAnnotations,
      annotations:
        pendingMutations.length > 0
          ? applyDraftMutations(draft.annotations, pendingMutations)
          : draft.annotations,
      hasFailedSave: pending?.hasFailed ?? false,
    };
  }

  function enqueue(conversation: IdentifiedConversation, mutation: DraftMutation) {
    const pending = pendingSave(conversation);
    pending.mutations.push(mutation);
    persist(pending);
  }

  function retry(conversation: IdentifiedConversation) {
    const pending = pendingSaves.get(conversationIdentityKey(conversation));
    if (pending) {
      persist(pending);
    }
  }

  function subscribe(listener: DraftPersistenceListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function pendingSave(conversation: IdentifiedConversation) {
    const key = conversationIdentityKey(conversation);
    const existing = pendingSaves.get(key);
    if (existing) {
      return existing;
    }
    const pending = {
      activeSave: null,
      conversationIdentity: conversation,
      hasFailed: false,
      mutations: [],
    };
    pendingSaves.set(key, pending);
    return pending;
  }

  function persist(pending: PendingDraftSave) {
    if (pending.activeSave || pending.mutations.length === 0) {
      return;
    }
    const activeSave = drain(pending).finally(() => {
      if (pending.activeSave !== activeSave) {
        return;
      }
      pending.activeSave = null;
      if (pending.mutations.length === 0) {
        pendingSaves.delete(conversationIdentityKey(pending.conversationIdentity));
      }
    });
    pending.activeSave = activeSave;
  }

  async function drain(pending: PendingDraftSave) {
    while (pending.mutations.length > 0) {
      const mutationCount = pending.mutations.length;
      let result: DraftMutationResult;
      try {
        result = await draftStore.mutate(
          pending.conversationIdentity,
          pending.mutations.slice(0, mutationCount),
        );
      } catch (error: unknown) {
        pending.hasFailed = true;
        notify({
          status: "failed",
          conversationIdentity: pending.conversationIdentity,
          error,
        });
        return;
      }
      pending.mutations.splice(0, mutationCount);
      pending.hasFailed = false;
      notify({
        status: "saved",
        conversationIdentity: pending.conversationIdentity,
        result,
        pendingMutations: [...pending.mutations],
      });
    }
  }

  function notify(event: DraftPersistenceEvent) {
    for (const listener of [...listeners]) {
      listener(event);
    }
  }

  return { enqueue, load, retry, subscribe };
}

export type DraftPersistence = ReturnType<typeof createDraftPersistence>;
