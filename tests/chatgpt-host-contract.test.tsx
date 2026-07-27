import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";
import { useAnnotatedComposerLayout } from "@/features/host/use-annotated-composer-layout";
import { QUOTECUE_NATIVE_ACTION_SELECTOR } from "@/lib/dom-identity";

import {
  appendSelectionToolbar,
  appendUserMessage,
  installChatGptHostFixture,
} from "./fixtures/chatgpt-host";
import { requiredNativeAction } from "./fixtures/fixture-utils";
import { HostTestProvider } from "./fixtures/host-provider";

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
    const stop = requiredNativeAction(createChatGptHost({ document, window })).mount({
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
    await nextFrame();

    const action = actionRow.querySelector<HTMLButtonElement>(QUOTECUE_NATIVE_ACTION_SELECTOR);
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

  it("coalesces toolbar discovery and skips scans while its action is connected", async () => {
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");
    const getComputedStyle = vi.spyOn(window, "getComputedStyle");
    const stop = requiredNativeAction(createChatGptHost({ document, window })).mount({
      label: "Add QuoteCue annotation",
      onActivate: vi.fn(),
      rect: {
        bottom: 220,
        height: 20,
        left: 100,
        right: 360,
        top: 200,
        width: 260,
      },
    });
    getComputedStyle.mockClear();

    const { actionRow } = appendSelectionToolbar();
    await Promise.resolve();
    document.body.append(document.createElement("span"));
    await Promise.resolve();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();

    await new Promise<void>((resolve) => nativeRequestAnimationFrame(() => resolve()));
    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();

    await Promise.resolve();
    getComputedStyle.mockClear();
    document.body.append(document.createElement("span"));
    await Promise.resolve();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(getComputedStyle).not.toHaveBeenCalled();

    stop();
  });

  it("finds the native toolbar after block and inline position fallbacks", () => {
    const { actionRow } = appendSelectionToolbar(new DOMRect(768, 49, 196, 36));
    const stop = requiredNativeAction(createChatGptHost({ document, window })).mount({
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

    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();
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
    await act(async () =>
      root.render(
        <HostTestProvider host={host}>
          <LayoutProbe />
        </HostTestProvider>,
      ),
    );
    expect(container.textContent).toBe("112,708|456,748,36,36");

    let annotations = [annotation];
    const onSendConfirmed = vi.fn(() => {
      annotations = [];
    });
    fixture.action.addEventListener("click", () => {
      const sentText = fixture.composer.textContent ?? "";
      appendUserMessage("user-one", sentText);
    });
    const interceptor = registerSendInterceptor({
      annotations: () => numberAnnotations(annotations),
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => "en",
      onSendConfirmed,
    });

    await expect(interceptor.submit(fixture.action)).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-one"],
    });
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation]);
    expect(annotations).toEqual([]);

    interceptor.dispose();
    await act(async () => root.unmount());
    expect(fixture.surface.style.paddingTop).toBe("5px");
    expect(fixture.action.style.visibility).toBe("");
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
      end: 9,
      quote: "alphabeta",
      start: 0,
    });
    expect(host.selection.messageIndex().get(captured.value.anchor.messageId)).toBe(
      fixture.assistantMessage,
    );
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
    expect(host.selection.messageIndex().get(captured.value.anchor.messageId)).toBe(
      fixture.assistantMessage,
    );
  });

  it("classifies viewport and text changes for selection projections", async () => {
    const fixture = installChatGptHostFixture();
    const text = fixture.assistantMessage.querySelector("strong")?.firstChild;
    if (!text) {
      throw new Error("Expected assistant message text");
    }
    const onInvalidation = vi.fn();
    const stop = createChatGptHost({ document, window }).selection.observeInvalidation(
      onInvalidation,
    );

    window.dispatchEvent(new Event("resize"));
    expect(onInvalidation).toHaveBeenLastCalledWith({ reason: "layout" });

    onInvalidation.mockClear();
    text.textContent = "updated answer";
    await vi.waitFor(() =>
      expect(onInvalidation).toHaveBeenCalledWith({
        dirtyMessageIds: new Set(["assistant-one"]),
        reason: "content",
      }),
    );

    stop();
    onInvalidation.mockClear();
    text.textContent = "detached observer";
    await Promise.resolve();
    expect(onInvalidation).not.toHaveBeenCalled();
  });

  it("shares page observation until the final subscriber disconnects", () => {
    let constructionCount = 0;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor() {
          constructionCount += 1;
        }

        disconnect = disconnect;
        observe = observe;
      },
    );
    const host = createChatGptHost({ document, window });

    const stopLayoutObservation = host.layout.subscribe(vi.fn());
    const stopSelectionObservation = host.selection.observeInvalidation(vi.fn());
    const stopActionObservation = requiredNativeAction(host).mount({
      label: "Add QuoteCue annotation",
      onActivate: vi.fn(),
      rect: { bottom: 20, height: 10, left: 0, right: 20, top: 10, width: 20 },
    });

    expect(constructionCount).toBe(1);
    expect(observe).toHaveBeenCalledTimes(2);

    stopLayoutObservation();
    expect(disconnect).not.toHaveBeenCalled();

    stopSelectionObservation();
    expect(disconnect).toHaveBeenCalledOnce();

    stopActionObservation();
    expect(disconnect).toHaveBeenCalledTimes(2);
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
    const range = document.createRange();
    range.selectNodeContents(message);
    const host = createChatGptHost({ document, window });

    expect(host.selection.reveal(range)).toEqual({ status: "available", value: "scrolled" });
    expect(scrollContainer.scrollTop).toBe(660);

    endpointTop.value = 200;
    expect(host.selection.reveal(range)).toEqual({ status: "available", value: "visible" });
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
        format: "exact",
        messageId: "private-message",
        prefix: "private prefix",
        quote: "private selected text",
        start: 0,
        suffix: "private suffix",
      },
      comment: "private comment",
    };
    const interceptor = registerSendInterceptor({
      annotations: () => numberAnnotations([privateAnnotation]),
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => "en",
      onSendConfirmed: vi.fn(),
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

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
