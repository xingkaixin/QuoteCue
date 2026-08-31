import { Plus } from "lucide-react";

import type { SelectionRect } from "@/features/host-port/host-port";
import { useI18n } from "@/features/i18n/I18nProvider";
import { SecureTextField } from "@/features/secure-field/SecureTextField";
import { QUOTECUE_INTERACTIVE_CLASS } from "@/lib/dom-identity";

import { useAnnotationCommentSurface } from "./use-annotation-comment-surface";

type AnnotationQuickInputProps = {
  bindSession: (requestDismissal: (() => boolean) | null) => void;
  onClose: () => void;
  onSave: (comment: string) => void;
  rect: SelectionRect;
  sourceRemoved: boolean;
  canSave: boolean;
};

const QUICK_INPUT_SIZE = { height: 48, width: 320 };

export function AnnotationQuickInput({
  bindSession,
  onClose,
  onSave,
  rect,
  sourceRemoved,
  canSave,
}: AnnotationQuickInputProps) {
  const { messages } = useI18n();
  const { commentFieldProps, position, resetWarning, rootRef, saveComment } =
    useAnnotationCommentSurface({
      bindSession,
      initialComment: "",
      onDismiss: onClose,
      onSave,
      rect,
      size: QUICK_INPUT_SIZE,
    });

  return (
    <div
      className={`${QUOTECUE_INTERACTIVE_CLASS} qc-surface qc-divider fixed w-[320px] max-w-[calc(100dvw-1.5rem)] border p-1 shadow-sm ${sourceRemoved ? "rounded-2xl" : "h-12 rounded-full"}`}
      onPointerDown={resetWarning}
      ref={rootRef}
      style={position}
    >
      <div className="flex h-full items-center gap-1.5 pl-3">
        <SecureTextField
          {...commentFieldProps}
          ariaLabel={messages.annotationContent}
          className="h-9 min-w-0 flex-1 rounded-lg border-0 bg-transparent outline-none"
          kind="input"
          placeholder={messages.optionalComment}
        />
        <button
          aria-label={sourceRemoved ? messages.saveAsNewAnnotation : messages.saveAnnotation}
          disabled={!canSave}
          className="qc-primary qc-pressable qc-focus flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
          onClick={saveComment}
          type="button"
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
      {sourceRemoved && (
        <p className="px-3 py-2 text-sm" role="status">
          {messages.annotationRemovedElsewhere}
        </p>
      )}
    </div>
  );
}
