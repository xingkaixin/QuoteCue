import type { HostLayout, HostResult, SelectionRect } from "@/features/host-port/host-port";
import { toSelectionRect } from "@/features/host-port/selection-rect";

import type { HostContext } from "./host-context";
import { available, unavailable } from "./host-result";
import { once } from "./host-signals";

type ComposerLayoutElements = {
  action: HTMLElement | null;
  isSendControlPresent: boolean;
  send: SelectionRect;
  summary: HostLayout["summary"];
  surface: HTMLElement;
};

type InlineStyleOverride = {
  element: HTMLElement;
  property: string;
  value: string;
  priority: string;
};

const FALLBACK_ACTION = {
  bottomInset: 8,
  height: 36,
  rightInset: 8,
  width: 36,
};
const LAYOUT_REFRESH_INTERVAL_MS = 80;

export function createComposerLayout(
  context: HostContext,
  currentComposer: () => HTMLElement | null,
) {
  const { adapter, document: hostDocument, logger, signals, window: hostWindow } = context;
  let activeReservation: { height: number } | null = null;
  const layoutSubscribers = new Set<(layout: HostResult<HostLayout>) => void>();
  let resizeObserver: ResizeObserver | null = null;
  let actionObserver: MutationObserver | null = null;
  let observedSurface: HTMLElement | null = null;
  let stopSignalObservation: (() => void) | null = null;
  let styledSurface: InlineStyleOverride | null = null;
  let hiddenAction: InlineStyleOverride | null = null;
  let refreshTimer: number | undefined;
  let lastRefreshAt = Number.NEGATIVE_INFINITY;

  function current(): HostResult<HostLayout> {
    const elements = currentElements();
    return publicLayout(elements);
  }

  function refreshLayout(): HostResult<HostLayout> {
    lastRefreshAt = Date.now();
    const elements = currentElements();
    if (elements.status === "unavailable") {
      reconcileReservation(null);
      observeSurface(null);
    } else {
      reconcileReservation(elements.value);
      observeSurface(elements.value.surface);
    }
    return publicLayout(elements);
  }

  function publicLayout(elements: HostResult<ComposerLayoutElements>): HostResult<HostLayout> {
    if (elements.status === "unavailable") {
      return elements;
    }
    return available({
      isSendControlPresent: elements.value.isSendControlPresent,
      send: elements.value.send,
      summary: elements.value.summary,
    });
  }

  function observeSurface(surface: HTMLElement | null) {
    if (!needsObservation()) {
      observedSurface = null;
      return;
    }
    if (surface === observedSurface) {
      return;
    }
    resizeObserver?.disconnect();
    actionObserver?.disconnect();
    observedSurface = surface;
    if (surface) {
      resizeObserver?.observe(surface);
      actionObserver ??= new MutationObserver((records) => {
        // Reservation styles must not schedule another layout read.
        if (records.some((record) => record.attributeName !== "style")) {
          scheduleRefresh();
        }
      });
      actionObserver.observe(surface, { attributes: true, subtree: true });
    }
  }

  function currentElements(): HostResult<ComposerLayoutElements> {
    const composer = currentComposer();
    if (!composer) {
      return unavailable("composer-unavailable", logger);
    }

    const boundary = context.composerBoundary(composer);
    if (!boundary) {
      return unavailable("composer-surface-unavailable", logger);
    }
    const surface = findComposerSurface(composer, boundary);
    if (!surface) {
      return unavailable("composer-surface-unavailable", logger);
    }

    const rect = surface.getBoundingClientRect();
    const action = findComposerAction(boundary, rect);
    const actionRect = action?.getBoundingClientRect();
    const send = actionRect ? toSelectionRect(actionRect) : fallbackRectangle(rect);
    return available({
      action,
      isSendControlPresent: context.sendControl(composer) !== null,
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
    startObservation();
    publishRefresh();

    return once(() => {
      if (activeReservation !== reservation) {
        return;
      }
      activeReservation = null;
      restoreReservation();
      if (layoutSubscribers.size === 0) {
        stopObservation();
      } else {
        publishRefresh();
      }
    });
  }

  function subscribe(callback: (layout: HostResult<HostLayout>) => void) {
    layoutSubscribers.add(callback);
    startObservation();
    callback(refreshLayout());

    return once(() => {
      layoutSubscribers.delete(callback);
      if (!needsObservation()) {
        stopObservation();
      }
    });
  }

  function startObservation() {
    if (stopSignalObservation) {
      return;
    }
    resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleRefresh);
    hostDocument.addEventListener("input", handleComposerInput, true);
    const stopMutationObservation = signals.observeMutations(
      (records) => {
        if (mutationsAffectComposer(records)) {
          scheduleRefresh();
        }
      },
      { childList: true },
    );
    const stopViewportObservation = signals.observeViewport(scheduleRefresh);
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
    actionObserver?.disconnect();
    actionObserver = null;
    observedSurface = null;
    if (refreshTimer !== undefined) {
      hostWindow.clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
    lastRefreshAt = Number.NEGATIVE_INFINITY;
  }

  function needsObservation() {
    return activeReservation !== null || layoutSubscribers.size > 0;
  }

  function scheduleRefresh() {
    if (refreshTimer !== undefined) {
      return;
    }
    const delay = LAYOUT_REFRESH_INTERVAL_MS - (Date.now() - lastRefreshAt);
    if (delay <= 0) {
      publishRefresh();
      return;
    }
    refreshTimer = hostWindow.setTimeout(publishRefresh, delay);
  }

  function publishRefresh() {
    if (refreshTimer !== undefined) {
      hostWindow.clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
    const layout = refreshLayout();
    for (const subscriber of [...layoutSubscribers]) {
      subscriber(layout);
    }
  }

  function handleComposerInput(event: Event) {
    const composer = currentComposer();
    if (composer && event.target instanceof Node && composer.contains(event.target)) {
      scheduleRefresh();
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
    if (elements.isSendControlPresent && elements.action) {
      hideAction(elements.action);
    } else {
      restoreAction();
    }
  }

  function styleSurface(surface: HTMLElement, height: number) {
    if (surface === styledSurface?.element) {
      return;
    }
    restoreSurface();
    const paddingTop = Number.parseFloat(hostWindow.getComputedStyle(surface).paddingTop);
    styledSurface = overrideInlineStyle(surface, "padding-top", `${paddingTop + height}px`);
  }

  function restoreSurface() {
    restoreInlineStyle(styledSurface);
    styledSurface = null;
  }

  function hideAction(action: HTMLElement) {
    if (action === hiddenAction?.element) {
      return;
    }
    restoreAction();
    hiddenAction = overrideInlineStyle(action, "visibility", "hidden");
  }

  function restoreAction() {
    restoreInlineStyle(hiddenAction);
    hiddenAction = null;
  }

  function isHostHidden(action: HTMLElement) {
    if (action !== hiddenAction?.element) {
      return hostWindow.getComputedStyle(action).visibility === "hidden";
    }
    restoreInlineStyle(hiddenAction);
    try {
      return hostWindow.getComputedStyle(action).visibility === "hidden";
    } finally {
      action.style.setProperty("visibility", "hidden", "important");
    }
  }

  function restoreReservation() {
    restoreSurface();
    restoreAction();
  }

  function findComposerSurface(composer: HTMLElement, boundary: HTMLElement) {
    const surface = composer.closest<HTMLElement>(adapter.layout.surfaceSelector);
    return surface && surface !== boundary && boundary.contains(surface) ? surface : null;
  }

  function findComposerAction(root: HTMLElement, surfaceRect: DOMRect) {
    let rightmostAction: HTMLElement | null = null;
    let rightmostEdge = Number.NEGATIVE_INFINITY;
    for (const action of root.querySelectorAll<HTMLElement>(adapter.layout.actionSelector)) {
      const rect = action.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      if (
        (adapter.layout.visibleActionsOnly && isHostHidden(action)) ||
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

function overrideInlineStyle(
  element: HTMLElement,
  property: string,
  value: string,
): InlineStyleOverride {
  const original = {
    element,
    property,
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  };
  element.style.setProperty(property, value, "important");
  return original;
}

function restoreInlineStyle(override: InlineStyleOverride | null) {
  if (override) {
    override.element.style.setProperty(override.property, override.value, override.priority);
  }
}
