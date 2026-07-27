import type { SelectionRect } from "@/features/host-port/host-port";
import { currentVisualViewportBounds } from "@/features/layout/use-visual-viewport";
import { QUOTECUE_HOST_SELECTOR } from "@/lib/dom-identity";

import type { HostEnvironment } from "./host-context";

const HIGHLIGHT_NAME = "quotecue-annotations";
const HIGHLIGHT_STYLE_ID = "quotecue-highlight-style";

type HighlightConstructor = new (...ranges: AbstractRange[]) => Highlight;
type SelectionVisualWindow = Window & {
  CSS?: typeof CSS;
  Highlight?: HighlightConstructor;
};

export function createSelectionVisuals(environment: HostEnvironment) {
  const { document: hostDocument, window: hostWindow } = environment;
  const visualWindow = hostWindow as SelectionVisualWindow;

  function highlight(range: Range | null) {
    const registry = visualWindow.CSS?.highlights;
    registry?.delete(HIGHLIGHT_NAME);
    if (!range || !registry) {
      return;
    }

    const HighlightClass = visualWindow.Highlight;
    if (!HighlightClass) {
      return;
    }

    ensureHighlightStyle();
    registry.set(HIGHLIGHT_NAME, new HighlightClass(range));
  }

  function ensureHighlightStyle() {
    if (hostDocument.getElementById(HIGHLIGHT_STYLE_ID)) {
      return;
    }

    const style = hostDocument.createElement("style");
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = `::highlight(${HIGHLIGHT_NAME}) {
    background: color-mix(in srgb, #2f7df4 22%, transparent);
  }`;
    hostDocument.head.append(style);
  }

  function isObscured(range: Range, rect: SelectionRect) {
    if (typeof hostDocument.elementsFromPoint !== "function") {
      return false;
    }

    const anchor =
      range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
    if (!anchor) {
      return false;
    }

    const viewport = currentVisualViewportBounds(hostWindow);
    const x = Math.min(Math.max(rect.right - 1, viewport.left), viewport.left + viewport.width - 1);
    const y = Math.min(
      Math.max(rect.top + rect.height / 2, viewport.top),
      viewport.top + viewport.height - 1,
    );

    // QuoteCue floats above the page, so hit testing must ignore its own host before checking cover.
    const hit = hostDocument
      .elementsFromPoint(x, y)
      .find((element) => !element.closest(QUOTECUE_HOST_SELECTOR));
    return hit !== undefined && !anchor.contains(hit) && !hit.contains(anchor);
  }

  return { highlight, isObscured };
}
