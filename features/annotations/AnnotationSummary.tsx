import {
  ArrowUp,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { Fragment } from "react";
import { useState } from "react";

import type {
  ComposerPosition,
  ComposerRect,
} from "@/features/chatgpt/use-annotated-composer-layout";
import { useI18n } from "@/features/i18n/I18nProvider";

import type { DraftAnnotation } from "./annotation";

type AnnotationSummaryProps = {
  annotations: DraftAnnotation[];
  onClear: () => void;
  onEdit: (annotation: DraftAnnotation) => void;
  onRemove: (annotationId: string) => void;
  onSend: () => void;
  position: ComposerPosition;
  sendStatus: "idle" | "pending" | "failed";
  sendPosition: ComposerRect;
};

export function AnnotationSummary({
  annotations,
  onClear,
  onEdit,
  onRemove,
  onSend,
  position,
  sendStatus,
  sendPosition,
}: AnnotationSummaryProps) {
  const { messages } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Fragment>
      <div
        className="quotecue-interactive group fixed"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        style={position}
      >
        <div className="flex items-center rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium text-neutral-700">
            <MessageSquareText className="size-4 text-blue-600" />
            {messages.annotationCount(annotations.length)}
          </div>
          <button
            aria-label={messages.clearAnnotations}
            className="flex size-9 cursor-pointer items-center justify-center rounded-r-xl border-l border-neutral-100 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-50 hover:text-neutral-700 focus-visible:opacity-100 group-hover:opacity-100"
            onClick={onClear}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        {isOpen && (
          <div
            aria-label={messages.annotationCount(annotations.length)}
            className="absolute bottom-10 left-0 w-96 overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-950 shadow-2xl"
            data-quotecue-portal=""
            role="dialog"
          >
            <div className="max-h-80 divide-y divide-neutral-100 overflow-auto">
              {annotations.map((annotation, index) => (
                <div className="group/row relative flex gap-2.5 px-3 py-2.5" key={annotation.id}>
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 pr-12">
                    <p className="text-[10px] leading-4 text-neutral-400">
                      {messages.selectedText}
                    </p>
                    <p className="line-clamp-2 text-xs leading-4 text-neutral-800">
                      {annotation.anchor.quote}
                    </p>
                    <p className="mt-1.5 text-[10px] leading-4 text-neutral-400">
                      {messages.userComment}
                    </p>
                    <p className="text-xs leading-4 text-neutral-800">
                      {annotation.comment || messages.noComment}
                    </p>
                  </div>
                  <div className="absolute right-2.5 top-2.5 flex rounded-lg border border-neutral-200 bg-white opacity-0 shadow-sm transition-opacity group-hover/row:opacity-100">
                    <button
                      aria-label={messages.editNumberedAnnotation(index + 1)}
                      className="flex size-8 cursor-pointer items-center justify-center text-neutral-400 hover:text-blue-600"
                      onClick={() => onEdit(annotation)}
                      type="button"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      aria-label={messages.deleteNumberedAnnotation(index + 1)}
                      className="flex size-8 cursor-pointer items-center justify-center border-l border-neutral-100 text-neutral-400 hover:text-red-500"
                      onClick={() => onRemove(annotation.id)}
                      type="button"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {sendStatus !== "idle" && (
        <div
          aria-live="polite"
          className="fixed max-w-72 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-600 shadow-md"
          role="status"
          style={{
            left: sendPosition.left - 8,
            top: sendPosition.top + sendPosition.height / 2,
            transform: "translate(-100%, -50%)",
          }}
        >
          {sendStatus === "pending" ? messages.sendingAnnotations : messages.sendAnnotationsFailed}
        </div>
      )}
      <button
        aria-label={
          sendStatus === "failed" ? messages.retrySendingAnnotations : messages.sendAnnotations
        }
        className="quotecue-interactive fixed flex cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-white shadow-sm transition-colors hover:bg-neutral-700 disabled:cursor-default disabled:bg-neutral-500"
        disabled={sendStatus === "pending"}
        onClick={onSend}
        style={sendPosition}
        type="button"
      >
        {sendStatus === "pending" ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin motion-reduce:animate-none"
          />
        ) : sendStatus === "failed" ? (
          <RotateCcw aria-hidden="true" className="size-4.5" />
        ) : (
          <ArrowUp aria-hidden="true" className="size-5" />
        )}
      </button>
    </Fragment>
  );
}
