import { rangeEndpointRect } from "@/features/host-port/range-geometry";
import type { HostResult } from "@/features/host-port/host-port";
import { currentVisualViewportBounds } from "@/features/layout/use-visual-viewport";

import type { HostContext } from "./host-context";
import { available, unavailable } from "./host-result";

const SCROLLABLE_OVERFLOW_PATTERN = /auto|overlay|scroll/;

export function createSelectionReveal(context: HostContext) {
  const { logger, window: hostWindow } = context;

  return function reveal(range: Range): HostResult<"scrolled" | "visible"> {
    if (!range.endContainer.isConnected) {
      return unavailable("selection-detached", logger);
    }

    const endpointRect = rangeEndpointRect(range);
    const scrollContainer = nearestScrollContainer(range.endContainer);
    const viewportRect = scrollContainer
      ? scrollContainer.getBoundingClientRect()
      : viewportRectangle();

    if (endpointRect.bottom >= viewportRect.top && endpointRect.top <= viewportRect.bottom) {
      return available("visible");
    }

    const offset =
      endpointRect.top + endpointRect.height / 2 - (viewportRect.top + viewportRect.height / 2);
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollTop + offset;
    } else {
      hostWindow.scrollBy({ behavior: "instant", top: offset });
    }
    return available("scrolled");
  };

  function nearestScrollContainer(node: Node) {
    let element = node instanceof HTMLElement ? node : node.parentElement;

    while (element) {
      const { overflowY } = hostWindow.getComputedStyle(element);
      if (
        SCROLLABLE_OVERFLOW_PATTERN.test(overflowY) &&
        element.scrollHeight > element.clientHeight
      ) {
        return element;
      }
      element = element.parentElement;
    }

    return null;
  }

  function viewportRectangle() {
    const viewport = currentVisualViewportBounds(hostWindow);
    return { bottom: viewport.top + viewport.height, height: viewport.height, top: viewport.top };
  }
}
