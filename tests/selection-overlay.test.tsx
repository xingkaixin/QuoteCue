import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SelectionDraft } from "@/features/annotations/annotation";
import { useSelectionOverlay } from "@/features/annotations/use-selection-overlay";

import { appendAssistantMessage, appendSelectionToolbar } from "./fixtures/chatgpt-host";

const elementsFromPointDescriptor = Object.getOwnPropertyDescriptor(document, "elementsFromPoint");

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  if (elementsFromPointDescriptor) {
    Object.defineProperty(document, "elementsFromPoint", elementsFromPointDescriptor);
  } else {
    Reflect.deleteProperty(document, "elementsFromPoint");
  }
});

describe("selection overlay", () => {
  it("inserts the QuoteCue action first with native styling", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const message = appendAssistantMessage("assistant-one", "selected answer");
    const { actionRow, firstAction, toolbar } = appendSelectionToolbar();
    installToolbarHitTest(firstAction, actionRow, toolbar);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    const onActivate = vi.fn();
    await act(async () => root.render(<SelectionHarness onActivate={onActivate} />));
    selectText(message.firstChild);
    await act(async () => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextFrame();
    });

    const action = actionRow.querySelector<HTMLButtonElement>("[data-quotecue-native-action]");
    expect(actionRow.firstElementChild).toBe(action);
    expect(action?.className).toBe(firstAction.className);
    expect(action?.textContent).toBe("QuoteCue");
    expect(action?.getAttribute("aria-label")).toBe("Add QuoteCue annotation");

    await act(async () => action?.click());
    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate.mock.calls[0]?.[0].anchor.quote).toBe("selected answer");

    await act(async () => root.unmount());
  });

  it("supports keyboard selection and dismisses on Escape or viewport changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const message = appendAssistantMessage("assistant-one", "keyboard selection");
    const { actionRow, firstAction, toolbar } = appendSelectionToolbar();
    installToolbarHitTest(firstAction, actionRow, toolbar);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<SelectionHarness onActivate={vi.fn()} />));
    selectText(message.firstChild);
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight", shiftKey: true }),
      );
      await nextFrame();
    });
    expect(actionRow.querySelector("[data-quotecue-native-action]")).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(actionRow.querySelector("[data-quotecue-native-action]")).toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));
      await nextFrame();
    });
    expect(actionRow.querySelector("[data-quotecue-native-action]")).not.toBeNull();
    await act(async () => window.dispatchEvent(new Event("scroll")));
    expect(actionRow.querySelector("[data-quotecue-native-action]")).toBeNull();

    await act(async () => root.unmount());
  });

  it("ignores events retargeted from the closed QuoteCue shadow", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const message = appendAssistantMessage("assistant-one", "private selection");
    const { actionRow, firstAction, toolbar } = appendSelectionToolbar();
    installToolbarHitTest(firstAction, actionRow, toolbar);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<SelectionHarness onActivate={vi.fn()} />));
    selectText(message.firstChild);
    await act(async () => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextFrame();
    });
    expect(actionRow.querySelector("[data-quotecue-native-action]")).not.toBeNull();

    const host = document.createElement("quotecue-ui");
    host.setAttribute("data-quotecue-host", "");
    const shadowRoot = host.attachShadow({ mode: "closed" });
    const internalButton = document.createElement("button");
    shadowRoot.append(internalButton);
    document.body.append(host);
    window.getSelection()?.removeAllRanges();
    await act(async () => {
      internalButton.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true }));
      await nextFrame();
    });
    expect(actionRow.querySelector("[data-quotecue-native-action]")).not.toBeNull();

    await act(async () => root.unmount());
  });
});

function SelectionHarness({ onActivate }: { onActivate: (draft: SelectionDraft) => void }) {
  useSelectionOverlay(true, "conversation-a", onActivate);
  return null;
}

function selectText(node: ChildNode | null) {
  if (!node) {
    throw new Error("Expected a text node");
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  Object.defineProperty(range, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 220,
      height: 20,
      left: 100,
      right: 360,
      top: 200,
      width: 260,
    }),
  });
  window.getSelection()?.addRange(range);
}

function installToolbarHitTest(...elements: Element[]) {
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => elements,
  });
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
