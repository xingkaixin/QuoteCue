import { useCallback, useEffect, useState } from "react";

import type { SelectionActionState } from "./annotation";
import { captureAssistantSelection } from "./selection-anchor";

const ROOT_ATTRIBUTE = "data-quotecue-root";
const HOST_ATTRIBUTE = "data-quotecue-host";

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
      if (event.composedPath().some(isQuoteCueElement)) {
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

function isQuoteCueElement(target: EventTarget) {
  return (
    target instanceof Element && target.closest(`[${HOST_ATTRIBUTE}], [${ROOT_ATTRIBUTE}]`) !== null
  );
}
