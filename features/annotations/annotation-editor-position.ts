import type { SelectionDraft } from "./annotation";

const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 10;

type EditorSize = {
  height: number;
  width: number;
};

export function annotationEditorPosition(draft: SelectionDraft, size: EditorSize) {
  const left = Math.min(
    Math.max(draft.rect.right + ANCHOR_GAP, VIEWPORT_MARGIN),
    window.innerWidth - size.width - VIEWPORT_MARGIN,
  );
  const top = Math.min(
    draft.rect.bottom + ANCHOR_GAP,
    window.innerHeight - size.height - VIEWPORT_MARGIN,
  );

  return { left, top: Math.max(top, VIEWPORT_MARGIN) };
}
