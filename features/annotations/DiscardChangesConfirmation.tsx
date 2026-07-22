import type { Ref } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/I18nProvider";
import { cn } from "@/lib/cn";

type DiscardChangesConfirmationProps = {
  className?: string;
  continueButtonRef: Ref<HTMLButtonElement>;
  onContinue: () => void;
  onDiscard: () => void;
};

export function DiscardChangesConfirmation({
  className,
  continueButtonRef,
  onContinue,
  onDiscard,
}: DiscardChangesConfirmationProps) {
  const { messages } = useI18n();

  return (
    <div
      aria-label={messages.unsavedChanges}
      aria-modal="true"
      className={cn("qc-surface qc-elevated z-10 rounded-2xl border p-3", className)}
      onKeyDown={(event) => {
        if (event.key !== "Tab") {
          return;
        }
        const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
        const boundaryButton = event.shiftKey ? buttons[0] : buttons.at(-1);
        if (document.activeElement !== boundaryButton) {
          return;
        }
        event.preventDefault();
        const target = event.shiftKey ? buttons.at(-1) : buttons[0];
        target?.focus();
      }}
      role="alertdialog"
    >
      <p className="text-sm font-semibold">{messages.unsavedChanges}</p>
      <p className="qc-muted mt-1 text-xs leading-5">{messages.discardChangesPrompt}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button className="qc-danger" onClick={onDiscard} size="sm" variant="ghost">
          {messages.discardChanges}
        </Button>
        <Button onClick={onContinue} ref={continueButtonRef} size="sm">
          {messages.continueEditing}
        </Button>
      </div>
    </div>
  );
}
