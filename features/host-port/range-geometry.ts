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
