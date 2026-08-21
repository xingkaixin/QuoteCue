import { ArrowUp, LoaderCircle, MessageSquareText, Pencil, Trash2, X } from "lucide-react";
import { useReducer, useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import type { DemoCopy } from "@/i18n/content";

import { compileDemoPrompt } from "./interactive-demo-prompt";
import {
  initialInteractiveDemoState,
  reduceInteractiveDemo,
  type DemoAnnotation,
} from "./interactive-demo-state";
import { useInteractiveDemoProjection } from "./use-interactive-demo-projection";
import { useInteractiveDemoStatusTimer } from "./use-interactive-demo-status-timer";

const sites = ["ChatGPT", "Claude", "DeepSeek", "Kimi"] as const;

interface InteractiveDemoProps {
  copy: DemoCopy;
}

function formatAnnotationCount(copy: DemoCopy, count: number) {
  if (copy.locale === "zh-CN") return `${count} 条批注`;
  return `${count} ${count === 1 ? "annotation" : "annotations"}`;
}

function formatRemovedNotice(copy: DemoCopy, remaining: number) {
  if (copy.locale === "zh-CN") return `批注已删除，还剩 ${remaining} 条。`;
  return `Annotation removed. ${remaining} ${remaining === 1 ? "annotation" : "annotations"} remaining.`;
}

export function InteractiveDemo({ copy }: InteractiveDemoProps) {
  const sequenceRef = useRef(0);

  const [site, setSite] = useState<(typeof sites)[number]>("ChatGPT");
  const [demo, dispatch] = useReducer(reduceInteractiveDemo, initialInteractiveDemoState);

  const { annotations, editor, sentPrompt, status, summaryOpen } = demo;
  const editingId = editor?.annotationId ?? null;
  const editorComment = editor?.comment ?? "";
  const sending = status.kind === "sending";
  const clearArmed = status.kind === "clear-armed";
  const undoBuffer = status.kind === "undo" ? status : null;
  const {
    candidate,
    captureSelection,
    captureTouchSelection,
    clearCandidate,
    editorRef,
    geometry,
    stageRef,
    transcriptRef,
  } = useInteractiveDemoProjection(annotations, editingId);
  useInteractiveDemoStatusTimer(status, dispatch);

  function createAnnotation() {
    if (!candidate || sending) return;
    const annotation: DemoAnnotation = {
      id: ++sequenceRef.current,
      text: candidate.text,
      comment: "",
      range: candidate.range,
    };
    dispatch({ type: "add-annotation", annotation });
    clearCandidate();
  }

  function openEditor(annotation: DemoAnnotation) {
    if (sending) return;
    dispatch({ type: "open-editor", annotationId: annotation.id });
  }

  function saveEditor() {
    dispatch({ type: "save-editor" });
  }

  function cancelEditor() {
    dispatch({ type: "cancel-editor" });
  }

  function removeAnnotation(id: number) {
    if (sending) return;
    dispatch({ type: "remove-annotation", annotationId: id });
  }

  function undoRemoval() {
    if (!undoBuffer) return;
    dispatch({ type: "undo-removal" });
  }

  function clearAll() {
    if (sending) return;
    if (!clearArmed) {
      dispatch({ type: "arm-clear" });
      return;
    }

    dispatch({ type: "confirm-clear" });
  }

  function sendAnnotations() {
    if (annotations.length === 0 || sending) return;
    const prompt = compileDemoPrompt(annotations, copy);
    dispatch({ type: "start-send", prompt });
  }

  const actionStyle = geometry.action
    ? ({ left: geometry.action.left, top: geometry.action.top } satisfies CSSProperties)
    : undefined;
  const editorStyle = geometry.editor
    ? ({ left: geometry.editor.left, top: geometry.editor.top } satisfies CSSProperties)
    : undefined;

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-[1.25rem] border border-line bg-panel shadow-[var(--surface-shadow)]"
        ref={stageRef}
      >
        <div className="flex min-h-11 items-center gap-2.5 border-b border-hairline bg-panel-strong px-3 py-2.5 sm:px-4">
          <div aria-hidden="true" className="hidden gap-1.5 sm:flex">
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
          </div>
          <div className="font-mono flex min-w-0 gap-0.5 overflow-x-auto sm:ml-2">
            {sites.map((name) => (
              <Button
                className={
                  name === site
                    ? "border-transparent bg-[var(--accent-soft)] px-2 text-accent hover:border-transparent hover:text-accent sm:px-3"
                    : "border-transparent px-2 sm:px-3"
                }
                key={name}
                onClick={() => setSite(name)}
                size="compact"
                variant="ghost"
              >
                {name}
              </Button>
            ))}
          </div>
          <span className="font-mono ml-auto hidden text-[0.6875rem] text-muted lg:block">
            quotecue-ui · shadowRoot: null
          </span>
        </div>

        <div className="px-5 pt-6 pb-5 sm:px-[1.875rem] sm:pt-7">
          <div className="mb-5 flex justify-end">
            <div className="max-w-[82%] rounded-[1.125rem] border border-hairline bg-panel-strong px-4 py-2.5 text-[0.9375rem] leading-6 sm:max-w-[62%]">
              {copy.userMessage}
            </div>
          </div>
          <div
            className="cursor-text text-[0.96875rem] leading-[1.78] select-text"
            onMouseUp={captureSelection}
            onTouchEnd={captureTouchSelection}
            ref={transcriptRef}
          >
            {copy.answer.map((paragraph) => (
              <p className="mb-4 last:mb-0" key={paragraph}>
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div className="relative px-5 pb-6 sm:px-[1.875rem]">
          {sentPrompt && (
            <div className="mb-4 flex justify-end">
              <pre className="animate-rise m-0 max-w-[92%] rounded-[1.125rem] border border-accent bg-[var(--accent-soft)] px-4 py-3 font-mono text-xs leading-6 break-words whitespace-pre-wrap sm:max-w-[78%]">
                {sentPrompt}
              </pre>
            </div>
          )}
          <div className="relative flex items-end gap-2.5 rounded-[1.625rem] border border-line bg-panel-strong p-3 pl-[1.125rem]">
            <span className="min-w-0 flex-1 pb-1.5 text-[0.9375rem] text-muted">
              {copy.composerPrefix} {site}
            </span>
            <Button
              aria-label={copy.send}
              className="size-9 shrink-0"
              disabled={annotations.length === 0 || sending}
              onClick={sendAnnotations}
              size="icon"
              variant="primary"
            >
              {sending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" size={19} />
              ) : (
                <ArrowUp aria-hidden="true" size={19} />
              )}
            </Button>
            {(sending || clearArmed) && (
              <div
                aria-live="polite"
                className="absolute right-14 bottom-3.5 max-w-[15rem] rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs shadow-[var(--surface-shadow)]"
                role="status"
              >
                {sending ? copy.sending : copy.clearConfirm}
              </div>
            )}
          </div>

          {annotations.length > 0 && (
            <div className="absolute bottom-[5.75rem] left-5 z-30 flex max-w-[calc(100%-2.5rem)] items-center gap-2 sm:left-[1.875rem]">
              <div className="flex overflow-hidden rounded-lg border border-line bg-panel shadow-[var(--surface-shadow)]">
                <button
                  className="flex h-8 cursor-pointer items-center gap-1.5 px-2.5 text-xs font-medium text-foreground outline-none hover:bg-panel-strong focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => dispatch({ type: "set-summary-open", isOpen: !summaryOpen })}
                  disabled={sending}
                  type="button"
                >
                  <MessageSquareText aria-hidden="true" className="text-accent" size={16} />
                  {formatAnnotationCount(copy, annotations.length)}
                </button>
                <button
                  aria-label={copy.clear}
                  className="flex size-8 cursor-pointer items-center justify-center border-l border-line text-muted outline-none hover:bg-panel-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={clearAll}
                  disabled={sending}
                  type="button"
                >
                  <X aria-hidden="true" size={14} />
                </button>
              </div>

              {summaryOpen && (
                <div
                  aria-label={formatAnnotationCount(copy, annotations.length)}
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
                          <p className="m-0 line-clamp-2 overflow-wrap-anywhere">
                            {annotation.text}
                          </p>
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
                            onClick={() => openEditor(annotation)}
                            type="button"
                          >
                            <Pencil aria-hidden="true" size={14} />
                          </button>
                          <button
                            aria-label={copy.remove}
                            className="flex size-8 cursor-pointer items-center justify-center border-l border-line text-red-500 outline-none hover:bg-panel-strong focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            onClick={() => removeAnnotation(annotation.id)}
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
          )}
        </div>

        {undoBuffer && (
          <div
            aria-live="polite"
            className="absolute right-4 bottom-[5.75rem] z-40 flex max-w-[calc(100%-2rem)] items-center gap-2 overflow-hidden rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs shadow-[var(--surface-shadow)]"
            role="status"
          >
            <span>{formatRemovedNotice(copy, annotations.length)}</span>
            <button
              className="cursor-pointer border-0 bg-transparent px-1.5 py-0.5 font-semibold text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={undoRemoval}
              type="button"
            >
              {copy.undo}
            </button>
            <span
              aria-hidden="true"
              className="animate-undo absolute right-0 bottom-0 left-0 h-0.5 origin-left bg-accent/70"
            />
          </div>
        )}

        {geometry.badges.map((badge, index) => {
          const annotation = annotations.find((item) => item.id === badge.id);
          if (!annotation) return null;
          return (
            <button
              aria-label={copy.edit}
              className="animate-pop absolute z-30 flex size-5 cursor-pointer items-center justify-center rounded-full border-0 bg-accent text-xs font-semibold text-accent-foreground shadow-[0_0_0_2px_var(--panel),0_8px_20px_rgb(0_0_0/32%)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={sending}
              key={badge.id}
              onClick={() => openEditor(annotation)}
              style={{ left: badge.left, top: badge.top }}
              title={annotation.comment}
              type="button"
            >
              {index + 1}
            </button>
          );
        })}

        {candidate && actionStyle && (
          <button
            className="animate-pop absolute z-40 flex h-8 cursor-pointer items-center rounded-full border border-line bg-panel px-3 text-[0.84375rem] font-medium text-foreground shadow-[var(--surface-shadow)] outline-none hover:border-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={createAnnotation}
            onMouseDown={(event) => event.preventDefault()}
            disabled={sending}
            style={actionStyle}
            type="button"
          >
            {copy.selectAction}
          </button>
        )}

        {editingId !== null && editorStyle && (
          <div
            className="animate-rise absolute z-50 w-[21.25rem] max-w-[calc(100%-2rem)] rounded-2xl border border-line bg-panel p-3 shadow-[var(--surface-shadow)]"
            style={editorStyle}
          >
            <textarea
              className="h-24 w-full resize-none border-0 bg-transparent text-sm leading-[1.55] text-foreground outline-none placeholder:text-muted"
              onChange={(event) =>
                dispatch({ type: "change-editor-comment", comment: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") cancelEditor();
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) saveEditor();
              }}
              placeholder={copy.optionalComment}
              ref={editorRef}
              value={editorComment}
            />
            <div className="mt-2.5 flex items-center justify-between">
              <Button
                aria-label={copy.remove}
                className="text-muted hover:text-red-500"
                onClick={() => editingId !== null && removeAnnotation(editingId)}
                size="icon"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" size={16} />
              </Button>
              <div className="flex items-center gap-1.5">
                <Button onClick={cancelEditor} size="compact" variant="ghost">
                  {copy.cancel}
                </Button>
                <Button onClick={saveEditor} size="compact" variant="primary">
                  {copy.save}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ol className="mt-6 grid list-none grid-cols-1 gap-px overflow-hidden rounded-[0.875rem] border border-line bg-line p-0 sm:grid-cols-2 lg:grid-cols-4">
        {copy.steps.map((step, index) => (
          <li className="bg-background px-5 py-[1.125rem]" key={step}>
            <div className="font-mono mb-2 text-[0.6875rem] text-accent">
              {String(index + 1).padStart(2, "0")}
            </div>
            <p className="m-0 text-[0.90625rem] leading-[1.55] text-muted">{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
