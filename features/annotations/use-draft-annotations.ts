import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationIdentity, IdentifiedConversation } from "@/features/host-port/host-port";

import { sameAnnotationSnapshot, type DraftAnnotation } from "./annotation";
import { sameConversationIdentity } from "./conversation-identity";
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
      operation: "load" | "save";
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
  const saveQueue = useRef(Promise.resolve());

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

  const enqueueSave = useCallback(
    (snapshot: AvailableDraftLifecycleState) => {
      const conversation = snapshot.conversationIdentity;
      if (conversation.kind === "unidentified") {
        return;
      }

      const save = () => draftStore.save(conversation, snapshot.annotations);
      const pendingSave = saveQueue.current.then(save, save);
      saveQueue.current = pendingSave.catch(() => undefined);

      void pendingSave
        .then(() => {
          const current = draftStateRef.current;
          if (isCurrentRevision(current, snapshot)) {
            setDraftState({ ...current, status: "ready" });
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
    (mutate: (annotations: DraftAnnotation[]) => DraftAnnotation[] | null) => {
      const current = draftStateRef.current;
      if (!canMutateDraftState(current, conversationIdentity)) {
        return false;
      }
      const annotations = mutate(current.annotations);
      if (annotations === null) {
        return false;
      }
      if (annotations === current.annotations) {
        return true;
      }
      const next = {
        ...current,
        annotations,
        revision: current.revision + 1,
      };
      setDraftState(next);
      enqueueSave(next);
      return true;
    },
    [conversationIdentity, enqueueSave, setDraftState],
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
      (annotation: DraftAnnotation) => mutateAnnotations((current) => [...current, annotation]),
      [mutateAnnotations],
    ),
    updateAnnotation: useCallback(
      (annotationId: string, comment: string) =>
        mutateAnnotations((current) => {
          const index = current.findIndex((annotation) => annotation.id === annotationId);
          if (index < 0) {
            return null;
          }
          if (current[index]?.comment === comment) {
            return current;
          }
          return current.map((annotation, currentIndex) =>
            currentIndex === index ? { ...annotation, comment } : annotation,
          );
        }),
      [mutateAnnotations],
    ),
    discardAnnotations: useCallback(
      (annotationIds: readonly string[]) => {
        const removedIds = new Set(annotationIds);
        return mutateAnnotations((current) => current.filter(({ id }) => !removedIds.has(id)));
      },
      [mutateAnnotations],
    ),
    removeConfirmedAnnotations: useCallback(
      (confirmedAnnotations: readonly DraftAnnotation[]) => {
        const confirmedById = new Map(
          confirmedAnnotations.map((annotation) => [annotation.id, annotation]),
        );
        return mutateAnnotations((current) =>
          current.filter((annotation) => {
            const confirmed = confirmedById.get(annotation.id);
            return !confirmed || !sameAnnotationSnapshot(annotation, confirmed);
          }),
        );
      },
      [mutateAnnotations],
    ),
    discardAllAnnotations: useCallback(() => mutateAnnotations(() => []), [mutateAnnotations]),
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
      enqueueSave(visibleDraftState);
    }, [conversationIdentity, enqueueSave, loadDraftState, setDraftState, visibleDraftState]),
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
