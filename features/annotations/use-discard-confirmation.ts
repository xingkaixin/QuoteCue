import { useCallback, useEffect, useRef, useState } from "react";

type UseDiscardConfirmationOptions = {
  focusEditor: () => void;
  isDirty: boolean;
  onDiscard: () => void;
};

export function useDiscardConfirmation({
  focusEditor,
  isDirty,
  onDiscard,
}: UseDiscardConfirmationOptions) {
  const [state, setState] = useState<"editing" | "confirming-discard">("editing");
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state === "confirming-discard") {
      continueButtonRef.current?.focus();
    }
  }, [state]);

  const requestDiscard = useCallback(() => {
    if (!isDirty) {
      onDiscard();
      return true;
    }
    setState("confirming-discard");
    return false;
  }, [isDirty, onDiscard]);

  const continueEditing = useCallback(() => {
    setState("editing");
    requestAnimationFrame(focusEditor);
  }, [focusEditor]);

  return {
    confirmDiscard: onDiscard,
    continueButtonRef,
    continueEditing,
    isConfirmingDiscard: state === "confirming-discard",
    requestDiscard,
  };
}
