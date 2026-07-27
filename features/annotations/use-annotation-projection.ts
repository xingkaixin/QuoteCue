import { useEffect, useMemo, useRef, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";
import type { Host, SelectionInvalidation, SelectionRect } from "@/features/host-port/host-port";
import { rangeEndpointRect } from "@/features/host-port/range-geometry";
import { clampPositionToViewport } from "@/features/layout/floating-position";
import { currentVisualViewportBounds } from "@/features/layout/use-visual-viewport";

import type { DraftAnnotation } from "./annotation";
import {
  numberAnnotations,
  type AnnotationResolution,
  type ProjectedAnnotation,
  type SettledAnnotationResolution,
} from "./annotation-projection";
import { restoreTextAnchorFromIndex } from "./selection-anchor";

const FULL_REANCHOR_INTERVAL_MS = 5_000;
const PENDING_RESOLUTION: AnnotationResolution = { resolution: "pending" };
const UNRESOLVED_RESOLUTION: SettledAnnotationResolution = { resolution: "unresolved" };
const EMPTY_RESOLUTIONS = new Map<string, SettledAnnotationResolution>();

export function useAnnotationProjection(
  annotations: readonly DraftAnnotation[],
  activeAnnotationId: string | null,
) {
  const host = useHost();
  const [resolutionByAnnotationId, setResolutionByAnnotationId] =
    useState<ReadonlyMap<string, SettledAnnotationResolution>>(EMPTY_RESOLUTIONS);
  const resolutionRef =
    useRef<ReadonlyMap<string, SettledAnnotationResolution>>(resolutionByAnnotationId);
  const numberedAnnotations = useMemo(() => numberAnnotations(annotations), [annotations]);
  const projectedAnnotations = useMemo(
    () =>
      numberedAnnotations.map<ProjectedAnnotation>((entry) => ({
        ...entry,
        ...(resolutionByAnnotationId.get(entry.annotation.id) ?? PENDING_RESOLUTION),
      })),
    [numberedAnnotations, resolutionByAnnotationId],
  );
  const activeProjection = projectedAnnotations.find(
    ({ annotation }) => annotation.id === activeAnnotationId,
  );
  const activeRange =
    activeProjection?.resolution === "resolved" ? activeProjection.geometry.range : null;

  useEffect(() => {
    if (annotations.length === 0) {
      commitResolutions(EMPTY_RESOLUTIONS);
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
        commitResolutions(
          projectAnnotationResolutions(
            annotations,
            host,
            rangeByAnnotationId,
            resolutionRef.current,
          ),
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

    function commitResolutions(next: ReadonlyMap<string, SettledAnnotationResolution>) {
      if (sameResolutions(resolutionRef.current, next)) {
        return;
      }
      resolutionRef.current = next;
      setResolutionByAnnotationId(next);
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

function projectAnnotationResolutions(
  annotations: readonly DraftAnnotation[],
  host: Host,
  rangeByAnnotationId: ReadonlyMap<string, Range | null>,
  previousResolutions: ReadonlyMap<string, SettledAnnotationResolution>,
) {
  const resolutions = new Map<string, SettledAnnotationResolution>();
  for (const annotation of annotations) {
    const resolvedRange = rangeByAnnotationId.get(annotation.id);
    if (!resolvedRange) {
      resolutions.set(annotation.id, UNRESOLVED_RESOLUTION);
      continue;
    }
    const previousResolution = previousResolutions.get(annotation.id);
    const previousRange =
      previousResolution?.resolution === "resolved" ? previousResolution.geometry.range : undefined;
    const range =
      previousRange && sameRangeBoundaries(previousRange, resolvedRange)
        ? previousRange
        : resolvedRange;
    const rect = selectionRect(rangeEndpointRect(range));
    resolutions.set(annotation.id, {
      resolution: "resolved",
      geometry: {
        badge: badgePosition(host, range, rect),
        range,
        rect,
      },
    });
  }
  return resolutions;
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

function sameResolutions(
  left: ReadonlyMap<string, SettledAnnotationResolution>,
  right: ReadonlyMap<string, SettledAnnotationResolution>,
) {
  if (left.size !== right.size) {
    return false;
  }
  for (const [annotationId, resolution] of left) {
    const other = right.get(annotationId);
    if (!other || resolution.resolution !== other.resolution) {
      return false;
    }
    if (resolution.resolution === "unresolved" || other.resolution === "unresolved") {
      continue;
    }
    if (
      !sameRangeBoundaries(resolution.geometry.range, other.geometry.range) ||
      !sameRect(resolution.geometry.rect, other.geometry.rect) ||
      !sameBadge(resolution.geometry.badge, other.geometry.badge)
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
