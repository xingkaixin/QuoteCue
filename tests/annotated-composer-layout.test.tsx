import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { useAnnotatedComposerLayout } from "@/features/host/use-annotated-composer-layout";

import { installChatGptHostFixture } from "./fixtures/chatgpt-host";
import { createFakeHost } from "./fixtures/fake-host";
import { setElementRect } from "./fixtures/fixture-utils";
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
    <output data-send-present={layout?.isSendControlPresent}>
      {layout
        ? `${layout.summary.left},${layout.summary.top}|${layout.send.left},${layout.send.top},${layout.send.width},${layout.send.height}`
        : "missing"}
    </output>
  );
}

describe("useAnnotatedComposerLayout", () => {
  it("reserves an annotation row and releases it on unmount", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const releaseReservation = vi.fn();
    const reserveAnnotationRow = vi.fn(() => releaseReservation);
    const host = createFakeHost({ layout: { reserveAnnotationRow } });

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

    expect(reserveAnnotationRow).toHaveBeenCalledWith(40);
    expect(container.textContent).toBe("10,10|200,200,36,36");

    await act(async () => root.unmount());
    expect(releaseReservation).toHaveBeenCalledOnce();
  });

  it("publishes send-control changes without requiring changed geometry", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = createFakeHost();
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
    const current = host.layout.current();
    if (current.status !== "available") throw new Error("Missing fixture layout");
    host.controls.setLayout({
      status: "available",
      value: { ...current.value, isSendControlPresent: false },
    });
    await act(async () => {
      host.controls.emitLayoutChange();
      await vi.advanceTimersByTimeAsync(80);
    });
    expect(container.querySelector("output")?.dataset.sendPresent).toBe("false");
    await act(async () => root.unmount());
  });

  it("throttles measurements throughout a continuous stream of layout signals", async () => {
    vi.useFakeTimers();
    stubPassiveResizeObserver();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const { surface } = installChatGptHostFixture();
    const measure = vi.spyOn(surface, "getBoundingClientRect");
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
    measure.mockClear();
    for (let elapsed = 0; elapsed < 200; elapsed += 20) {
      await act(async () => {
        window.dispatchEvent(new Event("resize"));
        await vi.advanceTimersByTimeAsync(20);
      });
    }

    expect(measure).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it("ignores document mutations outside the composer surface", async () => {
    vi.useFakeTimers();
    stubPassiveResizeObserver();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    installChatGptHostFixture();
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
    await act(async () => vi.advanceTimersByTimeAsync(80));

    const getComputedStyle = vi.spyOn(window, "getComputedStyle");
    const querySelector = vi.spyOn(document, "querySelector");
    for (let index = 0; index < 10; index += 1) {
      const node = document.createElement("div");
      document.body.append(node);
      await act(async () => vi.advanceTimersByTimeAsync(20));
    }
    await act(async () => vi.advanceTimersByTimeAsync(80));

    expect(querySelector).not.toHaveBeenCalled();
    expect(getComputedStyle).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("refreshes after a composer surface mutation", async () => {
    vi.useFakeTimers();
    stubPassiveResizeObserver();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const { surface } = installChatGptHostFixture();
    const measure = vi.spyOn(surface, "getBoundingClientRect");
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
    measure.mockClear();

    surface.append(document.createElement("span"));
    await act(async () => vi.advanceTimersByTimeAsync(80));

    expect(measure).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("uses the configured composer surface without inspecting ancestor styles", () => {
    const { composer, surface } = installChatGptHostFixture();
    const wrapper = document.createElement("div");
    composer.before(wrapper);
    wrapper.append(composer);
    const host = createChatGptHost({ document, window });
    const getComputedStyle = vi.spyOn(window, "getComputedStyle");

    expect(host.layout.current().status).toBe("available");
    expect(getComputedStyle).not.toHaveBeenCalled();

    expect(host.layout.current().status).toBe("available");
    expect(getComputedStyle).not.toHaveBeenCalled();

    surface.replaceWith(composer);
    expect(host.layout.current()).toEqual({ status: "unavailable" });
  });

  it("moves an active reservation to a replacement composer surface", async () => {
    vi.useFakeTimers();
    stubPassiveResizeObserver();
    const fixture = installChatGptHostFixture();
    const host = createChatGptHost({ document, window });
    const release = host.layout.reserveAnnotationRow(40);
    const nextSurface = document.createElement("div");
    const nextAction = document.createElement("button");
    nextSurface.style.paddingTop = "3px";
    nextAction.dataset.testid = "send-button";
    nextSurface.append(fixture.composer, nextAction);
    fixture.form.append(nextSurface);
    setElementRect(nextSurface, new DOMRect(100, 500, 400, 92));
    setElementRect(nextAction, new DOMRect(456, 548, 36, 36));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(80);

    expect(fixture.surface.style.paddingTop).toBe("5px");
    expect(fixture.action.style.visibility).toBe("");
    expect(nextSurface.style.paddingTop).toBe("43px");
    expect(nextAction.style.visibility).toBe("hidden");

    release();
    expect(nextSurface.style.paddingTop).toBe("3px");
    expect(nextAction.style.visibility).toBe("");
  });
});

function stubPassiveResizeObserver() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
    },
  );
}
