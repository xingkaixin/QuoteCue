import { useCallback, useRef, useState } from "react";

import type { SecureTextFieldHandle } from "@/features/secure-field/SecureTextField";
import type { SelectionRect } from "@/features/host-port/host-port";
import type { FloatingElementSize } from "@/features/layout/floating-position";

import { useAnnotationEditorPosition } from "./annotation-editor-position";
import { useDismissalWarning } from "./use-dismissal-warning";
import { useOutsideDiscard } from "./use-outside-discard";

type UseAnnotationCommentSurfaceOptions = {
  initialComment: string;
  onDismiss: () => void;
  onSave: (comment: string) => void;
  rect: SelectionRect;
  size: FloatingElementSize;
};

export function useAnnotationCommentSurface({
  initialComment,
  onDismiss,
  onSave,
  rect,
  size,
}: UseAnnotationCommentSurfaceOptions) {
  const [comment, setComment] = useState(initialComment);
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<SecureTextFieldHandle>(null);
  const focusEditor = useCallback(() => fieldRef.current?.focus(), []);
  const { requestDismissal, resetWarning } = useDismissalWarning({
    focusEditor,
    isDirty: comment !== initialComment,
    onDismiss,
    rootRef,
  });
  const position = useAnnotationEditorPosition(rect, rootRef, size);
  const changeComment = useCallback(
    (value: string) => {
      resetWarning();
      setComment(value);
    },
    [resetWarning],
  );
  const saveValue = useCallback((value: string) => onSave(value.trim()), [onSave]);
  const saveComment = useCallback(() => saveValue(comment), [comment, saveValue]);

  useOutsideDiscard(rootRef, requestDismissal);

  return {
    commentFieldProps: {
      name: "quotecue-annotation-comment",
      onCancel: onDismiss,
      onChange: changeComment,
      onSave: saveValue,
      ref: fieldRef,
      value: comment,
    },
    position,
    resetWarning,
    rootRef,
    saveComment,
  };
}
