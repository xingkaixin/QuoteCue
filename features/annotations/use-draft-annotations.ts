import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationIdentity, IdentifiedConversation } from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";
import { sameConversationIdentity } from "./conversation-identity";
import { applyDraftMutation, type DraftMutation } from "./draft-mutation";
import { useDraftStore } from "./DraftStoreProvider";

type DraftLifecycleState =
  | { status: "loading"; conversationIdentity: ConversationIdentity }
  | {
      status: "ready";
      conversationIdentity: ConversationIdentity;
      annotations: DraftAnnotation[];
      revision: number;
    }
  | {
      status: "error";
      conversationIdentity: IdentifiedConversation;
      annotations: DraftAnnotation[];
      revision: number;
      operation: "load";
    }
  // Retrying a failed save resends the mutation that failed, not a whole-draft snapshot, which
  // would reintroduce the lost update this store exists to prevent. Mutations are idempotent.
  | {
      status: "error";
      conversationIdentity: IdentifiedConversation;
      annotations: DraftAnnotation[];
      revision: number;
      operation: "save";
      mutation: DraftMutation;
    };

type AvailableDraftLifecycleState = Extract<DraftLifecycleState, { status: "ready" | "error" }>;

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
  const draftStore = useDraftStore();
  const [draftState, setRenderedDraftState] = useState<DraftLifecycleState>(() =>
    initialDraftState(conversationIdentity),
  );
  const draftStateRef = useRef(draftState);
  const loadGeneration = useRef(0);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const setDraftState = useCallback((nextState: DraftLifecycleState) => {
    draftStateRef.current = nextState;
    setRenderedDraftState(nextState);
  }, []);

  const loadDraftState = useCallback(
    (identity: ConversationIdentity) => {
      const generation = ++loadGeneration.current;
      if (identity.kind === "unidentified") {
        setDraftState(readyDraftState(identity));
        return;
      }

      setDraftState(loadingDraftState(identity));

      void saveQueue.current
        .then(() => draftStore.load(identity))
        .then((annotations) => {
          if (generation !== loadGeneration.current) {
            return;
          }
          setDraftState({
            status: "ready",
            conversationIdentity: identity,
            annotations,
            revision: 0,
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
            annotations: [],
            revision: 0,
            operation: "load",
          });
        });
    },
    [draftStore, setDraftState],
  );

  // The owner returns the authoritative annotations, which may already include another context's
  // concurrent change. Adopting them is how a lost update is avoided without the React layer
  // knowing anything about storage revisions.
  const persistMutation = useCallback(
    (snapshot: AvailableDraftLifecycleState, mutation: DraftMutation) => {
      const conversation = snapshot.conversationIdentity;
      if (conversation.kind === "unidentified") {
        return;
      }

      const pendingMutation = draftStore.mutate(conversation, mutation);
      saveQueue.current = pendingMutation.catch(() => undefined);

      void pendingMutation
        .then((annotations) => {
          const current = draftStateRef.current;
          if (isCurrentRevision(current, snapshot)) {
            setDraftState({ ...current, status: "ready", annotations });
          }
        })
        .catch((error: unknown) => {
          console.error("[QuoteCue] Failed to save draft annotations", error);
          const current = draftStateRef.current;
          if (
            isCurrentRevision(current, snapshot) &&
            current.conversationIdentity.kind === "identified"
          ) {
            setDraftState({
              status: "error",
              conversationIdentity: current.conversationIdentity,
              annotations: current.annotations,
              revision: current.revision,
              operation: "save",
              mutation,
            });
          }
        });
    },
    [draftStore, setDraftState],
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
      const annotations = applyDraftMutation(current.annotations, mutation);
      if (annotations === null) {
        return false;
      }
      if (annotations === current.annotations) {
        return true;
      }
      const next = {
        ...current,
        annotations: [...annotations],
        revision: current.revision + 1,
      };
      setDraftState(next);
      persistMutation(next, mutation);
      return true;
    },
    [conversationIdentity, persistMutation, setDraftState],
  );

  const visibleDraftState = sameConversationIdentity(
    draftState.conversationIdentity,
    conversationIdentity,
  )
    ? draftState
    : loadingDraftState(conversationIdentity);

  return {
    draft: toPublicDraftState(visibleDraftState),
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
    removeConfirmedAnnotations: useCallback(
      (confirmedAnnotations: readonly DraftAnnotation[]) =>
        mutateAnnotations({ kind: "discard-confirmed", annotations: confirmedAnnotations }),
      [mutateAnnotations],
    ),
    discardAllAnnotations: useCallback(
      () => mutateAnnotations({ kind: "clear" }),
      [mutateAnnotations],
    ),
    retry: useCallback(() => {
      if (visibleDraftState.status !== "error") {
        return;
      }
      if (visibleDraftState.operation === "load") {
        loadDraftState(conversationIdentity);
        return;
      }
      setDraftState({
        status: "ready",
        conversationIdentity: visibleDraftState.conversationIdentity,
        annotations: visibleDraftState.annotations,
        revision: visibleDraftState.revision,
      });
      persistMutation(visibleDraftState, visibleDraftState.mutation);
    }, [conversationIdentity, loadDraftState, persistMutation, setDraftState, visibleDraftState]),
  };
}

function toPublicDraftState(state: DraftLifecycleState): DraftState {
  switch (state.status) {
    case "loading":
      return { status: "loading" };
    case "ready":
      return { status: "ready", annotations: state.annotations };
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
  return { status: "ready", conversationIdentity, annotations: [], revision: 0 };
}

function canMutateDraftState(
  state: DraftLifecycleState,
  conversationIdentity: ConversationIdentity,
): state is AvailableDraftLifecycleState {
  return (
    sameConversationIdentity(state.conversationIdentity, conversationIdentity) &&
    (state.status === "ready" || (state.status === "error" && state.operation === "save"))
  );
}

function isCurrentRevision(
  current: DraftLifecycleState,
  saved: AvailableDraftLifecycleState,
): current is AvailableDraftLifecycleState {
  return (
    current.status !== "loading" &&
    sameConversationIdentity(current.conversationIdentity, saved.conversationIdentity) &&
    current.revision === saved.revision
  );
}
