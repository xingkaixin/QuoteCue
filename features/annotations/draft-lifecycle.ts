import type { ConversationIdentity, IdentifiedConversation } from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";
import { sameConversationIdentity } from "./conversation-identity";

export type DraftLifecycleState =
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
      operation: "load" | "save";
    };

type MutableDraftLifecycleState =
  | Extract<DraftLifecycleState, { status: "ready" }>
  | (Extract<DraftLifecycleState, { status: "error" }> & { operation: "save" });

export type DraftState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly annotations: readonly DraftAnnotation[] }
  | {
      readonly status: "error";
      readonly annotations: readonly DraftAnnotation[];
      readonly operation: "load" | "save";
    };

type MutableDraftState =
  | Extract<DraftState, { status: "ready" }>
  | (Extract<DraftState, { status: "error" }> & { operation: "save" });

export type DraftLifecycleAction =
  | { type: "load-started"; conversationIdentity: ConversationIdentity }
  | {
      type: "load-succeeded";
      conversationIdentity: IdentifiedConversation;
      annotations: DraftAnnotation[];
      hasFailedSave: boolean;
    }
  | {
      type: "load-failed";
      conversationIdentity: IdentifiedConversation;
      annotations: DraftAnnotation[];
    }
  | { type: "save-failed"; conversationIdentity: IdentifiedConversation }
  | {
      type: "save-succeeded";
      conversationIdentity: IdentifiedConversation;
      annotations: DraftAnnotation[];
    }
  | {
      type: "mutated";
      conversationIdentity: ConversationIdentity;
      annotations: DraftAnnotation[];
    };

export function initialDraftLifecycleState(
  conversationIdentity: ConversationIdentity,
): DraftLifecycleState {
  return loadStartedState(conversationIdentity);
}

export function reduceDraftLifecycle(
  state: DraftLifecycleState,
  action: DraftLifecycleAction,
): DraftLifecycleState {
  switch (action.type) {
    case "load-started":
      return loadStartedState(action.conversationIdentity);
    case "load-succeeded":
      return action.hasFailedSave
        ? {
            status: "error",
            conversationIdentity: action.conversationIdentity,
            annotations: action.annotations,
            operation: "save",
          }
        : {
            status: "ready",
            conversationIdentity: action.conversationIdentity,
            annotations: action.annotations,
          };
    case "load-failed":
      return {
        status: "error",
        conversationIdentity: action.conversationIdentity,
        annotations: action.annotations,
        operation: "load",
      };
    case "save-failed":
      return canMutateDraftLifecycle(state, action.conversationIdentity)
        ? {
            status: "error",
            conversationIdentity: action.conversationIdentity,
            annotations: state.annotations,
            operation: "save",
          }
        : state;
    case "save-succeeded":
      return canMutateDraftLifecycle(state, action.conversationIdentity)
        ? {
            status: "ready",
            conversationIdentity: state.conversationIdentity,
            annotations: action.annotations,
          }
        : state;
    case "mutated":
      return canMutateDraftLifecycle(state, action.conversationIdentity)
        ? { ...state, annotations: action.annotations }
        : state;
  }
}

export function canMutateDraft(draft: DraftState): draft is MutableDraftState {
  return draft.status === "ready" || (draft.status === "error" && draft.operation === "save");
}

export function canMutateDraftLifecycle(
  state: DraftLifecycleState,
  conversationIdentity: ConversationIdentity,
): state is MutableDraftLifecycleState {
  return (
    sameConversationIdentity(state.conversationIdentity, conversationIdentity) &&
    (state.status === "ready" || (state.status === "error" && state.operation === "save"))
  );
}

export function visibleDraftLifecycleState(
  state: DraftLifecycleState,
  conversationIdentity: ConversationIdentity,
) {
  return sameConversationIdentity(state.conversationIdentity, conversationIdentity)
    ? state
    : ({ status: "loading", conversationIdentity } satisfies DraftLifecycleState);
}

export function publicDraftState(state: DraftLifecycleState): DraftState {
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

export function draftAnnotationsToAdopt(
  state: DraftLifecycleState,
  nextIdentity: ConversationIdentity,
) {
  if (nextIdentity.kind !== "identified" || state.status === "loading") {
    return [];
  }
  if (state.conversationIdentity.kind === "unidentified") {
    return state.annotations;
  }
  return state.status === "error" &&
    state.operation === "load" &&
    sameConversationIdentity(state.conversationIdentity, nextIdentity)
    ? state.annotations
    : [];
}

function loadStartedState(conversationIdentity: ConversationIdentity): DraftLifecycleState {
  return conversationIdentity.kind === "identified"
    ? { status: "loading", conversationIdentity }
    : { status: "ready", conversationIdentity, annotations: [] };
}
