import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/features/i18n/I18nProvider";

import type { NumberedAnnotation } from "./annotation-projection";

type AnnotationBadgeProps = {
  entry: NumberedAnnotation;
  left: number;
  onEdit: (annotation: NumberedAnnotation["annotation"]) => void;
  top: number;
};

export function AnnotationBadge({ entry, left, onEdit, top }: AnnotationBadgeProps) {
  const { messages } = useI18n();
  const { annotation, ordinal } = entry;
  const comment = annotation.comment.trim();

  return (
    <div
      className="quotecue-interactive fixed z-[2147483646] flex size-6 items-center justify-center"
      style={{ left, top }}
    >
      <Tooltip disabled={!comment}>
        <TooltipTrigger
          aria-label={messages.viewAnnotation(ordinal)}
          className="qc-cue qc-focus qc-pressable flex size-5 cursor-pointer items-center justify-center rounded-full text-xs font-semibold"
          onClick={() => onEdit(annotation)}
        >
          {ordinal}
        </TooltipTrigger>
        {comment && (
          <TooltipContent className="max-w-64">
            <p className="truncate whitespace-nowrap">{comment}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}
