import { useHost } from "@/features/host-port/HostProvider";

import { NativeSelectionPresentation } from "./NativeSelectionPresentation";
import { OverlaySelectionPresentation } from "./OverlaySelectionPresentation";
import type { SelectionCaptureOptions } from "./use-selection-capture";

export function SelectionPresentation(options: SelectionCaptureOptions) {
  const host = useHost();
  return host.selection.presentation === "native-toolbar" ? (
    <NativeSelectionPresentation {...options} nativeAction={host.selection.nativeAction} />
  ) : (
    <OverlaySelectionPresentation {...options} />
  );
}
