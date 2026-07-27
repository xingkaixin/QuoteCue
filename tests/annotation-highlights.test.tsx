import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { useAnnotationProjection } from "@/features/annotations/use-annotation-projection";

import { createFakeHost, type FakeHost } from "./fixtures/fake-host";
import { HostTestProvider } from "./fixtures/host-provider";

const geometry = vi.hoisted(() => ({
  top: 200,
}));
let renderCount = 0;
const rangeRectsDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");

const annotation: DraftAnnotation = {
  id: "annotation-1",
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
const annotationList = [annotation];

afterEach(() => {
  geometry.top = 200;
  renderCount = 0;
  Reflect.deleteProperty(document, "elementsFromPoint");
  if (rangeRectsDescriptor) {
    Object.defineProperty(Range.prototype, "getClientRects", rangeRectsDescriptor);
  } else {
    Reflect.deleteProperty(Range.prototype, "getClientRects");
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("annotation badge scrolling", () => {
  it("updates the badge on the next animation frame during scrolling", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const projectionHost = createProjectionHost();
    const messageIndex = vi.spyOn(projectionHost.selection, "messageIndex");
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(shadowHost);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness host={projectionHost} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(container.querySelector("output")?.dataset.top).toBe("190");
    expect(container.querySelector("output")?.dataset.ordinal).toBe("1");

    geometry.top = 100;
    messageIndex.mockClear();
    projectionHost.controls.emitSelectionInvalidation({ reason: "layout" });
    await act(async () => vi.advanceTimersByTimeAsync(17));

    expect(container.querySelector("output")?.dataset.top).toBe("90");
    expect(messageIndex).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("reports unresolved annotations without positioning a badge", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const projectionHost = createProjectionHost(false);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness host={projectionHost} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));

    const output = container.querySelector("output");
    expect(output?.dataset.top).toBeUndefined();
    expect(output?.dataset.unresolved).toBe("true");

    await act(async () => root.unmount());
  });

  it("re-resolves and fails closed after a content mutation", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const projectionHost = createProjectionHost();
    const messageIndex = vi.spyOn(projectionHost.selection, "messageIndex");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness host={projectionHost} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    messageIndex.mockClear();
    projectionHost.controls.setMessageIndex(new Map());
    projectionHost.controls.emitSelectionInvalidation({
      dirtyMessageIds: new Set(["message-1"]),
      reason: "content",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(17);
    });

    expect(messageIndex).toHaveBeenCalledOnce();
    expect(container.querySelector("output")?.dataset.unresolved).toBe("true");
    await act(async () => root.unmount());
  });

  it("hides the badge while a host overlay covers the anchor", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const projectionHost = createProjectionHost();
    const anchorParagraph = projectionHost.selection.messageIndex().get("message-1");
    const overlay = document.createElement("div");
    document.body.append(overlay);
    let covering = true;
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: () => [covering ? overlay : anchorParagraph],
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness host={projectionHost} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    const output = container.querySelector("output");
    expect(output?.dataset.top).toBeUndefined();
    expect(output?.dataset.unresolved).toBe("false");

    covering = false;
    projectionHost.controls.emitSelectionInvalidation({ reason: "layout" });
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(output?.dataset.top).toBe("190");

    await act(async () => root.unmount());
  });

  it("preserves layout identity when projected geometry is unchanged", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const projectionHost = createProjectionHost();
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(shadowHost);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness host={projectionHost} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    const rendersAfterInitialProjection = renderCount;
    projectionHost.controls.emitSelectionInvalidation({ reason: "layout" });
    await act(async () => vi.advanceTimersByTimeAsync(17));

    expect(renderCount).toBe(rendersAfterInitialProjection);
    await act(async () => root.unmount());
  });

  it("preserves projection identity when content invalidation keeps the same geometry", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const projectionHost = createProjectionHost();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness host={projectionHost} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    const rendersAfterInitialProjection = renderCount;
    projectionHost.controls.emitSelectionInvalidation({
      dirtyMessageIds: new Set(["message-1"]),
      reason: "content",
    });
    await act(async () => vi.advanceTimersByTimeAsync(17));

    expect(renderCount).toBe(rendersAfterInitialProjection);
    await act(async () => root.unmount());
  });

  it("keeps the active highlight when content invalidation only changes geometry", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const setHighlight = vi.fn();
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { highlights: { delete: vi.fn(), set: setHighlight } },
    });
    vi.stubGlobal("Highlight", vi.fn());
    const projectionHost = createProjectionHost();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () =>
      root.render(<HighlightHarness activeAnnotationId={annotation.id} host={projectionHost} />),
    );
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(setHighlight).toHaveBeenCalledOnce();

    geometry.top = 100;
    projectionHost.controls.emitSelectionInvalidation({
      dirtyMessageIds: new Set(["message-1"]),
      reason: "content",
    });
    await act(async () => vi.advanceTimersByTimeAsync(17));

    expect(container.querySelector("output")?.dataset.top).toBe("90");
    expect(setHighlight).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("reuses the projected range when an annotation becomes active", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const projectionHost = createProjectionHost();
    const messageIndex = vi.spyOn(projectionHost.selection, "messageIndex");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness host={projectionHost} />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(messageIndex).toHaveBeenCalledOnce();

    messageIndex.mockClear();
    await act(async () =>
      root.render(<HighlightHarness activeAnnotationId={annotation.id} host={projectionHost} />),
    );
    expect(messageIndex).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});

function HighlightHarness({
  activeAnnotationId = null,
  host,
}: {
  activeAnnotationId?: string | null;
  host: FakeHost;
}) {
  return (
    <HostTestProvider host={host}>
      <HighlightProbe activeAnnotationId={activeAnnotationId} />
    </HostTestProvider>
  );
}

function HighlightProbe({ activeAnnotationId }: { activeAnnotationId: string | null }) {
  renderCount += 1;
  const [projection] = useAnnotationProjection(annotationList, activeAnnotationId);
  return (
    <output
      data-ordinal={projection?.ordinal}
      data-top={projection?.badge?.top}
      data-unresolved={projection?.range === null}
    />
  );
}

function annotationRect() {
  return {
    bottom: geometry.top + 20,
    height: 20,
    left: 100,
    right: 200,
    top: geometry.top,
    width: 100,
    x: 100,
    y: geometry.top,
    toJSON: () => ({}),
  };
}

function createProjectionHost(isResolved = true) {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [annotationRect()],
  });
  const host = createFakeHost();
  if (!isResolved) {
    return host;
  }
  const message = document.createElement("p");
  message.textContent = "selected text";
  document.body.append(message);
  host.controls.setMessageIndex(new Map([["message-1", message]]));
  return host;
}
