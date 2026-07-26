import type { SelectionDraft, TextAnchor } from "@/features/host-port/host-port";

export type {
  SelectionCapture,
  SelectionDraft,
  SelectionRect,
  TextAnchor,
} from "@/features/host-port/host-port";

export function selectedTextFor(anchor: TextAnchor) {
  return anchor.displayQuote ?? anchor.quote;
}

export type DraftAnnotation = {
  id: string;
  anchor: TextAnchor;
  comment: string;
};

export type AnnotationEditorState =
  | { status: "hidden" }
  | { status: "quick"; annotationId: string; draft: SelectionDraft }
  | { status: "expanded"; annotationId: string; draft: SelectionDraft };
