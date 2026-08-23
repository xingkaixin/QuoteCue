import { describe, expect, it } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import {
  compiledPromptExceedsCapacity,
  draftMutationExceedsCapacity,
  MAX_ANNOTATION_COMMENT_LENGTH,
  MAX_COMPILED_PROMPT_LENGTH,
  MAX_DRAFT_ANNOTATIONS,
  MAX_SELECTED_TEXT_LENGTH,
} from "@/features/annotations/draft-capacity";

const annotation: DraftAnnotation = {
  id: "annotation-a",
  anchor: {
    end: 13,
    format: "exact",
    messageId: "message-a",
    prefix: "",
    quote: "selected text",
    start: 0,
    suffix: "",
  },
  comment: "",
};

describe("draft capacity", () => {
  it("accepts focused annotations up to the draft limit", () => {
    const annotations = Array.from({ length: MAX_DRAFT_ANNOTATIONS - 1 }, (_, index) => ({
      ...annotation,
      id: `annotation-${index}`,
    }));

    expect(
      draftMutationExceedsCapacity(annotations, {
        kind: "add",
        annotation: { ...annotation, id: "last-annotation" },
      }),
    ).toBe(false);
    expect(
      draftMutationExceedsCapacity([...annotations, annotation], {
        kind: "add",
        annotation: { ...annotation, id: "overflow" },
      }),
    ).toBe(true);
    expect(
      draftMutationExceedsCapacity([...annotations, annotation], {
        kind: "add",
        annotation,
      }),
    ).toBe(false);
  });

  it("rejects oversized comments and selections", () => {
    expect(
      draftMutationExceedsCapacity([], {
        kind: "add",
        annotation: { ...annotation, comment: "x".repeat(MAX_ANNOTATION_COMMENT_LENGTH + 1) },
      }),
    ).toBe(true);
    expect(
      draftMutationExceedsCapacity([], {
        kind: "add",
        annotation: {
          ...annotation,
          anchor: {
            ...annotation.anchor,
            end: MAX_SELECTED_TEXT_LENGTH + 1,
            quote: "x".repeat(MAX_SELECTED_TEXT_LENGTH + 1),
          },
        },
      }),
    ).toBe(true);
  });

  it("allows oversized legacy comments to be shortened or discarded", () => {
    const oversized = {
      ...annotation,
      comment: "x".repeat(MAX_ANNOTATION_COMMENT_LENGTH + 10),
    };

    expect(
      draftMutationExceedsCapacity([oversized], {
        kind: "update",
        annotationId: oversized.id,
        comment: oversized.comment.slice(1),
      }),
    ).toBe(false);
    expect(
      draftMutationExceedsCapacity([oversized], {
        kind: "discard",
        annotationIds: [oversized.id],
      }),
    ).toBe(false);
  });

  it("bounds the compiled follow-up", () => {
    expect(compiledPromptExceedsCapacity("x".repeat(MAX_COMPILED_PROMPT_LENGTH))).toBe(false);
    expect(compiledPromptExceedsCapacity("x".repeat(MAX_COMPILED_PROMPT_LENGTH + 1))).toBe(true);
  });
});
