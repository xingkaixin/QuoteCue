import { describe, expect, it } from "vitest";

import { compileDemoPrompt } from "../website/src/components/interactive-demo-prompt";
import {
  initialInteractiveDemoState,
  reduceInteractiveDemo,
  type DemoAnnotation,
  type InteractiveDemoAction,
} from "../website/src/components/interactive-demo-state";
import { getCopy } from "../website/src/i18n/content";

function annotation(id = 1, comment = ""): DemoAnnotation {
  return {
    id,
    text: "selected answer",
    comment,
    range: document.createRange(),
  };
}

function reduce(actions: InteractiveDemoAction[]) {
  return actions.reduce(reduceInteractiveDemo, initialInteractiveDemoState);
}

describe("interactive demo state", () => {
  it("replaces clear confirmation with send progress and returns to idle", () => {
    const prompt = "compiled prompt";
    const state = reduce([
      { type: "add-annotation", annotation: annotation() },
      { type: "save-editor" },
      { type: "request-clear" },
      { type: "start-send", prompt },
      { type: "complete-send" },
    ]);

    expect(state).toMatchObject({
      annotations: [],
      editor: null,
      sentPrompt: prompt,
      status: { kind: "idle" },
      summaryOpen: false,
    });
  });

  it("preserves an existing empty annotation when editing is cancelled", () => {
    const item = annotation();
    const state = reduce([
      { type: "add-annotation", annotation: item },
      { type: "save-editor" },
      { type: "open-editor", annotationId: item.id },
      { type: "cancel-editor" },
    ]);

    expect(state.annotations).toEqual([item]);
  });

  it("removes a new annotation when its first edit is cancelled", () => {
    const state = reduce([
      { type: "add-annotation", annotation: annotation() },
      { type: "cancel-editor" },
    ]);

    expect(state.annotations).toEqual([]);
  });

  it("restores a removed annotation at its original position", () => {
    const first = annotation(1);
    const second = annotation(2);
    const state = reduce([
      { type: "add-annotation", annotation: first },
      { type: "save-editor" },
      { type: "add-annotation", annotation: second },
      { type: "save-editor" },
      { type: "remove-annotation", annotationId: first.id },
      { type: "undo-removal" },
    ]);

    expect(state.annotations).toEqual([first, second]);
    expect(state.status).toEqual({ kind: "idle" });
  });

  it("keeps sending authoritative until it completes", () => {
    const prompt = "compiled prompt";
    const state = reduce([
      { type: "add-annotation", annotation: annotation() },
      { type: "save-editor" },
      { type: "start-send", prompt },
      { type: "request-clear" },
      { type: "add-annotation", annotation: annotation(2) },
      { type: "remove-annotation", annotationId: 1 },
      { type: "set-summary-open", isOpen: true },
    ]);

    expect(state.annotations).toHaveLength(1);
    expect(state.status).toEqual({ kind: "sending", prompt });
    expect(state.summaryOpen).toBe(false);
  });

  it("owns the two-step clear transition", () => {
    const armed = reduce([
      { type: "add-annotation", annotation: annotation() },
      { type: "save-editor" },
      { type: "request-clear" },
    ]);
    const cleared = reduceInteractiveDemo(armed, { type: "request-clear" });

    expect(armed.status).toEqual({ kind: "clear-armed" });
    expect(cleared.annotations).toEqual([]);
    expect(cleared.status).toEqual({ kind: "idle" });
  });
});

describe("interactive demo prompt", () => {
  it("uses the same compiled format as the extension", () => {
    expect(compileDemoPrompt([annotation(1, "my note")], getCopy("en").demo)).toBe(
      "Please respond based on the following annotations:\n\n[Annotation 1]\nSelected text: selected answer\nMy comment: my note",
    );
  });
});
