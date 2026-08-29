import type { SelectionRect } from "@/features/host-port/host-port";
import { QUOTECUE_HOST_SELECTOR, QUOTECUE_NATIVE_ACTION_ATTR } from "@/lib/dom-identity";

import type { HostContext } from "./host-context";
import type { SelectionToolbarBounds } from "./site-adapter";

const NATIVE_ACTION_DISCOVERY_WINDOW_MS = 2_000;
const DEFAULT_SELECTION_TOOLBAR_BOUNDS: SelectionToolbarBounds = {
  maxHeight: 80,
  maxVerticalDistance: 24,
  maxWidth: 480,
  minHeight: 28,
};

type SelectionToolbarCandidate = {
  actionRow: HTMLElement;
  distance: number;
};

export function createNativeActionMount(
  context: HostContext,
  toolbarBounds: SelectionToolbarBounds = DEFAULT_SELECTION_TOOLBAR_BOUNDS,
) {
  const { document: hostDocument, signals, window: hostWindow } = context;

  return function mount(options: { label: string; onActivate: () => void; rect: SelectionRect }) {
    let action: HTMLButtonElement | null = null;
    let insertFrame: number | null = null;
    let discoveryTimer: number | undefined;
    let stopObserving: () => void = () => undefined;
    const discoveryDeadline = hostWindow.performance.now() + NATIVE_ACTION_DISCOVERY_WINDOW_MS;

    const preserveSelection = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const removeAction = () => {
      action?.remove();
      action = null;
    };
    const stopDiscovery = () => {
      stopObserving();
      if (discoveryTimer !== undefined) {
        hostWindow.clearTimeout(discoveryTimer);
        discoveryTimer = undefined;
      }
      if (insertFrame !== null) {
        hostWindow.cancelAnimationFrame(insertFrame);
        insertFrame = null;
      }
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

      action = hostDocument.createElement("button");
      action.type = "button";
      action.className = sourceAction.className;
      action.setAttribute(QUOTECUE_NATIVE_ACTION_ATTR, "");
      action.setAttribute("aria-label", options.label);
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
      if (
        action?.isConnected ||
        insertFrame !== null ||
        hostWindow.performance.now() >= discoveryDeadline
      ) {
        return;
      }
      insertFrame = hostWindow.requestAnimationFrame(() => {
        insertFrame = null;
        insertAction();
      });
    };
    stopObserving = signals.observeMutations(scheduleInsert, { childList: true });
    discoveryTimer = hostWindow.setTimeout(stopDiscovery, NATIVE_ACTION_DISCOVERY_WINDOW_MS);

    insertAction();

    return () => {
      stopDiscovery();
      removeAction();
    };
  };

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
    if (
      candidate.matches(QUOTECUE_HOST_SELECTOR) ||
      hostWindow.getComputedStyle(candidate).position !== "fixed"
    ) {
      return null;
    }

    const rect = candidate.getBoundingClientRect();
    const horizontalOverlap =
      Math.min(selectionRect.right, rect.right) - Math.max(selectionRect.left, rect.left);
    const verticalDistance = Math.max(
      selectionRect.top - rect.bottom,
      rect.top - selectionRect.bottom,
      0,
    );
    const isNearbyToolbar =
      rect.width <= toolbarBounds.maxWidth &&
      rect.height >= toolbarBounds.minHeight &&
      rect.height <= toolbarBounds.maxHeight &&
      horizontalOverlap > 0 &&
      verticalDistance <= toolbarBounds.maxVerticalDistance;
    if (!isNearbyToolbar) {
      return null;
    }

    const actionRow = actionRowWithin(candidate);
    return actionRow ? { actionRow, distance: verticalDistance } : null;
  }
}

function actionRowWithin(candidate: Element) {
  const parents = new Set<HTMLElement>();
  for (const button of candidate.querySelectorAll("button")) {
    if (button.parentElement) {
      parents.add(button.parentElement);
    }
  }
  for (const parent of parents) {
    if (
      parent.children.length > 0 &&
      Array.from(parent.children).every((child) => child.tagName === "BUTTON")
    ) {
      return parent;
    }
  }
  return null;
}
