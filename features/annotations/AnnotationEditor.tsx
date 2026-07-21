import { Check, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/features/i18n/I18nProvider";

import type { DraftAnnotation, SelectionDraft } from "./annotation";
import { annotationEditorPosition } from "./annotation-editor-position";

type AnnotationEditorProps = {
  annotation: DraftAnnotation;
  draft: SelectionDraft;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (comment: string) => void;
};

const EDITOR_SIZE = { height: 230, width: 380 };
const SHAKE_KEYFRAMES = [
  { transform: "translateX(0)" },
  { transform: "translateX(-8px)" },
  { transform: "translateX(8px)" },
  { transform: "translateX(-6px)" },
  { transform: "translateX(6px)" },
  { transform: "translateX(0)" },
];
const SHAKE_OPTIONS = { duration: 320, easing: "ease-in-out" };

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
  const hasWarnedAboutChangesRef = useRef(false);
  const ignoreNextBlurRef = useRef(false);
  const isDismissingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const requestDismissal = useCallback(
    (event?: PointerEvent) => {
      if (isDismissingRef.current) {
        return true;
      }

      if (comment === annotation.comment || hasWarnedAboutChangesRef.current) {
        isDismissingRef.current = true;
        onCancel();
        return true;
      }

      event?.preventDefault();
      event?.stopImmediatePropagation();
      if (event) {
        ignoreNextBlurRef.current = true;
        requestAnimationFrame(() => {
          ignoreNextBlurRef.current = false;
        });
      }
      hasWarnedAboutChangesRef.current = true;
      editorRef.current?.animate(SHAKE_KEYFRAMES, SHAKE_OPTIONS);
      return false;
    },
    [annotation.comment, comment, onCancel],
  );

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (editorRef.current && event.composedPath().includes(editorRef.current)) {
        hasWarnedAboutChangesRef.current = false;
        return;
      }
      requestDismissal(event);
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [requestDismissal]);

  return (
    <div
      className="quotecue-interactive fixed w-[380px] rounded-3xl border border-neutral-200 bg-white p-4 text-neutral-950 shadow-2xl"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) {
          return;
        }
        if (ignoreNextBlurRef.current) {
          ignoreNextBlurRef.current = false;
          requestAnimationFrame(() => textareaRef.current?.focus());
          return;
        }
        if (!requestDismissal()) {
          requestAnimationFrame(() => textareaRef.current?.focus());
        }
      }}
      onPointerDown={() => {
        hasWarnedAboutChangesRef.current = false;
      }}
      ref={editorRef}
      style={annotationEditorPosition(draft, EDITOR_SIZE)}
    >
      <Textarea
        aria-label={messages.annotationContent}
        className="min-h-28 border-0 px-1 py-1 text-base shadow-none focus:border-0 focus:ring-0"
        onChange={(event) => {
          hasWarnedAboutChangesRef.current = false;
          setComment(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel();
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSave(comment.trim());
          }
        }}
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
          <Trash2 className="size-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Button onClick={onCancel} variant="outline">
            <X className="size-4" />
            {messages.cancel}
          </Button>
          <Button onClick={() => onSave(comment.trim())}>
            <Check className="size-4" />
            {messages.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
