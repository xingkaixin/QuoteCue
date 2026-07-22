import { useEffect, useState } from "react";

import type { DraftAnnotation } from "./annotation";
import { restoreTextAnchor } from "./selection-anchor";

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

export function useAnnotationHighlights(
  annotations: DraftAnnotation[],
  activeAnnotationId: string | null,
) {
  const [layout, setLayout] = useState<AnnotationHighlightLayout>({
    badgePositions: [],
    unresolvedAnnotationIds: new Set(),
  });

  useEffect(() => {
    ensureHighlightStyle();
    let positionFrame = 0;

    const refreshPositions = () => {
      cancelAnimationFrame(positionFrame);
      positionFrame = requestAnimationFrame(() => {
        setLayout(annotationHighlightLayout(annotations));
      });
    };
    const refreshAnchors = () => {
      renderActiveHighlight(annotations, activeAnnotationId);
      refreshPositions();
    };
    const observer = new MutationObserver(refreshAnchors);

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", refreshPositions);
    window.addEventListener("scroll", refreshPositions, true);
    refreshAnchors();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refreshPositions);
      window.removeEventListener("scroll", refreshPositions, true);
      cancelAnimationFrame(positionFrame);
      clearHighlights();
    };
  }, [activeAnnotationId, annotations]);

  return layout;
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

function renderActiveHighlight(annotations: DraftAnnotation[], activeAnnotationId: string | null) {
  clearHighlights();
  const activeAnnotation = annotations.find(({ id }) => id === activeAnnotationId);
  const activeRange = activeAnnotation ? restoreTextAnchor(activeAnnotation.anchor) : null;
  if (activeRange && "highlights" in CSS && typeof Highlight !== "undefined") {
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(activeRange));
  }
}

function annotationHighlightLayout(annotations: DraftAnnotation[]): AnnotationHighlightLayout {
  const entries = annotations.map((annotation) => ({
    annotation,
    range: restoreTextAnchor(annotation.anchor),
  }));
  const unresolvedAnnotationIds = new Set(
    entries.filter(({ range }) => range === null).map(({ annotation }) => annotation.id),
  );
  const badgePositions = entries
    .filter((entry): entry is { annotation: DraftAnnotation; range: Range } => entry.range !== null)
    .map(({ annotation, range }) => badgePosition(annotation, range))
    .filter((position): position is AnnotationBadgePosition => position !== null);

  return { badgePositions, unresolvedAnnotationIds };
}

function badgePosition(annotation: DraftAnnotation, range: Range) {
  const rects = Array.from(range.getClientRects());
  const rect = rects.at(-1) ?? range.getBoundingClientRect();

  if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
    return null;
  }

  return {
    annotation,
    left: Math.min(rect.right + 5, window.innerWidth - 30),
    top: Math.max(rect.top - 10, 6),
  };
}

function clearHighlights() {
  if ("highlights" in CSS) {
    CSS.highlights.delete(HIGHLIGHT_NAME);
  }
}
