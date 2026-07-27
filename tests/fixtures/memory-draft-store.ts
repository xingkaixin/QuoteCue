import { vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import type { DraftStore } from "@/features/annotations/draft-store";

export function createMemoryDraftStore() {
  const drafts = new Map<string, DraftAnnotation[]>();
  const store: DraftStore = {
    async load(conversation) {
      return cloneAnnotations(drafts.get(conversation.id) ?? []);
    },
    async save(conversation, annotations) {
      drafts.set(conversation.id, cloneAnnotations(annotations));
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
      save: vi.fn(memory.store.save),
    },
  };
}

function cloneAnnotations(annotations: readonly DraftAnnotation[]) {
  return annotations.map((annotation) => ({
    ...annotation,
    anchor: { ...annotation.anchor },
  }));
}
