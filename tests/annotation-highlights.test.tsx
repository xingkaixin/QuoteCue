import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { useAnnotationProjection } from "@/features/annotations/use-annotation-projection";

import { HostTestProvider } from "./fixtures/host-provider";

const geometry = vi.hoisted(() => ({
  anchorNode: null as Node | null,
  isResolved: true,
  restoreCount: 0,
  top: 200,
}));
let renderCount = 0;

vi.mock("@/features/annotations/selection-anchor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/annotations/selection-anchor")>()),
  restoreTextAnchorFromIndex: () => {
    geometry.restoreCount += 1;
    return geometry.isResolved
      ? {
          endContainer: geometry.anchorNode,
          getBoundingClientRect: () => annotationRect(),
          getClientRects: () => [annotationRect()],
        }
      : null;
  },
}));

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
  geometry.anchorNode = null;
  geometry.isResolved = true;
  geometry.restoreCount = 0;
  geometry.top = 200;
  renderCount = 0;
  Reflect.deleteProperty(document, "elementsFromPoint");
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("annotation badge scrolling", () => {
  it("updates the badge on the next animation frame during scrolling", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(host);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(container.querySelector("output")?.dataset.top).toBe("190");
    expect(container.querySelector("output")?.dataset.ordinal).toBe("1");

    geometry.top = 100;
    geometry.restoreCount = 0;
    window.dispatchEvent(new Event("scroll"));
    await act(async () => vi.advanceTimersByTimeAsync(17));

    expect(container.querySelector("output")?.dataset.top).toBe("90");
    expect(geometry.restoreCount).toBe(0);

    await act(async () => root.unmount());
  });

  it("reports unresolved annotations without positioning a badge", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    geometry.isResolved = false;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness />));
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
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    geometry.restoreCount = 0;
    geometry.isResolved = false;
    document.body.append(document.createElement("span"));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(17);
    });

    expect(geometry.restoreCount).toBe(1);
    expect(container.querySelector("output")?.dataset.unresolved).toBe("true");
    await act(async () => root.unmount());
  });

  it("hides the badge while a host overlay covers the anchor", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const anchorParagraph = document.createElement("p");
    const overlay = document.createElement("div");
    document.body.append(anchorParagraph, overlay);
    geometry.anchorNode = anchorParagraph;
    let covering = true;
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: () => [covering ? overlay : anchorParagraph],
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    const output = container.querySelector("output");
    expect(output?.dataset.top).toBeUndefined();
    expect(output?.dataset.unresolved).toBe("false");

    covering = false;
    window.dispatchEvent(new Event("scroll"));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(output?.dataset.top).toBe("190");

    await act(async () => root.unmount());
  });

  it("preserves layout identity when projected geometry is unchanged", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(host);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    const rendersAfterInitialProjection = renderCount;
    window.dispatchEvent(new Event("scroll"));
    await act(async () => vi.advanceTimersByTimeAsync(17));

    expect(renderCount).toBe(rendersAfterInitialProjection);
    await act(async () => root.unmount());
  });

  it("reuses the projected range when an annotation becomes active", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<HighlightHarness />));
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(geometry.restoreCount).toBe(1);

    geometry.restoreCount = 0;
    await act(async () => root.render(<HighlightHarness activeAnnotationId={annotation.id} />));
    expect(geometry.restoreCount).toBe(0);

    await act(async () => root.unmount());
  });
});

function HighlightHarness({ activeAnnotationId = null }: { activeAnnotationId?: string | null }) {
  return (
    <HostTestProvider>
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
