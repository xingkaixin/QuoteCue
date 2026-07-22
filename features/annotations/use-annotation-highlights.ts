import { useEffect, useRef, useState } from "react";

import { chatGptHost } from "@/features/chatgpt/chatgpt-host";

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
    const scheduleProjection = () => {
      if (projectionFrame !== undefined) {
        return;
      }
      projectionFrame = requestAnimationFrame(() => {
        projectionFrame = undefined;
        const projection = projectAnnotations(annotations, activeAnnotationId);
        renderActiveHighlight(projection.activeRange);
        commitLayout(projection);
      });
    };
    const stopObserving = chatGptHost.selection.observeInvalidation(scheduleProjection);
    scheduleProjection();

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
  }, [activeAnnotationId, annotations]);

  return layout;
}

function projectAnnotations(
  annotations: DraftAnnotation[],
  activeAnnotationId: string | null,
): AnnotationProjection {
  const messageIndex = chatGptHost.selection.messageIndex();
  const entries = annotations.map((annotation) => ({
    annotation,
    range: restoreTextAnchorFromIndex(annotation.anchor, messageIndex),
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

  if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
    return null;
  }

  return {
    annotation,
    left: Math.min(rect.right + 5, window.innerWidth - 30),
    top: Math.max(rect.top - 10, 6),
  };
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
