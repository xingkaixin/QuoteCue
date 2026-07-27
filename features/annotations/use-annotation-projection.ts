import { useEffect, useMemo, useRef, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";
import type { Host, SelectionInvalidation, SelectionRect } from "@/features/host-port/host-port";
import { rangeEndpointRect } from "@/features/host-port/range-geometry";
import { clampPositionToViewport } from "@/features/layout/floating-position";
import { currentVisualViewportBounds } from "@/features/layout/use-visual-viewport";

import type { DraftAnnotation } from "./annotation";
import { numberAnnotations, type ProjectedAnnotation } from "./annotation-projection";
import { restoreTextAnchorFromIndex } from "./selection-anchor";

const FULL_REANCHOR_INTERVAL_MS = 5_000;

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

    let projectionFrame: number | undefined;
    let lastFullResolutionAt = Number.NEGATIVE_INFINITY;
    let pendingInvalidation: SelectionInvalidation | undefined;
    let rangeByAnnotationId = new Map<string, Range | null>();
    const scheduleProjection = (nextInvalidation: SelectionInvalidation) => {
      pendingInvalidation = mergeInvalidations(pendingInvalidation, nextInvalidation);
      if (projectionFrame !== undefined) {
        return;
      }
      projectionFrame = requestAnimationFrame(() => {
        projectionFrame = undefined;
        const invalidation = pendingInvalidation ?? { reason: "layout" };
        pendingInvalidation = undefined;
        if (invalidation.reason === "content") {
          const dirtyMessageIds =
            invalidation.dirtyMessageIds === "all" ||
            Date.now() - lastFullResolutionAt >= FULL_REANCHOR_INTERVAL_MS
              ? "all"
              : invalidation.dirtyMessageIds;
          if (dirtyMessageIds === "all") {
            lastFullResolutionAt = Date.now();
          }
          rangeByAnnotationId = resolveAnnotationRanges(
            annotations,
            host,
            rangeByAnnotationId,
            dirtyMessageIds,
          );
        }
        commitGeometry(
          projectAnnotationGeometry(annotations, host, rangeByAnnotationId, geometryRef.current),
        );
      });
    };
    const stopObserving = host.selection.observeInvalidation(scheduleProjection);
    scheduleProjection({ dirtyMessageIds: "all", reason: "content" });

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
    host.selection.highlight(activeRange);
    return () => host.selection.highlight(null);
  }, [activeRange, host]);

  return projectedAnnotations;
}

function resolveAnnotationRanges(
  annotations: readonly DraftAnnotation[],
  host: Host,
  currentRanges: ReadonlyMap<string, Range | null>,
  dirtyMessageIds: ReadonlySet<string> | "all",
) {
  const annotationIdsToResolve = new Set<string>();
  const messageIdsToResolve = new Set<string>();
  for (const annotation of annotations) {
    const currentRange = currentRanges.get(annotation.id);
    const shouldResolve =
      dirtyMessageIds === "all" ||
      dirtyMessageIds.has(annotation.anchor.messageId) ||
      !currentRanges.has(annotation.id) ||
      (currentRange !== undefined && currentRange !== null && !isRangeConnected(currentRange));
    if (shouldResolve) {
      annotationIdsToResolve.add(annotation.id);
      messageIdsToResolve.add(annotation.anchor.messageId);
    }
  }

  const messageIndex =
    annotationIdsToResolve.size === 0
      ? new Map<string, HTMLElement>()
      : host.selection.messageIndex(dirtyMessageIds === "all" ? undefined : messageIdsToResolve);
  const messageTextCache = new Map<HTMLElement, string>();
  return new Map(
    annotations.map((annotation) => {
      const range = annotationIdsToResolve.has(annotation.id)
        ? restoreTextAnchorFromIndex(annotation.anchor, messageIndex, messageTextCache)
        : (currentRanges.get(annotation.id) ?? null);
      return [annotation.id, range];
    }),
  );
}

function isRangeConnected(range: Range) {
  return range.startContainer.isConnected && range.endContainer.isConnected;
}

function mergeInvalidations(
  current: SelectionInvalidation | undefined,
  next: SelectionInvalidation,
): SelectionInvalidation {
  if (!current || current.reason === "layout") {
    return next;
  }
  if (next.reason === "layout") {
    return current;
  }
  if (current.dirtyMessageIds === "all" || next.dirtyMessageIds === "all") {
    return { dirtyMessageIds: "all", reason: "content" };
  }
  return {
    dirtyMessageIds: new Set([...current.dirtyMessageIds, ...next.dirtyMessageIds]),
    reason: "content",
  };
}

function projectAnnotationGeometry(
  annotations: readonly DraftAnnotation[],
  host: Host,
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
      badge: badgePosition(host, range, rect),
      range,
      rect,
    });
  }
  return geometry;
}

function badgePosition(host: Host, range: Range, rect: SelectionRect) {
  const viewport = currentVisualViewportBounds();

  if (rect.width === 0 || rect.bottom < viewport.top || rect.top > viewport.top + viewport.height) {
    return null;
  }
  if (host.selection.isObscured(range, rect)) {
    return null;
  }
  return clampPositionToViewport(
    { left: rect.right + 5, top: rect.top - 10 },
    { height: 24, width: 24 },
    { margin: 6, viewport },
  );
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
