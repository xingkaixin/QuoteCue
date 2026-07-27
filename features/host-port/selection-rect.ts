import type { SelectionRect } from "./host-port";

export function toSelectionRect(rect: SelectionRect): SelectionRect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}
