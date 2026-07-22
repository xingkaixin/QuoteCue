import { useCallback, useEffect, useMemo, useState } from "react";

import type { DraftAnnotation } from "./annotation";

export const DELETE_UNDO_WINDOW_MS = 5_000;

type PendingDeletionBatch = {
  annotationIds: string[];
  expiresAt: number;
  scopeKey: string;
};

export function useDeferredAnnotationDeletion(
  annotations: DraftAnnotation[],
  scopeKey: string,
  commitDeletions: (annotationIds: readonly string[]) => void,
) {
  const [pendingDeletionBatch, setPendingDeletionBatch] = useState<PendingDeletionBatch | null>(
    null,
  );
  const currentBatch = pendingDeletionBatch?.scopeKey === scopeKey ? pendingDeletionBatch : null;
  const visibleAnnotations = useMemo(() => {
    if (!currentBatch) {
      return annotations;
    }
    const pendingIds = new Set(currentBatch.annotationIds);
    return annotations.filter(({ id }) => !pendingIds.has(id));
  }, [annotations, currentBatch]);

  useEffect(() => {
    if (!currentBatch) {
      return;
    }
    const timer = window.setTimeout(
      () => {
        commitDeletions(currentBatch.annotationIds);
        setPendingDeletionBatch((current) => (current === currentBatch ? null : current));
      },
      Math.max(0, currentBatch.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [commitDeletions, currentBatch]);

  useEffect(() => setPendingDeletionBatch(null), [scopeKey]);

  const requestDeletion = useCallback(
    (annotationId: string) => {
      const annotationExists = annotations.some((annotation) => annotation.id === annotationId);
      if (!annotationExists || currentBatch?.annotationIds.includes(annotationId)) {
        return false;
      }
      setPendingDeletionBatch({
        annotationIds: [...(currentBatch?.annotationIds ?? []), annotationId],
        expiresAt: Date.now() + DELETE_UNDO_WINDOW_MS,
        scopeKey,
      });
      return true;
    },
    [annotations, currentBatch, scopeKey],
  );

  const clearPendingDeletions = useCallback(() => setPendingDeletionBatch(null), []);

  return {
    discardPendingDeletions: clearPendingDeletions,
    pendingDeletionCount: currentBatch?.annotationIds.length ?? 0,
    pendingDeletionExpiresAt: currentBatch?.expiresAt ?? null,
    requestDeletion,
    undoDeletions: clearPendingDeletions,
    visibleAnnotations,
  };
}
