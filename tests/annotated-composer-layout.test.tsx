import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAnnotatedComposerLayout } from "@/features/host/use-annotated-composer-layout";

import { installChatGptHostFixture } from "./fixtures/chatgpt-host";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
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

describe("useAnnotatedComposerLayout", () => {
  it("adds an annotation row to the composer and restores it on unmount", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect() {}
        observe() {}
      },
    );

    const { action, surface } = installChatGptHostFixture();

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<LayoutProbe />));

    expect(surface.style.paddingTop).toBe("45px");
    expect(action.style.visibility).toBe("hidden");
    expect(container.textContent).toBe("112,708|456,748,36,36");

    await act(async () => root.unmount());
    expect(surface.style.paddingTop).toBe("5px");
    expect(action.style.visibility).toBe("");
  });
});
