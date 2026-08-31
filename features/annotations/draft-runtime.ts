import {
  sameConversationIdentity,
  type ConversationIdentity,
  type IdentifiedConversation,
  type UnidentifiedConversation,
} from "@/features/conversation/conversation-identity";

import { sameAnnotationSnapshot, type DraftAnnotation } from "./annotation";
import { draftMutationExceedsCapacity } from "./draft-capacity";
import {
  canMutateDraftLifecycle,
  initialDraftLifecycleState,
  publicDraftState,
  reduceDraftLifecycle,
  visibleDraftLifecycleState,
  type DraftLifecycleAction,
  type DraftLifecycleState,
} from "./draft-lifecycle";
import { applyDraftMutation, applyDraftMutations, type DraftMutation } from "./draft-mutation";
import type { DraftPersistence, DraftPersistenceEvent } from "./draft-persistence";

type DraftRuntimeSnapshot = {
  capacityExceeded: boolean;
  draftState: DraftLifecycleState | null;
  retainedDrafts: ReadonlyMap<string, RetainedAnnotations>;
};

type RetainedAnnotations = { annotations: readonly DraftAnnotation[] } & (
  | { status: "retained" }
  | { status: "restoring" | "save-failed"; target: IdentifiedConversation }
);

export type RetainedDraftState = {
  conversationIdentity: UnidentifiedConversation;
  count: number;
  status: RetainedAnnotations["status"];
};

export function createDraftRuntime(draftPersistence: DraftPersistence) {
  let snapshot: DraftRuntimeSnapshot = {
    capacityExceeded: false,
    draftState: null,
    retainedDrafts: new Map(),
  };
  let loadGeneration = 0;
  let unsubscribePersistence: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function handlePersistenceEvent(event: DraftPersistenceEvent) {
    settleRetainedDrafts(event);
    if (event.status === "failed") {
      console.error("[QuoteCue] Failed to save draft annotations", event.error);
      dispatch({ type: "save-failed", conversationIdentity: event.conversationIdentity });
      return;
    }
    const { result } = event;
    if (
      snapshot.draftState &&
      sameConversationIdentity(snapshot.draftState.conversationIdentity, event.conversationIdentity)
    ) {
      setCapacityExceeded(result.status === "rejected" && result.reason === "capacity");
    }
    dispatch({
      type: "save-succeeded",
      conversationIdentity: event.conversationIdentity,
      annotations: withoutRestoringAnnotations(
        applyDraftMutations(result.annotations, event.pendingMutations),
        event.conversationIdentity,
      ),
      hasUnreadableAnnotations: result.hasUnreadableAnnotations,
    });
  }

  function dispatch(action: DraftLifecycleAction) {
    const current = snapshot.draftState ?? initialDraftLifecycleState(action.conversationIdentity);
    const next = reduceDraftLifecycle(current, action);
    if (snapshot.draftState === next) {
      return next;
    }
    snapshot = { ...snapshot, draftState: next };
    notify();
    return next;
  }

  function activate(conversationIdentity: ConversationIdentity) {
    if (
      snapshot.draftState &&
      sameConversationIdentity(snapshot.draftState.conversationIdentity, conversationIdentity)
    ) {
      return;
    }
    load(conversationIdentity);
  }

  function load(conversationIdentity: ConversationIdentity) {
    const generation = ++loadGeneration;
    const previous = snapshot.draftState;
    if (
      previous?.status === "ready" &&
      previous.conversationIdentity.kind === "unidentified" &&
      previous.annotations.length > 0
    ) {
      setRetainedDraft(previous.conversationIdentity.sessionKey, {
        status: "retained",
        annotations: previous.annotations,
      });
    }
    setCapacityExceeded(false);
    dispatch({ type: "load-started", conversationIdentity });
    if (conversationIdentity.kind === "unidentified") {
      return;
    }

    void draftPersistence
      .load(conversationIdentity)
      .then(({ annotations, hasFailedSave, hasUnreadableAnnotations }) => {
        if (generation !== loadGeneration) {
          return;
        }
        dispatch({
          type: "load-succeeded",
          conversationIdentity,
          annotations: withoutRestoringAnnotations(annotations, conversationIdentity),
          hasUnreadableAnnotations,
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
        });
      });
  }

  function mutate(conversationIdentity: ConversationIdentity, mutation: DraftMutation) {
    const current = snapshot.draftState;
    if (!current || !canMutateDraftLifecycle(current, conversationIdentity)) {
      return false;
    }
    if (current.hasUnreadableAnnotations && mutation.kind !== "clear") {
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
    if (
      annotations === current.annotations &&
      !(current.hasUnreadableAnnotations && mutation.kind === "clear")
    ) {
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
    if (conversationIdentity.kind === "unidentified") {
      const retained = snapshot.retainedDrafts.get(conversationIdentity.sessionKey);
      if (retained) {
        const remaining =
          applyDraftMutation(retained.annotations, mutation) ?? retained.annotations;
        setRetainedDraft(conversationIdentity.sessionKey, { ...retained, annotations: remaining });
        return true;
      }
    }
    const target = conversationIdentity;
    if (
      sameConversationIdentity(currentConversationIdentity, target) &&
      snapshot.draftState &&
      canMutateDraftLifecycle(snapshot.draftState, target)
    ) {
      return mutate(currentConversationIdentity, mutation);
    }
    if (target.kind === "unidentified") {
      return false;
    }
    draftPersistence.enqueue(target, mutation);
    return true;
  }

  function restoreRetainedDraft(
    conversationIdentity: ConversationIdentity,
    sourceSessionKey: string | undefined,
  ) {
    const first = snapshot.retainedDrafts.entries().next().value;
    if (!first || first[0] !== sourceSessionKey || conversationIdentity.kind !== "identified") {
      return false;
    }
    const [sessionKey, retained] = first;
    if (retained.status === "restoring") {
      return false;
    }
    if (retained.status === "save-failed") {
      setRetainedDraft(sessionKey, { ...retained, status: "restoring" });
      draftPersistence.retry(retained.target);
      return true;
    }
    const current = snapshot.draftState;
    if (
      current?.status !== "ready" ||
      current.hasUnreadableAnnotations ||
      !sameConversationIdentity(current.conversationIdentity, conversationIdentity)
    ) {
      return false;
    }
    let combined: readonly DraftAnnotation[] = current.annotations;
    for (const annotation of retained.annotations) {
      const mutation = { kind: "add", annotation } as const;
      if (draftMutationExceedsCapacity(combined, mutation)) {
        setCapacityExceeded(true);
        return false;
      }
      combined = applyDraftMutation(combined, mutation) ?? combined;
    }
    setRetainedDraft(sessionKey, {
      ...retained,
      status: "restoring",
      target: conversationIdentity,
    });
    for (const annotation of retained.annotations) {
      draftPersistence.enqueue(conversationIdentity, { kind: "add", annotation });
    }
    setCapacityExceeded(false);
    return true;
  }

  function discardRetainedDraft(sourceSessionKey: string | undefined) {
    const first = snapshot.retainedDrafts.entries().next().value;
    if (!first || first[0] !== sourceSessionKey || first[1].status !== "retained") {
      return false;
    }
    setRetainedDraft(first[0], null);
    return true;
  }

  function setRetainedDraft(sessionKey: string, retained: RetainedAnnotations | null) {
    const retainedDrafts = new Map(snapshot.retainedDrafts);
    if (retained && retained.annotations.length > 0) {
      retainedDrafts.set(sessionKey, retained);
    } else {
      retainedDrafts.delete(sessionKey);
    }
    snapshot = { ...snapshot, retainedDrafts };
    notify();
  }

  function settleRetainedDrafts(event: DraftPersistenceEvent) {
    for (const [sessionKey, retained] of snapshot.retainedDrafts) {
      if (
        retained.status === "retained" ||
        !sameConversationIdentity(retained.target, event.conversationIdentity)
      ) {
        continue;
      }
      if (event.status === "failed") {
        setRetainedDraft(sessionKey, { ...retained, status: "save-failed" });
        continue;
      }
      const annotations = retained.annotations.filter(
        (annotation) =>
          !event.result.annotations.some((saved) => sameAnnotationSnapshot(annotation, saved)),
      );
      const hasPendingAdds = event.pendingMutations.some(
        (mutation) =>
          mutation.kind === "add" &&
          annotations.some((annotation) => annotation.id === mutation.annotation.id),
      );
      setRetainedDraft(
        sessionKey,
        hasPendingAdds
          ? { ...retained, annotations, status: "restoring" }
          : { annotations, status: "retained" },
      );
    }
  }

  function withoutRestoringAnnotations(
    annotations: readonly DraftAnnotation[],
    conversationIdentity: IdentifiedConversation,
  ) {
    const restoringIds = new Set<string>();
    for (const retained of snapshot.retainedDrafts.values()) {
      if (
        retained.status !== "retained" &&
        sameConversationIdentity(retained.target, conversationIdentity)
      ) {
        for (const annotation of retained.annotations) {
          restoringIds.add(annotation.id);
        }
      }
    }
    return annotations.filter(({ id }) => !restoringIds.has(id));
  }

  function retry(conversationIdentity: ConversationIdentity) {
    if (!snapshot.draftState) {
      return;
    }
    const visible = visibleDraftLifecycleState(snapshot.draftState, conversationIdentity);
    if (visible.status !== "error") {
      return;
    }
    if (visible.operation === "load") {
      load(conversationIdentity);
    } else {
      draftPersistence.retry(visible.conversationIdentity);
    }
  }

  function setCapacityExceeded(next: boolean) {
    if (snapshot.capacityExceeded === next) {
      return;
    }
    snapshot = { ...snapshot, capacityExceeded: next };
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
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function getSnapshot() {
    return snapshot;
  }

  return {
    activate,
    discardRetainedDraft,
    getSnapshot,
    mutate,
    removeConfirmed,
    restoreRetainedDraft,
    retry,
    subscribe,
  };
}

export type DraftRuntime = ReturnType<typeof createDraftRuntime>;

export function visibleDraftSnapshot(
  snapshot: DraftRuntimeSnapshot,
  conversationIdentity: ConversationIdentity,
) {
  const state = snapshot.draftState
    ? visibleDraftLifecycleState(snapshot.draftState, conversationIdentity)
    : initialDraftLifecycleState(conversationIdentity);
  return {
    retainedDraft: retainedDraftState(snapshot),
    capacityExceeded:
      snapshot.draftState !== null &&
      sameConversationIdentity(snapshot.draftState.conversationIdentity, conversationIdentity) &&
      snapshot.capacityExceeded,
    draft: publicDraftState(state),
  };
}

function retainedDraftState(snapshot: DraftRuntimeSnapshot): RetainedDraftState | null {
  const first = snapshot.retainedDrafts.entries().next().value;
  if (!first) {
    return null;
  }
  const [sessionKey, retained] = first;
  return {
    conversationIdentity: { kind: "unidentified", sessionKey },
    count: retained.annotations.length,
    status: retained.status,
  };
}
