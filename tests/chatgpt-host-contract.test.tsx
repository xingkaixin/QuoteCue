import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { registerSendInterceptor } from "@/features/host/register-send-interceptor";
import { useAnnotatedComposerLayout } from "@/features/host/use-annotated-composer-layout";

import {
  appendAssistantMessage,
  appendSelectionToolbar,
  appendUserMessage,
  installChatGptHostFixture,
} from "./fixtures/chatgpt-host";

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => false),
  });
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

describe("ChatGPT host contract", () => {
  it("mounts a delayed native-styled first action without localized text", async () => {
    const onActivate = vi.fn();
    const stop = createChatGptHost({ document, window }).selection.mountAction({
      label: "Add QuoteCue annotation",
      onActivate,
      rect: {
        bottom: 220,
        height: 20,
        left: 100,
        right: 360,
        top: 200,
        width: 260,
      },
    });
    const { actionRow, firstAction } = appendSelectionToolbar();
    await Promise.resolve();

    const action = actionRow.querySelector<HTMLButtonElement>("[data-quotecue-native-action]");
    expect(actionRow.firstElementChild).toBe(action);
    expect(action?.className).toBe(firstAction.className);
    expect(action?.textContent).toBe("QuoteCue");
    expect(action?.getAttribute("aria-label")).toBe("Add QuoteCue annotation");
    expect(action?.hasAttribute("aria-describedby")).toBe(false);

    action?.click();
    expect(onActivate).toHaveBeenCalledOnce();
    expect(action?.isConnected).toBe(false);
    stop();
  });

  it("finds the native toolbar after block and inline position fallbacks", () => {
    const { actionRow } = appendSelectionToolbar(new DOMRect(768, 49, 196, 36));
    const stop = createChatGptHost({ document, window }).selection.mountAction({
      label: "Add QuoteCue annotation",
      onActivate: vi.fn(),
      rect: {
        bottom: 88,
        height: 62,
        left: 436,
        right: 897,
        top: 26,
        width: 461,
      },
    });

    expect(actionRow.querySelector("[data-quotecue-native-action]")).not.toBeNull();
    stop();
  });

  it("covers selection, layout, annotated send confirmation, and cleanup", async () => {
    const fixture = installChatGptHostFixture();
    const host = createChatGptHost({ document, window });
    const selectedText = fixture.assistantMessage.querySelector("strong")?.firstChild;
    if (!selectedText) {
      throw new Error("Expected fixture selection text");
    }
    const range = document.createRange();
    range.selectNodeContents(selectedText);
    window.getSelection()?.addRange(range);

    const selection = host.selection.capture();
    expect(selection.status).toBe("available");
    const draft = selection.status === "available" ? selection.value : missingSelection();
    expect(draft.anchor).toMatchObject({
      messageId: "assistant-one",
      quote: "focused answer",
    });

    const annotation: DraftAnnotation = {
      id: "annotation-one",
      anchor: draft.anchor,
      comment: "Explain the tradeoff",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<LayoutProbe />));
    expect(container.textContent).toBe("112,708|456,748,36,36");

    let annotations = [annotation];
    const onSendAccepted = vi.fn(() => {
      annotations = [];
    });
    fixture.action.addEventListener("click", () => {
      const sentText = fixture.composer.textContent ?? "";
      appendUserMessage("user-one", sentText);
    });
    const interceptor = registerSendInterceptor({
      annotations: () => annotations,
      host,
      locale: () => "en",
      onSendAccepted,
    });

    await expect(interceptor.submit(fixture.action)).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-one"],
    });
    expect(onSendAccepted).toHaveBeenCalledWith([annotation]);
    expect(annotations).toEqual([]);

    interceptor.dispose();
    await act(async () => root.unmount());
    expect(fixture.surface.style.paddingTop).toBe("5px");
    expect(fixture.action.style.visibility).toBe("");
  });

  it("rejects selections spanning assistant messages", () => {
    const fixture = installChatGptHostFixture();
    const secondMessage = appendAssistantMessage("assistant-two", "A second answer");
    const firstText = fixture.assistantMessage.querySelector("strong")?.firstChild;
    const secondText = secondMessage.firstChild;
    if (!firstText || !secondText) {
      throw new Error("Expected fixture message text");
    }
    const range = document.createRange();
    range.setStart(firstText, 0);
    range.setEnd(secondText, 8);
    window.getSelection()?.addRange(range);

    const result = createChatGptHost({ document, window }).selection.capture();

    expect(result).toEqual({
      reason: "assistant-message-unavailable",
      status: "unavailable",
    });
  });

  it("restores table selections while preserving their rendered text", () => {
    const fixture = installChatGptHostFixture();
    fixture.assistantMessage.innerHTML =
      "<table><tbody><tr><td>alpha</td><td>beta</td></tr><tr><td>gamma</td><td>delta</td></tr></tbody></table>";
    const cells = fixture.assistantMessage.querySelectorAll("td");
    const start = cells.item(0).firstChild;
    const end = cells.item(3).firstChild;
    if (!start || !end) {
      throw new Error("Expected table cell text");
    }
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.textContent?.length ?? 0);
    const selectionTextSpy = selectRangeWithRenderedText(range, "alpha beta\ngamma delta");
    const logs: string[] = [];
    const host = createChatGptHost({
      document,
      logger: (message) => logs.push(message),
      window,
    });

    const captured = host.selection.capture();
    selectionTextSpy.mockRestore();
    expect(captured.status).toBe("available");
    if (captured.status === "unavailable") {
      return;
    }

    expect(captured.value.anchor).toMatchObject({
      displayQuote: "alpha beta\ngamma delta",
      quote: "alphabetagammadelta",
    });
    expect(host.selection.restore(captured.value.anchor).status).toBe("available");
    expect(logs).toEqual(["[QuoteCue host] selection text mismatch: rendered=22, dom=19"]);
  });

  it.each([
    ["paragraphs", "<p>alpha</p><p>beta</p>", "alpha\n\nbeta"],
    ["code blocks", "<p>alpha</p><pre><code>beta</code></pre>", "alpha\n\nbeta"],
  ])("restores selections spanning %s", (_name, html, renderedText) => {
    const fixture = installChatGptHostFixture();
    fixture.assistantMessage.innerHTML = html;
    const walker = document.createTreeWalker(fixture.assistantMessage, NodeFilter.SHOW_TEXT);
    const start = walker.nextNode();
    let end = start;
    let node = walker.nextNode();
    while (node) {
      end = node;
      node = walker.nextNode();
    }
    if (!start || !end) {
      throw new Error("Expected structured selection text");
    }
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.textContent?.length ?? 0);
    const selectionTextSpy = selectRangeWithRenderedText(range, renderedText);
    const host = createChatGptHost({ document, window });

    const captured = host.selection.capture();
    selectionTextSpy.mockRestore();
    expect(captured.status).toBe("available");
    if (captured.status === "unavailable") {
      return;
    }

    expect(captured.value.anchor).toMatchObject({
      displayQuote: renderedText,
      quote: "alphabeta",
    });
    expect(host.selection.restore(captured.value.anchor).status).toBe("available");
  });

  it("keeps exact offsets when rendered selection text is trimmed", () => {
    const fixture = installChatGptHostFixture();
    fixture.assistantMessage.innerHTML = "<p>  alpha  </p>";
    const text = fixture.assistantMessage.querySelector("p")?.firstChild;
    if (!text) {
      throw new Error("Expected selection text with surrounding whitespace");
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    const selectionTextSpy = selectRangeWithRenderedText(range, "  alpha  ");
    const host = createChatGptHost({ document, window });

    const captured = host.selection.capture();
    selectionTextSpy.mockRestore();
    expect(captured.status).toBe("available");
    if (captured.status === "unavailable") {
      return;
    }

    expect(captured.value.anchor).toMatchObject({
      displayQuote: "alpha",
      end: 9,
      quote: "  alpha  ",
      start: 0,
    });
    expect(host.selection.restore(captured.value.anchor).status).toBe("available");
  });

  it("centers an offscreen annotation endpoint in its nearest scroll container", () => {
    const endpointTop = { value: 900 };
    const rangeRectsDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [new DOMRect(100, endpointTop.value, 160, 20)],
    });
    const scrollContainer = document.createElement("div");
    scrollContainer.style.overflowY = "auto";
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_200 },
      getBoundingClientRect: {
        configurable: true,
        value: () => new DOMRect(0, 100, 800, 400),
      },
    });
    scrollContainer.scrollTop = 50;
    const message = document.createElement("article");
    message.dataset.messageAuthorRole = "assistant";
    message.dataset.messageId = "assistant-scroll";
    message.textContent = "target phrase";
    scrollContainer.append(message);
    document.body.append(scrollContainer);
    const anchor = {
      end: 13,
      messageId: "assistant-scroll",
      prefix: "",
      quote: "target phrase",
      start: 0,
      suffix: "",
    };
    const host = createChatGptHost({ document, window });

    expect(host.selection.reveal(anchor)).toEqual({ status: "available", value: "scrolled" });
    expect(scrollContainer.scrollTop).toBe(660);

    endpointTop.value = 200;
    expect(host.selection.reveal(anchor)).toEqual({ status: "available", value: "visible" });
    expect(scrollContainer.scrollTop).toBe(660);

    if (rangeRectsDescriptor) {
      Object.defineProperty(Range.prototype, "getClientRects", rangeRectsDescriptor);
    } else {
      Reflect.deleteProperty(Range.prototype, "getClientRects");
    }
  });

  it("reports typed host failures without annotation content", async () => {
    document.body.innerHTML = "<main></main>";
    const logs: string[] = [];
    const host = createChatGptHost({ document, logger: (message) => logs.push(message), window });
    const privateAnnotation: DraftAnnotation = {
      id: "private-annotation",
      anchor: {
        end: 20,
        messageId: "private-message",
        prefix: "private prefix",
        quote: "private selected text",
        start: 0,
        suffix: "private suffix",
      },
      comment: "private comment",
    };
    const interceptor = registerSendInterceptor({
      annotations: () => [privateAnnotation],
      host,
      locale: () => "en",
      onSendAccepted: vi.fn(),
    });

    await expect(interceptor.submit()).resolves.toEqual({
      reason: "composer-unavailable",
      status: "failed",
    });
    expect(logs).toEqual(["[QuoteCue host] unavailable: composer-unavailable"]);
    expect(logs.join(" ")).not.toContain("private");
    interceptor.dispose();
  });
});

function LayoutProbe() {
  const layout = useAnnotatedComposerLayout(true);
  return (
    <output>
      {layout
        ? `${layout.summary.left},${layout.summary.top}|${layout.send.left},${layout.send.top},${layout.send.width},${layout.send.height}`
        : "missing"}
    </output>
  );
}

function missingSelection(): never {
  throw new Error("Expected a captured selection");
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
