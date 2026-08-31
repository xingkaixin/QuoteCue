import { vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { conversationIdentityKey } from "@/features/conversation/conversation-identity";
import { applyDraftMutation } from "@/features/annotations/draft-mutation";
import type { DraftStore } from "@/features/annotations/draft-store";

export function createMemoryDraftStore() {
  const drafts = new Map<string, DraftAnnotation[]>();
  const listeners = new Map<string, Set<() => void>>();
  const store: DraftStore = {
    async load(conversation) {
      return draftResult(cloneAnnotations(drafts.get(conversationIdentityKey(conversation)) ?? []));
    },
    async mutate(conversation, mutations) {
      const key = conversationIdentityKey(conversation);
      const current = drafts.get(key) ?? [];
      const annotations = cloneAnnotations(
        mutations.reduce<readonly DraftAnnotation[]>(
          (currentAnnotations, mutation) =>
            applyDraftMutation(currentAnnotations, mutation) ?? currentAnnotations,
          current,
        ),
      );
      drafts.set(key, annotations);
      for (const listener of listeners.get(key) ?? []) {
        listener();
      }
      return draftResult(cloneAnnotations(annotations));
    },
    subscribe(conversation, onChanged) {
      const key = conversationIdentityKey(conversation);
      const subscribers = listeners.get(key) ?? new Set<() => void>();
      subscribers.add(onChanged);
      listeners.set(key, subscribers);
      return () => {
        subscribers.delete(onChanged);
        if (subscribers.size === 0) {
          listeners.delete(key);
        }
      };
    },
  };
  return { store };
}

export function createDraftStoreDouble() {
  const memory = createMemoryDraftStore();
  return {
    ...memory,
    store: {
      load: vi.fn(memory.store.load),
      mutate: vi.fn(memory.store.mutate),
      subscribe: vi.fn(memory.store.subscribe),
    },
  };
}

function cloneAnnotations(annotations: readonly DraftAnnotation[]) {
  return annotations.map((annotation) => ({
    ...annotation,
    anchor: { ...annotation.anchor },
  }));
}

export function draftResult(annotations: DraftAnnotation[]) {
  return { status: "ok" as const, annotations, hasUnreadableAnnotations: false };
}
