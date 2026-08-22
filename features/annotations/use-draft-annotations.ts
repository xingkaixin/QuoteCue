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
    };

type PendingDraftSave = {
  conversationIdentity: IdentifiedConversation;
  mutations: readonly DraftMutation[];
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
  const draftStore = useDraftStore();
  const [draftState, setRenderedDraftState] = useState<DraftLifecycleState>(() =>
    initialDraftState(conversationIdentity),
  );
  const [capacityExceeded, setCapacityExceeded] = useState(false);
  const [failedSaveConversation, setFailedSaveConversation] =
    useState<IdentifiedConversation | null>(null);
  const draftStateRef = useRef(draftState);
  const loadGeneration = useRef(0);
  const activeSave = useRef<Promise<void> | null>(null);
  const pendingSaves = useRef<PendingDraftSave[]>([]);

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
        .then(() => draftStore.load(identity))
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
    const initial = pendingSaves.current[0];
    if (!initial) {
      return;
    }

    const save = drainPendingMutations().finally(() => {
      if (activeSave.current === save) {
        activeSave.current = null;
      }
    });
    activeSave.current = save;

    async function drainPendingMutations() {
      while (true) {
        const snapshot = pendingSaves.current[0];
        if (!snapshot) {
          return;
        }
        const conversation = snapshot.conversationIdentity;
        const confirmedMutationCount = snapshot.mutations.length;
        let annotations: DraftAnnotation[];
        try {
          annotations = await draftStore.mutate(conversation, snapshot.mutations);
        } catch (error: unknown) {
          console.error("[QuoteCue] Failed to save draft annotations", error);
          setFailedSaveConversation(conversation);
          return;
        }
        setFailedSaveConversation((failedConversation) =>
          failedConversation && sameConversationIdentity(failedConversation, conversation)
            ? null
            : failedConversation,
        );

        const pendingIndex = pendingSaves.current.findIndex(
          ({ conversationIdentity: pendingConversation }) =>
            sameConversationIdentity(pendingConversation, conversation),
        );
        const currentPending = pendingSaves.current[pendingIndex];
        if (!currentPending) {
          return;
        }
        const remainingMutations = currentPending.mutations.slice(confirmedMutationCount);
        pendingSaves.current =
          remainingMutations.length > 0
            ? pendingSaves.current.map((pending, index) =>
                index === pendingIndex
                  ? { conversationIdentity: conversation, mutations: remainingMutations }
                  : pending,
              )
            : pendingSaves.current.filter((_, index) => index !== pendingIndex);
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

  const enqueuePendingMutation = useCallback(
    (conversation: IdentifiedConversation, mutation: DraftMutation) => {
      const pendingIndex = pendingSaves.current.findIndex(
        ({ conversationIdentity: pendingConversation }) =>
          sameConversationIdentity(pendingConversation, conversation),
      );
      const pending = pendingSaves.current[pendingIndex];
      pendingSaves.current = pending
        ? pendingSaves.current.map((entry, index) =>
            index === pendingIndex
              ? { ...entry, mutations: [...entry.mutations, mutation] }
              : entry,
          )
        : [...pendingSaves.current, { conversationIdentity: conversation, mutations: [mutation] }];
    },
    [],
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
        enqueuePendingMutation(current.conversationIdentity, mutation);
      }
      setDraftState(next);
      setCapacityExceeded(false);
      persistPendingMutations();
      return true;
    },
    [conversationIdentity, enqueuePendingMutation, persistPendingMutations, setDraftState],
  );

  const visibleDraftState = sameConversationIdentity(
    draftState.conversationIdentity,
    conversationIdentity,
  )
    ? draftState
    : loadingDraftState(conversationIdentity);
  const visibleSaveFailed =
    failedSaveConversation !== null &&
    sameConversationIdentity(failedSaveConversation, conversationIdentity);

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
        enqueuePendingMutation(conversation, mutation);
        persistPendingMutations();
        return true;
      },
      [conversationIdentity, enqueuePendingMutation, mutateAnnotations, persistPendingMutations],
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
      if (visibleSaveFailed) {
        persistPendingMutations();
      }
    }, [
      conversationIdentity,
      loadDraftState,
      persistPendingMutations,
      visibleSaveFailed,
      visibleDraftState,
    ]),
  };
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

function applyDraftMutations(
  annotations: readonly DraftAnnotation[],
  mutations: readonly DraftMutation[],
) {
  return mutations.reduce<DraftAnnotation[]>(
    (current, mutation) => [...(applyDraftMutation(current, mutation) ?? current)],
    [...annotations],
  );
}
