import { vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { conversationIdentityKey } from "@/features/conversation/conversation-identity";
import { applyDraftMutation } from "@/features/annotations/draft-mutation";
import type { DraftStore } from "@/features/annotations/draft-store";

export function createMemoryDraftStore() {
  const drafts = new Map<string, DraftAnnotation[]>();
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
      return draftResult(cloneAnnotations(annotations));
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

function cloneAnnotations(annotations: readonly DraftAnnotation[]) {
  return annotations.map((annotation) => ({
    ...annotation,
    anchor: { ...annotation.anchor },
  }));
}

export function draftResult(annotations: DraftAnnotation[]) {
  return { status: "ok" as const, annotations, hasUnreadableAnnotations: false };
}
