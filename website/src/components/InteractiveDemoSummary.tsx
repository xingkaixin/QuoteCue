import { MessageSquareText, Pencil, Trash2, X } from "lucide-react";

import type { DemoCopy } from "@/i18n/content";

import type { DemoAnnotation } from "./interactive-demo-state";

type InteractiveDemoSummaryProps = {
  annotations: readonly DemoAnnotation[];
  copy: DemoCopy;
  isOpen: boolean;
  isSending: boolean;
  onClear: () => void;
  onEdit: (annotation: DemoAnnotation) => void;
  onRemove: (annotationId: number) => void;
  onToggle: () => void;
};

export function InteractiveDemoSummary({
  annotations,
  copy,
  isOpen,
  isSending,
  onClear,
  onEdit,
  onRemove,
  onToggle,
}: InteractiveDemoSummaryProps) {
  if (annotations.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-[5.75rem] left-5 z-30 flex max-w-[calc(100%-2.5rem)] items-center gap-2 sm:left-[1.875rem]">
      <div className="flex overflow-hidden rounded-lg border border-line bg-panel shadow-[var(--surface-shadow)]">
        <button
          className="flex h-8 cursor-pointer items-center gap-1.5 px-2.5 text-xs font-medium text-foreground outline-none hover:bg-panel-strong focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          disabled={isSending}
          onClick={onToggle}
          type="button"
        >
          <MessageSquareText aria-hidden="true" className="text-accent" size={16} />
          {copy.formatAnnotationCount(annotations.length)}
        </button>
        <button
          aria-label={copy.clear}
          className="flex size-8 cursor-pointer items-center justify-center border-l border-line text-muted outline-none hover:bg-panel-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          disabled={isSending}
          onClick={onClear}
          type="button"
        >
          <X aria-hidden="true" size={14} />
        </button>
      </div>

      {isOpen && (
        <div
          aria-label={copy.formatAnnotationCount(annotations.length)}
          className="absolute bottom-[calc(100%+0.375rem)] left-0 w-[min(24rem,calc(100vw-3.5rem))] overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--surface-shadow)]"
          role="dialog"
        >
          <div className="max-h-80 overflow-y-auto">
            {annotations.map((annotation, index) => (
              <div
                className="relative flex gap-2.5 border-b border-hairline p-3 last:border-b-0"
                key={annotation.id}
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 pr-[4.75rem] text-xs leading-5">
                  <p className="m-0 text-muted">{copy.selectedText}</p>
                  <p className="m-0 line-clamp-2 overflow-wrap-anywhere">{annotation.text}</p>
                  {annotation.comment && (
                    <>
                      <p className="mt-2 mb-0 text-muted">{copy.userComment}</p>
                      <p className="m-0 overflow-wrap-anywhere">{annotation.comment}</p>
                    </>
                  )}
                </div>
                <div className="absolute top-2.5 right-2.5 flex overflow-hidden rounded-lg border border-line bg-panel">
                  <button
                    aria-label={copy.edit}
                    className="flex size-8 cursor-pointer items-center justify-center text-muted outline-none hover:bg-panel-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => onEdit(annotation)}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={14} />
                  </button>
                  <button
                    aria-label={copy.remove}
                    className="flex size-8 cursor-pointer items-center justify-center border-l border-line text-red-500 outline-none hover:bg-panel-strong focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => onRemove(annotation.id)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
