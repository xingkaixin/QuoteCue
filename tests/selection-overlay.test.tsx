import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SelectionDraft } from "@/features/annotations/annotation";
import { SelectionPresentation } from "@/features/annotations/SelectionPresentation";

import { appendAssistantMessage, appendSelectionToolbar } from "./fixtures/chatgpt-host";
import { HostTestProvider } from "./fixtures/host-provider";

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("selection overlay", () => {
  it("inserts the QuoteCue action first with native styling", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const message = appendAssistantMessage("assistant-one", "selected answer");
    const { actionRow, firstAction } = appendSelectionToolbar();
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
    expect(onActivate.mock.calls[0]?.[0].rect.top).toBe(240);

    await act(async () => root.unmount());
  });

  it("supports keyboard selection and dismisses on Escape or viewport changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const message = appendAssistantMessage("assistant-one", "keyboard selection");
    const { actionRow } = appendSelectionToolbar();
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
    const { actionRow } = appendSelectionToolbar();
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
  return (
    <HostTestProvider>
      <SelectionPresentation isEnabled onActivate={onActivate} resetKey="conversation-a" />
    </HostTestProvider>
  );
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
      bottom: 260,
      height: 60,
      left: 100,
      right: 800,
      top: 200,
      width: 700,
    }),
  });
  Object.defineProperty(range, "getClientRects", {
    configurable: true,
    value: () => [
      new DOMRect(100, 200, 260, 20),
      new DOMRect(100, 220, 260, 20),
      new DOMRect(100, 240, 120, 20),
    ],
  });
  window.getSelection()?.addRange(range);
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
