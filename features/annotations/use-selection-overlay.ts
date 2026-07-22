import { useCallback, useEffect, useState } from "react";

import type { SelectionActionState } from "./annotation";
import { isQuoteCueEvent } from "./is-quotecue-event";
import { captureAssistantSelection } from "./selection-anchor";

export function useSelectionOverlay(isEnabled: boolean, resetKey: string) {
  const [selectionAction, setSelectionAction] = useState<SelectionActionState>({
    status: "hidden",
  });
  const dismissSelectionAction = useCallback(() => setSelectionAction({ status: "hidden" }), []);

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
        const draft = captureAssistantSelection();
        setSelectionAction(draft ? { status: "action", draft } : { status: "hidden" });
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

  return { dismissSelectionAction, selectionAction };
}
