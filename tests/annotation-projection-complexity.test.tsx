import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { useAnnotationProjection } from "@/features/annotations/use-annotation-projection";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import type { Host } from "@/features/host-port/host-port";

import { appendAssistantMessage } from "./fixtures/chatgpt-host";
import { HostTestProvider } from "./fixtures/host-provider";

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
    const host = createChatGptHost({ document, window });
    const messageIndex = vi.spyOn(host.selection, "messageIndex");
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(shadowHost);
    const root = createRoot(container);

    await act(async () => root.render(<ProjectionHarness annotations={annotations} host={host} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(messageIndex).toHaveBeenCalledOnce();
    expect(messageTextReads).toBe(1);

    await act(async () => root.unmount());
  });

  it("updates a comment without restarting anchor projection", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    Object.defineProperties(Range.prototype, {
      getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
      getClientRects: { configurable: true, value: () => [] },
    });
    appendAssistantMessage("message-1", "selected text");
    const host = createChatGptHost({ document, window });
    const messageIndex = vi.spyOn(host.selection, "messageIndex");
    const observeInvalidation = vi.spyOn(host.selection, "observeInvalidation");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const initial = { ...annotation(0), comment: "initial comment" };

    await act(async () => root.render(<ProjectionHarness annotations={[initial]} host={host} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    messageIndex.mockClear();
    observeInvalidation.mockClear();

    await act(async () =>
      root.render(
        <ProjectionHarness
          annotations={[{ ...initial, anchor: { ...initial.anchor }, comment: "updated comment" }]}
          host={host}
        />,
      ),
    );
    await act(async () => vi.advanceTimersByTimeAsync(17));

    expect(container.textContent).toBe("updated comment");
    expect(observeInvalidation).not.toHaveBeenCalled();
    expect(messageIndex).not.toHaveBeenCalled();

    await act(async () =>
      root.render(
        <ProjectionHarness
          annotations={[
            {
              ...initial,
              anchor: { ...initial.anchor, end: 8, quote: "selected" },
              comment: "anchor updated",
            },
          ]}
          host={host}
        />,
      ),
    );
    await act(async () => vi.advanceTimersByTimeAsync(17));

    expect(container.textContent).toBe("anchor updated");
    expect(observeInvalidation).toHaveBeenCalledOnce();
    expect(messageIndex).toHaveBeenCalledOnce();
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
    const host = createChatGptHost({ document, window });
    const messageIndex = vi.spyOn(host.selection, "messageIndex");
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(shadowHost);
    const root = createRoot(container);

    await act(async () =>
      root.render(<ProjectionHarness annotations={[annotation(0)]} host={host} />),
    );
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

  it("reanchors only dirty-message annotations between full reconciliations", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    Object.defineProperties(Range.prototype, {
      getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
      getClientRects: { configurable: true, value: () => [] },
    });
    const messageA = appendAssistantMessage("message-a", "selected text A");
    const messageB = appendAssistantMessage("message-b", "selected text B");
    const textA = requiredTextNode(messageA);
    const textB = requiredTextNode(messageB);
    let messageATextReads = 0;
    let messageBTextReads = 0;
    Object.defineProperty(messageA, "textContent", {
      configurable: true,
      get: () => {
        messageATextReads += 1;
        return textA.data;
      },
    });
    Object.defineProperty(messageB, "textContent", {
      configurable: true,
      get: () => {
        messageBTextReads += 1;
        return textB.data;
      },
    });
    const host = createChatGptHost({ document, window });
    const messageIndex = vi.spyOn(host.selection, "messageIndex");
    const documentQuery = vi.spyOn(document, "querySelectorAll");
    const annotations = [
      annotationForMessage("annotation-a", "message-a", " A"),
      annotationForMessage("annotation-b", "message-b", " B"),
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<ProjectionHarness annotations={annotations} host={host} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    messageATextReads = 0;
    messageBTextReads = 0;
    messageIndex.mockClear();
    documentQuery.mockClear();

    textA.data = "selected text A updated";
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(17);
    });

    expect(messageATextReads).toBe(1);
    expect(messageBTextReads).toBe(0);
    expect(messageIndex).toHaveBeenCalledOnce();
    expect([...(messageIndex.mock.calls[0]?.[0] ?? [])]).toEqual(["message-a"]);
    expect(documentQuery).not.toHaveBeenCalled();

    messageATextReads = 0;
    messageBTextReads = 0;
    messageIndex.mockClear();
    documentQuery.mockClear();
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    textA.data = "selected text A reconciled";
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(17);
    });

    expect(messageATextReads).toBe(1);
    expect(messageBTextReads).toBe(1);
    expect(messageIndex).toHaveBeenCalledWith(undefined);
    expect(documentQuery).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});

function ProjectionHarness({ annotations, host }: { annotations: DraftAnnotation[]; host?: Host }) {
  return (
    <HostTestProvider host={host}>
      <Projection annotations={annotations} />
    </HostTestProvider>
  );
}

function Projection({ annotations }: { annotations: DraftAnnotation[] }) {
  const projectedAnnotations = useAnnotationProjection(annotations, null);
  return projectedAnnotations.map((entry) => entry.annotation.comment).join("|");
}

function annotation(index: number): DraftAnnotation {
  return {
    id: `annotation-${index}`,
    anchor: {
      format: "exact",
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

function annotationForMessage(id: string, messageId: string, suffix: string): DraftAnnotation {
  return {
    id,
    anchor: {
      end: 13,
      format: "exact",
      messageId,
      prefix: "",
      quote: "selected text",
      start: 0,
      suffix,
    },
    comment: "",
  };
}

function requiredTextNode(element: Element) {
  const node = element.firstChild;
  if (!(node instanceof Text)) {
    throw new Error("Expected message text node");
  }
  return node;
}
