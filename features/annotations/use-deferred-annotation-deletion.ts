import { useCallback, useEffect, useMemo, useState } from "react";

import type { DraftAnnotation } from "./annotation";

const DELETE_UNDO_WINDOW_MS = 5_000;

type PendingDeletion = {
  annotationId: string;
  scopeKey: string;
};

export function useDeferredAnnotationDeletion(
  annotations: DraftAnnotation[],
  scopeKey: string,
  commitDeletion: (annotationId: string) => void,
) {
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const currentPendingDeletion = pendingDeletion?.scopeKey === scopeKey ? pendingDeletion : null;
  const visibleAnnotations = useMemo(
    () =>
      currentPendingDeletion
        ? annotations.filter(({ id }) => id !== currentPendingDeletion.annotationId)
        : annotations,
    [annotations, currentPendingDeletion],
  );

  useEffect(() => {
    if (!currentPendingDeletion) {
      return;
    }
    const timer = window.setTimeout(() => {
      commitDeletion(currentPendingDeletion.annotationId);
      setPendingDeletion((current) => (current === currentPendingDeletion ? null : current));
    }, DELETE_UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [commitDeletion, currentPendingDeletion]);

  useEffect(() => setPendingDeletion(null), [scopeKey]);

  const requestDeletion = useCallback(
    (annotationId: string) => {
      if (
        currentPendingDeletion ||
        !annotations.some((annotation) => annotation.id === annotationId)
      ) {
        return false;
      }
      setPendingDeletion({ annotationId, scopeKey });
      return true;
    },
    [annotations, currentPendingDeletion, scopeKey],
  );

  return {
    hasPendingDeletion: currentPendingDeletion !== null,
    requestDeletion,
    undoDeletion: useCallback(() => setPendingDeletion(null), []),
    visibleAnnotations,
  };
}
