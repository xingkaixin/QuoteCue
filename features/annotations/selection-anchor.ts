import type { TextAnchor } from "./annotation";

type RangeBoundary = {
  node: Node;
  offset: number;
};

export function rangeEndpointRect(range: Range) {
  const rects = visibleRangeRects(range);

  return rects.at(-1) ?? rangeBoundingRect(range);
}

export function rangeStartRect(range: Range) {
  return visibleRangeRects(range)[0] ?? rangeBoundingRect(range);
}

function visibleRangeRects(range: Range) {
  const rects = typeof range.getClientRects === "function" ? range.getClientRects() : [];
  return Array.from(rects).filter((rect) => rect.width > 0 || rect.height > 0);
}

function rangeBoundingRect(range: Range) {
  return typeof range.getBoundingClientRect === "function"
    ? range.getBoundingClientRect()
    : new DOMRect();
}

export function restoreTextAnchorFromIndex(
  anchor: TextAnchor,
  messageIndex: ReadonlyMap<string, HTMLElement>,
) {
  const message = messageIndex.get(anchor.messageId);
  return message ? restoreTextAnchorInMessage(anchor, message) : null;
}

function restoreTextAnchorInMessage(anchor: TextAnchor, message: HTMLElement) {
  const messageText = message.textContent ?? "";
  const start = resolvedStartOffset(messageText, anchor);

  if (start < 0) {
    return null;
  }

  const range = rangeFromOffsets(message, start, start + anchor.quote.length);
  return range?.toString() === anchor.quote ? range : null;
}

function resolvedStartOffset(messageText: string, anchor: TextAnchor) {
  if (messageText.slice(anchor.start, anchor.end) === anchor.quote) {
    return anchor.start;
  }

  const candidates = quoteOffsets(messageText, anchor.quote);
  if (candidates.length === 1) {
    return candidates[0];
  }

  return uniqueContextMatch(messageText, anchor, candidates);
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
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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

  const range = document.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  return range;
}
