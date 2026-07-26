import { parseTextAnchor } from "@/features/annotations/annotation";
import { rangeEndpointRect } from "@/features/annotations/selection-anchor";
import type { SelectionCapture, SelectionRect } from "@/features/host-port/host-port";
import { currentVisualViewportBounds } from "@/features/layout/use-visual-viewport";
import { QUOTECUE_HOST_SELECTOR, QUOTECUE_NATIVE_ACTION_ATTR } from "@/lib/dom-identity";

import {
  available,
  unavailable,
  type HostContext,
  type HostResult,
  type SelectionInvalidationReason,
} from "./host-context";

const CONTEXT_LENGTH = 48;
const SCROLLABLE_OVERFLOW_PATTERN = /auto|overlay|scroll/;

type SelectionRevealStatus = "scrolled" | "visible";

type SelectionToolbarCandidate = {
  actionRow: HTMLElement;
  distance: number;
};

export function createSelectionSurface(context: HostContext) {
  const { adapter, document: hostDocument, logger, signals, window: hostWindow } = context;

  function observeInvalidation(callback: (reason: SelectionInvalidationReason) => void) {
    const stopMutationObservation = signals.observeMutations(() => callback("content"), {
      characterData: true,
      childList: true,
    });
    const stopViewportObservation = signals.observeViewport(() => callback("layout"));

    return () => {
      stopMutationObservation();
      stopViewportObservation();
    };
  }

  function messageIndex(root: ParentNode = hostDocument) {
    const index = new Map<string, HTMLElement>();
    for (const message of root.querySelectorAll<HTMLElement>(adapter.messages.assistantSelector)) {
      if (!adapter.messages.isAssistant(message)) {
        continue;
      }
      const messageId = adapter.messages.id(message);
      if (messageId && !index.has(messageId)) {
        index.set(messageId, message);
      }
    }
    return index;
  }

  function capture(selection = hostWindow.getSelection()): HostResult<SelectionCapture> {
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return unavailable("selection-unavailable");
    }

    const range = selection.getRangeAt(0);
    const message = assistantMessageForRange(range);
    const displayQuote = selection.toString().trim();
    const quote = range.toString();
    if (!message || displayQuote.length === 0 || quote.length === 0) {
      return unavailable("assistant-message-unavailable");
    }
    if (displayQuote !== quote) {
      logger?.(
        `[QuoteCue host] selection text mismatch: rendered=${displayQuote.length}, dom=${quote.length}`,
      );
    }

    const start = textOffset(message, range.startContainer, range.startOffset);
    const end = textOffset(message, range.endContainer, range.endOffset);
    const messageText = message.textContent ?? "";
    const actionRect = rangeRect(range);
    const anchor = parseTextAnchor({
      end,
      messageId: adapter.messages.id(message),
      prefix: messageText.slice(Math.max(0, start - CONTEXT_LENGTH), start),
      quote,
      ...(displayQuote === quote ? {} : { displayQuote }),
      start,
      suffix: messageText.slice(end, end + CONTEXT_LENGTH),
    });
    if (!anchor) {
      return unavailable("assistant-message-unavailable");
    }

    return available({
      actionRect,
      anchor,
      rect: rectangleSnapshot(rangeEndpointRect(range)),
    });
  }

  function clear() {
    hostWindow.getSelection()?.removeAllRanges();
  }

  function selectionToolbar(selectionRect: SelectionRect) {
    let closest: SelectionToolbarCandidate | null = null;
    for (const element of hostDocument.body.children) {
      const candidate = selectionToolbarCandidate(element, selectionRect);
      if (candidate && (!closest || candidate.distance < closest.distance)) {
        closest = candidate;
      }
    }

    return closest?.actionRow ?? null;
  }

  function selectionToolbarCandidate(
    candidate: Element,
    selectionRect: SelectionRect,
  ): SelectionToolbarCandidate | null {
    const rect = candidate.getBoundingClientRect();
    const horizontalOverlap =
      Math.min(selectionRect.right, rect.right) - Math.max(selectionRect.left, rect.left);
    const verticalDistance = Math.max(
      selectionRect.top - rect.bottom,
      rect.top - selectionRect.bottom,
      0,
    );
    const isNearbyFixedToolbar =
      !candidate.matches(QUOTECUE_HOST_SELECTOR) &&
      hostWindow.getComputedStyle(candidate).position === "fixed" &&
      rect.width >= 80 &&
      rect.width <= 480 &&
      rect.height >= 28 &&
      rect.height <= 80 &&
      horizontalOverlap > 0 &&
      verticalDistance <= 24;
    if (!isNearbyFixedToolbar) {
      return null;
    }

    const actionRow = Array.from(candidate.querySelectorAll("button"))
      .map((button) => button.parentElement)
      .find(
        (parent): parent is HTMLElement =>
          parent !== null &&
          parent.children.length > 0 &&
          Array.from(parent.children).every((child) => child.tagName === "BUTTON"),
      );
    return actionRow ? { actionRow, distance: verticalDistance } : null;
  }

  function mountAction(options: { label: string; onActivate: () => void; rect: SelectionRect }) {
    let action: HTMLButtonElement | null = null;
    let insertFrame: number | null = null;

    const preserveSelection = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const removeAction = () => {
      action?.remove();
      action = null;
    };
    const insertAction = () => {
      if (action?.isConnected) {
        return;
      }

      const toolbar = selectionToolbar(options.rect);
      const sourceAction = toolbar?.querySelector<HTMLButtonElement>("button");
      if (!toolbar || !sourceAction) {
        return;
      }

      action = sourceAction.cloneNode(true) as HTMLButtonElement;
      action.setAttribute(QUOTECUE_NATIVE_ACTION_ATTR, "");
      action.setAttribute("aria-label", options.label);
      action.removeAttribute("aria-describedby");
      action.removeAttribute("id");
      action.textContent = "QuoteCue";
      action.addEventListener("mousedown", preserveSelection, true);
      action.addEventListener("click", (event) => {
        preserveSelection(event);
        options.onActivate();
        removeAction();
      });
      toolbar.prepend(action);
    };
    const scheduleInsert = () => {
      if (action?.isConnected || insertFrame !== null) {
        return;
      }
      insertFrame = hostWindow.requestAnimationFrame(() => {
        insertFrame = null;
        insertAction();
      });
    };
    const stopObserving = signals.observeMutations(scheduleInsert, { childList: true });

    insertAction();

    return () => {
      stopObserving();
      if (insertFrame !== null) {
        hostWindow.cancelAnimationFrame(insertFrame);
      }
      removeAction();
    };
  }

  function reveal(range: Range): HostResult<SelectionRevealStatus> {
    if (!range.endContainer.isConnected) {
      return unavailable("assistant-message-unavailable");
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
  }

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

  function assistantMessageForRange(range: Range) {
    const startMessage = closestAssistantMessage(range.startContainer);
    const endMessage = closestAssistantMessage(range.endContainer);
    return startMessage === endMessage ? startMessage : null;
  }

  function textOffset(root: HTMLElement, node: Node, offset: number) {
    const range = hostDocument.createRange();
    range.setStart(root, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  function closestAssistantMessage(node: Node) {
    const element = node instanceof Element ? node : node.parentElement;
    const message = element?.closest<HTMLElement>(adapter.messages.assistantSelector) ?? null;
    return message && adapter.messages.isAssistant(message) ? message : null;
  }

  return {
    presentation: adapter.selectionPresentation.mode,
    capture,
    clear,
    messageIndex,
    mountAction,
    observeInvalidation,
    reveal,
  };
}

function rangeRect(range: Range) {
  const rect =
    typeof range.getBoundingClientRect === "function"
      ? range.getBoundingClientRect()
      : new DOMRect();
  return rectangleSnapshot(rect);
}

function rectangleSnapshot(rect: SelectionRect): SelectionRect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}
