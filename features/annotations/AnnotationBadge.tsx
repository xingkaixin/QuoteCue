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
          className="flex size-5 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white shadow-lg ring-2 ring-white transition-transform duration-150 hover:scale-120 focus-visible:scale-120"
          onClick={() => onEdit(annotation)}
        >
          {number}
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          <p className="truncate whitespace-nowrap text-white">
            {annotation.comment || messages.noComment}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
