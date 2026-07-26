import type { ComponentType } from "react";

import { requireActiveHost } from "@/features/host/active-host";
import type { SelectionPresentationMode } from "@/features/host-port/host-port";

import { NativeSelectionPresentation } from "./NativeSelectionPresentation";
import { OverlaySelectionPresentation } from "./OverlaySelectionPresentation";
import type { SelectionCaptureOptions } from "./use-selection-capture";

const PRESENTATIONS: Record<SelectionPresentationMode, ComponentType<SelectionCaptureOptions>> = {
  "native-toolbar": NativeSelectionPresentation,
  overlay: OverlaySelectionPresentation,
};

export function SelectionPresentation(options: SelectionCaptureOptions) {
  const Presentation = PRESENTATIONS[requireActiveHost().selection.presentation];
  return <Presentation {...options} />;
}
