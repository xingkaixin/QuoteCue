import {
  ArrowUp,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  ComposerPosition,
  ComposerRect,
} from "@/features/chatgpt/use-annotated-composer-layout";
import { useI18n } from "@/features/i18n/I18nProvider";
import { useVisualViewportBounds } from "@/features/layout/use-visual-viewport";

import type { DraftAnnotation } from "./annotation";

type AnnotationSummaryProps = {
  annotations: DraftAnnotation[];
  hasPendingDeletion: boolean;
  onClear: () => void;
  onEdit: (annotation: DraftAnnotation) => void;
  onRemove: (annotationId: string) => void;
  onSend: () => void;
  onUndo: () => void;
  position: ComposerPosition;
  sendStatus: "idle" | "pending" | "failed";
  sendPosition: ComposerRect;
  unresolvedAnnotationIds: ReadonlySet<string>;
};

export function AnnotationSummary({
  annotations,
  hasPendingDeletion,
  onClear,
  onEdit,
  onRemove,
  onSend,
  onUndo,
  position,
  sendStatus,
  sendPosition,
  unresolvedAnnotationIds,
}: AnnotationSummaryProps) {
  const { messages } = useI18n();
  const viewport = useVisualViewportBounds();
  const firstActionButtonRef = useRef<HTMLButtonElement>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [transientStatus, setTransientStatus] = useState("");

  useEffect(() => {
    if (!isConfirmingClear) {
      return;
    }
    const timer = window.setTimeout(() => setIsConfirmingClear(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [isConfirmingClear]);

  useEffect(() => setIsConfirmingClear(false), [annotations.length, hasPendingDeletion]);

  useEffect(() => {
    if (!transientStatus) {
      return;
    }
    const timer = window.setTimeout(() => setTransientStatus(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [transientStatus]);

  const statusMessage = hasPendingDeletion
    ? messages.annotationRemoved(annotations.length)
    : isConfirmingClear
      ? messages.clearAnnotationsConfirmation
      : transientStatus;

  return (
    <Fragment>
      <div className="quotecue-interactive fixed flex items-center gap-2" style={position}>
        <Popover>
          <div className="qc-surface flex items-center rounded-xl border shadow-sm">
            <PopoverTrigger className="qc-hover qc-focus qc-pressable flex h-9 cursor-pointer items-center gap-2 rounded-l-xl px-3 text-sm font-medium">
              <MessageSquareText aria-hidden="true" className="qc-accent-text size-4" />
              <span aria-live="polite">{messages.annotationCount(annotations.length)}</span>
            </PopoverTrigger>
            <button
              aria-label={
                isConfirmingClear ? messages.confirmClearAnnotations : messages.clearAnnotations
              }
              className="qc-muted qc-divider qc-hover qc-focus qc-pressable flex size-9 cursor-pointer items-center justify-center rounded-r-xl border-l disabled:cursor-default disabled:opacity-40"
              disabled={hasPendingDeletion || annotations.length === 0}
              onClick={() => {
                if (isConfirmingClear) {
                  setIsConfirmingClear(false);
                  onClear();
                  return;
                }
                setTransientStatus("");
                setIsConfirmingClear(true);
              }}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>

          <PopoverContent
            aria-label={messages.annotationCount(annotations.length)}
            className="w-[min(24rem,calc(100dvw-1.5rem))] overflow-hidden p-0"
            initialFocus={firstActionButtonRef}
            style={{ maxWidth: Math.max(0, viewport.width - 24) }}
          >
            <div className="qc-divide max-h-80 divide-y overscroll-contain overflow-y-auto">
              {annotations.map((annotation, index) => {
                const isUnresolved = unresolvedAnnotationIds.has(annotation.id);
                return (
                  <div className="group/row relative flex gap-2.5 px-3 py-3" key={annotation.id}>
                    <span className="qc-accent-bg flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 pr-20">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <p className="qc-muted text-xs leading-4">{messages.selectedText}</p>
                        {isUnresolved && (
                          <span className="qc-danger text-xs font-medium leading-4">
                            {messages.annotationSourceUnavailable}
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs leading-5 [overflow-wrap:anywhere]">
                        {annotation.anchor.quote}
                      </p>
                      <p className="qc-muted mt-2 text-xs leading-4">{messages.userComment}</p>
                      <p className="line-clamp-3 text-xs leading-5 [overflow-wrap:anywhere]">
                        {annotation.comment || messages.noComment}
                      </p>
                    </div>
                    <div className="qc-surface absolute right-2.5 top-2.5 flex rounded-lg border opacity-0 shadow-sm transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                      <button
                        aria-label={messages.editNumberedAnnotation(index + 1)}
                        className="qc-muted qc-hover qc-focus flex size-8 cursor-pointer items-center justify-center disabled:cursor-default disabled:opacity-40"
                        disabled={isUnresolved}
                        onClick={() => onEdit(annotation)}
                        ref={index === 0 && !isUnresolved ? firstActionButtonRef : undefined}
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="size-3.5" />
                      </button>
                      <button
                        aria-label={messages.deleteNumberedAnnotation(index + 1)}
                        className="qc-danger qc-divider qc-hover qc-focus flex size-8 cursor-pointer items-center justify-center border-l disabled:opacity-40"
                        disabled={hasPendingDeletion}
                        onClick={() => onRemove(annotation.id)}
                        ref={index === 0 && isUnresolved ? firstActionButtonRef : undefined}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        {statusMessage && (
          <div
            aria-live="polite"
            className="qc-surface qc-elevated flex max-w-72 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
            role="status"
          >
            <span>{statusMessage}</span>
            {hasPendingDeletion && (
              <button
                className="qc-accent-text qc-hover qc-focus shrink-0 cursor-pointer rounded px-1.5 py-1 font-semibold"
                onClick={() => {
                  setTransientStatus(messages.annotationRestored);
                  onUndo();
                }}
                type="button"
              >
                {messages.undo}
              </button>
            )}
          </div>
        )}
      </div>
      {sendStatus !== "idle" && (
        <div
          aria-live="polite"
          className="qc-surface qc-elevated fixed max-w-72 rounded-lg border px-2.5 py-1.5 text-xs"
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
        className="quotecue-interactive qc-primary qc-pressable qc-focus fixed flex cursor-pointer items-center justify-center rounded-full shadow-sm disabled:cursor-default disabled:opacity-50"
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
