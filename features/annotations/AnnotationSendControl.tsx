import { ArrowUp, LoaderCircle, RotateCcw } from "lucide-react";

import type { HostLayout } from "@/features/host-port/host-port";
import { useI18n } from "@/features/i18n/I18nProvider";

type AnnotationSendControlProps = {
  onSend: () => void;
  position: HostLayout["send"];
  status: "idle" | "pending" | "failed";
};

export function AnnotationSendControl({ onSend, position, status }: AnnotationSendControlProps) {
  const { messages } = useI18n();

  return (
    <>
      {status !== "idle" && (
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
          {status === "pending" ? messages.sendingAnnotations : messages.sendAnnotationsFailed}
        </div>
      )}
      <button
        aria-label={
          status === "failed" ? messages.retrySendingAnnotations : messages.sendAnnotations
        }
        className="quotecue-interactive qc-primary qc-pressable qc-focus fixed flex cursor-pointer items-center justify-center rounded-full shadow-sm disabled:cursor-default disabled:opacity-50"
        disabled={status === "pending"}
        onClick={onSend}
        style={position}
        type="button"
      >
        {status === "pending" ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin motion-reduce:animate-none"
          />
        ) : status === "failed" ? (
          <RotateCcw aria-hidden="true" className="size-4.5" />
        ) : (
          <ArrowUp aria-hidden="true" className="size-5" />
        )}
      </button>
    </>
  );
}
