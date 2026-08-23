import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConversationIdentity } from "@/features/conversation/conversation-identity";
import { SelectionPresentation } from "@/features/annotations/SelectionPresentation";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import type { AnchoredSelection, Host } from "@/features/host-port/host-port";
import { QUOTECUE_HOST_ATTR, QUOTECUE_NATIVE_ACTION_SELECTOR } from "@/lib/dom-identity";

import { appendAssistantMessage, appendSelectionToolbar } from "./fixtures/chatgpt-host";
import { HostTestProvider } from "./fixtures/host-provider";

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("native selection presentation", () => {
  it("reports anchor validation failures without selection content", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const message = appendAssistantMessage("assistant-one", "private selection");
    message.removeAttribute("data-message-id");
    const { actionRow } = appendSelectionToolbar();
    const logs: string[] = [];
    const host = createChatGptHost({ document, logger: (entry) => logs.push(entry), window });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<SelectionHarness host={host} onActivate={vi.fn()} />));
    selectText(message.firstChild);
    await act(async () => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextFrame();
    });

    expect(logs).toEqual(["[QuoteCue host] unavailable: anchor-unavailable"]);
    expect(logs.join(" ")).not.toContain("private selection");
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).toBeNull();

    await act(async () => root.unmount());
  });

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

    const action = actionRow.querySelector<HTMLButtonElement>(QUOTECUE_NATIVE_ACTION_SELECTOR);
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
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Escape" }));
      await nextFrame();
    });
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));
      await nextFrame();
    });
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();
    await act(async () => window.dispatchEvent(new Event("scroll")));
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));
      await nextFrame();
    });
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).toBeNull();

    await act(async () => root.unmount());
  });

  it("dismisses the action when the conversation identity changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const message = appendAssistantMessage("assistant-one", "changing conversation");
    const { actionRow } = appendSelectionToolbar();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () =>
      root.render(
        <SelectionHarness
          conversationIdentity={{ kind: "identified", id: "conversation-a", siteId: "chatgpt" }}
          onActivate={vi.fn()}
        />,
      ),
    );
    selectText(message.firstChild);
    await act(async () => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextFrame();
    });
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();

    await act(async () =>
      root.render(
        <SelectionHarness
          conversationIdentity={{ kind: "identified", id: "conversation-b", siteId: "chatgpt" }}
          onActivate={vi.fn()}
        />,
      ),
    );
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).toBeNull();

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
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();

    const host = document.createElement("quotecue-ui");
    host.setAttribute(QUOTECUE_HOST_ATTR, "");
    const shadowRoot = host.attachShadow({ mode: "closed" });
    const internalButton = document.createElement("button");
    shadowRoot.append(internalButton);
    document.body.append(host);
    window.getSelection()?.removeAllRanges();
    await act(async () => {
      internalButton.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true }));
      await nextFrame();
    });
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();

    await act(async () => root.unmount());
  });
});

function SelectionHarness({
  conversationIdentity = { kind: "identified", id: "conversation-a", siteId: "chatgpt" },
  host = createChatGptHost({ document, window }),
  onActivate,
}: {
  conversationIdentity?: ConversationIdentity;
  host?: Host;
  onActivate: (selection: AnchoredSelection) => void;
}) {
  return (
    <HostTestProvider host={host}>
      <SelectionPresentation
        conversationIdentity={conversationIdentity}
        isEnabled
        onActivate={onActivate}
      />
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
