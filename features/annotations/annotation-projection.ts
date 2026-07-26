import type { SelectionRect } from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";

export type NumberedAnnotation = {
  annotation: DraftAnnotation;
  ordinal: number;
};

export type ProjectedAnnotation = NumberedAnnotation & {
  badge: Pick<SelectionRect, "left" | "top"> | null;
  range: Range | null;
  rect: SelectionRect | null;
};

export function numberAnnotations(annotations: readonly DraftAnnotation[]): NumberedAnnotation[] {
  return annotations.map((annotation, index) => ({ annotation, ordinal: index + 1 }));
}
