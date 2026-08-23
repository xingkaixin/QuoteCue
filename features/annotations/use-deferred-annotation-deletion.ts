import { useCallback, useEffect, useMemo, useState } from "react";

import {
  sameConversationIdentity,
  type ConversationIdentity,
} from "@/features/conversation/conversation-identity";

import type { DraftAnnotation } from "./annotation";

export const DELETE_UNDO_WINDOW_MS = 5_000;

type PendingDeletionBatch = {
  annotationIds: string[];
  conversationIdentity: ConversationIdentity;
  expiresAt: number;
};

export function useDeferredAnnotationDeletion(
  annotations: readonly DraftAnnotation[],
  conversationIdentity: ConversationIdentity,
  commitDeletions: (annotationIds: readonly string[]) => void,
) {
  const [pendingDeletionBatch, setPendingDeletionBatch] = useState<PendingDeletionBatch | null>(
    null,
  );
  const currentBatch =
    pendingDeletionBatch &&
    sameConversationIdentity(pendingDeletionBatch.conversationIdentity, conversationIdentity)
      ? pendingDeletionBatch
      : null;
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

  useEffect(
    () =>
      setPendingDeletionBatch((current) =>
        current && sameConversationIdentity(current.conversationIdentity, conversationIdentity)
          ? current
          : null,
      ),
    [conversationIdentity],
  );

  const requestDeletion = useCallback(
    (annotationId: string) => {
      const annotationExists = annotations.some((annotation) => annotation.id === annotationId);
      if (!annotationExists || currentBatch?.annotationIds.includes(annotationId)) {
        return false;
      }
      setPendingDeletionBatch({
        annotationIds: [...(currentBatch?.annotationIds ?? []), annotationId],
        conversationIdentity,
        expiresAt: Date.now() + DELETE_UNDO_WINDOW_MS,
      });
      return true;
    },
    [annotations, conversationIdentity, currentBatch],
  );

  const clearPendingDeletions = useCallback(() => setPendingDeletionBatch(null), []);

  return {
    discardPendingDeletions: clearPendingDeletions,
    pendingDeletionCount: currentBatch?.annotationIds.length ?? 0,
    pendingDeletionExpiresAt: currentBatch?.expiresAt ?? null,
    requestDeletion,
    visibleAnnotations,
  };
}
