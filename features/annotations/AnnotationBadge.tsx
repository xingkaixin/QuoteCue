import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/features/i18n/I18nProvider";

import type { AnnotationBadgePosition } from "./use-annotation-highlights";

type AnnotationBadgeProps = AnnotationBadgePosition & {
  number: number;
  onEdit: (annotation: AnnotationBadgePosition["annotation"]) => void;
};

export function AnnotationBadge({ annotation, left, number, onEdit, top }: AnnotationBadgeProps) {
  const { messages } = useI18n();

  return (
    <div
      className="quotecue-interactive fixed z-[2147483646] flex size-6 items-center justify-center"
      style={{ left, top }}
    >
      <Tooltip>
        <TooltipTrigger
          aria-label={messages.viewAnnotation(number)}
          className="qc-cue qc-focus qc-pressable flex size-5 cursor-pointer items-center justify-center rounded-full text-xs font-semibold"
          onClick={() => onEdit(annotation)}
        >
          {number}
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          <p className="truncate whitespace-nowrap">{annotation.comment || messages.noComment}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
