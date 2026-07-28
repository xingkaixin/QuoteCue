import { sameAnnotationSnapshot, type DraftAnnotation } from "./annotation";

export type DraftMutation =
  | { kind: "add"; annotation: DraftAnnotation }
  | { kind: "update"; annotationId: string; comment: string }
  | { kind: "discard"; annotationIds: readonly string[] }
  | { kind: "discard-confirmed"; annotations: readonly DraftAnnotation[] }
  | { kind: "clear" };

// Returns the same array when the mutation does not apply, so callers can treat identity as
// "nothing changed" without a second flag. Returns null when the mutation is not valid for the
// current draft at all.
export function applyDraftMutation(
  annotations: readonly DraftAnnotation[],
  mutation: DraftMutation,
): DraftAnnotation[] | readonly DraftAnnotation[] | null {
  switch (mutation.kind) {
    case "add":
      // Idempotent so a retried or duplicated message cannot add the annotation twice.
      return annotations.some(({ id }) => id === mutation.annotation.id)
        ? annotations
        : [...annotations, mutation.annotation];
    case "update": {
      const index = annotations.findIndex(({ id }) => id === mutation.annotationId);
      if (index < 0) {
        return null;
      }
      if (annotations[index]?.comment === mutation.comment) {
        return annotations;
      }
      return annotations.map((annotation, currentIndex) =>
        currentIndex === index ? { ...annotation, comment: mutation.comment } : annotation,
      );
    }
    case "discard": {
      const discardedIds = new Set(mutation.annotationIds);
      return keepIfUnchanged(
        annotations,
        annotations.filter(({ id }) => !discardedIds.has(id)),
      );
    }
    case "discard-confirmed": {
      const confirmedById = new Map(
        mutation.annotations.map((annotation) => [annotation.id, annotation]),
      );
      // Keeps an annotation edited after the send was compiled, per the snapshot semantics.
      return keepIfUnchanged(
        annotations,
        annotations.filter((annotation) => {
          const confirmed = confirmedById.get(annotation.id);
          return !confirmed || !sameAnnotationSnapshot(annotation, confirmed);
        }),
      );
    }
    case "clear":
      return annotations.length === 0 ? annotations : [];
  }
}

function keepIfUnchanged(
  annotations: readonly DraftAnnotation[],
  filtered: DraftAnnotation[],
): readonly DraftAnnotation[] {
  return filtered.length === annotations.length ? annotations : filtered;
}
