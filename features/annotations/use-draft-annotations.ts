import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationIdentity, IdentifiedConversation } from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";
import { sameConversationIdentity } from "./conversation-identity";
import { draftMutationExceedsCapacity } from "./draft-capacity";
import { applyDraftMutation, applyDraftMutations, type DraftMutation } from "./draft-mutation";
import { useDraftPersistence } from "./DraftStoreProvider";

type DraftLifecycleState =
  | { status: "loading"; conversationIdentity: ConversationIdentity }
  | {
      status: "ready";
      conversationIdentity: ConversationIdentity;
      annotations: DraftAnnotation[];
    }
  | {
      status: "error";
      conversationIdentity: IdentifiedConversation;
      annotations: DraftAnnotation[];
      operation: "load";
    };

type MutableDraftLifecycleState = Extract<DraftLifecycleState, { status: "ready" }>;

export type Draft = {
  readonly annotations: readonly DraftAnnotation[];
};

export type DraftState =
  | { readonly status: "loading" }
  | (Draft & { readonly status: "ready" })
  | (Draft & { readonly status: "error"; readonly operation: "load" | "save" });

type MutableDraftState =
  | Extract<DraftState, { status: "ready" }>
  | (Extract<DraftState, { status: "error" }> & { operation: "save" });

export function canMutateDraft(draft: DraftState): draft is MutableDraftState {
  return draft.status === "ready" || (draft.status === "error" && draft.operation === "save");
}

export function useDraftAnnotations(conversationIdentity: ConversationIdentity) {
  const draftPersistence = useDraftPersistence();
  const [draftState, setRenderedDraftState] = useState<DraftLifecycleState>(() =>
    initialDraftState(conversationIdentity),
  );
  const [capacityExceeded, setCapacityExceeded] = useState(false);
  const [failedSaveConversations, setFailedSaveConversations] = useState<IdentifiedConversation[]>(
    [],
  );
  const draftStateRef = useRef(draftState);
  const loadGeneration = useRef(0);

  const setDraftState = useCallback((nextState: DraftLifecycleState) => {
    draftStateRef.current = nextState;
    setRenderedDraftState(nextState);
  }, []);

  const loadDraftState = useCallback(
    (identity: ConversationIdentity) => {
      const generation = ++loadGeneration.current;
      const annotationsToAdopt = draftAnnotationsToAdopt(draftStateRef.current, identity);
      setCapacityExceeded(false);
      if (identity.kind === "unidentified") {
        setDraftState(readyDraftState(identity));
        return;
      }

      setDraftState(loadingDraftState(identity));
      for (const annotation of annotationsToAdopt) {
        draftPersistence.enqueue(identity, { kind: "add", annotation });
      }

      void draftPersistence
        .load(identity)
        .then((annotations) => {
          if (generation !== loadGeneration.current) {
            return;
          }
          setDraftState({
            status: "ready",
            conversationIdentity: identity,
            annotations: applyDraftMutations(
              annotations,
              annotationsToAdopt.map((annotation) => ({ kind: "add", annotation })),
            ),
          });
        })
        .catch((error: unknown) => {
          console.error("[QuoteCue] Failed to load draft annotations", error);
          if (generation !== loadGeneration.current) {
            return;
          }
          setDraftState({
            status: "error",
            conversationIdentity: identity,
            annotations: annotationsToAdopt,
            operation: "load",
          });
        });
    },
    [draftPersistence, setDraftState],
  );

  useEffect(
    () =>
      draftPersistence.subscribe((event) => {
        if (event.status === "failed") {
          console.error("[QuoteCue] Failed to save draft annotations", event.error);
          setFailedSaveConversations((failedConversations) =>
            addConversation(failedConversations, event.conversationIdentity),
          );
          return;
        }
        setFailedSaveConversations((failedConversations) =>
          removeConversation(failedConversations, event.conversationIdentity),
        );
        const current = draftStateRef.current;
        if (canMutateDraftState(current, event.conversationIdentity)) {
          setDraftState({
            status: "ready",
            conversationIdentity: current.conversationIdentity,
            annotations: applyDraftMutations(event.annotations, event.pendingMutations),
          });
        }
      }),
    [draftPersistence, setDraftState],
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
      if (!canMutateDraftState(current, conversationIdentity)) {
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
      const next = {
        ...current,
        annotations: [...annotations],
      };
      if (current.conversationIdentity.kind === "identified") {
        draftPersistence.enqueue(current.conversationIdentity, mutation);
      }
      setDraftState(next);
      setCapacityExceeded(false);
      return true;
    },
    [conversationIdentity, draftPersistence, setDraftState],
  );

  const visibleDraftState = sameConversationIdentity(
    draftState.conversationIdentity,
    conversationIdentity,
  )
    ? draftState
    : loadingDraftState(conversationIdentity);
  const visibleSaveFailed = failedSaveConversations.some((failedConversation) =>
    sameConversationIdentity(failedConversation, conversationIdentity),
  );

  return {
    capacityExceeded,
    draft: toPublicDraftState(visibleDraftState, visibleSaveFailed),
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
        loadDraftState(conversationIdentity);
        return;
      }
      if (visibleSaveFailed && conversationIdentity.kind === "identified") {
        draftPersistence.retry(conversationIdentity);
      }
    }, [
      conversationIdentity,
      draftPersistence,
      loadDraftState,
      visibleSaveFailed,
      visibleDraftState,
    ]),
  };
}

function addConversation(
  conversations: IdentifiedConversation[],
  conversation: IdentifiedConversation,
) {
  return conversations.some((candidate) => sameConversationIdentity(candidate, conversation))
    ? conversations
    : [...conversations, conversation];
}

function removeConversation(
  conversations: IdentifiedConversation[],
  conversation: IdentifiedConversation,
) {
  return conversations.filter((candidate) => !sameConversationIdentity(candidate, conversation));
}

function toPublicDraftState(state: DraftLifecycleState, saveFailed: boolean): DraftState {
  switch (state.status) {
    case "loading":
      return { status: "loading" };
    case "ready":
      return saveFailed
        ? { status: "error", annotations: state.annotations, operation: "save" }
        : { status: "ready", annotations: state.annotations };
    case "error":
      return {
        status: "error",
        annotations: state.annotations,
        operation: state.operation,
      };
  }
}

function initialDraftState(conversationIdentity: ConversationIdentity): DraftLifecycleState {
  return conversationIdentity.kind === "identified"
    ? loadingDraftState(conversationIdentity)
    : readyDraftState(conversationIdentity);
}

function loadingDraftState(conversationIdentity: ConversationIdentity): DraftLifecycleState {
  return { status: "loading", conversationIdentity };
}

function readyDraftState(conversationIdentity: ConversationIdentity): DraftLifecycleState {
  return {
    status: "ready",
    conversationIdentity,
    annotations: [],
  };
}

function canMutateDraftState(
  state: DraftLifecycleState,
  conversationIdentity: ConversationIdentity,
): state is MutableDraftLifecycleState {
  return (
    sameConversationIdentity(state.conversationIdentity, conversationIdentity) &&
    state.status === "ready"
  );
}

function draftAnnotationsToAdopt(state: DraftLifecycleState, nextIdentity: ConversationIdentity) {
  if (nextIdentity.kind !== "identified" || state.status === "loading") {
    return [];
  }
  if (state.conversationIdentity.kind === "unidentified") {
    return state.annotations;
  }
  return state.status === "error" &&
    sameConversationIdentity(state.conversationIdentity, nextIdentity)
    ? state.annotations
    : [];
}
