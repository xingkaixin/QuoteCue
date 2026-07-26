import { SelectionActionButton } from "./SelectionActionButton";
import { useSelectionCapture, type SelectionCaptureOptions } from "./use-selection-capture";

export function OverlaySelectionPresentation(options: SelectionCaptureOptions) {
  const { activate, selection } = useSelectionCapture(options);
  return selection ? <SelectionActionButton onActivate={activate} rect={selection.rect} /> : null;
}
