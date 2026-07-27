import { ArrowUp, LoaderCircle, RotateCcw } from "lucide-react";

import type {
  AnnotatedSendFailureReason,
  AnnotatedSendState,
} from "@/features/annotations/register-send-interceptor";
import type { HostLayout } from "@/features/host-port/host-port";
import { useI18n } from "@/features/i18n/I18nProvider";
import { QUOTECUE_INTERACTIVE_CLASS } from "@/lib/dom-identity";

type AnnotationSendControlProps = {
  onSend: () => void;
  position: HostLayout["send"];
  state: AnnotatedSendState;
};

export function AnnotationSendControl({ onSend, position, state }: AnnotationSendControlProps) {
  const { messages } = useI18n();
  const isPending =
    state.status === "preparing" ||
    state.status === "replaying" ||
    state.status === "awaiting-confirmation";
  const failureReason =
    state.status === "failed" || state.status === "failed-before-attempt" ? state.reason : null;
  const statusMessage = isPending
    ? messages.sendingAnnotations
    : failureReason
      ? failureMessage(failureReason, messages)
      : null;

  return (
    <>
      {statusMessage && (
        <div
          aria-live="polite"
          className="qc-surface qc-elevated fixed max-w-72 rounded-lg border px-2.5 py-1.5 text-xs"
          role="status"
          style={{
            left: position.left - 8,
            top: position.top + position.height / 2,
            transform: "translate(-100%, -50%)",
          }}
        >
          {statusMessage}
        </div>
      )}
      <button
        aria-label={failureReason ? messages.retrySendingAnnotations : messages.sendAnnotations}
        className={`${QUOTECUE_INTERACTIVE_CLASS} qc-primary qc-pressable qc-focus fixed flex cursor-pointer items-center justify-center rounded-full shadow-sm disabled:cursor-default disabled:opacity-50`}
        disabled={isPending}
        onClick={onSend}
        style={position}
        type="button"
      >
        {isPending ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin motion-reduce:animate-none"
          />
        ) : failureReason ? (
          <RotateCcw aria-hidden="true" className="size-4.5" />
        ) : (
          <ArrowUp aria-hidden="true" className="size-5" />
        )}
      </button>
    </>
  );
}

function failureMessage(
  reason: AnnotatedSendFailureReason,
  messages: ReturnType<typeof useI18n>["messages"],
) {
  if (reason === "confirmation-timeout") {
    return messages.sendAnnotationsConfirmationTimedOut;
  }
  if (reason === "composer-unavailable") {
    return messages.sendAnnotationsComposerUnavailable;
  }
  return messages.sendAnnotationsFailed;
}
