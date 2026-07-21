import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { useAnnotationHighlights } from "@/features/annotations/use-annotation-highlights";

const geometry = vi.hoisted(() => ({ top: 200 }));

vi.mock("@/features/annotations/selection-anchor", () => ({
  restoreTextAnchor: () => ({
    getBoundingClientRect: () => annotationRect(),
    getClientRects: () => [annotationRect()],
  }),
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
  createdAt: 1,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("annotation badge scrolling", () => {
  it("updates the badge on the next animation frame during scrolling", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
    const container = document.createElement("div");
    document.body.append(container);
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
});

function HighlightHarness() {
  const positions = useAnnotationHighlights([annotation], null);
  return <output data-top={positions[0]?.top} />;
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
