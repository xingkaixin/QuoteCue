import type { DraftAnnotation } from "./annotation";
import {
  sameConversationIdentity,
  type ConversationIdentity,
  type IdentifiedConversation,
} from "@/features/conversation/conversation-identity";

export type DraftLifecycleState =
  | { status: "loading"; conversationIdentity: ConversationIdentity }
  | {
      status: "ready";
      conversationIdentity: ConversationIdentity;
      annotations: DraftAnnotation[];
      hasUnreadableAnnotations: boolean;
    }
  | {
      status: "error";
      conversationIdentity: IdentifiedConversation;
      annotations: DraftAnnotation[];
      hasUnreadableAnnotations: boolean;
      operation: "load" | "save";
    };

type MutableDraftLifecycleState =
  | Extract<DraftLifecycleState, { status: "ready" }>
  | (Extract<DraftLifecycleState, { status: "error" }> & { operation: "save" });

export type DraftState =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly annotations: readonly DraftAnnotation[];
      readonly hasUnreadableAnnotations: boolean;
    }
  | {
      readonly status: "error";
      readonly annotations: readonly DraftAnnotation[];
      readonly hasUnreadableAnnotations: boolean;
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
      hasUnreadableAnnotations: boolean;
      hasFailedSave: boolean;
    }
  | {
      type: "load-failed";
      conversationIdentity: IdentifiedConversation;
    }
  | { type: "save-failed"; conversationIdentity: IdentifiedConversation }
  | {
      type: "save-succeeded";
      conversationIdentity: IdentifiedConversation;
      annotations: DraftAnnotation[];
      hasUnreadableAnnotations: boolean;
    }
  | {
      type: "mutated";
      conversationIdentity: ConversationIdentity;
      annotations: DraftAnnotation[];
    };

export function initialDraftLifecycleState(
  conversationIdentity: ConversationIdentity,
): DraftLifecycleState {
  return conversationIdentity.kind === "identified"
    ? { status: "loading", conversationIdentity }
    : { status: "ready", conversationIdentity, annotations: [], hasUnreadableAnnotations: false };
}

export function reduceDraftLifecycle(
  state: DraftLifecycleState,
  action: DraftLifecycleAction,
): DraftLifecycleState {
  switch (action.type) {
    case "load-started":
      return initialDraftLifecycleState(action.conversationIdentity);
    case "load-succeeded":
      return action.hasFailedSave
        ? {
            status: "error",
            conversationIdentity: action.conversationIdentity,
            annotations: action.annotations,
            hasUnreadableAnnotations: action.hasUnreadableAnnotations,
            operation: "save",
          }
        : {
            status: "ready",
            conversationIdentity: action.conversationIdentity,
            annotations: action.annotations,
            hasUnreadableAnnotations: action.hasUnreadableAnnotations,
          };
    case "load-failed":
      return {
        status: "error",
        conversationIdentity: action.conversationIdentity,
        annotations:
          state.status !== "loading" &&
          sameConversationIdentity(state.conversationIdentity, action.conversationIdentity)
            ? state.annotations
            : [],
        hasUnreadableAnnotations: false,
        operation: "load",
      };
    case "save-failed":
      return canMutateDraftLifecycle(state, action.conversationIdentity)
        ? {
            status: "error",
            conversationIdentity: action.conversationIdentity,
            annotations: state.annotations,
            hasUnreadableAnnotations: state.hasUnreadableAnnotations,
            operation: "save",
          }
        : state;
    case "save-succeeded":
      return canMutateDraftLifecycle(state, action.conversationIdentity)
        ? {
            status: "ready",
            conversationIdentity: state.conversationIdentity,
            annotations: action.annotations,
            hasUnreadableAnnotations: action.hasUnreadableAnnotations,
          }
        : state;
    case "mutated":
      return canMutateDraftLifecycle(state, action.conversationIdentity)
        ? { ...state, annotations: action.annotations }
        : state;
  }
}

export function canMutateDraft(draft: DraftState): draft is MutableDraftState {
  return (
    draft.status !== "loading" &&
    !draft.hasUnreadableAnnotations &&
    (draft.status === "ready" || (draft.status === "error" && draft.operation === "save"))
  );
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
      return {
        status: "ready",
        annotations: state.annotations,
        hasUnreadableAnnotations: state.hasUnreadableAnnotations,
      };
    case "error":
      return {
        status: "error",
        annotations: state.annotations,
        hasUnreadableAnnotations: state.hasUnreadableAnnotations,
        operation: state.operation,
      };
  }
}
