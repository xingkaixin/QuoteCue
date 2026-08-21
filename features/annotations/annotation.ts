import { sameTextAnchor, type TextAnchor } from "@/lib/text-anchor";

export type {
  AnchoredSelection,
  SelectionCapture,
  SelectionRect,
} from "@/features/host-port/host-port";
export type { TextAnchor } from "@/lib/text-anchor";

export type DraftAnnotation = {
  id: string;
  anchor: TextAnchor;
  comment: string;
};

export function sameAnnotationSnapshot(current: DraftAnnotation, other: DraftAnnotation) {
  return (
    current.id === other.id &&
    current.comment === other.comment &&
    sameTextAnchor(current.anchor, other.anchor)
  );
}

export type AnnotationEditorState =
  | { status: "hidden" }
  | { status: "quick"; annotationId: string }
  | { status: "expanded"; annotationId: string };
