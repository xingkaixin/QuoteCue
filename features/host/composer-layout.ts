import {
  available,
  unavailable,
  type ComposerLayoutCapability,
  type HostContext,
  type HostResult,
} from "./host-context";
import type { HostLayout, SelectionRect } from "@/features/host-port/host-port";

export function createComposerLayout(
  context: HostContext,
  currentComposer: () => HTMLElement | null,
) {
  const { adapter, document: hostDocument, signals, window: hostWindow } = context;
  const surfaceByComposer = new WeakMap<HTMLElement, HTMLElement>();

  function current(): HostResult<HostLayout> {
    const composer = currentComposer();
    if (!composer) {
      return unavailable("composer-unavailable");
    }

    const boundary = composer.closest<HTMLElement>("form");
    const surface = findComposerSurface(composer, boundary ?? hostDocument.body);
    if (!surface) {
      return unavailable("composer-surface-unavailable");
    }

    const rect = surface.getBoundingClientRect();
    const action = findComposerAction(boundary ?? surface, rect);
    const actionRect = action?.getBoundingClientRect();
    const send = actionRect
      ? rectangleSnapshot(actionRect)
      : fallbackRectangle(rect, adapter.layout.fallbackAction);
    return available({
      action,
      send,
      summary: { left: rect.left + 12, top: rect.top + 8 },
      surface,
    });
  }

  function subscribe(callback: () => void) {
    const stopMutationObservation = signals.observeMutations(callback, { childList: true });
    const stopViewportObservation = signals.observeViewport(callback);

    return () => {
      stopMutationObservation();
      stopViewportObservation();
    };
  }

  function findComposerSurface(composer: HTMLElement, boundary: HTMLElement) {
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

  return { current, subscribe };
}

function fallbackRectangle(
  surface: DOMRect,
  fallback: ComposerLayoutCapability["fallbackAction"],
): SelectionRect {
  const left = surface.right - fallback.width - fallback.rightInset;
  const top = surface.bottom - fallback.height - fallback.bottomInset;
  return {
    bottom: top + fallback.height,
    height: fallback.height,
    left,
    right: left + fallback.width,
    top,
    width: fallback.width,
  };
}

function rectangleSnapshot(rect: DOMRect): SelectionRect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}

export function composerLayout(
  actionSelector: string,
  fallbackAction: ComposerLayoutCapability["fallbackAction"] = {
    bottomInset: 8,
    height: 36,
    rightInset: 8,
    width: 36,
  },
): ComposerLayoutCapability {
  return { actionSelector, fallbackAction };
}
