import type { SelectionRect } from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";

export type NumberedAnnotation = {
  annotation: DraftAnnotation;
  ordinal: number;
};

export type AnnotationGeometry = {
  badge: Pick<SelectionRect, "left" | "top"> | null;
  range: Range;
  rect: SelectionRect;
};

export type AnnotationResolution =
  | { resolution: "pending" }
  | { resolution: "unresolved" }
  | { resolution: "resolved"; geometry: AnnotationGeometry };

export type ProjectedAnnotation = NumberedAnnotation & AnnotationResolution;

export type ResolvedProjectedAnnotation = Extract<ProjectedAnnotation, { resolution: "resolved" }>;

export type SettledAnnotationResolution = Exclude<AnnotationResolution, { resolution: "pending" }>;

export function numberAnnotations(annotations: readonly DraftAnnotation[]): NumberedAnnotation[] {
  return annotations.map((annotation, index) => ({ annotation, ordinal: index + 1 }));
}
