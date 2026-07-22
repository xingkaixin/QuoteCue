import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

import {
  currentVisualViewportBounds,
  useVisualViewportBounds,
  type VisualViewportBounds,
} from "@/features/layout/use-visual-viewport";

import type { SelectionDraft } from "./annotation";
import { restoreTextAnchor } from "./selection-anchor";

const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 10;

type EditorSize = {
  height: number;
  width: number;
};

export function useAnnotationEditorPosition(
  draft: SelectionDraft,
  elementRef: RefObject<HTMLElement | null>,
  fallbackSize: EditorSize,
) {
  const viewport = useVisualViewportBounds();
  const [position, setPosition] = useState(() =>
    annotationEditorPosition(draft, fallbackSize, currentVisualViewportBounds()),
  );

  useLayoutEffect(() => {
    const refresh = () => {
      const elementRect = elementRef.current?.getBoundingClientRect();
      const size = {
        height: elementRect?.height || fallbackSize.height,
        width: elementRect?.width || fallbackSize.width,
      };
      const restoredRect = restoreTextAnchor(draft.anchor)?.getBoundingClientRect();
      const nextPosition = annotationEditorPosition(
        { ...draft, rect: restoredRect ?? draft.rect },
        size,
        viewport,
      );
      setPosition((current) => (samePosition(current, nextPosition) ? current : nextPosition));
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh);

    if (elementRef.current) {
      resizeObserver?.observe(elementRef.current);
    }
    window.addEventListener("scroll", refresh, true);
    refresh();
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", refresh, true);
    };
  }, [draft, elementRef, fallbackSize, viewport]);

  return position;
}

export function annotationEditorPosition(
  draft: SelectionDraft,
  size: EditorSize,
  viewport: VisualViewportBounds = currentVisualViewportBounds(),
) {
  const horizontalMargin = Math.min(VIEWPORT_MARGIN, viewport.width / 2);
  const verticalMargin = Math.min(VIEWPORT_MARGIN, viewport.height / 2);
  const maxWidth = Math.max(0, viewport.width - horizontalMargin * 2);
  const maxHeight = Math.max(0, viewport.height - verticalMargin * 2);
  const renderedWidth = Math.min(size.width, maxWidth);
  const renderedHeight = Math.min(size.height, maxHeight);
  const minLeft = viewport.left + horizontalMargin;
  const minTop = viewport.top + verticalMargin;
  const maxLeft = Math.max(
    minLeft,
    viewport.left + viewport.width - renderedWidth - horizontalMargin,
  );
  const maxTop = Math.max(minTop, viewport.top + viewport.height - renderedHeight - verticalMargin);
  const left = Math.min(Math.max(draft.rect.right + ANCHOR_GAP, minLeft), maxLeft);
  const top = Math.min(Math.max(draft.rect.bottom + ANCHOR_GAP, minTop), maxTop);

  return { left, maxHeight, maxWidth, top };
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
