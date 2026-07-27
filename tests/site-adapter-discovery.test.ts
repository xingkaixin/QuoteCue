import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import { createDomHost } from "@/features/host/dom-host";
import {
  composerLayout,
  richTextComposer,
  type SelectionPresentationAccess,
  type SiteAdapter,
} from "@/features/host/site-adapter";
import { QUOTECUE_NATIVE_ACTION_SELECTOR } from "@/lib/dom-identity";

import { requiredElement, requiredNativeAction, setElementRect } from "./fixtures/fixture-utils";

afterEach(() => {
  document.body.replaceChildren();
});

describe("site adapter discovery", () => {
  it("uses declared composer boundaries and surfaces without visual heuristics", () => {
    document.body.innerHTML = `
      <main>
        <form data-composer-boundary>
          <section data-composer-surface>
            <div id="composer" contenteditable="true"></div>
            <button type="button"></button>
          </section>
        </form>
      </main>
    `;
    const surface = requiredElement<HTMLElement>("[data-composer-surface]");
    const action = requiredElement<HTMLElement>("button");
    setElementRect(surface, new DOMRect(100, 700, 400, 92));
    setElementRect(action, new DOMRect(456, 748, 36, 36));
    const host = createDomHost(
      { document, window },
      adapter({
        layout: composerLayout("button", {
          boundarySelector: "[data-composer-boundary]",
          surfaceSelector: "[data-composer-surface]",
        }),
      }),
    );

    expect(host.layout.current()).toEqual({
      status: "available",
      value: {
        send: { bottom: 784, height: 36, left: 456, right: 492, top: 748, width: 36 },
        summary: { left: 112, top: 708 },
      },
    });
  });

  it("uses declared native-toolbar bounds instead of the defaults", () => {
    const toolbar = document.createElement("div");
    toolbar.style.position = "fixed";
    const actionRow = document.createElement("div");
    actionRow.append(document.createElement("button"), document.createElement("button"));
    toolbar.append(actionRow);
    document.body.append(toolbar);
    setElementRect(toolbar, new DOMRect(100, 150, 600, 36));
    const host = createDomHost(
      { document, window },
      adapter({
        selectionPresentation: {
          mode: "native-toolbar",
          toolbarBounds: {
            maxHeight: 60,
            maxVerticalDistance: 20,
            maxWidth: 640,
            minHeight: 30,
            minWidth: 500,
          },
        },
      }),
    );

    const stop = requiredNativeAction(host).mount({
      label: "Add QuoteCue annotation",
      onActivate: () => undefined,
      rect: { bottom: 220, height: 20, left: 200, right: 400, top: 200, width: 200 },
    });

    expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();
    stop();
  });

  it("omits native action mounting from overlay hosts", () => {
    const host = createDomHost({ document, window }, adapter({}));

    expect(host.selection.presentation).toBe("overlay");
    expect(host.selection).not.toHaveProperty("nativeAction");
    if (host.selection.presentation === "overlay") {
      expectTypeOf(host.selection.nativeAction).toEqualTypeOf<undefined>();
    }
  });
});

function adapter(
  overrides: Partial<Pick<SiteAdapter, "layout" | "selectionPresentation">>,
): SiteAdapter {
  return {
    composer: richTextComposer("#composer"),
    conversationPathPattern: /^\/conversation\/([^/]+)/,
    layout: composerLayout("button"),
    messages: {
      assistantSelector: "[data-assistant]",
      id: (message) => message.id,
      isAssistant: () => true,
      userSelector: "[data-user]",
    },
    selectionPresentation: {
      mode: "overlay",
    } satisfies SelectionPresentationAccess,
    sendControl: {
      isDisabled: () => false,
      selector: "button",
    },
    ...overrides,
  };
}
