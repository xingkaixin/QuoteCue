import type { RefObject } from "react";
import { useCallback, useRef } from "react";

const SHAKE_KEYFRAMES = [
  { transform: "translateX(0)" },
  { transform: "translateX(-8px)" },
  { transform: "translateX(8px)" },
  { transform: "translateX(-6px)" },
  { transform: "translateX(6px)" },
  { transform: "translateX(0)" },
];
const SHAKE_OPTIONS = {
  duration: 280,
  easing: "cubic-bezier(0.77, 0, 0.175, 1)",
};

type UseDismissalWarningOptions = {
  focusEditor: () => void;
  isDirty: boolean;
  onDismiss: () => void;
  rootRef: RefObject<HTMLElement | null>;
};

export function useDismissalWarning({
  focusEditor,
  isDirty,
  onDismiss,
  rootRef,
}: UseDismissalWarningOptions) {
  const hasWarnedRef = useRef(false);
  const isDismissingRef = useRef(false);

  const requestDismissal = useCallback(() => {
    if (isDismissingRef.current) {
      return true;
    }
    if (!isDirty || hasWarnedRef.current) {
      isDismissingRef.current = true;
      onDismiss();
      return true;
    }

    hasWarnedRef.current = true;
    const shouldReduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!shouldReduceMotion) {
      rootRef.current?.animate(SHAKE_KEYFRAMES, SHAKE_OPTIONS);
    }
    requestAnimationFrame(focusEditor);
    return false;
  }, [focusEditor, isDirty, onDismiss, rootRef]);

  const resetWarning = useCallback(() => {
    hasWarnedRef.current = false;
  }, []);

  return { requestDismissal, resetWarning };
}
