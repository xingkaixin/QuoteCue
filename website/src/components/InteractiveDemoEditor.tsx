import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import type { CSSProperties, RefObject } from "react";

import { Button } from "@/components/ui/button";
import type { DemoCopy } from "@/i18n/content";

type InteractiveDemoEditorProps = {
  comment: string;
  copy: DemoCopy;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onCancel: () => void;
  onChange: (comment: string) => void;
  onDelete: () => void;
  onSave: () => void;
  style: CSSProperties;
};

export function InteractiveDemoEditor({
  comment,
  copy,
  editorRef,
  onCancel,
  onChange,
  onDelete,
  onSave,
  style,
}: InteractiveDemoEditorProps) {
  return (
    <div
      className="animate-rise absolute z-50 w-[21.25rem] max-w-[calc(100%-2rem)] rounded-2xl border border-line bg-panel p-3 shadow-[var(--surface-shadow)]"
      style={style}
    >
      <textarea
        className="h-24 w-full resize-none border-0 bg-transparent text-sm leading-[1.55] text-foreground outline-none placeholder:text-muted"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) onSave();
        }}
        placeholder={copy.optionalComment}
        ref={editorRef}
        value={comment}
      />
      <div className="mt-2.5 flex items-center justify-between">
        <Button
          aria-label={copy.remove}
          className="text-muted hover:text-red-500"
          onClick={onDelete}
          size="icon"
          variant="ghost"
        >
          <TrashIcon aria-hidden="true" size={16} weight="bold" />
        </Button>
        <div className="flex items-center gap-1.5">
          <Button onClick={onCancel} size="compact" variant="ghost">
            {copy.cancel}
          </Button>
          <Button onClick={onSave} size="compact" variant="primary">
            {copy.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
