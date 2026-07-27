import { Plus } from "lucide-react";

import type { SelectionRect } from "@/features/host-port/host-port";
import { useI18n } from "@/features/i18n/I18nProvider";
import { SecureTextField } from "@/features/secure-field/SecureTextField";
import { QUOTECUE_INTERACTIVE_CLASS } from "@/lib/dom-identity";

import { useAnnotationCommentSurface } from "./use-annotation-comment-surface";

type AnnotationQuickInputProps = {
  onClose: () => void;
  onSave: (comment: string) => void;
  rect: SelectionRect;
};

const QUICK_INPUT_SIZE = { height: 48, width: 320 };

export function AnnotationQuickInput({ onClose, onSave, rect }: AnnotationQuickInputProps) {
  const { messages } = useI18n();
  const { commentFieldProps, position, resetWarning, rootRef, saveComment } =
    useAnnotationCommentSurface({
      initialComment: "",
      onDismiss: onClose,
      onSave,
      rect,
      size: QUICK_INPUT_SIZE,
    });

  return (
    <div
      className={`${QUOTECUE_INTERACTIVE_CLASS} qc-surface qc-divider fixed flex h-12 w-[320px] max-w-[calc(100dvw-1.5rem)] items-center gap-1.5 rounded-full border p-1 pl-4 shadow-sm`}
      onPointerDown={resetWarning}
      ref={rootRef}
      style={position}
    >
      <SecureTextField
        {...commentFieldProps}
        ariaLabel={messages.annotationContent}
        className="h-9 min-w-0 flex-1 rounded-lg border-0 bg-transparent outline-none"
        kind="input"
        placeholder={messages.optionalComment}
      />
      <button
        aria-label={messages.saveAnnotation}
        className="qc-primary qc-pressable qc-focus flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full"
        onClick={saveComment}
        type="button"
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
