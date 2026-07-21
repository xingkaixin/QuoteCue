import type { DraftAnnotation, SelectionDraft, TextAnchor } from "./annotation";

const ASSISTANT_MESSAGE_SELECTOR = '[data-message-author-role="assistant"][data-message-id]';
const CONTEXT_LENGTH = 48;

type RangeBoundary = {
  node: Node;
  offset: number;
};

export function captureAssistantSelection(
  selection = window.getSelection(),
): SelectionDraft | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const message = assistantMessageForRange(range);
  const quote = selection.toString().trim();

  if (!message || quote.length === 0) {
    return null;
  }

  const start = textOffset(message, { node: range.startContainer, offset: range.startOffset });
  const end = textOffset(message, { node: range.endContainer, offset: range.endOffset });
  const messageText = message.textContent ?? "";
  const rect =
    typeof range.getBoundingClientRect === "function"
      ? range.getBoundingClientRect()
      : new DOMRect();

  return {
    anchor: {
      messageId: message.dataset.messageId ?? "",
      quote,
      prefix: messageText.slice(Math.max(0, start - CONTEXT_LENGTH), start),
      suffix: messageText.slice(end, end + CONTEXT_LENGTH),
      start,
      end,
    },
    rect: {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    },
  };
}

export function restoreTextAnchor(anchor: TextAnchor) {
  const message = assistantMessageById(anchor.messageId);
  if (!message) {
    return null;
  }

  const messageText = message.textContent ?? "";
  const start = resolvedStartOffset(messageText, anchor);

  if (start < 0) {
    return null;
  }

  return rangeFromOffsets(message, start, start + anchor.quote.length);
}

export function selectionDraftFromAnnotation(annotation: DraftAnnotation) {
  const range = restoreTextAnchor(annotation.anchor);
  if (!range) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  return {
    anchor: annotation.anchor,
    rect: {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    },
  } satisfies SelectionDraft;
}

function assistantMessageForRange(range: Range) {
  const startMessage = closestAssistantMessage(range.startContainer);
  const endMessage = closestAssistantMessage(range.endContainer);
  return startMessage === endMessage ? startMessage : null;
}

function closestAssistantMessage(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>(ASSISTANT_MESSAGE_SELECTOR) ?? null;
}

function assistantMessageById(messageId: string) {
  const messages = document.querySelectorAll<HTMLElement>(ASSISTANT_MESSAGE_SELECTOR);
  return Array.from(messages).find((message) => message.dataset.messageId === messageId) ?? null;
}

function textOffset(root: HTMLElement, boundary: RangeBoundary) {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(boundary.node, boundary.offset);
  return range.toString().length;
}

function resolvedStartOffset(messageText: string, anchor: TextAnchor) {
  if (messageText.slice(anchor.start, anchor.end) === anchor.quote) {
    return anchor.start;
  }

  const candidates = quoteOffsets(messageText, anchor.quote);
  if (candidates.length === 1) {
    return candidates[0];
  }

  return bestContextMatch(messageText, anchor, candidates);
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

function bestContextMatch(messageText: string, anchor: TextAnchor, candidates: number[]) {
  let bestOffset = -1;
  let bestScore = -1;

  for (const candidate of candidates) {
    const prefixStart = Math.max(0, candidate - anchor.prefix.length);
    const prefix = messageText.slice(prefixStart, candidate);
    const suffixStart = candidate + anchor.quote.length;
    const suffix = messageText.slice(suffixStart, suffixStart + anchor.suffix.length);
    const score =
      matchingEdgeLength(prefix, anchor.prefix, "end") +
      matchingEdgeLength(suffix, anchor.suffix, "start");

    if (score > bestScore) {
      bestOffset = candidate;
      bestScore = score;
    }
  }

  return bestOffset;
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
