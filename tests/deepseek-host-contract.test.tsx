import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { SelectionActionButton } from "@/features/annotations/SelectionActionButton";
import { useSelectionOverlay } from "@/features/annotations/use-selection-overlay";
import { createDeepSeekHost } from "@/features/deepseek/deepseek-host";
import { registerSendInterceptor } from "@/features/host/register-send-interceptor";
import type { SelectionDraft } from "@/features/annotations/annotation";

import { appendUserMessageItem, installDeepSeekHostFixture } from "./fixtures/deepseek-host";

vi.mock("@/features/host/active-host", async () => {
  const { createDeepSeekHost: createHost } = await import("@/features/deepseek/deepseek-host");
  const host = createHost({ document, window });
  return { activeHost: host, hostForHostname: () => host };
});

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
    },
  );
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DeepSeek host contract", () => {
  it("exposes the overlay selection action mode", () => {
    expect(createDeepSeekHost({ document, window }).selection.actionMode).toBe("overlay");
  });

  it("uses the DeepSeek conversation path for draft keys", () => {
    const host = createDeepSeekHost({ document, window });
    window.history.replaceState({}, "", "/a/chat/s/session-one");
    expect(host.conversation.key("new-chat:tab-a")).toBe("session-one");

    window.history.replaceState({}, "", "/");
    expect(host.conversation.key("new-chat:tab-a")).toBe("new-chat:tab-a");
  });

  it("anchors selections to the virtual list item key", () => {
    const fixture = installDeepSeekHostFixture();
    const host = createDeepSeekHost({ document, window });
    selectNodeContents(fixture.assistantContent.querySelector("strong")?.firstChild);

    const result = host.selection.capture();

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.value.anchor).toMatchObject({
        messageId: "assistant-one",
        quote: "focused answer",
      });
    }
  });

  it("restores table selections with rendered cell separators", () => {
    const fixture = installDeepSeekHostFixture();
    fixture.assistantContent.innerHTML =
      "<table><tbody><tr><td>alpha</td><td>beta</td></tr></tbody></table>";
    const cells = fixture.assistantContent.querySelectorAll("td");
    const start = cells.item(0).firstChild;
    const end = cells.item(1).firstChild;
    if (!start || !end) {
      throw new Error("Expected table cell text");
    }
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.textContent?.length ?? 0);
    const selectionTextSpy = selectRangeWithRenderedText(range, "alpha beta");
    const host = createDeepSeekHost({ document, window });

    const captured = host.selection.capture();
    selectionTextSpy.mockRestore();
    expect(captured.status).toBe("available");
    if (captured.status === "unavailable") {
      return;
    }

    expect(captured.value.anchor).toMatchObject({
      displayQuote: "alpha beta",
      messageId: "assistant-one",
      quote: "alphabeta",
    });
    expect(host.selection.restore(captured.value.anchor).status).toBe("available");
  });

  it("rejects selections inside collapsible think content", () => {
    const fixture = installDeepSeekHostFixture();
    const host = createDeepSeekHost({ document, window });
    selectNodeContents(fixture.thinkContent.firstChild);

    expect(host.selection.capture()).toEqual({
      reason: "assistant-message-unavailable",
      status: "unavailable",
    });
  });

  it("covers layout, annotated send confirmation, and composer restore", async () => {
    const fixture = installDeepSeekHostFixture();
    const host = createDeepSeekHost({ document, window });
    selectNodeContents(fixture.assistantContent.querySelector("strong")?.firstChild);
    const selection = host.selection.capture();
    const draft = selection.status === "available" ? selection.value : missingSelection();

    const layout = host.layout.current();
    expect(layout.status).toBe("available");
    if (layout.status === "available") {
      expect(layout.value.surface).toBe(fixture.surface);
      expect(layout.value.action).toBe(fixture.sendButton);
    }

    const annotation: DraftAnnotation = {
      id: "annotation-one",
      anchor: draft.anchor,
      comment: "Explain the tradeoff",
    };
    let annotations = [annotation];
    const onSendAccepted = vi.fn(() => {
      annotations = [];
    });
    fixture.sendButton.addEventListener("click", () => {
      appendUserMessageItem("user-two", fixture.composer.value);
    });
    const interceptor = registerSendInterceptor({
      annotations: () => annotations,
      host,
      locale: () => "en",
      onSendAccepted,
    });

    await expect(interceptor.submit(fixture.sendButton)).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-one"],
    });
    expect(onSendAccepted).toHaveBeenCalledWith([annotation]);
    expect(annotations).toEqual([]);

    interceptor.dispose();
  });

  it("treats the ds-button--disabled class as an unavailable send control", () => {
    const fixture = installDeepSeekHostFixture();
    const host = createDeepSeekHost({ document, window });
    const sendButton = fixture.sendButton;

    expect(host.composer.isButtonAvailable(sendButton)).toBe(true);
    fixture.sendButton.classList.add("ds-button--disabled");
    expect(host.composer.isButtonAvailable(sendButton)).toBe(false);
  });

  it("takes over a native send on an empty composer and fills in annotations", async () => {
    const fixture = installDeepSeekHostFixture();
    const host = createDeepSeekHost({ document, window });
    fixture.composer.value = "";
    fixture.sendButton.classList.add("ds-button--disabled");
    fixture.composer.addEventListener("input", () => {
      fixture.sendButton.classList.toggle(
        "ds-button--disabled",
        fixture.composer.value.trim().length === 0,
      );
    });
    let sentText = "";
    fixture.sendButton.addEventListener("click", () => {
      if (!fixture.sendButton.classList.contains("ds-button--disabled")) {
        sentText = fixture.composer.value;
        appendUserMessageItem("user-two", sentText);
      }
    });
    const onSendAccepted = vi.fn();
    const interceptor = registerSendInterceptor({
      annotations: () => [
        { id: "annotation-one", anchor: emptyAnchor(), comment: "Explain the tradeoff" },
      ],
      host,
      locale: () => "en",
      onSendAccepted,
    });

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fixture.sendButton.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    await vi.waitFor(() =>
      expect(onSendAccepted).toHaveBeenCalledWith([
        expect.objectContaining({ id: "annotation-one" }),
      ]),
    );
    expect(sentText).toContain("[Annotation 1]");
    expect(sentText).not.toContain("[Supplemental question]");
    interceptor.dispose();
  });

  it("renders the floating QuoteCue action for overlay hosts", async () => {
    const fixture = installDeepSeekHostFixture();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onActivate = vi.fn();

    await act(async () => root.render(<OverlayHarness onActivate={onActivate} />));
    selectNodeContents(fixture.assistantContent.querySelector("strong")?.firstChild);
    await act(async () => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextFrame();
    });

    const action = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add QuoteCue annotation"]',
    );
    expect(action).not.toBeNull();
    expect(action?.textContent).toContain("QuoteCue");

    await act(async () => action?.click());
    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate.mock.calls[0]?.[0].anchor.quote).toBe("focused answer");
    expect(container.querySelector("button")).toBeNull();

    await act(async () => root.unmount());
  });
});

function OverlayHarness({ onActivate }: { onActivate: (draft: SelectionDraft) => void }) {
  const action = useSelectionOverlay(true, "conversation-a", onActivate);
  return action ? <SelectionActionButton {...action} /> : null;
}

function selectNodeContents(node: ChildNode | null | undefined) {
  if (!node) {
    throw new Error("Expected a text node");
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  Object.defineProperty(range, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 260, height: 60, left: 100, right: 800, top: 200, width: 700 }),
  });
  Object.defineProperty(range, "getClientRects", {
    configurable: true,
    value: () => [new DOMRect(100, 200, 260, 20), new DOMRect(100, 240, 120, 20)],
  });
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

function selectRangeWithRenderedText(range: Range, renderedText: string) {
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("Expected a document selection");
  }
  selection.removeAllRanges();
  selection.addRange(range);
  return vi.spyOn(selection, "toString").mockReturnValue(renderedText);
}

function missingSelection(): never {
  throw new Error("Expected a captured selection");
}

function emptyAnchor() {
  return {
    end: 13,
    messageId: "assistant-one",
    prefix: "",
    quote: "selected text",
    start: 0,
    suffix: "",
  };
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
