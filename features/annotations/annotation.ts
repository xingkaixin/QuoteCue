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
  createdAt: number;
};

export type SelectionDraft = {
  anchor: TextAnchor;
  rect: Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">;
};

export type SelectionActionState =
  | { status: "hidden" }
  | { status: "action"; draft: SelectionDraft };

export type AnnotationEditorState =
  | { status: "hidden" }
  | { status: "quick"; annotationId: string; draft: SelectionDraft }
  | { status: "expanded"; annotationId: string; draft: SelectionDraft };
