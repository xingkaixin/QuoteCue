import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning";

import { useI18n } from "@/features/i18n/I18nProvider";
import { QUOTECUE_INTERACTIVE_CLASS } from "@/lib/dom-identity";

export function DraftCapacityStatus() {
  const { messages } = useI18n();

  return (
    <div
      aria-live="polite"
      className={`${QUOTECUE_INTERACTIVE_CLASS} qc-surface qc-elevated fixed right-4 top-4 flex max-w-80 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm`}
      role="status"
    >
      <WarningIcon aria-hidden="true" className="size-4 shrink-0 text-amber-600" weight="bold" />
      <span>{messages.draftCapacityExceeded}</span>
    </div>
  );
}
