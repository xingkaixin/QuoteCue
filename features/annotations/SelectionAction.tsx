import { MessageSquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/I18nProvider";

import type { SelectionDraft } from "./annotation";

type SelectionActionProps = {
  draft: SelectionDraft;
  onActivate: () => void;
  onDismiss: () => void;
};

const ACTION_SIZE = { height: 36, width: 112 };
const VIEWPORT_MARGIN = 8;

export function SelectionAction({ draft, onActivate, onDismiss }: SelectionActionProps) {
  const { messages } = useI18n();

  return (
    <Button
      aria-label={messages.addAnnotation}
      className="quotecue-interactive qc-elevated fixed rounded-full"
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onDismiss();
        }
      }}
      onPointerDown={(event) => event.preventDefault()}
      size="sm"
      style={selectionActionPosition(draft.rect)}
    >
      <MessageSquarePlus aria-hidden="true" className="size-4" />
      QuoteCue
    </Button>
  );
}

export function selectionActionPosition(rect: SelectionDraft["rect"]) {
  const maxLeft = Math.max(
    VIEWPORT_MARGIN,
    window.innerWidth - ACTION_SIZE.width - VIEWPORT_MARGIN,
  );
  const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), maxLeft);
  const positionAbove = rect.top - ACTION_SIZE.height - VIEWPORT_MARGIN;
  const maxTop = Math.max(
    VIEWPORT_MARGIN,
    window.innerHeight - ACTION_SIZE.height - VIEWPORT_MARGIN,
  );
  const preferredTop =
    positionAbove >= VIEWPORT_MARGIN
      ? positionAbove
      : Math.min(rect.bottom + VIEWPORT_MARGIN, maxTop);
  const top = Math.min(Math.max(preferredTop, VIEWPORT_MARGIN), maxTop);

  return { left, top, width: ACTION_SIZE.width };
}
