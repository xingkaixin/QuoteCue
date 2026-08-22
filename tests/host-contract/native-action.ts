import { describe, expect, it, vi } from "vitest";

import { QUOTECUE_NATIVE_ACTION_SELECTOR } from "@/lib/dom-identity";

import { missingToolbar, nextFrame, selectionRectangle } from "../fixtures/host-contract";
import { requiredNativeAction } from "../fixtures/fixture-utils";

import type { HostContractDefinition } from "../host-contract-suite";

export function runNativeActionHostContract(definition: HostContractDefinition) {
  describe("native selection action", () => {
    it.skipIf(!definition.installSelectionToolbar)(
      "mounts a delayed native selection action",
      async () => {
        const siteHost = host();
        const stop = requiredNativeAction(siteHost).mount({
          label: "Add QuoteCue annotation",
          onActivate: vi.fn(),
          rect: selectionRectangle(),
        });

        const { actionRow } = definition.installSelectionToolbar?.() ?? missingToolbar();
        await nextFrame();

        expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();
        stop();
      },
    );

    it.skipIf(!definition.installSelectionToolbar)(
      "coalesces native toolbar discovery within a frame",
      async () => {
        const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
        const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");
        const stop = requiredNativeAction(host()).mount({
          label: "Add QuoteCue annotation",
          onActivate: vi.fn(),
          rect: selectionRectangle(),
        });

        const { actionRow } = definition.installSelectionToolbar?.() ?? missingToolbar();
        await Promise.resolve();
        document.body.append(document.createElement("span"));
        await Promise.resolve();
        expect(requestAnimationFrame).toHaveBeenCalledOnce();

        await new Promise<void>((resolve) => nativeRequestAnimationFrame(() => resolve()));
        expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();

        document.body.append(document.createElement("span"));
        await Promise.resolve();
        expect(requestAnimationFrame).toHaveBeenCalledOnce();
        stop();
      },
    );

    it.skipIf(!definition.installSelectionToolbar)(
      "stops native toolbar discovery after its time window",
      async () => {
        let now = 0;
        vi.spyOn(window.performance, "now").mockImplementation(() => now);
        const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
        const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");
        const stop = requiredNativeAction(host()).mount({
          label: "Add QuoteCue annotation",
          onActivate: vi.fn(),
          rect: selectionRectangle(),
        });

        document.body.append(document.createElement("span"));
        await Promise.resolve();
        expect(requestAnimationFrame).toHaveBeenCalledOnce();
        await new Promise<void>((resolve) => nativeRequestAnimationFrame(() => resolve()));

        requestAnimationFrame.mockClear();
        now = 2_000;
        document.body.append(document.createElement("span"));
        await Promise.resolve();
        expect(requestAnimationFrame).not.toHaveBeenCalled();
        stop();
      },
    );

    it.skipIf(!definition.installSelectionToolbar)(
      "finds a native toolbar from an endpoint fallback rectangle",
      () => {
        const { actionRow } =
          definition.installSelectionToolbar?.(new DOMRect(768, 49, 196, 36)) ?? missingToolbar();
        const stop = requiredNativeAction(host()).mount({
          label: "Add QuoteCue annotation",
          onActivate: vi.fn(),
          rect: {
            bottom: 88,
            height: 62,
            left: 436,
            right: 897,
            top: 26,
            width: 461,
          },
        });

        expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();
        stop();
      },
    );
    function host() {
      return definition.createHost({ document, window });
    }
  });
}
