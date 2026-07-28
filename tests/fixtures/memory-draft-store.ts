import { vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { applyDraftMutation } from "@/features/annotations/draft-mutation";
import type { DraftStore } from "@/features/annotations/draft-store";

export function createMemoryDraftStore() {
  const drafts = new Map<string, DraftAnnotation[]>();
  const store: DraftStore = {
    async load(conversation) {
      return cloneAnnotations(drafts.get(conversation.id) ?? []);
    },
    async mutate(conversation, mutation) {
      const current = drafts.get(conversation.id) ?? [];
      const annotations = cloneAnnotations(applyDraftMutation(current, mutation) ?? current);
      drafts.set(conversation.id, annotations);
      return cloneAnnotations(annotations);
    },
  };
  return { drafts, store };
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
