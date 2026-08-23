import { describe, expect, it } from "vitest";

import {
  formatDemoAnnotationCount,
  formatDemoRemovedNotice,
} from "../website/src/components/interactive-demo-copy";
import { compileDemoPrompt } from "../website/src/components/interactive-demo-prompt";
import {
  initialInteractiveDemoState,
  reduceInteractiveDemo,
  type DemoAnnotation,
  type InteractiveDemoAction,
} from "../website/src/components/interactive-demo-state";
import { getCopy, type DemoCopy } from "../website/src/i18n/content";

function annotation(id = 1, comment = ""): DemoAnnotation {
  return {
    anchor: { end: 15, quote: "selected", start: 7 },
    id,
    comment,
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

  it("commits pending removals when the remaining annotations are sent", () => {
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

    expect(restored).toBe(sent);
    expect(restored.annotations).toEqual([]);
    expect(restored.pendingRemovals).toEqual([]);
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
      "Please respond based on the following annotations:\n\n[Annotation 1]\nSelected text: selected\nMy comment: my note",
    );
  });
});

describe("interactive demo copy", () => {
  it("formats serialized annotation counts and removal grammar for each locale", () => {
    const zh = JSON.parse(JSON.stringify(getCopy("zh-CN").demo)) as DemoCopy;
    const ja = JSON.parse(JSON.stringify(getCopy("ja").demo)) as DemoCopy;
    const en = JSON.parse(JSON.stringify(getCopy("en").demo)) as DemoCopy;

    expect([formatDemoAnnotationCount(zh, 1), formatDemoRemovedNotice(zh, 2, 0)]).toEqual([
      "1 条批注",
      "已删除 2 条批注，还剩 0 条。",
    ]);
    expect([formatDemoAnnotationCount(ja, 1), formatDemoRemovedNotice(ja, 2, 0)]).toEqual([
      "1 件の注釈",
      "2 件の注釈を削除しました。残り 0 件です。",
    ]);
    expect([
      formatDemoAnnotationCount(en, 1),
      formatDemoAnnotationCount(en, 2),
      formatDemoRemovedNotice(en, 1, 1),
      formatDemoRemovedNotice(en, 2, 0),
    ]).toEqual([
      "1 annotation",
      "2 annotations",
      "Annotation removed. 1 remaining.",
      "2 annotations removed. 0 remaining.",
    ]);
  });
});
