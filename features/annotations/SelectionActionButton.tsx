import { useI18n } from "@/features/i18n/I18nProvider";

import type { SelectionOverlayAction } from "./use-selection-overlay";

const BUTTON_HEIGHT = 32;
const BUTTON_WIDTH = 96;
const VIEWPORT_MARGIN = 8;

export function SelectionActionButton({ onActivate, rect }: SelectionOverlayAction) {
  const { messages } = useI18n();
  const left = Math.min(
    Math.max(rect.right + VIEWPORT_MARGIN, VIEWPORT_MARGIN),
    window.innerWidth - BUTTON_WIDTH - VIEWPORT_MARGIN,
  );
  const preferredTop = rect.bottom + VIEWPORT_MARGIN;
  const top =
    preferredTop + BUTTON_HEIGHT > window.innerHeight - VIEWPORT_MARGIN
      ? rect.top - BUTTON_HEIGHT - VIEWPORT_MARGIN
      : preferredTop;

  return (
    <button
      aria-label={messages.addAnnotation}
      className="quotecue-interactive qc-surface qc-divider qc-pressable qc-focus fixed z-[2147483646] flex h-8 cursor-pointer items-center rounded-full border px-3 text-sm font-medium shadow-sm"
      onClick={onActivate}
      onMouseDown={(event) => event.preventDefault()}
      style={{ left, top }}
      type="button"
    >
      QuoteCue
    </button>
  );
}
