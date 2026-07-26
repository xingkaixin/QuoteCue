import { useEffect } from "react";

import { requireActiveHost } from "@/features/host/active-host";
import { useI18n } from "@/features/i18n/I18nProvider";

import { useSelectionCapture, type SelectionCaptureOptions } from "./use-selection-capture";

export function NativeSelectionPresentation(options: SelectionCaptureOptions) {
  const host = requireActiveHost();
  const { messages } = useI18n();
  const { activate, selection } = useSelectionCapture(options);

  useEffect(() => {
    if (!selection) {
      return;
    }

    return host.selection.mountAction({
      label: messages.addAnnotation,
      onActivate: activate,
      rect: selection.actionRect,
    });
  }, [activate, host, messages.addAnnotation, selection]);

  return null;
}
