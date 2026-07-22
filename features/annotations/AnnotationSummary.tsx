import {
  ArrowUp,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useRef } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const firstEditButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Fragment>
      <div className="quotecue-interactive fixed" style={position}>
        <Popover>
          <div className="flex items-center rounded-xl border border-neutral-200 bg-white shadow-sm">
            <PopoverTrigger className="flex h-9 cursor-pointer items-center gap-2 rounded-l-xl px-3 text-sm font-medium text-neutral-700 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-blue-500/45">
              <MessageSquareText aria-hidden="true" className="size-4 text-blue-600" />
              {messages.annotationCount(annotations.length)}
            </PopoverTrigger>
            <button
              aria-label={messages.clearAnnotations}
              className="flex size-9 cursor-pointer items-center justify-center rounded-r-xl border-l border-neutral-200 text-neutral-600 outline-none hover:bg-neutral-50 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-blue-500/45"
              onClick={onClear}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>

          <PopoverContent
            aria-label={messages.annotationCount(annotations.length)}
            className="w-96 overflow-hidden p-0"
            initialFocus={firstEditButtonRef}
          >
            <div className="max-h-80 divide-y divide-neutral-100 overscroll-contain overflow-y-auto">
              {annotations.map((annotation, index) => (
                <div className="group/row relative flex gap-2.5 px-3 py-3" key={annotation.id}>
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 pr-20">
                    <p className="text-xs leading-4 text-neutral-600">{messages.selectedText}</p>
                    <p className="line-clamp-2 text-xs leading-5 text-neutral-900 [overflow-wrap:anywhere]">
                      {annotation.anchor.quote}
                    </p>
                    <p className="mt-2 text-xs leading-4 text-neutral-600">
                      {messages.userComment}
                    </p>
                    <p className="line-clamp-3 text-xs leading-5 text-neutral-900 [overflow-wrap:anywhere]">
                      {annotation.comment || messages.noComment}
                    </p>
                  </div>
                  <div className="absolute right-2.5 top-2.5 flex rounded-lg border border-neutral-200 bg-white opacity-0 shadow-sm transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                    <button
                      aria-label={messages.editNumberedAnnotation(index + 1)}
                      className="flex size-8 cursor-pointer items-center justify-center text-neutral-600 outline-none hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500/45"
                      onClick={() => onEdit(annotation)}
                      ref={index === 0 ? firstEditButtonRef : undefined}
                      type="button"
                    >
                      <Pencil aria-hidden="true" className="size-3.5" />
                    </button>
                    <button
                      aria-label={messages.deleteNumberedAnnotation(index + 1)}
                      className="flex size-8 cursor-pointer items-center justify-center border-l border-neutral-200 text-neutral-600 outline-none hover:text-red-700 focus-visible:ring-2 focus-visible:ring-blue-500/45"
                      onClick={() => onRemove(annotation.id)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {sendStatus !== "idle" && (
        <div
          aria-live="polite"
          className="fixed max-w-72 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-700 shadow-md"
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
