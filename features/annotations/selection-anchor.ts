import type { TextAnchor } from "./annotation";

type RangeBoundary = {
  node: Node;
  offset: number;
};

export function rangeEndpointRect(range: Range) {
  const rects = typeof range.getClientRects === "function" ? range.getClientRects() : [];

  for (let index = rects.length - 1; index >= 0; index -= 1) {
    const rect = rects[index];
    if (rect && (rect.width > 0 || rect.height > 0)) {
      return rect;
    }
  }

  return typeof range.getBoundingClientRect === "function"
    ? range.getBoundingClientRect()
    : new DOMRect();
}

export function restoreTextAnchorFromIndex(
  anchor: TextAnchor,
  messageIndex: ReadonlyMap<string, HTMLElement>,
  messageTextCache?: Map<HTMLElement, string>,
) {
  const message = messageIndex.get(anchor.messageId);
  return message
    ? restoreTextAnchorInMessage(anchor, message, readMessageText(message, messageTextCache))
    : null;
}

function readMessageText(message: HTMLElement, cache?: Map<HTMLElement, string>) {
  const cached = cache?.get(message);
  if (cached !== undefined) {
    return cached;
  }
  const text = message.textContent ?? "";
  cache?.set(message, text);
  return text;
}

function restoreTextAnchorInMessage(anchor: TextAnchor, message: HTMLElement, messageText: string) {
  const resolved = resolveTextAnchor(messageText, anchor);

  if (!resolved) {
    return null;
  }

  const range = rangeFromOffsets(message, resolved.start, resolved.start + resolved.quote.length);
  return range?.toString() === resolved.quote ? range : null;
}

function resolveTextAnchor(messageText: string, anchor: TextAnchor) {
  if (messageText.slice(anchor.start, anchor.end) === anchor.quote) {
    return { quote: anchor.quote, start: anchor.start };
  }

  const positionalQuote = legacyPositionalQuote(messageText, anchor);
  if (positionalQuote !== null) {
    return { quote: positionalQuote, start: anchor.start };
  }

  const candidates = quoteOffsets(messageText, anchor.quote);
  if (candidates.length === 1) {
    return { quote: anchor.quote, start: candidates[0] };
  }

  const start = uniqueContextMatch(messageText, anchor, candidates);
  return start < 0 ? null : { quote: anchor.quote, start };
}

function legacyPositionalQuote(messageText: string, anchor: TextAnchor) {
  const storedSpanLength = anchor.end - anchor.start;
  if (
    storedSpanLength === anchor.quote.length ||
    anchor.start > messageText.length ||
    anchor.end > messageText.length
  ) {
    return null;
  }

  const quote = messageText.slice(anchor.start, anchor.end);
  const prefixStart = Math.max(0, anchor.start - anchor.prefix.length);
  const prefix = messageText.slice(prefixStart, anchor.start);
  const suffix = messageText.slice(anchor.end, anchor.end + anchor.suffix.length);
  const hasExactContext = prefix === anchor.prefix && suffix === anchor.suffix;
  return hasExactContext && sameNonWhitespaceText(quote, anchor.quote) ? quote : null;
}

function sameNonWhitespaceText(left: string, right: string) {
  return left.replace(/\s/g, "") === right.replace(/\s/g, "");
}

function quoteOffsets(text: string, quote: string) {
  const offsets: number[] = [];
  let offset = text.indexOf(quote);

  while (offset >= 0) {
    offsets.push(offset);
    offset = text.indexOf(quote, offset + 1);
  }

  return offsets;
}

function uniqueContextMatch(messageText: string, anchor: TextAnchor, candidates: number[]) {
  const scoredCandidates = candidates.map((candidate) => {
    const prefixStart = Math.max(0, candidate - anchor.prefix.length);
    const prefix = messageText.slice(prefixStart, candidate);
    const suffixStart = candidate + anchor.quote.length;
    const suffix = messageText.slice(suffixStart, suffixStart + anchor.suffix.length);
    const prefixScore = matchingEdgeLength(prefix, anchor.prefix, "end");
    const suffixScore = matchingEdgeLength(suffix, anchor.suffix, "start");
    return { offset: candidate, prefixScore, suffixScore, totalScore: prefixScore + suffixScore };
  });
  const bestScore = Math.max(...scoredCandidates.map(({ totalScore }) => totalScore));
  if (bestScore <= 0) {
    return -1;
  }

  const bestCandidates = scoredCandidates.filter(({ totalScore }) => totalScore === bestScore);
  return bestCandidates.length === 1 ? bestCandidates[0].offset : -1;
}

function matchingEdgeLength(left: string, right: string, edge: "start" | "end") {
  const length = Math.min(left.length, right.length);
  let matches = 0;

  for (let index = 0; index < length; index += 1) {
    const leftIndex = edge === "start" ? index : left.length - index - 1;
    const rightIndex = edge === "start" ? index : right.length - index - 1;
    if (left[leftIndex] !== right[rightIndex]) {
      break;
    }
    matches += 1;
  }

  return matches;
}

function rangeFromOffsets(root: HTMLElement, start: number, end: number) {
  const ownerDocument = root.ownerDocument;
  const walker = ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startBoundary: RangeBoundary | null = null;
  let endBoundary: RangeBoundary | null = null;
  let node = walker.nextNode();

  while (node) {
    const nextOffset = currentOffset + (node.textContent?.length ?? 0);

    if (!startBoundary && start >= currentOffset && start <= nextOffset) {
      startBoundary = { node, offset: start - currentOffset };
    }
    if (!endBoundary && end >= currentOffset && end <= nextOffset) {
      endBoundary = { node, offset: end - currentOffset };
    }
    if (startBoundary && endBoundary) {
      break;
    }

    currentOffset = nextOffset;
    node = walker.nextNode();
  }

  if (!startBoundary || !endBoundary) {
    return null;
  }

  const range = ownerDocument.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  return range;
}
