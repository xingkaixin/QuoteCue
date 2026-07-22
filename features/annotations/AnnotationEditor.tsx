import { Check, Trash2, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/I18nProvider";

import type { DraftAnnotation, SelectionDraft } from "./annotation";
import { useAnnotationEditorPosition } from "./annotation-editor-position";
import { SecureTextField, type SecureTextFieldHandle } from "./SecureTextField";
import { useDismissalWarning } from "./use-dismissal-warning";
import { useOutsideDiscard } from "./use-outside-discard";

type AnnotationEditorProps = {
  annotation: DraftAnnotation;
  draft: SelectionDraft;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (comment: string) => void;
};

const EDITOR_SIZE = { height: 230, width: 380 };

export function AnnotationEditor({
  annotation,
  draft,
  onCancel,
  onDelete,
  onSave,
}: AnnotationEditorProps) {
  const { messages } = useI18n();
  const [comment, setComment] = useState(annotation.comment);
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<SecureTextFieldHandle>(null);
  const focusEditor = useCallback(() => textareaRef.current?.focus(), []);
  const { requestDismissal, resetWarning } = useDismissalWarning({
    focusEditor,
    isDirty: comment !== annotation.comment,
    onDismiss: onCancel,
    rootRef: editorRef,
  });
  const position = useAnnotationEditorPosition(draft, editorRef, EDITOR_SIZE);

  useOutsideDiscard(editorRef, requestDismissal);

  return (
    <div
      className="quotecue-interactive qc-surface qc-elevated fixed w-[380px] max-w-[calc(100dvw-1.5rem)] overflow-y-auto rounded-3xl border p-4"
      onPointerDown={resetWarning}
      ref={editorRef}
      style={position}
    >
      <SecureTextField
        ariaLabel={messages.annotationContent}
        className="h-28 w-full rounded-xl border-0 bg-transparent outline-none data-[focused=true]:ring-2 data-[focused=true]:ring-blue-500/45"
        kind="textarea"
        name="quotecue-annotation-comment"
        onCancel={onCancel}
        onChange={(value) => {
          resetWarning();
          setComment(value);
        }}
        onSave={(value) => onSave(value.trim())}
        placeholder={messages.optionalComment}
        ref={textareaRef}
        value={comment}
      />
      <div className="mt-3 flex items-center justify-between">
        <Button
          aria-label={messages.deleteAnnotation}
          onClick={onDelete}
          size="icon"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" className="size-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Button onClick={onCancel} variant="outline">
            <X aria-hidden="true" className="size-4" />
            {messages.cancel}
          </Button>
          <Button onClick={() => onSave(comment.trim())}>
            <Check aria-hidden="true" className="size-4" />
            {messages.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
