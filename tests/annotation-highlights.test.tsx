import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { useAnnotationHighlights } from "@/features/annotations/use-annotation-highlights";

const geometry = vi.hoisted(() => ({ isResolved: true, top: 200 }));
let renderCount = 0;

vi.mock("@/features/annotations/selection-anchor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/annotations/selection-anchor")>()),
  restoreTextAnchorFromIndex: () =>
    geometry.isResolved
      ? {
          getBoundingClientRect: () => annotationRect(),
          getClientRects: () => [annotationRect()],
        }
      : null,
}));

const annotation: DraftAnnotation = {
  id: "annotation-1",
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
const annotationList = [annotation];

afterEach(() => {
  geometry.isResolved = true;
  geometry.top = 200;
  renderCount = 0;
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

    geometry.top = 100;
    window.dispatchEvent(new Event("scroll"));
    await act(async () => vi.advanceTimersByTimeAsync(17));

    expect(container.querySelector("output")?.dataset.top).toBe("90");

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
});

function HighlightHarness() {
  renderCount += 1;
  const { badgePositions, unresolvedAnnotationIds } = useAnnotationHighlights(annotationList, null);
  return (
    <output
      data-top={badgePositions[0]?.top}
      data-unresolved={unresolvedAnnotationIds.has(annotation.id)}
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
