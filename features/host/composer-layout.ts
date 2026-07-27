import type { HostLayout, SelectionRect } from "@/features/host-port/host-port";
import { toSelectionRect } from "@/features/host-port/selection-rect";

import { available, once, unavailable, type HostContext, type HostResult } from "./host-context";

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
  const { adapter, document: hostDocument, signals, window: hostWindow } = context;
  const surfaceByComposer = new WeakMap<HTMLElement, HTMLElement>();
  let activeReservation: { height: number } | null = null;
  let styledSurface: HTMLElement | null = null;
  let hiddenAction: HTMLElement | null = null;
  let originalPaddingTop = "";
  let originalPaddingTopPriority = "";
  let originalActionVisibility = "";
  let originalActionVisibilityPriority = "";

  function current(): HostResult<HostLayout> {
    const elements = currentElements();
    if (elements.status === "unavailable") {
      reconcileReservation(null);
      return elements;
    }
    reconcileReservation(elements.value);
    return available({
      send: elements.value.send,
      summary: elements.value.summary,
    });
  }

  function currentElements(): HostResult<ComposerLayoutElements> {
    const composer = currentComposer();
    if (!composer) {
      return unavailable("composer-unavailable");
    }

    const boundary = findComposerBoundary(composer);
    if (!boundary) {
      return unavailable("composer-surface-unavailable");
    }
    const surface = findComposerSurface(composer, boundary);
    if (!surface) {
      return unavailable("composer-surface-unavailable");
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
    let observedSurface: HTMLElement | null = null;
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(callback);
    const refresh = () => {
      const elements = currentElements();
      const surface = elements.status === "available" ? elements.value.surface : null;
      if (surface !== observedSurface) {
        resizeObserver?.disconnect();
        observedSurface = surface;
        if (surface) {
          resizeObserver?.observe(surface);
        }
      }
      callback();
    };
    const stopMutationObservation = signals.observeMutations(refresh, { childList: true });
    const stopViewportObservation = signals.observeViewport(refresh);
    const elements = currentElements();
    observedSurface = elements.status === "available" ? elements.value.surface : null;
    if (observedSurface) {
      resizeObserver?.observe(observedSurface);
    }

    return () => {
      stopMutationObservation();
      stopViewportObservation();
      resizeObserver?.disconnect();
    };
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
    if (adapter.layout.surfaceSelector) {
      const surface = composer.closest<HTMLElement>(adapter.layout.surfaceSelector);
      return surface && boundary.contains(surface) ? surface : null;
    }

    const cachedSurface = surfaceByComposer.get(composer);
    if (
      cachedSurface &&
      cachedSurface !== boundary &&
      boundary.contains(cachedSurface) &&
      cachedSurface.contains(composer) &&
      isComposerSurface(cachedSurface)
    ) {
      return cachedSurface;
    }

    let candidate = composer.parentElement;
    while (candidate && candidate !== boundary) {
      if (isComposerSurface(candidate)) {
        surfaceByComposer.set(composer, candidate);
        return candidate;
      }
      candidate = candidate.parentElement;
    }
    surfaceByComposer.delete(composer);
    return null;
  }

  function findComposerBoundary(composer: HTMLElement) {
    return adapter.layout.boundarySelector
      ? composer.closest<HTMLElement>(adapter.layout.boundarySelector)
      : (composer.closest<HTMLElement>("form") ?? hostDocument.body);
  }

  function isComposerSurface(candidate: HTMLElement) {
    const style = hostWindow.getComputedStyle(candidate);
    return (
      Number.parseFloat(style.borderTopLeftRadius) > 0 &&
      style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      style.backgroundColor !== "transparent"
    );
  }

  function findComposerAction(root: HTMLElement, surfaceRect: DOMRect) {
    let rightmostAction: HTMLElement | null = null;
    let rightmostEdge = Number.NEGATIVE_INFINITY;
    for (const action of root.querySelectorAll<HTMLElement>(adapter.layout.actionSelector)) {
      const rect = action.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      if (
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
