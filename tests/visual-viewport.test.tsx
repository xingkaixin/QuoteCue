import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useVisualViewportBounds } from "@/features/layout/use-visual-viewport";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("visual viewport", () => {
  it("updates bounds after zoom and viewport scrolling", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const viewport = new FakeVisualViewport();
    vi.stubGlobal("visualViewport", viewport);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<ViewportProbe />));
    expect(container.textContent).toBe("320,568,0,0");

    viewport.width = 240;
    viewport.height = 400;
    viewport.offsetLeft = 30;
    viewport.offsetTop = 80;
    await act(async () => viewport.dispatchEvent(new Event("resize")));
    expect(container.textContent).toBe("240,400,30,80");

    await act(async () => root.unmount());
  });
});

function ViewportProbe() {
  const viewport = useVisualViewportBounds();
  return `${viewport.width},${viewport.height},${viewport.left},${viewport.top}`;
}

class FakeVisualViewport extends EventTarget {
  width = 320;
  height = 568;
  offsetLeft = 0;
  offsetTop = 0;
}
