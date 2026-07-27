import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { useAnnotatedComposerLayout } from "@/features/host/use-annotated-composer-layout";

import { installChatGptHostFixture } from "./fixtures/chatgpt-host";
import { createFakeHost } from "./fixtures/fake-host";
import { HostTestProvider } from "./fixtures/host-provider";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
    const host = createChatGptHost({ document, window });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <HostTestProvider host={host}>
          <LayoutProbe />
        </HostTestProvider>,
      ),
    );

    expect(surface.style.paddingTop).toBe("45px");
    expect(action.style.visibility).toBe("hidden");
    expect(container.textContent).toBe("112,708|456,748,36,36");

    await act(async () => root.unmount());
    expect(surface.style.paddingTop).toBe("5px");
    expect(action.style.visibility).toBe("");
  });

  it("refreshes throughout a continuous stream of layout signals", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect() {}
        observe() {}
      },
    );
    const host = createFakeHost();
    const currentLayout = vi.spyOn(host.layout, "current");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () =>
      root.render(
        <HostTestProvider host={host}>
          <LayoutProbe />
        </HostTestProvider>,
      ),
    );
    for (let elapsed = 0; elapsed < 200; elapsed += 20) {
      host.controls.emitLayoutChange();
      await act(async () => vi.advanceTimersByTimeAsync(20));
    }

    expect(currentLayout).toHaveBeenCalledTimes(3);
    await act(async () => root.unmount());
  });

  it("reuses a validated composer surface without rescanning its ancestors", () => {
    const { composer, surface } = installChatGptHostFixture();
    const wrapper = document.createElement("div");
    composer.before(wrapper);
    wrapper.append(composer);
    const host = createChatGptHost({ document, window });
    const getComputedStyle = vi.spyOn(window, "getComputedStyle");

    expect(host.layout.current().status).toBe("available");
    expect(getComputedStyle.mock.calls.length).toBeGreaterThan(1);

    getComputedStyle.mockClear();
    expect(host.layout.current().status).toBe("available");
    expect(getComputedStyle).toHaveBeenCalledOnce();

    surface.style.backgroundColor = "transparent";
    surface.style.borderTopLeftRadius = "0";
    expect(host.layout.current()).toEqual({
      reason: "composer-surface-unavailable",
      status: "unavailable",
    });
  });
});
