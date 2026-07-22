export type TextAnchor = {
  messageId: string;
  quote: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
};

export type DraftAnnotation = {
  id: string;
  anchor: TextAnchor;
  comment: string;
};

export type SelectionDraft = {
  anchor: TextAnchor;
  rect: Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">;
};

export type AnnotationEditorState =
  | { status: "hidden" }
  | { status: "quick"; annotationId: string; draft: SelectionDraft }
  | { status: "expanded"; annotationId: string; draft: SelectionDraft };
