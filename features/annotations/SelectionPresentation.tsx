import type { ComponentType } from "react";

import { activeHost } from "@/features/host/active-host";
import type { SiteAdapter } from "@/features/host/dom-host";

import { NativeSelectionPresentation } from "./NativeSelectionPresentation";
import { OverlaySelectionPresentation } from "./OverlaySelectionPresentation";
import type { SelectionCaptureOptions } from "./use-selection-capture";

const PRESENTATIONS: Record<
  SiteAdapter["selectionPresentation"]["mode"],
  ComponentType<SelectionCaptureOptions>
> = {
  "native-toolbar": NativeSelectionPresentation,
  overlay: OverlaySelectionPresentation,
};

export function SelectionPresentation(options: SelectionCaptureOptions) {
  const Presentation = PRESENTATIONS[activeHost.selection.presentation];
  return <Presentation {...options} />;
}
