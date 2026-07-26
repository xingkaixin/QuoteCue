import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

import {
  currentVisualViewportBounds,
  useVisualViewportBounds,
  type VisualViewportBounds,
} from "@/features/layout/use-visual-viewport";
import {
  positionAdjacentToRect,
  type FloatingElementSize,
} from "@/features/layout/floating-position";
import { requireActiveHost } from "@/features/host/active-host";

import type { SelectionDraft } from "./annotation";
import { rangeEndpointRect } from "./selection-anchor";

const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 10;

export function useAnnotationEditorPosition(
  draft: SelectionDraft,
  elementRef: RefObject<HTMLElement | null>,
  fallbackSize: FloatingElementSize,
) {
  const host = requireActiveHost();
  const viewport = useVisualViewportBounds();
  const [position, setPosition] = useState(() =>
    annotationEditorPosition(draft, fallbackSize, currentVisualViewportBounds()),
  );

  useLayoutEffect(() => {
    let refreshFrame: number | undefined;
    const refresh = () => {
      refreshFrame = undefined;
      const elementRect = elementRef.current?.getBoundingClientRect();
      const size = {
        height: elementRect?.height || fallbackSize.height,
        width: elementRect?.width || fallbackSize.width,
      };
      const restored = host.selection.restore(draft.anchor);
      const restoredRect =
        restored.status === "available" ? rangeEndpointRect(restored.value) : null;
      const nextPosition = annotationEditorPosition(
        { ...draft, rect: restoredRect ?? draft.rect },
        size,
        viewport,
      );
      setPosition((current) => (samePosition(current, nextPosition) ? current : nextPosition));
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
    window.addEventListener("scroll", scheduleRefresh, true);
    refresh();
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleRefresh, true);
      if (refreshFrame !== undefined) {
        cancelAnimationFrame(refreshFrame);
      }
    };
  }, [draft, elementRef, fallbackSize, host, viewport]);

  return position;
}

export function annotationEditorPosition(
  draft: SelectionDraft,
  size: FloatingElementSize,
  viewport: VisualViewportBounds = currentVisualViewportBounds(),
) {
  return positionAdjacentToRect(draft.rect, size, {
    gap: ANCHOR_GAP,
    margin: VIEWPORT_MARGIN,
    viewport,
  });
}

function samePosition(
  left: ReturnType<typeof annotationEditorPosition>,
  right: ReturnType<typeof annotationEditorPosition>,
) {
  return (
    left.left === right.left &&
    left.maxHeight === right.maxHeight &&
    left.maxWidth === right.maxWidth &&
    left.top === right.top
  );
}
