import { afterEach, describe, expect, it, vi } from "vitest";

import type { SelectionRect } from "@/features/host-port/host-port";
import { createSelectionVisuals } from "@/features/host/selection-visuals";

const cssDescriptor = Object.getOwnPropertyDescriptor(window, "CSS");
const highlightDescriptor = Object.getOwnPropertyDescriptor(window, "Highlight");
const elementsFromPointDescriptor = Object.getOwnPropertyDescriptor(document, "elementsFromPoint");

afterEach(() => {
  restoreProperty(window, "CSS", cssDescriptor);
  restoreProperty(window, "Highlight", highlightDescriptor);
  restoreProperty(document, "elementsFromPoint", elementsFromPointDescriptor);
  document.head.querySelector("#quotecue-highlight-style")?.remove();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("selection visuals", () => {
  it("owns highlight styling and registry updates", () => {
    const removeHighlight = vi.fn();
    const setHighlight = vi.fn();
    Object.defineProperty(window, "CSS", {
      configurable: true,
      value: { highlights: { delete: removeHighlight, set: setHighlight } },
    });
    class FakeHighlight {
      constructor(readonly range: Range) {}
    }
    Object.defineProperty(window, "Highlight", {
      configurable: true,
      value: FakeHighlight,
    });
    const range = document.createRange();
    const visuals = createSelectionVisuals({ document, window });

    visuals.highlight(range);

    expect(removeHighlight).toHaveBeenCalledWith("quotecue-annotations");
    expect(setHighlight).toHaveBeenCalledWith(
      "quotecue-annotations",
      expect.objectContaining({ range }),
    );
    expect(document.head.querySelectorAll("#quotecue-highlight-style")).toHaveLength(1);

    visuals.highlight(null);
    expect(removeHighlight).toHaveBeenCalledTimes(2);
  });

  it("ignores QuoteCue UI and detects a covering host element", () => {
    const anchor = document.createElement("p");
    anchor.textContent = "selected text";
    const quoteCueHost = document.createElement("div");
    quoteCueHost.dataset.quotecueHost = "";
    const overlay = document.createElement("div");
    document.body.append(anchor, quoteCueHost, overlay);
    const range = document.createRange();
    range.selectNodeContents(anchor);
    const elementsFromPoint = vi.fn(() => [quoteCueHost, overlay]);
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: elementsFromPoint,
    });
    const visuals = createSelectionVisuals({ document, window });

    expect(visuals.isObscured(range, selectionRect())).toBe(true);
    expect(elementsFromPoint).toHaveBeenCalledWith(199, 210);

    elementsFromPoint.mockReturnValue([quoteCueHost, anchor]);
    expect(visuals.isObscured(range, selectionRect())).toBe(false);
  });
});

function selectionRect(): SelectionRect {
  return {
    bottom: 220,
    height: 20,
    left: 100,
    right: 200,
    top: 200,
    width: 100,
  };
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    Reflect.deleteProperty(target, property);
  }
}
