import { available, unavailable, type HostContext, type HostResult } from "./host-context";

type HostComposerLayout = {
  action: HTMLElement | null;
  send: { height: number; left: number; top: number; width: number };
  summary: { left: number; top: number };
  surface: HTMLElement;
};

export function createComposerLayout(
  context: HostContext,
  currentComposer: () => HTMLElement | null,
) {
  const { adapter, document: hostDocument, signals, window: hostWindow } = context;

  function current(): HostResult<HostComposerLayout> {
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
    return available({
      action,
      send: actionRect
        ? {
            height: actionRect.height,
            left: actionRect.left,
            top: actionRect.top,
            width: actionRect.width,
          }
        : { height: 36, left: rect.right - 44, top: rect.bottom - 44, width: 36 },
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
    let candidate = composer.parentElement;
    while (candidate && candidate !== boundary) {
      const style = hostWindow.getComputedStyle(candidate);
      const hasRoundedBackground =
        Number.parseFloat(style.borderTopLeftRadius) > 0 &&
        style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        style.backgroundColor !== "transparent";
      if (hasRoundedBackground) {
        return candidate;
      }
      candidate = candidate.parentElement;
    }
    return null;
  }

  function findComposerAction(root: HTMLElement, surfaceRect: DOMRect) {
    return Array.from(root.querySelectorAll<HTMLElement>(adapter.composerButtonSelector))
      .map((button) => ({ button, rect: button.getBoundingClientRect() }))
      .filter(({ rect }) => {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          centerX >= surfaceRect.left &&
          centerX <= surfaceRect.right &&
          centerY >= surfaceRect.top &&
          centerY <= surfaceRect.bottom
        );
      })
      .sort((left, right) => right.rect.right - left.rect.right)[0]?.button;
  }

  return { current, subscribe };
}
