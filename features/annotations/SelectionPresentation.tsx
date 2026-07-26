import type { ComponentType } from "react";

import { useHost } from "@/features/host-port/HostProvider";
import type { SelectionPresentationMode } from "@/features/host-port/host-port";

import { NativeSelectionPresentation } from "./NativeSelectionPresentation";
import { OverlaySelectionPresentation } from "./OverlaySelectionPresentation";
import type { SelectionCaptureOptions } from "./use-selection-capture";

const PRESENTATIONS: Record<SelectionPresentationMode, ComponentType<SelectionCaptureOptions>> = {
  "native-toolbar": NativeSelectionPresentation,
  overlay: OverlaySelectionPresentation,
};

export function SelectionPresentation(options: SelectionCaptureOptions) {
  const host = useHost();
  const Presentation = PRESENTATIONS[host.selection.presentation];
  return <Presentation {...options} />;
}
