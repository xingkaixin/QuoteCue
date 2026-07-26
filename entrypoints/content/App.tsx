import { TooltipProvider } from "@/components/ui/tooltip";
import { AnnotationBadge } from "@/features/annotations/AnnotationBadge";
import { AnnotationEditor } from "@/features/annotations/AnnotationEditor";
import { AnnotationQuickInput } from "@/features/annotations/AnnotationQuickInput";
import { AnnotationSummary } from "@/features/annotations/AnnotationSummary";
import { DraftPersistenceStatus } from "@/features/annotations/DraftPersistenceStatus";
import { SelectionPresentation } from "@/features/annotations/SelectionPresentation";
import { useAnnotationWorkspace } from "@/features/annotations/use-annotation-workspace";
import { useAnnotatedComposerLayout } from "@/features/host/use-annotated-composer-layout";

export default function App() {
  const { draft, editor, selection, summary } = useAnnotationWorkspace();
  const composerLayout = useAnnotatedComposerLayout(summary.isVisible);
  const activeProjection = editor.projection;

  return (
    <TooltipProvider delay={180}>
      <div data-quotecue-root>
        {draft.status === "loading" && <DraftPersistenceStatus status="loading" />}

        {draft.status === "error" && draft.errorOperation && (
          <DraftPersistenceStatus
            operation={draft.errorOperation}
            onRetry={draft.retry}
            status="error"
          />
        )}

        <SelectionPresentation {...selection} />

        {editor.status === "quick" && activeProjection?.rect && (
          <AnnotationQuickInput
            onClose={editor.close}
            onSave={editor.save}
            rect={activeProjection.rect}
          />
        )}

        {editor.status === "expanded" && activeProjection?.rect && (
          <AnnotationEditor
            annotation={activeProjection.annotation}
            onCancel={editor.close}
            onDelete={() => summary.remove(activeProjection.annotation.id)}
            onSave={editor.save}
            rect={activeProjection.rect}
          />
        )}

        {summary.annotations.map((projection) => {
          const position = projection.badge;
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
            onSend={summary.send}
            onUndo={summary.undoDeletion}
            position={composerLayout.summary}
            sendStatus={summary.sendStatus}
            sendPosition={composerLayout.send}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
