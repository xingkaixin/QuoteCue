import type { HostLayout, HostResult, SelectionRect } from "@/features/host-port/host-port";
import { toSelectionRect } from "@/features/host-port/selection-rect";

import type { HostContext } from "./host-context";
import { available, unavailable } from "./host-result";
import { once } from "./host-signals";

type ComposerLayoutElements = {
  action: HTMLElement | null;
  send: SelectionRect;
  summary: HostLayout["summary"];
  surface: HTMLElement;
};

const FALLBACK_ACTION = {
  bottomInset: 8,
  height: 36,
  rightInset: 8,
  width: 36,
};

export function createComposerLayout(
  context: HostContext,
  currentComposer: () => HTMLElement | null,
) {
  const { adapter, document: hostDocument, logger, signals, window: hostWindow } = context;
  let activeReservation: { height: number } | null = null;
  const layoutSubscribers = new Set<() => void>();
  let resizeObserver: ResizeObserver | null = null;
  let observedSurface: HTMLElement | null = null;
  let stopSignalObservation: (() => void) | null = null;
  let styledSurface: HTMLElement | null = null;
  let hiddenAction: HTMLElement | null = null;
  let originalPaddingTop = "";
  let originalPaddingTopPriority = "";
  let originalActionVisibility = "";
  let originalActionVisibilityPriority = "";

  // The single expensive boundary: one measurement serves layout publication, the reservation
  // and the resize observation, so raw signals only have to invalidate.
  function current(): HostResult<HostLayout> {
    const elements = currentElements();
    if (elements.status === "unavailable") {
      reconcileReservation(null);
      observeSurfaceResize(null);
      return elements;
    }
    reconcileReservation(elements.value);
    observeSurfaceResize(elements.value.surface);
    return available({
      send: elements.value.send,
      summary: elements.value.summary,
    });
  }

  function observeSurfaceResize(surface: HTMLElement | null) {
    if (!resizeObserver) {
      observedSurface = null;
      return;
    }
    if (surface === observedSurface) {
      return;
    }
    resizeObserver?.disconnect();
    observedSurface = surface;
    if (surface) {
      resizeObserver?.observe(surface);
    }
  }

  function currentElements(): HostResult<ComposerLayoutElements> {
    const composer = currentComposer();
    if (!composer) {
      return unavailable("composer-unavailable", logger);
    }

    const boundary = findComposerBoundary(composer);
    if (!boundary) {
      return unavailable("composer-surface-unavailable", logger);
    }
    const surface = findComposerSurface(composer, boundary);
    if (!surface) {
      return unavailable("composer-surface-unavailable", logger);
    }

    const rect = surface.getBoundingClientRect();
    const action = findComposerAction(boundary ?? surface, rect);
    const actionRect = action?.getBoundingClientRect();
    const send = actionRect ? toSelectionRect(actionRect) : fallbackRectangle(rect);
    return available({
      action,
      send,
      summary: { left: rect.left + 12, top: rect.top + 8 },
      surface,
    });
  }

  function reserveAnnotationRow(height: number) {
    if (!Number.isFinite(height) || height < 0) {
      throw new RangeError("Annotation row height must be a non-negative finite number");
    }

    restoreReservation();
    const reservation = { height };
    activeReservation = reservation;
    const elements = currentElements();
    reconcileReservation(elements.status === "available" ? elements.value : null);

    return once(() => {
      if (activeReservation !== reservation) {
        return;
      }
      activeReservation = null;
      restoreReservation();
    });
  }

  function subscribe(callback: () => void) {
    const subscription = () => callback();
    layoutSubscribers.add(subscription);
    if (layoutSubscribers.size === 1) {
      startObservation();
    }

    return once(() => {
      layoutSubscribers.delete(subscription);
      if (layoutSubscribers.size === 0) {
        stopObservation();
      }
    });
  }

  function startObservation() {
    resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(notifySubscribers);
    hostDocument.addEventListener("input", handleComposerInput, true);
    const stopMutationObservation = signals.observeMutations(
      (records) => {
        if (mutationsAffectComposer(records)) {
          notifySubscribers();
        }
      },
      { childList: true },
    );
    const stopViewportObservation = signals.observeViewport(notifySubscribers);
    stopSignalObservation = () => {
      hostDocument.removeEventListener("input", handleComposerInput, true);
      stopMutationObservation();
      stopViewportObservation();
    };
  }

  function stopObservation() {
    stopSignalObservation?.();
    stopSignalObservation = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    observedSurface = null;
  }

  function notifySubscribers() {
    for (const subscriber of [...layoutSubscribers]) {
      subscriber();
    }
  }

  function handleComposerInput(event: Event) {
    const composer = currentComposer();
    if (composer && event.target instanceof Node && composer.contains(event.target)) {
      notifySubscribers();
    }
  }

  function mutationsAffectComposer(records: readonly MutationRecord[]) {
    const surface = observedSurface;
    if (!surface?.isConnected) {
      return true;
    }

    return records.some(
      (record) =>
        surface.contains(record.target) ||
        [...record.addedNodes, ...record.removedNodes].some(
          (node) => node === surface || (node instanceof Element && node.contains(surface)),
        ),
    );
  }

  function reconcileReservation(elements: ComposerLayoutElements | null) {
    if (!activeReservation || !elements) {
      restoreReservation();
      return;
    }
    styleSurface(elements.surface, activeReservation.height);
    if (elements.action) {
      hideAction(elements.action);
    } else {
      restoreAction();
    }
  }

  function styleSurface(surface: HTMLElement, height: number) {
    if (surface === styledSurface) {
      return;
    }
    restoreSurface();
    styledSurface = surface;
    originalPaddingTop = surface.style.getPropertyValue("padding-top");
    originalPaddingTopPriority = surface.style.getPropertyPriority("padding-top");
    const paddingTop = Number.parseFloat(hostWindow.getComputedStyle(surface).paddingTop);
    surface.style.setProperty("padding-top", `${paddingTop + height}px`, "important");
  }

  function restoreSurface() {
    if (!styledSurface) {
      return;
    }
    styledSurface.style.setProperty("padding-top", originalPaddingTop, originalPaddingTopPriority);
    styledSurface = null;
  }

  function hideAction(action: HTMLElement) {
    if (action === hiddenAction) {
      return;
    }
    restoreAction();
    hiddenAction = action;
    originalActionVisibility = action.style.getPropertyValue("visibility");
    originalActionVisibilityPriority = action.style.getPropertyPriority("visibility");
    action.style.setProperty("visibility", "hidden", "important");
  }

  function restoreAction() {
    if (!hiddenAction) {
      return;
    }
    hiddenAction.style.setProperty(
      "visibility",
      originalActionVisibility,
      originalActionVisibilityPriority,
    );
    hiddenAction = null;
  }

  function restoreReservation() {
    restoreSurface();
    restoreAction();
  }

  function findComposerSurface(composer: HTMLElement, boundary: HTMLElement) {
    const surface = composer.closest<HTMLElement>(adapter.layout.surfaceSelector);
    return surface && surface !== boundary && boundary.contains(surface) ? surface : null;
  }

  function findComposerBoundary(composer: HTMLElement) {
    return adapter.layout.boundarySelector
      ? composer.closest<HTMLElement>(adapter.layout.boundarySelector)
      : (composer.closest<HTMLElement>("form") ?? hostDocument.body);
  }

  function findComposerAction(root: HTMLElement, surfaceRect: DOMRect) {
    let rightmostAction: HTMLElement | null = null;
    let rightmostEdge = Number.NEGATIVE_INFINITY;
    for (const action of root.querySelectorAll<HTMLElement>(adapter.layout.actionSelector)) {
      const rect = action.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      if (
        (adapter.layout.visibleActionsOnly &&
          hostWindow.getComputedStyle(action).visibility === "hidden") ||
        rect.width <= 0 ||
        rect.height <= 0 ||
        centerX < surfaceRect.left ||
        centerX > surfaceRect.right ||
        centerY < surfaceRect.top ||
        centerY > surfaceRect.bottom ||
        rect.right <= rightmostEdge
      ) {
        continue;
      }
      rightmostAction = action;
      rightmostEdge = rect.right;
    }
    return rightmostAction;
  }

  return { current, reserveAnnotationRow, subscribe };
}

function fallbackRectangle(surface: DOMRect): SelectionRect {
  const left = surface.right - FALLBACK_ACTION.width - FALLBACK_ACTION.rightInset;
  const top = surface.bottom - FALLBACK_ACTION.height - FALLBACK_ACTION.bottomInset;
  return {
    bottom: top + FALLBACK_ACTION.height,
    height: FALLBACK_ACTION.height,
    left,
    right: left + FALLBACK_ACTION.width,
    top,
    width: FALLBACK_ACTION.width,
  };
}
