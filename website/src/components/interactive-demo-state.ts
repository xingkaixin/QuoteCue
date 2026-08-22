export type DemoAnnotation = {
  id: number;
  text: string;
  comment: string;
  range: Range;
};

type DemoEditorSession = {
  annotationId: number;
  comment: string;
  removeOnCancel: boolean;
};

export type DemoStatus =
  | { kind: "idle" }
  | { kind: "clear-armed" }
  | { kind: "sending"; prompt: string }
  | { kind: "undo"; annotation: DemoAnnotation; index: number };

export type InteractiveDemoState = {
  annotations: DemoAnnotation[];
  editor: DemoEditorSession | null;
  sentPrompt: string;
  status: DemoStatus;
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
  | { type: "start-send"; prompt: string }
  | { type: "complete-send" }
  | { type: "set-summary-open"; isOpen: boolean };

export const initialInteractiveDemoState: InteractiveDemoState = {
  annotations: [],
  editor: null,
  sentPrompt: "",
  status: { kind: "idle" },
  summaryOpen: false,
};

export function reduceInteractiveDemo(
  state: InteractiveDemoState,
  action: InteractiveDemoAction,
): InteractiveDemoState {
  switch (action.type) {
    case "add-annotation":
      return state.status.kind === "sending"
        ? state
        : {
            ...state,
            annotations: [...state.annotations, action.annotation],
            editor: {
              annotationId: action.annotation.id,
              comment: "",
              removeOnCancel: true,
            },
            sentPrompt: "",
            status: { kind: "idle" },
          };
    case "open-editor": {
      if (state.status.kind === "sending") {
        return state;
      }
      const annotation = state.annotations.find(({ id }) => id === action.annotationId);
      return annotation
        ? {
            ...state,
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
      return state.editor
        ? {
            ...state,
            annotations: state.annotations.map((annotation) =>
              annotation.id === state.editor?.annotationId
                ? { ...annotation, comment: state.editor.comment.trim() }
                : annotation,
            ),
            editor: null,
          }
        : state;
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
      if (state.status.kind === "sending") {
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
        editor: null,
        status: { kind: "undo", annotation, index },
        summaryOpen: annotations.length > 0 && state.summaryOpen,
      };
    }
    case "undo-removal": {
      if (state.status.kind !== "undo") {
        return state;
      }
      const annotations = [...state.annotations];
      annotations.splice(state.status.index, 0, state.status.annotation);
      return { ...state, annotations, status: { kind: "idle" } };
    }
    case "request-clear":
      if (state.annotations.length === 0 || state.status.kind === "sending") {
        return state;
      }
      return state.status.kind === "clear-armed"
        ? {
            ...state,
            annotations: [],
            editor: null,
            status: { kind: "idle" },
            summaryOpen: false,
          }
        : { ...state, status: { kind: "clear-armed" } };
    case "expire-clear":
      return state.status.kind === "clear-armed" ? { ...state, status: { kind: "idle" } } : state;
    case "expire-undo":
      return state.status.kind === "undo" ? { ...state, status: { kind: "idle" } } : state;
    case "start-send":
      return state.annotations.length > 0 && state.status.kind !== "sending"
        ? {
            ...state,
            editor: null,
            status: { kind: "sending", prompt: action.prompt },
            summaryOpen: false,
          }
        : state;
    case "complete-send":
      return state.status.kind === "sending"
        ? {
            ...state,
            annotations: [],
            editor: null,
            sentPrompt: state.status.prompt,
            status: { kind: "idle" },
            summaryOpen: false,
          }
        : state;
    case "set-summary-open":
      return state.status.kind === "sending" ? state : { ...state, summaryOpen: action.isOpen };
  }
}
