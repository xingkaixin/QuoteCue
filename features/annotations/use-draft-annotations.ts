import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationIdentity } from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";
import { sameConversationIdentity } from "./conversation-identity";
import { draftMutationExceedsCapacity } from "./draft-capacity";
import {
  canMutateDraftLifecycle,
  draftAnnotationsToAdopt,
  initialDraftLifecycleState,
  publicDraftState,
  reduceDraftLifecycle,
  visibleDraftLifecycleState,
  type DraftLifecycleAction,
  type DraftLifecycleState,
} from "./draft-lifecycle";
import { applyDraftMutation, applyDraftMutations, type DraftMutation } from "./draft-mutation";
import { useDraftPersistence } from "./DraftPersistenceProvider";

export { canMutateDraft } from "./draft-lifecycle";
export type { DraftState } from "./draft-lifecycle";

export function useDraftAnnotations(conversationIdentity: ConversationIdentity) {
  const draftPersistence = useDraftPersistence();
  const [draftState, setRenderedDraftState] = useState<DraftLifecycleState>(() =>
    initialDraftLifecycleState(conversationIdentity),
  );
  const [capacityExceeded, setCapacityExceeded] = useState(false);
  const draftStateRef = useRef(draftState);
  const loadGeneration = useRef(0);

  const dispatchDraft = useCallback((action: DraftLifecycleAction) => {
    const nextState = reduceDraftLifecycle(draftStateRef.current, action);
    draftStateRef.current = nextState;
    setRenderedDraftState(nextState);
    return nextState;
  }, []);

  const loadDraftState = useCallback(
    (identity: ConversationIdentity) => {
      const generation = ++loadGeneration.current;
      const annotationsToAdopt = draftAnnotationsToAdopt(draftStateRef.current, identity);
      setCapacityExceeded(false);
      dispatchDraft({ type: "load-started", conversationIdentity: identity });
      if (identity.kind === "unidentified") {
        return;
      }

      for (const annotation of annotationsToAdopt) {
        draftPersistence.enqueue(identity, { kind: "add", annotation });
      }

      void draftPersistence
        .load(identity)
        .then(({ annotations, hasFailedSave }) => {
          if (generation !== loadGeneration.current) {
            return;
          }
          const nextAnnotations = applyDraftMutations(
            annotations,
            annotationsToAdopt.map((annotation) => ({ kind: "add", annotation })),
          );
          dispatchDraft({
            type: "load-succeeded",
            conversationIdentity: identity,
            annotations: nextAnnotations,
            hasFailedSave,
          });
        })
        .catch((error: unknown) => {
          console.error("[QuoteCue] Failed to load draft annotations", error);
          if (generation !== loadGeneration.current) {
            return;
          }
          dispatchDraft({
            type: "load-failed",
            conversationIdentity: identity,
            annotations: annotationsToAdopt,
          });
        });
    },
    [dispatchDraft, draftPersistence],
  );

  useEffect(
    () =>
      draftPersistence.subscribe((event) => {
        if (event.status === "failed") {
          console.error("[QuoteCue] Failed to save draft annotations", event.error);
        }
        if (event.status === "failed") {
          dispatchDraft({
            type: "save-failed",
            conversationIdentity: event.conversationIdentity,
          });
          return;
        }
        dispatchDraft({
          type: "save-succeeded",
          conversationIdentity: event.conversationIdentity,
          annotations: applyDraftMutations(event.annotations, event.pendingMutations),
        });
      }),
    [dispatchDraft, draftPersistence],
  );

  useEffect(() => {
    loadDraftState(conversationIdentity);
    return () => {
      loadGeneration.current += 1;
    };
  }, [conversationIdentity, loadDraftState]);

  const mutateAnnotations = useCallback(
    (mutation: DraftMutation) => {
      const current = draftStateRef.current;
      if (!canMutateDraftLifecycle(current, conversationIdentity)) {
        return false;
      }
      if (draftMutationExceedsCapacity(current.annotations, mutation)) {
        setCapacityExceeded(true);
        return false;
      }
      const annotations = applyDraftMutation(current.annotations, mutation);
      if (annotations === null) {
        return false;
      }
      if (annotations === current.annotations) {
        setCapacityExceeded(false);
        return true;
      }
      if (current.conversationIdentity.kind === "identified") {
        draftPersistence.enqueue(current.conversationIdentity, mutation);
      }
      dispatchDraft({
        type: "mutated",
        conversationIdentity,
        annotations: [...annotations],
      });
      setCapacityExceeded(false);
      return true;
    },
    [conversationIdentity, dispatchDraft, draftPersistence],
  );

  const visibleDraftState = visibleDraftLifecycleState(draftState, conversationIdentity);
  return {
    capacityExceeded,
    draft: publicDraftState(visibleDraftState),
    addAnnotation: useCallback(
      (annotation: DraftAnnotation) => mutateAnnotations({ kind: "add", annotation }),
      [mutateAnnotations],
    ),
    updateAnnotation: useCallback(
      (annotationId: string, comment: string) =>
        mutateAnnotations({ kind: "update", annotationId, comment }),
      [mutateAnnotations],
    ),
    discardAnnotations: useCallback(
      (annotationIds: readonly string[]) => mutateAnnotations({ kind: "discard", annotationIds }),
      [mutateAnnotations],
    ),
    // A send started in one conversation can be confirmed after navigating away, so the draft to
    // clean is the one that owned the attempt, not whichever is mounted now.
    removeConfirmedAnnotations: useCallback(
      (conversation: ConversationIdentity, confirmedAnnotations: readonly DraftAnnotation[]) => {
        const mutation = {
          kind: "discard-confirmed",
          annotations: confirmedAnnotations,
        } as const;
        if (sameConversationIdentity(conversationIdentity, conversation)) {
          return mutateAnnotations(mutation);
        }
        if (conversation.kind === "unidentified") {
          return false;
        }
        draftPersistence.enqueue(conversation, mutation);
        return true;
      },
      [conversationIdentity, draftPersistence, mutateAnnotations],
    ),
    discardAllAnnotations: useCallback(
      () => mutateAnnotations({ kind: "clear" }),
      [mutateAnnotations],
    ),
    retry: useCallback(() => {
      if (visibleDraftState.status === "error") {
        if (visibleDraftState.operation === "load") {
          loadDraftState(conversationIdentity);
        } else {
          draftPersistence.retry(visibleDraftState.conversationIdentity);
        }
      }
    }, [conversationIdentity, draftPersistence, loadDraftState, visibleDraftState]),
  };
}
