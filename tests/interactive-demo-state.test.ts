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
      clearArmed: false,
      editor: null,
      pendingRemovals: [],
      send: { kind: "idle" },
      sentPrompt: prompt,
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
    expect(state.pendingRemovals).toEqual([]);
  });

  it("keeps a pending removal undoable while clear confirmation is armed", () => {
    const first = annotation(1);
    const second = annotation(2);
    const clearArmed = reduce([
      { type: "add-annotation", annotation: first },
      { type: "save-editor" },
      { type: "add-annotation", annotation: second },
      { type: "save-editor" },
      { type: "remove-annotation", annotationId: first.id },
      { type: "request-clear" },
    ]);
    const restored = reduceInteractiveDemo(clearArmed, { type: "undo-removal" });

    expect(restored.annotations).toEqual([first, second]);
    expect(restored.clearArmed).toBe(true);
  });

  it("keeps a pending removal undoable after the remaining annotations are sent", () => {
    const first = annotation(1);
    const second = annotation(2);
    const sent = reduce([
      { type: "add-annotation", annotation: first },
      { type: "save-editor" },
      { type: "add-annotation", annotation: second },
      { type: "save-editor" },
      { type: "remove-annotation", annotationId: first.id },
      { type: "start-send", prompt: "compiled prompt" },
      { type: "complete-send" },
    ]);
    const restored = reduceInteractiveDemo(sent, { type: "undo-removal" });

    expect(restored.annotations).toEqual([first]);
    expect(restored.sentPrompt).toBe("compiled prompt");
  });

  it("restores consecutive removals in their original order", () => {
    const first = annotation(1);
    const second = annotation(2);
    const third = annotation(3);
    const state = reduce([
      { type: "add-annotation", annotation: first },
      { type: "save-editor" },
      { type: "add-annotation", annotation: second },
      { type: "save-editor" },
      { type: "add-annotation", annotation: third },
      { type: "save-editor" },
      { type: "remove-annotation", annotationId: first.id },
      { type: "remove-annotation", annotationId: second.id },
      { type: "undo-removal" },
    ]);

    expect(state.annotations).toEqual([first, second, third]);
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
    expect(state.send).toEqual({ kind: "sending", prompt });
    expect(state.summaryOpen).toBe(false);
  });

  it("owns the two-step clear transition", () => {
    const armed = reduce([
      { type: "add-annotation", annotation: annotation() },
      { type: "save-editor" },
      { type: "request-clear" },
    ]);
    const cleared = reduceInteractiveDemo(armed, { type: "request-clear" });

    expect(armed.clearArmed).toBe(true);
    expect(cleared.annotations).toEqual([]);
    expect(cleared.clearArmed).toBe(false);
  });
});

describe("interactive demo prompt", () => {
  it("uses the same compiled format as the extension", () => {
    expect(compileDemoPrompt([annotation(1, "my note")], getCopy("en").demo)).toBe(
      "Please respond based on the following annotations:\n\n[Annotation 1]\nSelected text: selected answer\nMy comment: my note",
    );
  });
});
