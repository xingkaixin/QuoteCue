import { Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useI18n } from "@/features/i18n/I18nProvider";

import type { SelectionDraft } from "./annotation";
import { annotationEditorPosition } from "./annotation-editor-position";
import { DiscardChangesConfirmation } from "./DiscardChangesConfirmation";
import { SecureTextField, type SecureTextFieldHandle } from "./SecureTextField";
import { useDiscardConfirmation } from "./use-discard-confirmation";
import { useOutsideDiscard } from "./use-outside-discard";

type AnnotationQuickInputProps = {
  draft: SelectionDraft;
  onClose: () => void;
  onSave: (comment: string) => void;
};

const QUICK_INPUT_SIZE = { height: 72, width: 360 };

export function AnnotationQuickInput({ draft, onClose, onSave }: AnnotationQuickInputProps) {
  const { messages } = useI18n();
  const [comment, setComment] = useState("");
  const inputRef = useRef<SecureTextFieldHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusEditor = useCallback(() => inputRef.current?.focus(), []);
  const {
    confirmDiscard,
    continueButtonRef,
    continueEditing,
    isConfirmingDiscard,
    requestDiscard,
  } = useDiscardConfirmation({ focusEditor, isDirty: comment !== "", onDiscard: onClose });

  useOutsideDiscard(rootRef, requestDiscard);

  return (
    <div
      className="quotecue-interactive fixed flex h-14 w-[360px] items-center gap-2 rounded-full border border-neutral-200 bg-white p-1.5 pl-5 shadow-xl"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          requestDiscard();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isConfirmingDiscard) {
          event.preventDefault();
          continueEditing();
        }
      }}
      ref={rootRef}
      style={annotationEditorPosition(draft, QUICK_INPUT_SIZE)}
    >
      <div className="contents" inert={isConfirmingDiscard}>
        <SecureTextField
          ariaLabel={messages.annotationContent}
          className="h-10 min-w-0 flex-1 rounded-lg border-0 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/45"
          kind="input"
          name="quotecue-annotation-comment"
          onCancel={requestDiscard}
          onChange={setComment}
          onSave={(value) => onSave(value.trim())}
          placeholder={messages.optionalComment}
          ref={inputRef}
          value={comment}
        />
        <button
          aria-label={messages.saveAnnotation}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-white outline-none transition-colors hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-blue-500/45"
          onClick={() => onSave(comment.trim())}
          type="button"
        >
          <Plus aria-hidden="true" className="size-6" />
        </button>
      </div>
      {isConfirmingDiscard && (
        <DiscardChangesConfirmation
          className="absolute right-0 top-full mt-2 w-80"
          continueButtonRef={continueButtonRef}
          onContinue={continueEditing}
          onDiscard={confirmDiscard}
        />
      )}
    </div>
  );
}
