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
import type { DraftPersistence, DraftPersistenceEvent } from "./draft-persistence";

export function createDraftRuntime(draftPersistence: DraftPersistence) {
  let capacityExceeded = false;
  let draftState: DraftLifecycleState | null = null;
  let loadGeneration = 0;
  let revision = 0;
  let unsubscribePersistence: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function handlePersistenceEvent(event: DraftPersistenceEvent) {
    if (event.status === "failed") {
      console.error("[QuoteCue] Failed to save draft annotations", event.error);
      dispatch({ type: "save-failed", conversationIdentity: event.conversationIdentity });
      return;
    }
    dispatch({
      type: "save-succeeded",
      conversationIdentity: event.conversationIdentity,
      annotations: applyDraftMutations(event.annotations, event.pendingMutations),
    });
  }

  function dispatch(action: DraftLifecycleAction) {
    const current = draftState ?? initialDraftLifecycleState(action.conversationIdentity);
    const next = reduceDraftLifecycle(current, action);
    if (draftState === next) {
      return next;
    }
    draftState = next;
    notify();
    return next;
  }

  function activate(conversationIdentity: ConversationIdentity) {
    if (
      draftState &&
      sameConversationIdentity(draftState.conversationIdentity, conversationIdentity)
    ) {
      return;
    }
    load(conversationIdentity);
  }

  function load(conversationIdentity: ConversationIdentity) {
    const generation = ++loadGeneration;
    const annotationsToAdopt = draftState
      ? draftAnnotationsToAdopt(draftState, conversationIdentity)
      : [];
    setCapacityExceeded(false);
    dispatch({ type: "load-started", conversationIdentity });
    if (conversationIdentity.kind === "unidentified") {
      return;
    }

    for (const annotation of annotationsToAdopt) {
      draftPersistence.enqueue(conversationIdentity, { kind: "add", annotation });
    }

    void draftPersistence
      .load(conversationIdentity)
      .then(({ annotations, hasFailedSave }) => {
        if (generation !== loadGeneration) {
          return;
        }
        dispatch({
          type: "load-succeeded",
          conversationIdentity,
          annotations: applyDraftMutations(
            annotations,
            annotationsToAdopt.map((annotation) => ({ kind: "add", annotation })),
          ),
          hasFailedSave,
        });
      })
      .catch((error: unknown) => {
        console.error("[QuoteCue] Failed to load draft annotations", error);
        if (generation !== loadGeneration) {
          return;
        }
        dispatch({
          type: "load-failed",
          conversationIdentity,
          annotations: annotationsToAdopt,
        });
      });
  }

  function mutate(conversationIdentity: ConversationIdentity, mutation: DraftMutation) {
    const current = draftState;
    if (!current || !canMutateDraftLifecycle(current, conversationIdentity)) {
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
    dispatch({
      type: "mutated",
      conversationIdentity,
      annotations: [...annotations],
    });
    setCapacityExceeded(false);
    return true;
  }

  function removeConfirmed(
    currentConversationIdentity: ConversationIdentity,
    conversationIdentity: ConversationIdentity,
    annotations: readonly DraftAnnotation[],
  ) {
    const mutation = { kind: "discard-confirmed", annotations } as const;
    if (sameConversationIdentity(currentConversationIdentity, conversationIdentity)) {
      return mutate(currentConversationIdentity, mutation);
    }
    if (conversationIdentity.kind === "unidentified") {
      return false;
    }
    draftPersistence.enqueue(conversationIdentity, mutation);
    return true;
  }

  function retry(conversationIdentity: ConversationIdentity) {
    if (!draftState) {
      return;
    }
    const visible = visibleDraftLifecycleState(draftState, conversationIdentity);
    if (visible.status !== "error") {
      return;
    }
    if (visible.operation === "load") {
      load(conversationIdentity);
    } else {
      draftPersistence.retry(visible.conversationIdentity);
    }
  }

  function snapshot(conversationIdentity: ConversationIdentity) {
    const state = draftState
      ? visibleDraftLifecycleState(draftState, conversationIdentity)
      : initialDraftLifecycleState(conversationIdentity);
    return {
      capacityExceeded:
        draftState !== null &&
        sameConversationIdentity(draftState.conversationIdentity, conversationIdentity) &&
        capacityExceeded,
      draft: publicDraftState(state),
    };
  }

  function setCapacityExceeded(next: boolean) {
    if (capacityExceeded === next) {
      return;
    }
    capacityExceeded = next;
    notify();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    unsubscribePersistence ??= draftPersistence.subscribe(handlePersistenceEvent);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        unsubscribePersistence?.();
        unsubscribePersistence = null;
      }
    };
  }

  function notify() {
    revision += 1;
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function getRevision() {
    return revision;
  }

  return { activate, getRevision, mutate, removeConfirmed, retry, snapshot, subscribe };
}

export type DraftRuntime = ReturnType<typeof createDraftRuntime>;
