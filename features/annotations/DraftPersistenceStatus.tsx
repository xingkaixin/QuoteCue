import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/I18nProvider";
import { QUOTECUE_INTERACTIVE_CLASS } from "@/lib/dom-identity";

import type { DraftState } from "./use-draft-annotations";

type DraftPersistenceStatusProps =
  | Extract<DraftState, { status: "loading" }>
  | (Extract<DraftState, { status: "ready" }> & { onClear: () => void })
  | (Extract<DraftState, { status: "error" }> & { onRetry: () => void });

const LOADING_DELAY_MS = 200;

export function DraftPersistenceStatus(props: DraftPersistenceStatusProps) {
  const { messages } = useI18n();
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isLoadingVisible, setIsLoadingVisible] = useState(false);
  const isLoading = props.status === "loading";

  useEffect(() => {
    if (!isLoading) {
      setIsLoadingVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setIsLoadingVisible(true), LOADING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  if (isLoading && !isLoadingVisible) {
    return null;
  }

  return (
    <div
      aria-live={isLoading ? undefined : "polite"}
      className={`${QUOTECUE_INTERACTIVE_CLASS} qc-surface qc-elevated fixed right-4 top-4 flex max-w-80 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm`}
      role={isLoading ? undefined : "status"}
    >
      {isLoading ? (
        <LoaderCircle
          aria-hidden="true"
          className="qc-muted size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
      ) : (
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-amber-600" />
      )}
      <span className="min-w-0 flex-1">
        {isLoading
          ? messages.loadingDraft
          : props.status === "ready"
            ? messages.unreadableDraft
            : props.operation === "load"
              ? messages.loadDraftFailed
              : messages.saveDraftFailed}
      </span>
      {props.status === "ready" && (
        <Button
          aria-label={
            isConfirmingClear ? messages.confirmClearAnnotations : messages.clearAnnotations
          }
          onClick={() => (isConfirmingClear ? props.onClear() : setIsConfirmingClear(true))}
          size="sm"
          variant="outline"
        >
          {isConfirmingClear ? messages.confirmClearAnnotations : messages.clearAnnotations}
        </Button>
      )}
      {props.status === "error" && (
        <Button onClick={props.onRetry} size="sm" variant="outline">
          <RotateCcw aria-hidden="true" className="size-3.5" />
          {messages.retry}
        </Button>
      )}
    </div>
  );
}
