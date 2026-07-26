import { useEffect, useRef, useState } from "react";

import { requireActiveHost } from "@/features/host/active-host";
import type { Host, SelectionInvalidationReason } from "@/features/host/dom-host";
import { clampPositionToViewport } from "@/features/layout/floating-position";
import { currentVisualViewportBounds } from "@/features/layout/use-visual-viewport";

import type { DraftAnnotation } from "./annotation";
import { rangeEndpointRect, restoreTextAnchorFromIndex } from "./selection-anchor";

const HIGHLIGHT_NAME = "quotecue-annotations";
const HIGHLIGHT_STYLE_ID = "quotecue-highlight-style";

export type AnnotationBadgePosition = {
  annotation: DraftAnnotation;
  left: number;
  top: number;
};

type AnnotationHighlightLayout = {
  badgePositions: AnnotationBadgePosition[];
  unresolvedAnnotationIds: ReadonlySet<string>;
};

type AnnotationProjection = AnnotationHighlightLayout & {
  activeRange: Range | null;
};

const EMPTY_LAYOUT: AnnotationHighlightLayout = {
  badgePositions: [],
  unresolvedAnnotationIds: new Set(),
};

export function useAnnotationHighlights(
  annotations: DraftAnnotation[],
  activeAnnotationId: string | null,
) {
  const host = requireActiveHost();
  const [layout, setLayout] = useState<AnnotationHighlightLayout>(EMPTY_LAYOUT);
  const layoutRef = useRef(layout);

  useEffect(() => {
    if (annotations.length === 0) {
      clearHighlights();
      commitLayout(EMPTY_LAYOUT);
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
        const projection = projectAnnotations(annotations, activeAnnotationId, rangeByAnnotationId);
        renderActiveHighlight(projection.activeRange);
        commitLayout(projection);
      });
    };
    const stopObserving = host.selection.observeInvalidation(scheduleProjection);
    scheduleProjection("content");

    return () => {
      stopObserving();
      if (projectionFrame !== undefined) {
        cancelAnimationFrame(projectionFrame);
      }
      clearHighlights();
    };

    function commitLayout(nextLayout: AnnotationHighlightLayout) {
      if (sameLayout(layoutRef.current, nextLayout)) {
        return;
      }
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
    }
  }, [activeAnnotationId, annotations, host]);

  return layout;
}

function projectAnnotations(
  annotations: DraftAnnotation[],
  activeAnnotationId: string | null,
  rangeByAnnotationId: ReadonlyMap<string, Range | null>,
): AnnotationProjection {
  const entries = annotations.map((annotation) => ({
    annotation,
    range: rangeByAnnotationId.get(annotation.id) ?? null,
  }));
  const unresolvedAnnotationIds = new Set(
    entries.filter(({ range }) => range === null).map(({ annotation }) => annotation.id),
  );
  const badgePositions = entries
    .filter((entry): entry is { annotation: DraftAnnotation; range: Range } => entry.range !== null)
    .map(({ annotation, range }) => badgePosition(annotation, range))
    .filter((position): position is AnnotationBadgePosition => position !== null);
  const activeRange =
    entries.find(({ annotation }) => annotation.id === activeAnnotationId)?.range ?? null;

  return { activeRange, badgePositions, unresolvedAnnotationIds };
}

function resolveAnnotationRanges(annotations: DraftAnnotation[], host: Host) {
  const messageIndex = host.selection.messageIndex();
  const messageTextCache = new Map<HTMLElement, string>();
  return new Map(
    annotations.map((annotation) => [
      annotation.id,
      restoreTextAnchorFromIndex(annotation.anchor, messageIndex, messageTextCache),
    ]),
  );
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

function badgePosition(annotation: DraftAnnotation, range: Range) {
  const rect = rangeEndpointRect(range);
  const viewport = currentVisualViewportBounds();

  if (rect.width === 0 || rect.bottom < viewport.top || rect.top > viewport.top + viewport.height) {
    return null;
  }
  if (isAnchorObscured(range, rect, viewport)) {
    return null;
  }
  const position = clampPositionToViewport(
    { left: rect.right + 5, top: rect.top - 10 },
    { height: 24, width: 24 },
    { margin: 6, viewport },
  );

  return {
    annotation,
    left: position.left,
    top: position.top,
  };
}

// 徽标固定在顶层，不随消息滚动容器裁剪；锚点滚到宿主浮层（如输入框）背后时，
// 命中测试的首个非 QuoteCue 元素与锚点无包含关系，此时徽标应一并隐藏
function isAnchorObscured(
  range: Range,
  rect: { height: number; right: number; top: number },
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
    .find((element) => !element.closest("[data-quotecue-host]"));
  return hit !== undefined && !anchor.contains(hit) && !hit.contains(anchor);
}

function sameLayout(left: AnnotationHighlightLayout, right: AnnotationHighlightLayout) {
  return (
    sameIds(left.unresolvedAnnotationIds, right.unresolvedAnnotationIds) &&
    left.badgePositions.length === right.badgePositions.length &&
    left.badgePositions.every((position, index) => {
      const other = right.badgePositions[index];
      return (
        position.annotation === other?.annotation &&
        position.left === other.left &&
        position.top === other.top
      );
    })
  );
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && Array.from(left).every((id) => right.has(id));
}

function clearHighlights() {
  if ("highlights" in CSS) {
    CSS.highlights.delete(HIGHLIGHT_NAME);
  }
}
