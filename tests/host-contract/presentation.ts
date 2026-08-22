import { describe, expect, it, vi } from "vitest";

import { availableValue, nextFrame, requiredText } from "../fixtures/host-contract";

import type { HostContractDefinition } from "../host-contract-suite";

export function runPresentationHostContract(definition: HostContractDefinition) {
  describe("selection and layout", () => {
    it("reserves and restores the configured composer row", () => {
      const fixture = definition.installFixture();
      fixture.surface.style.setProperty("padding-top", "7px", "important");
      fixture.sendControl.style.setProperty("visibility", "visible", "important");
      const siteHost = host();
      const release = siteHost.layout.reserveAnnotationRow(40);

      expect(fixture.surface.style.getPropertyValue("padding-top")).toBe("47px");
      expect(fixture.surface.style.getPropertyPriority("padding-top")).toBe("important");
      expect(fixture.sendControl.style.getPropertyValue("visibility")).toBe("hidden");
      expect(fixture.sendControl.style.getPropertyPriority("visibility")).toBe("important");
      expect(Object.keys(availableValue(siteHost.layout.current())).sort()).toEqual([
        "send",
        "summary",
      ]);

      release();
      expect(fixture.surface.style.getPropertyValue("padding-top")).toBe("7px");
      expect(fixture.surface.style.getPropertyPriority("padding-top")).toBe("important");
      expect(fixture.sendControl.style.getPropertyValue("visibility")).toBe("visible");
      expect(fixture.sendControl.style.getPropertyPriority("visibility")).toBe("important");
    });

    it("reports a collapsed selection as unavailable", () => {
      definition.installFixture();
      window.getSelection()?.removeAllRanges();

      expect(host().selection.capture()).toEqual({ status: "unavailable" });
    });

    it("reports a composer outside its configured surface", () => {
      const fixture = definition.installFixture();
      fixture.surface.replaceWith(fixture.composer, fixture.sendControl);

      const logger = vi.fn();

      expect(definition.createHost({ document, logger, window }).layout.current()).toEqual({
        status: "unavailable",
      });
      expect(logger).toHaveBeenCalledWith(
        "[QuoteCue host] unavailable: composer-surface-unavailable",
      );
    });

    it("does not intercept Enter while an IME composition is active", () => {
      const fixture = definition.installFixture();
      const onSubmit = vi.fn();
      const stop = host().composer.subscribeToSubmit(onSubmit);
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        isComposing: true,
        key: "Enter",
      });

      fixture.composer.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(onSubmit).not.toHaveBeenCalled();
      stop();
    });

    it("uses the configured fallback send rectangle when no action is available", () => {
      const fixture = definition.installFixture();
      const surfaceRect = fixture.surface.getBoundingClientRect();
      fixture.sendControl.remove();
      for (const action of fixture.surface.querySelectorAll("button, [role='button']")) {
        action.remove();
      }

      const layout = availableValue(host().layout.current());

      expect(layout.send).toEqual({
        bottom: surfaceRect.bottom - 8,
        height: 36,
        left: surfaceRect.right - 44,
        right: surfaceRect.right - 8,
        top: surfaceRect.bottom - 44,
        width: 36,
      });
    });

    it("emits semantic selection capture intents", async () => {
      definition.installFixture();
      const onIntent = vi.fn();
      const stop = host().selection.observeCaptureIntent(onIntent);

      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));
      await nextFrame();
      expect(onIntent).toHaveBeenCalledOnce();
      expect(onIntent).toHaveBeenLastCalledWith("capture");

      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Escape" }));
      await nextFrame();
      expect(onIntent).toHaveBeenCalledTimes(2);
      expect(onIntent).toHaveBeenLastCalledWith("dismiss");

      window.dispatchEvent(new Event("scroll"));
      expect(onIntent).toHaveBeenLastCalledWith("dismiss");
      expect(onIntent).toHaveBeenCalledTimes(3);

      stop();
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextFrame();
      expect(onIntent).toHaveBeenCalledTimes(3);
    });

    it("classifies viewport and message content invalidations", async () => {
      const fixture = definition.installFixture();
      const onInvalidation = vi.fn();
      const stop = host().selection.observeInvalidation(onInvalidation);

      window.dispatchEvent(new Event("resize"));
      expect(onInvalidation).toHaveBeenLastCalledWith({ reason: "layout" });

      onInvalidation.mockClear();
      requiredText(fixture.assistantMessage.querySelector("strong")).textContent = "updated answer";
      await vi.waitFor(() =>
        expect(onInvalidation).toHaveBeenCalledWith({
          dirtyMessageIds: new Set([definition.expectedMessageId]),
          reason: "content",
        }),
      );

      stop();
      onInvalidation.mockClear();
      requiredText(fixture.assistantMessage.querySelector("strong")).textContent =
        "detached observer";
      await Promise.resolve();
      expect(onInvalidation).not.toHaveBeenCalled();
    });

    it("does not classify composer character data as message content", async () => {
      const fixture = definition.installFixture();
      const composerText = document.createTextNode("composer text");
      fixture.composer.replaceChildren(composerText);
      const onInvalidation = vi.fn();
      const stop = host().selection.observeInvalidation(onInvalidation);

      composerText.data = "typed composer text";
      await Promise.resolve();

      expect(onInvalidation).not.toHaveBeenCalled();

      requiredText(fixture.assistantMessage.querySelector("strong")).data = "updated answer";
      await vi.waitFor(() =>
        expect(onInvalidation).toHaveBeenCalledWith({
          dirtyMessageIds: new Set([definition.expectedMessageId]),
          reason: "content",
        }),
      );
      stop();
    });

    it("keeps the detached-selection cause in diagnostics", () => {
      const detachedMessage = document.createElement("p");
      detachedMessage.textContent = "Detached selection";
      const range = document.createRange();
      range.selectNodeContents(detachedMessage);
      const logger = vi.fn();
      const siteHost = definition.createHost({ document, logger, window });

      expect(siteHost.selection.reveal(range)).toEqual({ status: "unavailable" });
      expect(logger).toHaveBeenCalledWith("[QuoteCue host] unavailable: selection-detached");
    });

    it("centers an offscreen endpoint in the nearest scroll container", () => {
      const fixture = definition.installFixture();
      const scrollContainer = document.createElement("div");
      scrollContainer.style.overflowY = "auto";
      Object.defineProperties(scrollContainer, {
        clientHeight: { configurable: true, value: 400 },
        scrollHeight: { configurable: true, value: 1_200 },
        getBoundingClientRect: {
          configurable: true,
          value: () => new DOMRect(0, 100, 800, 400),
        },
      });
      scrollContainer.scrollTop = 50;
      fixture.assistantMessage.replaceWith(scrollContainer);
      scrollContainer.append(fixture.assistantMessage);
      const range = document.createRange();
      range.selectNodeContents(fixture.assistantMessage);
      Object.defineProperty(range, "getClientRects", {
        configurable: true,
        value: () => [new DOMRect(100, 900, 160, 20)],
      });

      expect(host().selection.reveal(range)).toEqual({
        status: "available",
        value: "scrolled",
      });
      expect(scrollContainer.scrollTop).toBe(660);
    });

    function host() {
      return definition.createHost({ document, window });
    }
  });
}
