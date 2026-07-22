import { Plus } from "lucide-react";
import { useState } from "react";

import { useI18n } from "@/features/i18n/I18nProvider";

import type { SelectionDraft } from "./annotation";
import { annotationEditorPosition } from "./annotation-editor-position";
import { SecureTextField } from "./SecureTextField";

type AnnotationQuickInputProps = {
  draft: SelectionDraft;
  onClose: () => void;
  onSave: (comment: string) => void;
};

const QUICK_INPUT_SIZE = { height: 72, width: 360 };

export function AnnotationQuickInput({ draft, onClose, onSave }: AnnotationQuickInputProps) {
  const { messages } = useI18n();
  const [comment, setComment] = useState("");

  return (
    <div
      className="quotecue-interactive fixed flex h-14 w-[360px] items-center gap-2 rounded-full border border-neutral-200 bg-white p-1.5 pl-5 shadow-xl"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onClose();
        }
      }}
      style={annotationEditorPosition(draft, QUICK_INPUT_SIZE)}
    >
      <SecureTextField
        ariaLabel={messages.annotationContent}
        className="h-10 min-w-0 flex-1 border-0 bg-transparent"
        kind="input"
        onCancel={onClose}
        onChange={setComment}
        onSave={(value) => onSave(value.trim())}
        placeholder={messages.optionalComment}
        value={comment}
      />
      <button
        aria-label={messages.saveAnnotation}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-white transition-colors hover:bg-neutral-700"
        onClick={() => onSave(comment.trim())}
        type="button"
      >
        <Plus className="size-6" />
      </button>
    </div>
  );
}
