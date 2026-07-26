import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { useAnnotationHighlights } from "@/features/annotations/use-annotation-highlights";
import { chatGptHost } from "@/features/chatgpt/chatgpt-host";

import { appendAssistantMessage } from "./fixtures/chatgpt-host";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("annotation projection complexity", () => {
  it("collects assistant messages once for a 20-annotation projection", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    Object.defineProperties(Range.prototype, {
      getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
      getClientRects: { configurable: true, value: () => [] },
    });
    const message = appendAssistantMessage("message-1", "selected text");
    let messageTextReads = 0;
    Object.defineProperty(message, "textContent", {
      configurable: true,
      get: () => {
        messageTextReads += 1;
        return "selected text";
      },
    });
    const annotations = Array.from({ length: 20 }, (_, index) => annotation(index));
    const messageIndex = vi.spyOn(chatGptHost.selection, "messageIndex");
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(host);
    const root = createRoot(container);

    await act(async () => root.render(<ProjectionHarness annotations={annotations} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(messageIndex).toHaveBeenCalledOnce();
    expect(messageTextReads).toBe(1);

    await act(async () => root.unmount());
  });

  it("does not observe the page when annotations are empty", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<ProjectionHarness annotations={[]} />));

    expect(observe).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("coalesces synchronous DOM mutations into one projection frame", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    Object.defineProperties(Range.prototype, {
      getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
      getClientRects: { configurable: true, value: () => [] },
    });
    const message = appendAssistantMessage("message-1", "selected text");
    const messageIndex = vi.spyOn(chatGptHost.selection, "messageIndex");
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(host);
    const root = createRoot(container);

    await act(async () => root.render(<ProjectionHarness annotations={[annotation(0)]} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    messageIndex.mockClear();
    await act(async () => {
      for (let index = 0; index < 100; index += 1) {
        message.append(document.createElement("span"));
      }
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(17);
    });

    expect(messageIndex).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});

function ProjectionHarness({ annotations }: { annotations: DraftAnnotation[] }) {
  useAnnotationHighlights(annotations, null);
  return null;
}

function annotation(index: number): DraftAnnotation {
  return {
    id: `annotation-${index}`,
    anchor: {
      messageId: "message-1",
      quote: "selected text",
      prefix: "",
      suffix: "",
      start: 0,
      end: 13,
    },
    comment: "",
  };
}
