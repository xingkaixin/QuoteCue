import { isRecord } from "./is-record";

type TextAnchorBase = {
  end: number;
  messageId: string;
  prefix: string;
  quote: string;
  start: number;
  suffix: string;
};

export type TextAnchor = TextAnchorBase &
  (
    | { displayQuote?: string; format: "exact" }
    | { displayQuote?: never; format: "legacy-rendered" }
  );

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

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the parser for untrusted stored anchors.
export function parseTextAnchor(value: unknown): TextAnchor | null {
  if (
    !isRecord(value) ||
    (value.format !== "exact" && value.format !== "legacy-rendered") ||
    typeof value.messageId !== "string" ||
    value.messageId.length === 0 ||
    typeof value.quote !== "string" ||
    value.quote.length === 0 ||
    (value.displayQuote !== undefined && typeof value.displayQuote !== "string") ||
    (value.format === "legacy-rendered" && value.displayQuote !== undefined) ||
    typeof value.prefix !== "string" ||
    typeof value.suffix !== "string" ||
    !isTextOffset(value.start) ||
    !isTextOffset(value.end) ||
    value.end < value.start
  ) {
    return null;
  }

  const anchor = {
    messageId: value.messageId,
    quote: value.quote,
    prefix: value.prefix,
    suffix: value.suffix,
    start: value.start,
    end: value.end,
  };

  return value.format === "exact"
    ? {
        ...anchor,
        format: value.format,
        ...(value.displayQuote === undefined ? {} : { displayQuote: value.displayQuote }),
      }
    : { ...anchor, format: value.format };
}

export function selectedTextFor(anchor: TextAnchor) {
  return anchor.displayQuote ?? anchor.quote;
}

export function sameTextAnchor(current: TextAnchor, other: TextAnchor) {
  // SAFETY: This local object literal contains only the TextAnchor keys checked by satisfies.
  return (Object.keys(textAnchorFields) as KeysOfUnion<TextAnchor>[]).every(
    (field) => current[field] === other[field],
  );
}

function isTextOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
