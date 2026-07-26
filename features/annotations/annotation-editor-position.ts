import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

import type { SelectionRect } from "@/features/host-port/host-port";
import {
  positionAdjacentToRect,
  type FloatingElementSize,
} from "@/features/layout/floating-position";
import {
  currentVisualViewportBounds,
  useVisualViewportBounds,
  type VisualViewportBounds,
} from "@/features/layout/use-visual-viewport";

const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 10;

export function useAnnotationEditorPosition(
  rect: SelectionRect,
  elementRef: RefObject<HTMLElement | null>,
  fallbackSize: FloatingElementSize,
) {
  const viewport = useVisualViewportBounds();
  const [size, setSize] = useState(fallbackSize);

  useLayoutEffect(() => {
    let refreshFrame: number | undefined;
    const refresh = () => {
      refreshFrame = undefined;
      const elementRect = elementRef.current?.getBoundingClientRect();
      const nextSize = {
        height: elementRect?.height || fallbackSize.height,
        width: elementRect?.width || fallbackSize.width,
      };
      setSize((current) => (sameSize(current, nextSize) ? current : nextSize));
    };
    const scheduleRefresh = () => {
      if (refreshFrame === undefined) {
        refreshFrame = requestAnimationFrame(refresh);
      }
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleRefresh);

    if (elementRef.current) {
      resizeObserver?.observe(elementRef.current);
    }
    refresh();
    return () => {
      resizeObserver?.disconnect();
      if (refreshFrame !== undefined) {
        cancelAnimationFrame(refreshFrame);
      }
    };
  }, [elementRef, fallbackSize.height, fallbackSize.width]);

  return annotationEditorPosition(rect, size, viewport);
}

export function annotationEditorPosition(
  rect: SelectionRect,
  size: FloatingElementSize,
  viewport: VisualViewportBounds = currentVisualViewportBounds(),
) {
  return positionAdjacentToRect(rect, size, {
    gap: ANCHOR_GAP,
    margin: VIEWPORT_MARGIN,
    viewport,
  });
}

function sameSize(left: FloatingElementSize, right: FloatingElementSize) {
  return left.height === right.height && left.width === right.width;
}
