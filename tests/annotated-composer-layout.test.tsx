import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAnnotatedComposerLayout } from "@/features/chatgpt/use-annotated-composer-layout";

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

    const form = document.createElement("form");
    const surface = document.createElement("div");
    surface.style.backgroundColor = "rgb(255, 255, 255)";
    surface.style.borderRadius = "28px";
    surface.style.borderTopLeftRadius = "28px";
    surface.style.paddingTop = "5px";
    Object.defineProperty(surface, "getBoundingClientRect", {
      value: () => ({ bottom: 792, left: 100, right: 500, top: 700 }),
    });
    const composerParent = document.createElement("div");
    const composer = document.createElement("div");
    composer.id = "prompt-textarea";
    const action = document.createElement("button");
    Object.defineProperty(action, "getBoundingClientRect", {
      value: () => ({ bottom: 784, height: 36, left: 456, right: 492, top: 748, width: 36 }),
    });
    composerParent.append(composer);
    surface.append(composerParent, action);
    form.append(surface);
    document.body.append(form);

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
