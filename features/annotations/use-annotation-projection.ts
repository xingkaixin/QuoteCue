import { useEffect, useMemo, useRef, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";
import type {
  Host,
  SelectionInvalidationReason,
  SelectionRect,
} from "@/features/host-port/host-port";
import { clampPositionToViewport } from "@/features/layout/floating-position";
import { currentVisualViewportBounds } from "@/features/layout/use-visual-viewport";
import { QUOTECUE_HOST_SELECTOR } from "@/lib/dom-identity";

import type { DraftAnnotation } from "./annotation";
import { numberAnnotations, type ProjectedAnnotation } from "./annotation-projection";
import { rangeEndpointRect, restoreTextAnchorFromIndex } from "./selection-anchor";

const HIGHLIGHT_NAME = "quotecue-annotations";
const HIGHLIGHT_STYLE_ID = "quotecue-highlight-style";

type AnnotationGeometry = {
  badge: ProjectedAnnotation["badge"];
  range: Range;
  rect: SelectionRect;
};

const EMPTY_GEOMETRY = new Map<string, AnnotationGeometry>();

export function useAnnotationProjection(
  annotations: readonly DraftAnnotation[],
  activeAnnotationId: string | null,
) {
  const host = useHost();
  const [geometryByAnnotationId, setGeometryByAnnotationId] =
    useState<ReadonlyMap<string, AnnotationGeometry>>(EMPTY_GEOMETRY);
  const geometryRef = useRef<ReadonlyMap<string, AnnotationGeometry>>(geometryByAnnotationId);
  const numberedAnnotations = useMemo(() => numberAnnotations(annotations), [annotations]);
  const projectedAnnotations = useMemo(
    () =>
      numberedAnnotations.map<ProjectedAnnotation>((entry) => ({
        ...entry,
        ...(geometryByAnnotationId.get(entry.annotation.id) ?? {
          badge: null,
          range: null,
          rect: null,
        }),
      })),
    [geometryByAnnotationId, numberedAnnotations],
  );
  const activeRange =
    projectedAnnotations.find(({ annotation }) => annotation.id === activeAnnotationId)?.range ??
    null;

  useEffect(() => {
    if (annotations.length === 0) {
      commitGeometry(EMPTY_GEOMETRY);
      return;
    }

    ensureHighlightStyle();
    let projectionFrame: number | undefined;
    let pendingInvalidation: SelectionInvalidationReason | undefined;
    let rangeByAnnotationId = new Map<string, Range | null>();
    const scheduleProjection = (reason: SelectionInvalidationReason) => {
      if (reason === "content" || pendingInvalidation === undefined) {
        pendingInvalidation = reason;
      }
      if (projectionFrame !== undefined) {
        return;
      }
      projectionFrame = requestAnimationFrame(() => {
        projectionFrame = undefined;
        const invalidation = pendingInvalidation ?? "layout";
        pendingInvalidation = undefined;
        if (invalidation === "content") {
          rangeByAnnotationId = resolveAnnotationRanges(annotations, host);
        }
        commitGeometry(
          projectAnnotationGeometry(annotations, rangeByAnnotationId, geometryRef.current),
        );
      });
    };
    const stopObserving = host.selection.observeInvalidation(scheduleProjection);
    scheduleProjection("content");

    return () => {
      stopObserving();
      if (projectionFrame !== undefined) {
        cancelAnimationFrame(projectionFrame);
      }
    };

    function commitGeometry(nextGeometry: ReadonlyMap<string, AnnotationGeometry>) {
      if (sameGeometry(geometryRef.current, nextGeometry)) {
        return;
      }
      geometryRef.current = nextGeometry;
      setGeometryByAnnotationId(nextGeometry);
    }
  }, [annotations, host]);

  useEffect(() => {
    renderActiveHighlight(activeRange);
    return clearHighlights;
  }, [activeRange]);

  return projectedAnnotations;
}

function resolveAnnotationRanges(annotations: readonly DraftAnnotation[], host: Host) {
  const messageIndex = host.selection.messageIndex();
  const messageTextCache = new Map<HTMLElement, string>();
  return new Map(
    annotations.map((annotation) => [
      annotation.id,
      restoreTextAnchorFromIndex(annotation.anchor, messageIndex, messageTextCache),
    ]),
  );
}

function projectAnnotationGeometry(
  annotations: readonly DraftAnnotation[],
  rangeByAnnotationId: ReadonlyMap<string, Range | null>,
  previousGeometry: ReadonlyMap<string, AnnotationGeometry>,
) {
  const geometry = new Map<string, AnnotationGeometry>();
  for (const annotation of annotations) {
    const resolvedRange = rangeByAnnotationId.get(annotation.id);
    if (!resolvedRange) {
      continue;
    }
    const previousRange = previousGeometry.get(annotation.id)?.range;
    const range =
      previousRange && sameRangeBoundaries(previousRange, resolvedRange)
        ? previousRange
        : resolvedRange;
    const rect = selectionRect(rangeEndpointRect(range));
    geometry.set(annotation.id, {
      badge: badgePosition(range, rect),
      range,
      rect,
    });
  }
  return geometry;
}

function ensureHighlightStyle() {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `::highlight(${HIGHLIGHT_NAME}) {
    background: color-mix(in srgb, #2f7df4 22%, transparent);
  }`;
  document.head.append(style);
}

function renderActiveHighlight(activeRange: Range | null) {
  clearHighlights();
  if (activeRange && "highlights" in CSS && typeof Highlight !== "undefined") {
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(activeRange));
  }
}

function badgePosition(range: Range, rect: SelectionRect) {
  const viewport = currentVisualViewportBounds();

  if (rect.width === 0 || rect.bottom < viewport.top || rect.top > viewport.top + viewport.height) {
    return null;
  }
  if (isAnchorObscured(range, rect, viewport)) {
    return null;
  }
  return clampPositionToViewport(
    { left: rect.right + 5, top: rect.top - 10 },
    { height: 24, width: 24 },
    { margin: 6, viewport },
  );
}

// 徽标固定在顶层，不随消息滚动容器裁剪；锚点滚到宿主浮层（如输入框）背后时，
// 命中测试的首个非 QuoteCue 元素与锚点无包含关系，此时徽标应一并隐藏
function isAnchorObscured(
  range: Range,
  rect: Pick<SelectionRect, "height" | "right" | "top">,
  viewport: ReturnType<typeof currentVisualViewportBounds>,
) {
  if (typeof document.elementsFromPoint !== "function") {
    return false;
  }

  const anchor =
    range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
  if (!anchor) {
    return false;
  }

  const x = Math.min(Math.max(rect.right - 1, viewport.left), viewport.left + viewport.width - 1);
  const y = Math.min(
    Math.max(rect.top + rect.height / 2, viewport.top),
    viewport.top + viewport.height - 1,
  );
  const hit = document
    .elementsFromPoint(x, y)
    .find((element) => !element.closest(QUOTECUE_HOST_SELECTOR));
  return hit !== undefined && !anchor.contains(hit) && !hit.contains(anchor);
}

function sameGeometry(
  left: ReadonlyMap<string, AnnotationGeometry>,
  right: ReadonlyMap<string, AnnotationGeometry>,
) {
  if (left.size !== right.size) {
    return false;
  }
  for (const [annotationId, geometry] of left) {
    const other = right.get(annotationId);
    if (
      !other ||
      !sameRangeBoundaries(geometry.range, other.range) ||
      !sameRect(geometry.rect, other.rect) ||
      !sameBadge(geometry.badge, other.badge)
    ) {
      return false;
    }
  }
  return true;
}

function sameRangeBoundaries(left: Range, right: Range) {
  return (
    left.startContainer === right.startContainer &&
    left.startOffset === right.startOffset &&
    left.endContainer === right.endContainer &&
    left.endOffset === right.endOffset
  );
}

function sameRect(left: SelectionRect, right: SelectionRect) {
  return (
    left.bottom === right.bottom &&
    left.height === right.height &&
    left.left === right.left &&
    left.right === right.right &&
    left.top === right.top &&
    left.width === right.width
  );
}

function sameBadge(
  left: Pick<SelectionRect, "left" | "top"> | null,
  right: Pick<SelectionRect, "left" | "top"> | null,
) {
  return left === right || (left !== null && right !== null && samePosition(left, right));
}

function samePosition(
  left: Pick<SelectionRect, "left" | "top">,
  right: Pick<SelectionRect, "left" | "top">,
) {
  return left.left === right.left && left.top === right.top;
}

function selectionRect(rect: SelectionRect): SelectionRect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}

function clearHighlights() {
  if ("highlights" in CSS) {
    CSS.highlights.delete(HIGHLIGHT_NAME);
  }
}
