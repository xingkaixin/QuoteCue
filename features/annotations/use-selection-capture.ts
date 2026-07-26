import { useCallback, useEffect, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";
import type { ConversationIdentity } from "@/features/host-port/host-port";

import type { AnchoredSelection, SelectionCapture } from "./annotation";
import { isQuoteCueEvent } from "./is-quotecue-event";

export type SelectionCaptureOptions = {
  conversationIdentity: ConversationIdentity;
  isEnabled: boolean;
  onActivate: (selection: AnchoredSelection) => void;
};

export function useSelectionCapture({
  conversationIdentity,
  isEnabled,
  onActivate,
}: SelectionCaptureOptions) {
  const host = useHost();
  const [selection, setSelection] = useState<SelectionCapture | null>(null);
  const dismiss = useCallback(() => setSelection(null), []);
  const activate = useCallback(() => {
    if (!selection) {
      return;
    }
    onActivate({ anchor: selection.anchor, rect: selection.rect });
    dismiss();
  }, [dismiss, onActivate, selection]);

  useEffect(dismiss, [conversationIdentity, dismiss]);

  useEffect(() => {
    if (!isEnabled) {
      dismiss();
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
        const result = host.selection.capture();
        setSelection(result.status === "available" ? result.value : null);
      });
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
      }
    };

    document.addEventListener("mouseup", captureSelection, true);
    document.addEventListener("keyup", captureSelection, true);
    document.addEventListener("keydown", dismissOnEscape, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);

    return () => {
      if (captureFrame !== undefined) {
        cancelAnimationFrame(captureFrame);
      }
      document.removeEventListener("mouseup", captureSelection, true);
      document.removeEventListener("keyup", captureSelection, true);
      document.removeEventListener("keydown", dismissOnEscape, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [dismiss, host, isEnabled]);

  return { activate, selection };
}
