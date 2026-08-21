import { selectedTextFor } from "@/features/host-port/text-anchor";

import type { DraftAnnotation } from "./annotation";
import type { DraftMutation } from "./draft-mutation";

export const MAX_DRAFT_ANNOTATIONS = 20;
export const MAX_ANNOTATION_COMMENT_LENGTH = 4_000;
export const MAX_SELECTED_TEXT_LENGTH = 16_000;
export const MAX_COMPILED_PROMPT_LENGTH = 64_000;

export function draftMutationExceedsCapacity(
  annotations: readonly DraftAnnotation[],
  mutation: DraftMutation,
) {
  if (mutation.kind === "add") {
    return (
      annotations.length >= MAX_DRAFT_ANNOTATIONS || !annotationFitsCapacity(mutation.annotation)
    );
  }
  if (mutation.kind !== "update") {
    return false;
  }

  const current = annotations.find(({ id }) => id === mutation.annotationId);
  if (!current) {
    return false;
  }
  return (
    mutation.comment.length > MAX_ANNOTATION_COMMENT_LENGTH &&
    mutation.comment.length >= current.comment.length
  );
}

export function compiledPromptExceedsCapacity(prompt: string) {
  return prompt.length > MAX_COMPILED_PROMPT_LENGTH;
}

function annotationFitsCapacity(annotation: DraftAnnotation) {
  return (
    annotation.comment.length <= MAX_ANNOTATION_COMMENT_LENGTH &&
    selectedTextFor(annotation.anchor).length <= MAX_SELECTED_TEXT_LENGTH
  );
}
