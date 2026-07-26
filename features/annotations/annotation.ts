import type { TextAnchor } from "@/features/host-port/host-port";

export type {
  SelectionCapture,
  SelectionDraft,
  SelectionRect,
  TextAnchor,
} from "@/features/host-port/host-port";

export function parseTextAnchor(value: unknown): TextAnchor | null {
  if (
    !isRecord(value) ||
    typeof value.messageId !== "string" ||
    value.messageId.length === 0 ||
    typeof value.quote !== "string" ||
    value.quote.length === 0 ||
    (value.displayQuote !== undefined && typeof value.displayQuote !== "string") ||
    typeof value.prefix !== "string" ||
    typeof value.suffix !== "string" ||
    !isTextOffset(value.start) ||
    !isTextOffset(value.end) ||
    value.end < value.start
  ) {
    return null;
  }

  return {
    messageId: value.messageId,
    quote: value.quote,
    ...(value.displayQuote === undefined ? {} : { displayQuote: value.displayQuote }),
    prefix: value.prefix,
    suffix: value.suffix,
    start: value.start,
    end: value.end,
  };
}

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
  | { status: "quick"; annotationId: string }
  | { status: "expanded"; annotationId: string };

function isTextOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
