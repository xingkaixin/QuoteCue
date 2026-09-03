import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";

import { Button } from "@/components/ui/button";
import type { SelectionRect } from "@/features/host-port/host-port";
import { useI18n } from "@/features/i18n/I18nProvider";
import { SecureTextField } from "@/features/secure-field/SecureTextField";
import { QUOTECUE_INTERACTIVE_CLASS } from "@/lib/dom-identity";

import type { DraftAnnotation } from "./annotation";
import { useAnnotationCommentSurface } from "./use-annotation-comment-surface";

type AnnotationEditorProps = {
  annotation: DraftAnnotation;
  bindSession: (requestDismissal: (() => boolean) | null) => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (comment: string) => void;
  rect: SelectionRect;
  sourceRemoved: boolean;
  canSave: boolean;
};

const EDITOR_SIZE = { height: 164, width: 340 };

export function AnnotationEditor({
  annotation,
  bindSession,
  onCancel,
  onDelete,
  onSave,
  rect,
  sourceRemoved,
  canSave,
}: AnnotationEditorProps) {
  const { messages } = useI18n();
  const { commentFieldProps, position, resetWarning, rootRef, saveComment } =
    useAnnotationCommentSurface({
      bindSession,
      initialComment: annotation.comment,
      onDismiss: onCancel,
      onSave,
      rect,
      size: EDITOR_SIZE,
    });

  return (
    <div
      className={`${QUOTECUE_INTERACTIVE_CLASS} qc-surface qc-divider fixed w-[340px] max-w-[calc(100dvw-1.5rem)] overflow-y-auto rounded-2xl border p-3 shadow-sm`}
      onPointerDown={resetWarning}
      ref={rootRef}
      style={position}
    >
      {sourceRemoved && (
        <p className="mb-2 text-sm" role="status">
          {messages.annotationRemovedElsewhere}
        </p>
      )}
      <SecureTextField
        {...commentFieldProps}
        ariaLabel={messages.annotationContent}
        className="h-24 w-full rounded-lg border-0 bg-transparent outline-none"
        kind="textarea"
        placeholder={messages.optionalComment}
      />
      <div className="mt-2.5 flex items-center justify-between">
        <Button
          aria-label={messages.deleteAnnotation}
          disabled={!canSave}
          onClick={onDelete}
          size="icon"
          variant="ghost"
        >
          <TrashIcon aria-hidden="true" className="size-4" weight="bold" />
        </Button>
        <div className="flex items-center gap-1.5">
          <Button onClick={onCancel} size="sm" variant="outline">
            {messages.cancel}
          </Button>
          <Button disabled={!canSave} onClick={saveComment} size="sm">
            {sourceRemoved ? messages.saveAsNewAnnotation : messages.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
