import type { TextAnchor } from "@/features/host-port/host-port";

export type {
  AnchoredSelection,
  SelectionCapture,
  SelectionRect,
  TextAnchor,
} from "@/features/host-port/host-port";

export type DraftAnnotation = {
  id: string;
  anchor: TextAnchor;
  comment: string;
};

type KeysOfUnion<Value> = Value extends unknown ? keyof Value : never;

const textAnchorFields = {
  displayQuote: true,
  end: true,
  format: true,
  messageId: true,
  prefix: true,
  quote: true,
  start: true,
  suffix: true,
} satisfies Record<KeysOfUnion<TextAnchor>, true>;

export function sameTextAnchor(current: TextAnchor, other: TextAnchor) {
  return (Object.keys(textAnchorFields) as KeysOfUnion<TextAnchor>[]).every(
    (field) => Reflect.get(current, field) === Reflect.get(other, field),
  );
}

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
