import { ArrowUp, LoaderCircle } from "lucide-react";
import { useReducer, useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import type { DemoCopy } from "@/i18n/content";
import { SUPPORTED_SITES, type SupportedSiteName } from "../../../lib/supported-sites";

import { compileDemoPrompt } from "./interactive-demo-prompt";
import { InteractiveDemoEditor } from "./InteractiveDemoEditor";
import { InteractiveDemoSummary } from "./InteractiveDemoSummary";
import {
  initialInteractiveDemoState,
  reduceInteractiveDemo,
  type DemoAnnotation,
} from "./interactive-demo-state";
import { useInteractiveDemoProjection } from "./use-interactive-demo-projection";
import { useInteractiveDemoStatusTimer } from "./use-interactive-demo-status-timer";

const siteNames = SUPPORTED_SITES.map(({ name }) => name);

interface InteractiveDemoProps {
  copy: DemoCopy;
}

function formatRemovedNotice(copy: DemoCopy, removed: number, remaining: number) {
  switch (copy.locale) {
    case "zh-CN":
      return `已删除 ${removed} 条批注，还剩 ${remaining} 条。`;
    case "ja":
      return `${removed} 件の注釈を削除しました。残り ${remaining} 件です。`;
    case "en":
      return `${removed === 1 ? "Annotation" : `${removed} annotations`} removed. ${remaining} remaining.`;
  }
}

export function InteractiveDemo({ copy }: InteractiveDemoProps) {
  const sequenceRef = useRef(0);

  const [site, setSite] = useState<SupportedSiteName>(siteNames[0]);
  const [demo, dispatch] = useReducer(reduceInteractiveDemo, initialInteractiveDemoState);

  const { annotations, clearArmed, editor, pendingRemovals, send, sentPrompt, summaryOpen } = demo;
  const editingId = editor?.annotationId ?? null;
  const editorComment = editor?.comment ?? "";
  const sending = send.kind === "sending";
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
  useInteractiveDemoStatusTimer({ clearArmed, pendingRemovals, send }, dispatch);

  function createAnnotation() {
    if (!candidate) return;
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
    dispatch({ type: "open-editor", annotationId: annotation.id });
  }

  function saveEditor() {
    dispatch({ type: "save-editor" });
  }

  function cancelEditor() {
    dispatch({ type: "cancel-editor" });
  }

  function removeAnnotation(id: number) {
    dispatch({ type: "remove-annotation", annotationId: id });
  }

  function undoRemoval() {
    dispatch({ type: "undo-removal" });
  }

  function clearAll() {
    dispatch({ type: "request-clear" });
  }

  function sendAnnotations() {
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
            {siteNames.map((name) => (
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

          <InteractiveDemoSummary
            annotations={annotations}
            copy={copy}
            isOpen={summaryOpen}
            isSending={sending}
            onClear={clearAll}
            onEdit={openEditor}
            onRemove={removeAnnotation}
            onToggle={() => dispatch({ type: "set-summary-open", isOpen: !summaryOpen })}
          />
        </div>

        {pendingRemovals.length > 0 && (
          <div
            aria-live="polite"
            className="absolute right-4 bottom-[5.75rem] z-40 flex max-w-[calc(100%-2rem)] items-center gap-2 overflow-hidden rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs shadow-[var(--surface-shadow)]"
            role="status"
          >
            <span>{formatRemovedNotice(copy, pendingRemovals.length, annotations.length)}</span>
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
          <InteractiveDemoEditor
            comment={editorComment}
            copy={copy}
            editorRef={editorRef}
            onCancel={cancelEditor}
            onChange={(comment) => dispatch({ type: "change-editor-comment", comment })}
            onDelete={() => removeAnnotation(editingId)}
            onSave={saveEditor}
            style={editorStyle}
          />
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
