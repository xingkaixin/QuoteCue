import { useEffect } from "react";

import type { NativeSelectionAction } from "@/features/host-port/host-port";
import { useI18n } from "@/features/i18n/I18nProvider";

import { useSelectionCapture, type SelectionCaptureOptions } from "./use-selection-capture";

type NativeSelectionPresentationProps = SelectionCaptureOptions & {
  nativeAction: NativeSelectionAction;
};

export function NativeSelectionPresentation({
  nativeAction,
  ...options
}: NativeSelectionPresentationProps) {
  const { messages } = useI18n();
  const { activate, selection } = useSelectionCapture(options);

  useEffect(() => {
    if (!selection) {
      return;
    }

    return nativeAction.mount({
      label: messages.addAnnotation,
      onActivate: activate,
      rect: selection.actionRect,
    });
  }, [activate, messages.addAnnotation, nativeAction, selection]);

  return null;
}
