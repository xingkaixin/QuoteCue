import { useCallback, useEffect, useState } from "react";

import type { ConversationIdentity } from "@/features/conversation/conversation-identity";
import { useHost } from "@/features/host-port/HostProvider";
import type { AnchoredSelection, SelectionCapture } from "@/features/host-port/host-port";

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

    return host.selection.observeCaptureIntent((intent) => {
      if (intent === "capture") {
        const result = host.selection.capture();
        setSelection(result.status === "available" ? result.value : null);
      } else {
        dismiss();
      }
    });
  }, [dismiss, host, isEnabled]);

  return { activate, selection };
}
