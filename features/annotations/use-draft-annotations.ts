import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationIdentity, IdentifiedConversation } from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";
import { sameConversationIdentity } from "./conversation-identity";
import { draftMutationExceedsCapacity } from "./draft-capacity";
import { applyDraftMutation, type DraftMutation } from "./draft-mutation";
import { useDraftStore } from "./DraftStoreProvider";

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
    }
  | {
      status: "error";
      conversationIdentity: IdentifiedConversation;
      annotations: DraftAnnotation[];
      operation: "save";
    };

type PendingDraftSave = {
  conversationIdentity: IdentifiedConversation;
  mutations: readonly DraftMutation[];
};

type MutableDraftLifecycleState =
  | Extract<DraftLifecycleState, { status: "ready" }>
  | Extract<DraftLifecycleState, { status: "error"; operation: "save" }>;

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
  const [capacityExceeded, setCapacityExceeded] = useState(false);
  const draftStateRef = useRef(draftState);
  const loadGeneration = useRef(0);
  const activeSave = useRef<Promise<void> | null>(null);
  const pendingSave = useRef<PendingDraftSave | null>(null);

  const setDraftState = useCallback((nextState: DraftLifecycleState) => {
    draftStateRef.current = nextState;
    setRenderedDraftState(nextState);
  }, []);

  const loadDraftState = useCallback(
    (identity: ConversationIdentity) => {
      const generation = ++loadGeneration.current;
      setCapacityExceeded(false);
      if (identity.kind === "unidentified") {
        setDraftState(readyDraftState(identity));
        return;
      }

      setDraftState(loadingDraftState(identity));

      void (activeSave.current ?? Promise.resolve())
        .then(() => {
          if (
            pendingSave.current &&
            !sameConversationIdentity(pendingSave.current.conversationIdentity, identity)
          ) {
            pendingSave.current = null;
          }
          return draftStore.load(identity);
        })
        .then((annotations) => {
          if (generation !== loadGeneration.current) {
            return;
          }
          setDraftState({
            status: "ready",
            conversationIdentity: identity,
            annotations,
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
            operation: "load",
          });
        });
    },
    [draftStore, setDraftState],
  );

  const persistPendingMutations = useCallback(() => {
    if (activeSave.current) {
      return;
    }
    const initial = pendingSave.current;
    if (!initial) {
      return;
    }
    const conversation = initial.conversationIdentity;

    const save = drainPendingMutations().finally(() => {
      if (activeSave.current === save) {
        activeSave.current = null;
      }
    });
    activeSave.current = save;

    async function drainPendingMutations() {
      while (true) {
        const snapshot = pendingSave.current;
        if (
          !snapshot ||
          !sameConversationIdentity(snapshot.conversationIdentity, conversation) ||
          snapshot.mutations.length === 0
        ) {
          return;
        }
        const confirmedMutationCount = snapshot.mutations.length;
        let annotations: DraftAnnotation[];
        try {
          annotations = await draftStore.mutate(conversation, snapshot.mutations);
        } catch (error: unknown) {
          console.error("[QuoteCue] Failed to save draft annotations", error);
          const current = draftStateRef.current;
          if (
            canMutateDraftState(current, conversation) &&
            current.conversationIdentity.kind === "identified"
          ) {
            setDraftState({
              status: "error",
              conversationIdentity: current.conversationIdentity,
              annotations: current.annotations,
              operation: "save",
            });
          }
          return;
        }

        const currentPending = pendingSave.current;
        if (
          !currentPending ||
          !sameConversationIdentity(currentPending.conversationIdentity, conversation)
        ) {
          return;
        }
        // One request drains at a time, so new local mutations can only extend this confirmed prefix.
        const remainingMutations = currentPending.mutations.slice(confirmedMutationCount);
        pendingSave.current =
          remainingMutations.length > 0
            ? { conversationIdentity: conversation, mutations: remainingMutations }
            : null;
        const current = draftStateRef.current;
        if (canMutateDraftState(current, conversation)) {
          setDraftState({
            status: "ready",
            conversationIdentity: current.conversationIdentity,
            annotations: applyDraftMutations(annotations, remainingMutations),
          });
        }
      }
    }
  }, [draftStore, setDraftState]);

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
        const pending = pendingSave.current;
        pendingSave.current =
          pending && sameConversationIdentity(pending.conversationIdentity, conversationIdentity)
            ? { ...pending, mutations: [...pending.mutations, mutation] }
            : { conversationIdentity: current.conversationIdentity, mutations: [mutation] };
      }
      setDraftState(next);
      setCapacityExceeded(false);
      persistPendingMutations();
      return true;
    },
    [conversationIdentity, persistPendingMutations, setDraftState],
  );

  const visibleDraftState = sameConversationIdentity(
    draftState.conversationIdentity,
    conversationIdentity,
  )
    ? draftState
    : loadingDraftState(conversationIdentity);

  return {
    capacityExceeded,
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
        void draftStore.mutate(conversation, [mutation]).catch((error: unknown) => {
          console.error("[QuoteCue] Failed to remove confirmed annotations", error);
        });
        return true;
      },
      [conversationIdentity, draftStore, mutateAnnotations],
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
      });
      persistPendingMutations();
    }, [
      conversationIdentity,
      loadDraftState,
      persistPendingMutations,
      setDraftState,
      visibleDraftState,
    ]),
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
    (state.status === "ready" || (state.status === "error" && state.operation === "save"))
  );
}

function applyDraftMutations(
  annotations: readonly DraftAnnotation[],
  mutations: readonly DraftMutation[],
) {
  return mutations.reduce<DraftAnnotation[]>(
    (current, mutation) => [...(applyDraftMutation(current, mutation) ?? current)],
    [...annotations],
  );
}
