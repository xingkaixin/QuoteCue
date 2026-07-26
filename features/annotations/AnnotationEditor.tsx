import { Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SelectionRect } from "@/features/host-port/host-port";
import { useI18n } from "@/features/i18n/I18nProvider";

import type { DraftAnnotation } from "./annotation";
import { useAnnotationEditorPosition } from "./annotation-editor-position";
import { SecureTextField, type SecureTextFieldHandle } from "./SecureTextField";
import { useDismissalWarning } from "./use-dismissal-warning";
import { useOutsideDiscard } from "./use-outside-discard";

type AnnotationEditorProps = {
  annotation: DraftAnnotation;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (comment: string) => void;
  rect: SelectionRect;
};

const EDITOR_SIZE = { height: 164, width: 340 };

export function AnnotationEditor({
  annotation,
  onCancel,
  onDelete,
  onSave,
  rect,
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
  const position = useAnnotationEditorPosition(rect, editorRef, EDITOR_SIZE);

  useOutsideDiscard(editorRef, requestDismissal);

  return (
    <div
      className="quotecue-interactive qc-surface qc-divider fixed w-[340px] max-w-[calc(100dvw-1.5rem)] overflow-y-auto rounded-2xl border p-3 shadow-sm"
      onPointerDown={resetWarning}
      ref={editorRef}
      style={position}
    >
      <SecureTextField
        ariaLabel={messages.annotationContent}
        className="h-24 w-full rounded-lg border-0 bg-transparent outline-none"
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
      <div className="mt-2.5 flex items-center justify-between">
        <Button
          aria-label={messages.deleteAnnotation}
          onClick={onDelete}
          size="icon"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
        <div className="flex items-center gap-1.5">
          <Button onClick={onCancel} size="sm" variant="outline">
            {messages.cancel}
          </Button>
          <Button onClick={() => onSave(comment.trim())} size="sm">
            {messages.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
