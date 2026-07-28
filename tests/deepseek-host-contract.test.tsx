import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import { SelectionPresentation } from "@/features/annotations/SelectionPresentation";
import { createDeepSeekHost } from "@/features/deepseek/deepseek-host";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";
import type { AnchoredSelection } from "@/features/annotations/annotation";

import {
  appendAssistantMessageItem,
  appendUserMessageItem,
  installDeepSeekHostFixture,
} from "./fixtures/deepseek-host";
import { HostTestProvider } from "./fixtures/host-provider";

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
    const capturedSelection =
      selection.status === "available" ? selection.value : missingSelection();

    const layout = host.layout.current();
    expect(layout.status).toBe("available");

    const annotation: DraftAnnotation = {
      id: "annotation-one",
      anchor: capturedSelection.anchor,
      comment: "Explain the tradeoff",
    };
    let annotations = [annotation];
    const onSendConfirmed = vi.fn(() => {
      annotations = [];
    });
    fixture.sendButton.addEventListener("click", () => {
      appendUserMessageItem("user-two", fixture.composer.value);
    });
    const interceptor = registerSendInterceptor({
      annotations: () => numberAnnotations(annotations),
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => "en",
      onSendConfirmed,
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-one"],
    });
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation]);
    expect(annotations).toEqual([]);

    interceptor.dispose();
  });

  it("sends annotations on an empty composer without a supplemental question", async () => {
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
    const onSendConfirmed = vi.fn();
    const interceptor = registerSendInterceptor({
      annotations: () =>
        numberAnnotations([
          { id: "annotation-one", anchor: emptyAnchor(), comment: "Explain the tradeoff" },
        ]),
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => "en",
      onSendConfirmed,
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-one"],
    });

    expect(onSendConfirmed).toHaveBeenCalledWith([
      expect.objectContaining({ id: "annotation-one" }),
    ]);
    expect(sentText).toContain("[Annotation 1]");
    expect(sentText).not.toContain("[Supplemental question]");
    interceptor.dispose();
  });

  it("does not read a streaming assistant response as a send confirmation candidate", async () => {
    const fixture = installDeepSeekHostFixture();
    const logger = vi.fn();
    const host = createDeepSeekHost({ document, logger, window });
    let assistantInnerTextReads = 0;
    fixture.sendButton.addEventListener("click", () => {
      const assistant = appendAssistantMessageItem("assistant-two", "streaming");
      Object.defineProperty(assistant, "innerText", {
        configurable: true,
        get: () => {
          assistantInnerTextReads += 1;
          return assistant.textContent ?? "";
        },
      });
      assistant.textContent = "streaming response";
    });
    const interceptor = registerSendInterceptor({
      annotations: () =>
        numberAnnotations([
          { id: "annotation-one", anchor: emptyAnchor(), comment: "Explain the tradeoff" },
        ]),
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => "en",
      onSendConfirmed: vi.fn(),
    });

    const result = interceptor.submit();
    await vi.waitFor(() =>
      expect(logger).toHaveBeenCalledWith(
        "[QuoteCue host] send confirmation observed: total=1, matched=false",
      ),
    );
    expect(assistantInnerTextReads).toBe(0);

    interceptor.dispose();
    await expect(result).resolves.toEqual({ status: "failed", reason: "disposed" });
  });

  it("renders the floating QuoteCue action for overlay hosts", async () => {
    const fixture = installDeepSeekHostFixture();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onActivate = vi.fn();
    const host = createDeepSeekHost({ document, window });

    await act(async () =>
      root.render(
        <HostTestProvider host={host}>
          <OverlayHarness onActivate={onActivate} />
        </HostTestProvider>,
      ),
    );
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

function OverlayHarness({ onActivate }: { onActivate: (selection: AnchoredSelection) => void }) {
  return (
    <SelectionPresentation
      conversationIdentity={{ kind: "identified", id: "conversation-a" }}
      isEnabled
      onActivate={onActivate}
    />
  );
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

function missingSelection(): never {
  throw new Error("Expected a captured selection");
}

function emptyAnchor() {
  return {
    end: 13,
    format: "exact" as const,
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
