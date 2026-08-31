import { TooltipProvider } from "@/components/ui/tooltip";
import { AnnotationBadge } from "@/features/annotations/AnnotationBadge";
import { AnnotationEditor } from "@/features/annotations/AnnotationEditor";
import { AnnotationQuickInput } from "@/features/annotations/AnnotationQuickInput";
import { AnnotationSendControl } from "@/features/annotations/AnnotationSendControl";
import { AnnotationSummary } from "@/features/annotations/AnnotationSummary";
import { DraftCapacityStatus } from "@/features/annotations/DraftCapacityStatus";
import { DraftPersistenceStatus } from "@/features/annotations/DraftPersistenceStatus";
import { RetainedDraftStatus } from "@/features/annotations/RetainedDraftStatus";
import { SelectionPresentation } from "@/features/annotations/SelectionPresentation";
import { useAnnotationWorkspace } from "@/features/annotations/use-annotation-workspace";
import { useAnnotatedComposerLayout } from "@/features/host/use-annotated-composer-layout";

export default function App() {
  const { draft, editor, retainedDraft, selection, summary } = useAnnotationWorkspace();
  const hasSendFeedback = summary.sendState.status !== "idle";
  const isSendControlVisible = summary.isVisible || hasSendFeedback;
  const composerLayout = useAnnotatedComposerLayout(isSendControlVisible);
  const activeProjection = editor.projection;
  const isRetainedDraftVisible =
    retainedDraft.state !== null &&
    selection.conversationIdentity.kind === "identified" &&
    draft.state.status === "ready" &&
    !draft.state.hasUnreadableAnnotations;

  return (
    <TooltipProvider delay={180}>
      <div>
        {draft.state.status === "loading" && <DraftPersistenceStatus {...draft.state} />}

        {draft.state.status === "error" && (
          <DraftPersistenceStatus {...draft.state} onRetry={draft.retry} />
        )}

        {draft.state.status === "ready" && draft.state.hasUnreadableAnnotations && (
          <DraftPersistenceStatus {...draft.state} onClear={summary.clear} />
        )}

        {draft.capacityExceeded && !isRetainedDraftVisible && <DraftCapacityStatus />}

        {retainedDraft.state && isRetainedDraftVisible && (
          <RetainedDraftStatus
            key={retainedDraft.state.conversationIdentity.sessionKey}
            state={retainedDraft.state}
            capacityExceeded={draft.capacityExceeded}
            isSending={retainedDraft.isSending}
            onRestore={retainedDraft.restore}
            onDiscard={retainedDraft.discard}
          />
        )}

        <SelectionPresentation {...selection} />

        {editor.status === "quick" && activeProjection?.resolution === "resolved" && (
          <AnnotationQuickInput
            bindSession={editor.bindSession}
            key={activeProjection.annotation.id}
            onClose={editor.close}
            onSave={editor.save}
            rect={activeProjection.geometry.rect}
          />
        )}

        {editor.status === "expanded" && activeProjection?.resolution === "resolved" && (
          <AnnotationEditor
            annotation={activeProjection.annotation}
            bindSession={editor.bindSession}
            key={activeProjection.annotation.id}
            onCancel={editor.close}
            onDelete={editor.delete}
            onSave={editor.save}
            rect={activeProjection.geometry.rect}
          />
        )}

        {summary.annotations.map((projection) => {
          if (projection.resolution !== "resolved") {
            return null;
          }
          const position = projection.geometry.badge;
          return position ? (
            <AnnotationBadge
              entry={projection}
              key={projection.annotation.id}
              left={position.left}
              onEdit={summary.open}
              top={position.top}
            />
          ) : null;
        })}

        {summary.isVisible && composerLayout && (
          <AnnotationSummary
            annotations={summary.annotations}
            pendingDeletionCount={summary.pendingDeletionCount}
            pendingDeletionExpiresAt={summary.pendingDeletionExpiresAt}
            onClear={summary.clear}
            onEdit={summary.open}
            onRemove={summary.remove}
            onUndo={summary.undoDeletion}
            position={composerLayout.summary}
          />
        )}

        {isSendControlVisible && composerLayout?.isSendControlPresent && (
          <AnnotationSendControl
            onSend={summary.send}
            position={composerLayout.send}
            state={summary.sendState}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
