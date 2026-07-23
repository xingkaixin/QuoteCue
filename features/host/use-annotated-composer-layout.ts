import { useEffect, useState } from "react";

import { activeHost } from "./active-host";

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
    let hiddenAction: HTMLElement | null = null;
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

    function hideAction(action: HTMLElement) {
      if (action === hiddenAction) {
        return;
      }
      restoreAction();
      hiddenAction = action;
      originalActionVisibility = action.style.visibility;
      action.style.visibility = "hidden";
    }

    function refresh() {
      const result = activeHost.layout.current();
      if (result.status === "unavailable") {
        restoreSurface();
        restoreAction();
        setLayout(null);
        return;
      }

      const { action, send, summary, surface } = result.value;
      styleSurface(surface);
      if (action) {
        hideAction(action);
      } else {
        restoreAction();
      }
      const nextLayout = { send, summary };
      setLayout((current) => (sameLayout(current, nextLayout) ? current : nextLayout));
    }

    function scheduleRefresh() {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refresh, POSITION_REFRESH_MS);
    }

    const stopObserving = activeHost.layout.subscribe(scheduleRefresh);
    refresh();

    return () => {
      stopObserving();
      window.clearTimeout(refreshTimer);
      restoreSurface();
      restoreAction();
    };
  }, [isActive]);

  return layout;
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
