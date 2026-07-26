import { currentVisualViewportBounds, type VisualViewportBounds } from "./use-visual-viewport";

export type FloatingElementSize = {
  height: number;
  width: number;
};

export type FloatingPosition = {
  left: number;
  maxHeight: number;
  maxWidth: number;
  top: number;
};

type PositionOptions = {
  margin: number;
  viewport?: VisualViewportBounds;
};

type AdjacentPositionOptions = PositionOptions & {
  gap: number;
};

export function positionAdjacentToRect(
  anchor: Pick<DOMRect, "bottom" | "left" | "right" | "top">,
  size: FloatingElementSize,
  options: AdjacentPositionOptions,
): FloatingPosition {
  const bounds = positionBounds(size, options);
  return {
    ...bounds.size,
    left: adjacentPosition(
      anchor.right + options.gap,
      anchor.left - bounds.width - options.gap,
      bounds.minLeft,
      bounds.maxLeft,
    ),
    top: adjacentPosition(
      anchor.bottom + options.gap,
      anchor.top - bounds.height - options.gap,
      bounds.minTop,
      bounds.maxTop,
    ),
  };
}

export function clampPositionToViewport(
  position: { left: number; top: number },
  size: FloatingElementSize,
  options: PositionOptions,
): FloatingPosition {
  const bounds = positionBounds(size, options);
  return {
    ...bounds.size,
    left: clamp(position.left, bounds.minLeft, bounds.maxLeft),
    top: clamp(position.top, bounds.minTop, bounds.maxTop),
  };
}

function positionBounds(size: FloatingElementSize, options: PositionOptions) {
  const viewport = options.viewport ?? currentVisualViewportBounds();
  const horizontalMargin = Math.min(options.margin, viewport.width / 2);
  const verticalMargin = Math.min(options.margin, viewport.height / 2);
  const maxWidth = Math.max(0, viewport.width - horizontalMargin * 2);
  const maxHeight = Math.max(0, viewport.height - verticalMargin * 2);
  const width = Math.min(size.width, maxWidth);
  const height = Math.min(size.height, maxHeight);
  const minLeft = viewport.left + horizontalMargin;
  const minTop = viewport.top + verticalMargin;
  return {
    height,
    maxLeft: Math.max(minLeft, viewport.left + viewport.width - width - horizontalMargin),
    maxTop: Math.max(minTop, viewport.top + viewport.height - height - verticalMargin),
    minLeft,
    minTop,
    size: { maxHeight, maxWidth },
    width,
  };
}

function adjacentPosition(after: number, before: number, minimum: number, maximum: number) {
  if (after >= minimum && after <= maximum) {
    return after;
  }
  if (before >= minimum && before <= maximum) {
    return before;
  }
  return clamp(after, minimum, maximum);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
