import { useCallback, useEffect, useState } from "react";

import type { SelectionCapture, SelectionDraft } from "./annotation";
import { isQuoteCueEvent } from "./is-quotecue-event";
import { activeHost } from "@/features/host/active-host";
import { useI18n } from "@/features/i18n/I18nProvider";

export function useSelectionOverlay(
  isEnabled: boolean,
  resetKey: string,
  onActivate: (draft: SelectionDraft) => void,
) {
  const { messages } = useI18n();
  const [selectionDraft, setSelectionDraft] = useState<SelectionCapture | null>(null);
  const dismissSelectionAction = useCallback(() => setSelectionDraft(null), []);
  const activateSelection = useCallback(() => {
    if (!selectionDraft) {
      return;
    }
    onActivate({ anchor: selectionDraft.anchor, rect: selectionDraft.rect });
    dismissSelectionAction();
  }, [dismissSelectionAction, onActivate, selectionDraft]);

  useEffect(dismissSelectionAction, [dismissSelectionAction, resetKey]);

  useEffect(() => {
    if (!isEnabled) {
      dismissSelectionAction();
      return;
    }

    let captureFrame: number | undefined;
    const captureSelection = (event: Event) => {
      if (isQuoteCueEvent(event)) {
        return;
      }
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        return;
      }

      if (captureFrame !== undefined) {
        cancelAnimationFrame(captureFrame);
      }
      captureFrame = requestAnimationFrame(() => {
        const result = activeHost.selection.capture();
        setSelectionDraft(result.status === "available" ? result.value : null);
      });
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissSelectionAction();
      }
    };

    document.addEventListener("mouseup", captureSelection, true);
    document.addEventListener("keyup", captureSelection, true);
    document.addEventListener("keydown", dismissOnEscape, true);
    window.addEventListener("resize", dismissSelectionAction);
    window.addEventListener("scroll", dismissSelectionAction, true);

    return () => {
      if (captureFrame !== undefined) {
        cancelAnimationFrame(captureFrame);
      }
      document.removeEventListener("mouseup", captureSelection, true);
      document.removeEventListener("keyup", captureSelection, true);
      document.removeEventListener("keydown", dismissOnEscape, true);
      window.removeEventListener("resize", dismissSelectionAction);
      window.removeEventListener("scroll", dismissSelectionAction, true);
    };
  }, [dismissSelectionAction, isEnabled]);

  useEffect(() => {
    if (!selectionDraft || activeHost.selection.actionMode !== "native-toolbar") {
      return;
    }

    return activeHost.selection.mountAction({
      label: messages.addAnnotation,
      onActivate: activateSelection,
      rect: selectionDraft.actionRect,
    });
  }, [activateSelection, messages.addAnnotation, selectionDraft]);

  if (activeHost.selection.actionMode !== "overlay" || !selectionDraft) {
    return null;
  }
  return { onActivate: activateSelection, rect: selectionDraft.rect };
}

export type SelectionOverlayAction = {
  onActivate: () => void;
  rect: SelectionCapture["rect"];
};
