import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/I18nProvider";

type DraftPersistenceStatusProps =
  | { status: "loading" }
  | { status: "error"; operation: "load" | "save"; onRetry: () => void };

export function DraftPersistenceStatus(props: DraftPersistenceStatusProps) {
  const { messages } = useI18n();
  const isLoading = props.status === "loading";

  return (
    <div
      aria-live="polite"
      className="quotecue-interactive fixed right-4 top-4 flex max-w-80 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 shadow-lg"
      role="status"
    >
      {isLoading ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin text-neutral-400 motion-reduce:animate-none"
        />
      ) : (
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-amber-600" />
      )}
      <span className="min-w-0 flex-1">
        {isLoading
          ? messages.loadingDraft
          : props.operation === "load"
            ? messages.loadDraftFailed
            : messages.saveDraftFailed}
      </span>
      {!isLoading && (
        <Button onClick={props.onRetry} size="sm" variant="outline">
          <RotateCcw aria-hidden="true" className="size-3.5" />
          {messages.retry}
        </Button>
      )}
    </div>
  );
}
