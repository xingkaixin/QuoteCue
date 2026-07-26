import { useLayoutEffect, useRef, useState } from "react";

import { useI18n } from "@/features/i18n/I18nProvider";
import { positionAdjacentToRect } from "@/features/layout/floating-position";
import { useVisualViewportBounds } from "@/features/layout/use-visual-viewport";

import type { SelectionOverlayAction } from "./use-selection-overlay";

const BUTTON_HEIGHT = 32;
const BUTTON_WIDTH = 96;
const VIEWPORT_MARGIN = 8;

export function SelectionActionButton({ onActivate, rect }: SelectionOverlayAction) {
  const { messages } = useI18n();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const viewport = useVisualViewportBounds();
  const [size, setSize] = useState({ height: BUTTON_HEIGHT, width: BUTTON_WIDTH });
  const { left, top } = positionAdjacentToRect(rect, size, {
    gap: VIEWPORT_MARGIN,
    margin: VIEWPORT_MARGIN,
    viewport,
  });

  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const measure = () => {
      const bounds = button.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        setSize({ height: bounds.height, width: bounds.width });
      }
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(button);
    measure();
    return () => observer?.disconnect();
  }, []);

  return (
    <button
      aria-label={messages.addAnnotation}
      className="quotecue-interactive qc-surface qc-divider qc-pressable qc-focus fixed z-[2147483646] flex h-8 cursor-pointer items-center rounded-full border px-3 text-sm font-medium shadow-sm"
      onClick={onActivate}
      onMouseDown={(event) => event.preventDefault()}
      ref={buttonRef}
      style={{ left, top }}
      type="button"
    >
      QuoteCue
    </button>
  );
}
