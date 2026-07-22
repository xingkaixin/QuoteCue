import { Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useI18n } from "@/features/i18n/I18nProvider";

import type { SelectionDraft } from "./annotation";
import { useAnnotationEditorPosition } from "./annotation-editor-position";
import { SecureTextField, type SecureTextFieldHandle } from "./SecureTextField";
import { useDismissalWarning } from "./use-dismissal-warning";
import { useOutsideDiscard } from "./use-outside-discard";

type AnnotationQuickInputProps = {
  draft: SelectionDraft;
  onClose: () => void;
  onSave: (comment: string) => void;
};

const QUICK_INPUT_SIZE = { height: 48, width: 320 };

export function AnnotationQuickInput({ draft, onClose, onSave }: AnnotationQuickInputProps) {
  const { messages } = useI18n();
  const [comment, setComment] = useState("");
  const inputRef = useRef<SecureTextFieldHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusEditor = useCallback(() => inputRef.current?.focus(), []);
  const { requestDismissal, resetWarning } = useDismissalWarning({
    focusEditor,
    isDirty: comment !== "",
    onDismiss: onClose,
    rootRef,
  });
  const position = useAnnotationEditorPosition(draft, rootRef, QUICK_INPUT_SIZE);

  useOutsideDiscard(rootRef, requestDismissal);

  return (
    <div
      className="quotecue-interactive qc-surface qc-divider fixed flex h-12 w-[320px] max-w-[calc(100dvw-1.5rem)] items-center gap-1.5 rounded-full border p-1 pl-4 shadow-sm"
      onPointerDown={resetWarning}
      ref={rootRef}
      style={position}
    >
      <SecureTextField
        ariaLabel={messages.annotationContent}
        className="h-9 min-w-0 flex-1 rounded-lg border-0 bg-transparent outline-none"
        kind="input"
        name="quotecue-annotation-comment"
        onCancel={onClose}
        onChange={(value) => {
          resetWarning();
          setComment(value);
        }}
        onSave={(value) => onSave(value.trim())}
        placeholder={messages.optionalComment}
        ref={inputRef}
        value={comment}
      />
      <button
        aria-label={messages.saveAnnotation}
        className="qc-primary qc-pressable qc-focus flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full"
        onClick={() => onSave(comment.trim())}
        type="button"
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
