import { useEffect, useState } from "react";

const COMPOSER_SELECTOR = "#prompt-textarea";
const ANNOTATION_ROW_HEIGHT = 40;
const POSITION_REFRESH_MS = 80;

export type ComposerPosition = {
  left: number;
  top: number;
};

export type ComposerRect = ComposerPosition & {
  height: number;
  width: number;
};

export type AnnotatedComposerLayout = {
  send: ComposerRect;
  summary: ComposerPosition;
};

export function useAnnotatedComposerLayout(isActive: boolean) {
  const [layout, setLayout] = useState<AnnotatedComposerLayout | null>(null);

  useEffect(() => {
    if (!isActive) {
      setLayout(null);
      return;
    }

    let refreshTimer: number | undefined;
    let styledSurface: HTMLElement | null = null;
    let hiddenAction: HTMLButtonElement | null = null;
    let originalPaddingTop = "";
    let originalPaddingTopPriority = "";
    let originalActionVisibility = "";
    const resizeObserver = new ResizeObserver(scheduleRefresh);

    function restoreSurface() {
      if (!styledSurface) {
        return;
      }
      styledSurface.style.setProperty(
        "padding-top",
        originalPaddingTop,
        originalPaddingTopPriority,
      );
      styledSurface = null;
      resizeObserver.disconnect();
    }

    function styleSurface(surface: HTMLElement) {
      if (surface === styledSurface) {
        return;
      }

      restoreSurface();
      styledSurface = surface;
      originalPaddingTop = surface.style.getPropertyValue("padding-top");
      originalPaddingTopPriority = surface.style.getPropertyPriority("padding-top");
      const paddingTop = Number.parseFloat(getComputedStyle(surface).paddingTop);
      surface.style.setProperty(
        "padding-top",
        `${paddingTop + ANNOTATION_ROW_HEIGHT}px`,
        "important",
      );
      resizeObserver.observe(surface);
    }

    function restoreAction() {
      if (!hiddenAction) {
        return;
      }
      hiddenAction.style.visibility = originalActionVisibility;
      hiddenAction = null;
    }

    function hideAction(action: HTMLButtonElement) {
      if (action === hiddenAction) {
        return;
      }
      restoreAction();
      hiddenAction = action;
      originalActionVisibility = action.style.visibility;
      action.style.visibility = "hidden";
    }

    function refresh() {
      const composer = document.querySelector<HTMLElement>(COMPOSER_SELECTOR);
      const form = composer?.closest<HTMLFormElement>("form");
      const surface = composer && form ? findComposerSurface(composer, form) : null;
      if (!surface || !form) {
        restoreSurface();
        setLayout(null);
        return;
      }

      styleSurface(surface);
      const rect = surface.getBoundingClientRect();
      const action = findComposerAction(form, rect);
      const actionRect = action?.getBoundingClientRect();
      if (action) {
        hideAction(action);
      } else {
        restoreAction();
      }
      const nextLayout = {
        summary: { left: rect.left + 12, top: rect.top + 8 },
        send: actionRect
          ? {
              height: actionRect.height,
              left: actionRect.left,
              top: actionRect.top,
              width: actionRect.width,
            }
          : { height: 36, left: rect.right - 44, top: rect.bottom - 44, width: 36 },
      };
      setLayout((current) => (sameLayout(current, nextLayout) ? current : nextLayout));
    }

    function scheduleRefresh() {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refresh, POSITION_REFRESH_MS);
    }

    const mutationObserver = new MutationObserver(scheduleRefresh);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleRefresh);
    window.addEventListener("scroll", scheduleRefresh, true);
    refresh();

    return () => {
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleRefresh);
      window.removeEventListener("scroll", scheduleRefresh, true);
      window.clearTimeout(refreshTimer);
      restoreSurface();
      restoreAction();
    };
  }, [isActive]);

  return layout;
}

function findComposerSurface(composer: HTMLElement, form: HTMLFormElement) {
  let candidate = composer.parentElement;
  while (candidate && candidate !== form) {
    const style = getComputedStyle(candidate);
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

function findComposerAction(form: HTMLFormElement, surfaceRect: DOMRect) {
  return Array.from(form.querySelectorAll<HTMLButtonElement>("button"))
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

function sameLayout(current: AnnotatedComposerLayout | null, next: AnnotatedComposerLayout) {
  return (
    current?.summary.left === next.summary.left &&
    current.summary.top === next.summary.top &&
    current.send.left === next.send.left &&
    current.send.top === next.send.top &&
    current.send.width === next.send.width &&
    current.send.height === next.send.height
  );
}
