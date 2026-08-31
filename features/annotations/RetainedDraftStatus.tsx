import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/I18nProvider";
import { QUOTECUE_INTERACTIVE_CLASS } from "@/lib/dom-identity";

import type { RetainedDraftState } from "./use-draft-annotations";

type RetainedDraftStatusProps = {
  state: RetainedDraftState;
  capacityExceeded: boolean;
  isSending: boolean;
  onRestore: () => void;
  onDiscard: () => void;
};

export function RetainedDraftStatus({
  state,
  capacityExceeded,
  isSending,
  onRestore,
  onDiscard,
}: RetainedDraftStatusProps) {
  const { messages } = useI18n();
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const isBusy = isSending || state.status === "restoring";

  return (
    <div
      className={`${QUOTECUE_INTERACTIVE_CLASS} qc-surface qc-elevated fixed left-4 right-4 top-4 ml-auto flex max-w-sm flex-col gap-2 rounded-xl border px-3 py-2.5 text-sm`}
    >
      <p aria-live="polite" role="status">
        {state.status === "save-failed"
          ? messages.retainedDraftSaveFailed
          : messages.retainedDraft(state.count)}
      </p>
      {(isBusy || capacityExceeded) && (
        <p aria-live="polite" role="status">
          {isSending
            ? messages.sendingAnnotations
            : state.status === "restoring"
              ? messages.loadingDraft
              : messages.draftCapacityExceeded}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          className="h-auto min-h-8 whitespace-normal py-1"
          disabled={isBusy}
          onClick={() => {
            setIsConfirmingDiscard(false);
            onRestore();
          }}
          size="sm"
          variant="outline"
        >
          {state.status === "save-failed"
            ? messages.retrySavingDraft
            : messages.restoreRetainedDraft}
        </Button>
        <Button
          className="h-auto min-h-8 whitespace-normal py-1"
          disabled={isBusy || state.status !== "retained"}
          onClick={() => (isConfirmingDiscard ? onDiscard() : setIsConfirmingDiscard(true))}
          size="sm"
          variant="ghost"
        >
          {isConfirmingDiscard
            ? messages.confirmDiscardRetainedDraft
            : messages.discardRetainedDraft}
        </Button>
      </div>
    </div>
  );
}
