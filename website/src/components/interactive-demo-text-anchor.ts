export type DemoTextAnchor = {
  end: number;
  quote: string;
  start: number;
};

type RangeBoundary = {
  node: Node;
  offset: number;
};

export function captureDemoTextAnchor(root: HTMLElement, range: Range): DemoTextAnchor | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }
  const rawQuote = range.toString();
  const quote = rawQuote.trim();
  if (quote.length === 0) {
    return null;
  }
  const leadingWhitespace = rawQuote.length - rawQuote.trimStart().length;
  const trailingWhitespace = rawQuote.length - rawQuote.trimEnd().length;
  const rawStart = textOffset(root, range.startContainer, range.startOffset);
  const rawEnd = textOffset(root, range.endContainer, range.endOffset);
  return {
    end: rawEnd - trailingWhitespace,
    quote,
    start: rawStart + leadingWhitespace,
  };
}

export function restoreDemoTextAnchor(root: HTMLElement, anchor: DemoTextAnchor) {
  if (
    !Number.isSafeInteger(anchor.start) ||
    !Number.isSafeInteger(anchor.end) ||
    anchor.start < 0 ||
    anchor.end < anchor.start ||
    anchor.end - anchor.start !== anchor.quote.length
  ) {
    return null;
  }
  const range = rangeFromOffsets(root, anchor.start, anchor.end);
  return range?.toString() === anchor.quote ? range : null;
}

function textOffset(root: HTMLElement, node: Node, offset: number) {
  const range = root.ownerDocument.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
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
