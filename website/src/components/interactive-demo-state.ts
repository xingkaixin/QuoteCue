import type { Locale } from "../i18n/locales";

import { compileDemoPrompt } from "./interactive-demo-prompt";
import type { DemoTextAnchor } from "./interactive-demo-text-anchor";

export type DemoAnnotation = {
  anchor: DemoTextAnchor;
  id: number;
  comment: string;
};

type DemoEditorSession = {
  annotationId: number;
  comment: string;
  removeOnCancel: boolean;
};

export type DemoSendState = { kind: "idle" } | { kind: "sending"; prompt: string };

export type PendingDemoRemoval = {
  annotation: DemoAnnotation;
  index: number;
};

export type InteractiveDemoState = {
  annotations: DemoAnnotation[];
  clearArmed: boolean;
  editor: DemoEditorSession | null;
  pendingRemovals: readonly PendingDemoRemoval[];
  send: DemoSendState;
  sentPrompt: string;
  summaryOpen: boolean;
};

export type InteractiveDemoAction =
  | { type: "add-annotation"; annotation: DemoAnnotation }
  | { type: "open-editor"; annotationId: number }
  | { type: "change-editor-comment"; comment: string }
  | { type: "save-editor" }
  | { type: "cancel-editor" }
  | { type: "remove-annotation"; annotationId: number }
  | { type: "undo-removal" }
  | { type: "request-clear" }
  | { type: "expire-clear" }
  | { type: "expire-undo" }
  | { type: "start-send"; locale: Locale }
  | { type: "complete-send" }
  | { type: "set-summary-open"; isOpen: boolean };

export const initialInteractiveDemoState: InteractiveDemoState = {
  annotations: [],
  clearArmed: false,
  editor: null,
  pendingRemovals: [],
  send: { kind: "idle" },
  sentPrompt: "",
  summaryOpen: false,
};

export function reduceInteractiveDemo(
  state: InteractiveDemoState,
  action: InteractiveDemoAction,
): InteractiveDemoState {
  switch (action.type) {
    case "add-annotation": {
      if (state.send.kind === "sending") {
        return state;
      }
      const saved = saveEditor(state);
      return {
        ...saved,
        annotations: [...saved.annotations, action.annotation],
        clearArmed: false,
        editor: {
          annotationId: action.annotation.id,
          comment: "",
          removeOnCancel: true,
        },
        sentPrompt: "",
      };
    }
    case "open-editor": {
      if (state.send.kind === "sending" || state.editor?.annotationId === action.annotationId) {
        return state;
      }
      const annotation = state.annotations.find(({ id }) => id === action.annotationId);
      return annotation
        ? {
            ...saveEditor(state),
            editor: {
              annotationId: annotation.id,
              comment: annotation.comment,
              removeOnCancel: false,
            },
            summaryOpen: false,
          }
        : state;
    }
    case "change-editor-comment":
      return state.editor
        ? { ...state, editor: { ...state.editor, comment: action.comment } }
        : state;
    case "save-editor":
      return saveEditor(state);
    case "cancel-editor":
      return state.editor
        ? {
            ...state,
            annotations: state.editor.removeOnCancel
              ? state.annotations.filter(({ id }) => id !== state.editor?.annotationId)
              : state.annotations,
            editor: null,
          }
        : state;
    case "remove-annotation": {
      if (state.send.kind === "sending") {
        return state;
      }
      const index = state.annotations.findIndex(({ id }) => id === action.annotationId);
      if (index < 0) {
        return state;
      }
      const annotation = state.annotations[index];
      if (!annotation) {
        return state;
      }
      const annotations = state.annotations.filter(({ id }) => id !== action.annotationId);
      return {
        ...state,
        annotations,
        clearArmed: false,
        editor: state.editor?.annotationId === action.annotationId ? null : state.editor,
        pendingRemovals: [...state.pendingRemovals, { annotation, index }],
        summaryOpen: annotations.length > 0 && state.summaryOpen,
      };
    }
    case "undo-removal": {
      if (state.pendingRemovals.length === 0) {
        return state;
      }
      const annotations = [...state.annotations];
      for (const removal of state.pendingRemovals.toReversed()) {
        annotations.splice(removal.index, 0, removal.annotation);
      }
      return { ...state, annotations, pendingRemovals: [] };
    }
    case "request-clear":
      if (state.annotations.length === 0 || state.send.kind === "sending") {
        return state;
      }
      return state.clearArmed
        ? {
            ...state,
            annotations: [],
            clearArmed: false,
            editor: null,
            pendingRemovals: [],
            summaryOpen: false,
          }
        : { ...state, clearArmed: true };
    case "expire-clear":
      return state.clearArmed ? { ...state, clearArmed: false } : state;
    case "expire-undo":
      return state.pendingRemovals.length > 0 ? { ...state, pendingRemovals: [] } : state;
    case "start-send": {
      if (state.annotations.length === 0 || state.send.kind === "sending") {
        return state;
      }
      const saved = saveEditor(state);
      return {
        ...saved,
        pendingRemovals: [],
        send: { kind: "sending", prompt: compileDemoPrompt(saved.annotations, action.locale) },
        summaryOpen: false,
      };
    }
    case "complete-send":
      return state.send.kind === "sending"
        ? {
            ...state,
            annotations: [],
            clearArmed: false,
            editor: null,
            send: { kind: "idle" },
            sentPrompt: state.send.prompt,
            summaryOpen: false,
          }
        : state;
    case "set-summary-open":
      return state.send.kind === "sending" ? state : { ...state, summaryOpen: action.isOpen };
  }
}

function saveEditor(state: InteractiveDemoState): InteractiveDemoState {
  const editor = state.editor;
  if (!editor) {
    return state;
  }
  return {
    ...state,
    annotations: state.annotations.map((annotation) =>
      annotation.id === editor.annotationId
        ? { ...annotation, comment: editor.comment.trim() }
        : annotation,
    ),
    editor: null,
  };
}
