import { ChatTextIcon } from "@phosphor-icons/react/dist/csr/ChatText";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { Fragment, useEffect, useRef, useState } from "react";

import type { HostLayout } from "@/features/host-port/host-port";
import { useI18n } from "@/features/i18n/I18nProvider";
import { QUOTECUE_INTERACTIVE_CLASS, Z_LAYER } from "@/lib/dom-identity";
import { selectedTextFor } from "@/lib/text-anchor";

import type { ProjectedAnnotation } from "./annotation-projection";
import { DELETE_UNDO_WINDOW_MS } from "./use-deferred-annotation-deletion";

type AnnotationSummaryProps = {
  annotations: readonly ProjectedAnnotation[];
  onClear: () => void;
  onEdit: (annotation: ProjectedAnnotation) => void;
  onRemove: (annotationId: string) => void;
  onUndo: () => void;
  pendingDeletionCount: number;
  pendingDeletionExpiresAt: number | null;
  position: HostLayout["summary"];
};

export function AnnotationSummary({
  annotations,
  onClear,
  onEdit,
  onRemove,
  onUndo,
  pendingDeletionCount,
  pendingDeletionExpiresAt,
  position,
}: AnnotationSummaryProps) {
  const { messages } = useI18n();
  const countButtonRef = useRef<HTMLButtonElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const isOpen = isHovered || hasFocusWithin;
  const hasPendingDeletion = pendingDeletionCount > 0;

  useEffect(() => {
    if (!isConfirmingClear) {
      return;
    }
    const timer = window.setTimeout(() => setIsConfirmingClear(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [isConfirmingClear]);

  useEffect(() => setIsConfirmingClear(false), [annotations.length, pendingDeletionCount]);

  const statusKind: SummaryStatusKind = isConfirmingClear
    ? "clear"
    : hasPendingDeletion
      ? "deletion"
      : null;
  const statusMessage = isConfirmingClear
    ? messages.clearAnnotationsConfirmation
    : hasPendingDeletion
      ? messages.annotationRemoved(pendingDeletionCount, annotations.length)
      : "";
  const renderedStatus = useRetainedStatus(
    statusKind,
    statusMessage,
    statusKind === "deletion" ? pendingDeletionExpiresAt : null,
  );
  const isStatusExiting = renderedStatus !== null && statusKind === null;

  return (
    <div
      className={`${QUOTECUE_INTERACTIVE_CLASS} group/summary fixed flex items-center gap-2`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHasFocusWithin(false);
        }
      }}
      onFocus={() => setHasFocusWithin(true)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        countButtonRef.current?.focus();
        setIsHovered(false);
        setHasFocusWithin(false);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={position}
    >
      <div className="qc-surface qc-divider flex items-center rounded-lg border shadow-sm">
        <button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className="qc-hover qc-focus qc-pressable flex h-8 cursor-pointer items-center gap-1.5 rounded-l-lg px-2.5 text-xs font-medium"
          onClick={() => setHasFocusWithin(true)}
          ref={countButtonRef}
          type="button"
        >
          <ChatTextIcon aria-hidden="true" className="qc-accent-text size-4" weight="bold" />
          <span aria-live="polite">{messages.annotationCount(annotations.length)}</span>
        </button>
        <button
          aria-label={
            isConfirmingClear ? messages.confirmClearAnnotations : messages.clearAnnotations
          }
          className="qc-muted qc-divider qc-hover qc-focus qc-pressable flex size-8 cursor-pointer items-center justify-center rounded-r-lg border-l opacity-0 transition-opacity group-hover/summary:opacity-100 focus-visible:opacity-100 disabled:cursor-default disabled:opacity-40"
          disabled={annotations.length === 0}
          onClick={() => {
            if (isConfirmingClear) {
              setIsConfirmingClear(false);
              onClear();
              return;
            }
            setIsConfirmingClear(true);
          }}
          type="button"
        >
          <XIcon aria-hidden="true" className="size-3.5" weight="bold" />
        </button>
      </div>

      {isOpen && (
        <div
          className="absolute bottom-full left-0 w-[min(24rem,calc(100dvw-1.5rem))] pb-1"
          style={{ zIndex: Z_LAYER.tooltip }}
        >
          <div
            aria-label={messages.annotationCount(annotations.length)}
            className="qc-surface qc-elevated overflow-hidden rounded-2xl"
            role="dialog"
          >
            <div className="qc-divide max-h-80 divide-y overscroll-contain overflow-y-auto">
              {annotations.map((projection) => {
                const { annotation, ordinal } = projection;
                const isResolved = projection.resolution === "resolved";
                const isUnresolved = projection.resolution === "unresolved";
                const comment = annotation.comment.trim();
                return (
                  <div className="group/row relative flex gap-2.5 px-3 py-3" key={annotation.id}>
                    <span className="qc-accent-bg flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                      {ordinal}
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
                        {selectedTextFor(annotation.anchor)}
                      </p>
                      {comment && (
                        <Fragment>
                          <p className="qc-muted mt-2 text-xs leading-4">{messages.userComment}</p>
                          <p className="line-clamp-3 text-xs leading-5 [overflow-wrap:anywhere]">
                            {comment}
                          </p>
                        </Fragment>
                      )}
                    </div>
                    <div className="qc-surface qc-divider absolute right-2.5 top-2.5 flex rounded-lg border opacity-0 shadow-sm transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                      <button
                        aria-label={messages.editNumberedAnnotation(ordinal)}
                        className="qc-muted qc-hover qc-focus flex size-8 cursor-pointer items-center justify-center disabled:cursor-default disabled:opacity-40"
                        disabled={!isResolved}
                        onClick={() => onEdit(projection)}
                        type="button"
                      >
                        <PencilSimpleIcon aria-hidden="true" className="size-3.5" weight="bold" />
                      </button>
                      <button
                        aria-label={messages.deleteNumberedAnnotation(ordinal)}
                        className="qc-danger qc-divider qc-hover qc-focus flex size-8 cursor-pointer items-center justify-center border-l"
                        onClick={() => onRemove(annotation.id)}
                        type="button"
                      >
                        <TrashIcon aria-hidden="true" className="size-3.5" weight="bold" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {renderedStatus && (
        <div
          aria-hidden={isStatusExiting}
          aria-live="polite"
          className="qc-status-bubble qc-surface qc-divider relative flex max-w-72 items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-1.5 text-xs shadow-sm"
          data-exiting={isStatusExiting}
          role="status"
        >
          <span>{renderedStatus.message}</span>
          {renderedStatus.kind === "deletion" && (
            <Fragment>
              <button
                className="qc-accent-text qc-hover qc-focus shrink-0 cursor-pointer rounded px-1.5 py-1 font-semibold"
                disabled={isStatusExiting}
                onClick={onUndo}
                type="button"
              >
                {messages.undo}
              </button>
              <span
                aria-hidden="true"
                className="qc-undo-progress absolute inset-x-0 bottom-0 h-0.5"
                key={renderedStatus.progressKey}
                style={{ animationDuration: `${DELETE_UNDO_WINDOW_MS}ms` }}
              />
            </Fragment>
          )}
        </div>
      )}
    </div>
  );
}

type SummaryStatusKind = "clear" | "deletion" | null;

type SummaryStatus = {
  kind: Exclude<SummaryStatusKind, null>;
  message: string;
  progressKey: number | null;
};

const STATUS_EXIT_DURATION_MS = 180;

function useRetainedStatus(kind: SummaryStatusKind, message: string, progressKey: number | null) {
  const [retainedStatus, setRetainedStatus] = useState<SummaryStatus | null>(() =>
    kind ? { kind, message, progressKey } : null,
  );

  useEffect(() => {
    if (kind) {
      setRetainedStatus((current) =>
        current?.kind === kind && current.message === message && current.progressKey === progressKey
          ? current
          : { kind, message, progressKey },
      );
      return;
    }
    const timer = window.setTimeout(() => setRetainedStatus(null), STATUS_EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [kind, message, progressKey]);

  return kind ? { kind, message, progressKey } : retainedStatus;
}
