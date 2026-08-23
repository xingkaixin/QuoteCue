import { vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import type { IdentifiedConversation } from "@/features/conversation/conversation-identity";
import { applyDraftMutation } from "@/features/annotations/draft-mutation";
import type { DraftStore } from "@/features/annotations/draft-store";

export function createMemoryDraftStore() {
  const drafts = new Map<string, DraftAnnotation[]>();
  const store: DraftStore = {
    async load(conversation) {
      return cloneAnnotations(drafts.get(conversationKey(conversation)) ?? []);
    },
    async mutate(conversation, mutations) {
      const key = conversationKey(conversation);
      const current = drafts.get(key) ?? [];
      const annotations = cloneAnnotations(
        mutations.reduce<readonly DraftAnnotation[]>(
          (currentAnnotations, mutation) =>
            applyDraftMutation(currentAnnotations, mutation) ?? currentAnnotations,
          current,
        ),
      );
      drafts.set(key, annotations);
      return cloneAnnotations(annotations);
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
    },
  };
}

function conversationKey(conversation: IdentifiedConversation) {
  return `${conversation.siteId}:${conversation.id}`;
}

function cloneAnnotations(annotations: readonly DraftAnnotation[]) {
  return annotations.map((annotation) => ({
    ...annotation,
    anchor: { ...annotation.anchor },
  }));
}
