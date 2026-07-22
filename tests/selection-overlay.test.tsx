import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelectionAction } from "@/features/annotations/SelectionAction";
import type { SelectionDraft } from "@/features/annotations/annotation";
import { useSelectionOverlay } from "@/features/annotations/use-selection-overlay";

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("selection overlay", () => {
  it("renders its own action without a localized native action", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const message = document.createElement("div");
    message.dataset.messageAuthorRole = "assistant";
    message.dataset.messageId = "assistant-one";
    message.textContent = "selected answer";
    const container = document.createElement("div");
    document.body.append(message, container);
    const root = createRoot(container);

    const onActivate = vi.fn();
    await act(async () => root.render(<SelectionHarness onActivate={onActivate} />));
    selectText(message.firstChild);
    await act(async () => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextFrame();
    });

    const action = container.querySelector<HTMLButtonElement>(
      '[aria-label="Add QuoteCue annotation"]',
    );
    expect(action?.textContent).toContain("QuoteCue");
    expect(document.querySelector("[data-quotecue-native-action]")).toBeNull();

    await act(async () => action?.click());
    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate.mock.calls[0]?.[0].anchor.quote).toBe("selected answer");

    await act(async () => root.unmount());
  });

  it("supports keyboard selection and dismisses on Escape or viewport changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const message = document.createElement("div");
    message.dataset.messageAuthorRole = "assistant";
    message.dataset.messageId = "assistant-one";
    message.textContent = "keyboard selection";
    const container = document.createElement("div");
    document.body.append(message, container);
    const root = createRoot(container);

    await act(async () => root.render(<SelectionHarness onActivate={vi.fn()} />));
    selectText(message.firstChild);
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight", shiftKey: true }),
      );
      await nextFrame();
    });
    expect(container.querySelector('[aria-label="Add QuoteCue annotation"]')).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(container.querySelector('[aria-label="Add QuoteCue annotation"]')).toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));
      await nextFrame();
    });
    expect(container.querySelector('[aria-label="Add QuoteCue annotation"]')).not.toBeNull();
    await act(async () => window.dispatchEvent(new Event("scroll")));
    expect(container.querySelector('[aria-label="Add QuoteCue annotation"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("ignores events retargeted from the closed QuoteCue shadow", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const message = document.createElement("div");
    message.dataset.messageAuthorRole = "assistant";
    message.dataset.messageId = "assistant-one";
    message.textContent = "private selection";
    const container = document.createElement("div");
    document.body.append(message, container);
    const root = createRoot(container);

    await act(async () => root.render(<SelectionHarness onActivate={vi.fn()} />));
    selectText(message.firstChild);
    await act(async () => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextFrame();
    });
    expect(container.querySelector('[aria-label="Add QuoteCue annotation"]')).not.toBeNull();

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
    expect(container.querySelector('[aria-label="Add QuoteCue annotation"]')).not.toBeNull();

    await act(async () => root.unmount());
  });
});

function SelectionHarness({ onActivate }: { onActivate: (draft: SelectionDraft) => void }) {
  const { dismissSelectionAction, selectionAction } = useSelectionOverlay(true, "conversation-a");
  return selectionAction.status === "action" ? (
    <div data-quotecue-root="">
      <SelectionAction
        draft={selectionAction.draft}
        onActivate={() => {
          onActivate(selectionAction.draft);
          dismissSelectionAction();
        }}
        onDismiss={dismissSelectionAction}
      />
    </div>
  ) : null;
}

function selectText(node: ChildNode | null) {
  if (!node) {
    throw new Error("Expected a text node");
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  window.getSelection()?.addRange(range);
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
