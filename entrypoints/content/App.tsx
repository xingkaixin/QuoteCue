import { useCallback, useEffect, useRef, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AnnotationBadge } from "@/features/annotations/AnnotationBadge";
import { AnnotationEditor } from "@/features/annotations/AnnotationEditor";
import { AnnotationQuickInput } from "@/features/annotations/AnnotationQuickInput";
import { AnnotationSummary } from "@/features/annotations/AnnotationSummary";
import { DraftPersistenceStatus } from "@/features/annotations/DraftPersistenceStatus";
import { SelectionPresentation } from "@/features/annotations/SelectionPresentation";
import type { ProjectedAnnotation } from "@/features/annotations/annotation-projection";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import type {
  AnnotationEditorState,
  DraftAnnotation,
  SelectionDraft,
} from "@/features/annotations/annotation";
import { useAnnotationProjection } from "@/features/annotations/use-annotation-projection";
import { useConversationKey } from "@/features/annotations/use-conversation-key";
import { useDeferredAnnotationDeletion } from "@/features/annotations/use-deferred-annotation-deletion";
import { useDraftAnnotations } from "@/features/annotations/use-draft-annotations";
import {
  registerSendInterceptor,
  type AnnotatedSendState,
} from "@/features/host/register-send-interceptor";
import { useAnnotatedComposerLayout } from "@/features/host/use-annotated-composer-layout";
import { useHost } from "@/features/host-port/HostProvider";
import { useI18n } from "@/features/i18n/I18nProvider";

export default function App() {
  const host = useHost();
  const { locale } = useI18n();
  const conversationKey = useConversationKey();
  const {
    annotations,
    status: draftStatus,
    errorOperation,
    isHydrated,
    addAnnotation,
    updateAnnotation,
    removeAnnotations,
    removeSentAnnotations,
    clearAnnotations,
    retry,
  } = useDraftAnnotations(conversationKey);
  const [sendState, setSendState] = useState<AnnotatedSendState>({ status: "idle" });
  const [editor, setEditor] = useState<AnnotationEditorState>({ status: "hidden" });
  const {
    discardPendingDeletions,
    pendingDeletionCount,
    pendingDeletionExpiresAt,
    requestDeletion,
    visibleAnnotations,
  } = useDeferredAnnotationDeletion(annotations, conversationKey, removeAnnotations);
  const startAnnotation = useCallback(
    (draft: SelectionDraft) => {
      const annotation: DraftAnnotation = {
        id: crypto.randomUUID(),
        anchor: draft.anchor,
        comment: "",
      };
      addAnnotation(annotation);
      setEditor({ status: "quick", annotationId: annotation.id });
      window.getSelection()?.removeAllRanges();
    },
    [addAnnotation],
  );
  const activeAnnotationId = editor.status === "hidden" ? null : editor.annotationId;
  const projectedAnnotations = useAnnotationProjection(visibleAnnotations, activeAnnotationId);
  const activeProjection = projectedAnnotations.find(
    ({ annotation }) => annotation.id === activeAnnotationId,
  );
  const composerLayout = useAnnotatedComposerLayout(isHydrated && annotations.length > 0);
  const annotationsRef = useRef(projectedAnnotations);
  const sendActionsRef = useRef<SendActions>({
    submit: () => undefined,
    retry: () => undefined,
  });

  annotationsRef.current = projectedAnnotations;

  useEffect(() => {
    const interceptor = registerSendInterceptor({
      annotations: () => annotationsRef.current,
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => locale,
      onSendAccepted: (sentAnnotations) => {
        removeSentAnnotations(sentAnnotations);
        setEditor({ status: "hidden" });
      },
      onStateChange: setSendState,
    });
    sendActionsRef.current = {
      retry: () => {
        void interceptor.retry();
      },
      submit: () => {
        void interceptor.submit();
      },
    };

    return () => {
      sendActionsRef.current = { submit: () => undefined, retry: () => undefined };
      interceptor.dispose();
    };
  }, [host, locale, removeSentAnnotations]);

  useEffect(() => {
    setEditor({ status: "hidden" });
  }, [conversationKey]);

  const saveActiveAnnotation = (comment: string) => {
    if (editor.status === "hidden") {
      return;
    }

    const annotationId = editor.annotationId;
    updateAnnotation(annotationId, comment);
    setEditor({ status: "hidden" });
  };

  const openEditor = (projection: ProjectedAnnotation) => {
    if (!projection.range) {
      return;
    }
    const reveal = host.selection.reveal(projection.range);
    if (reveal.status === "unavailable") {
      return;
    }

    if (reveal.value === "visible") {
      showExpandedEditor(projection.annotation.id);
      return;
    }

    requestAnimationFrame(() => showExpandedEditor(projection.annotation.id));
  };

  const showExpandedEditor = (annotationId: string) => {
    setEditor({ status: "expanded", annotationId });
  };

  const deleteAnnotation = (annotationId: string) => {
    if (!requestDeletion(annotationId)) {
      return;
    }
    if (activeAnnotationId === annotationId) {
      setEditor({ status: "hidden" });
    }
  };

  return (
    <TooltipProvider delay={180}>
      <div data-quotecue-root>
        {draftStatus === "loading" && <DraftPersistenceStatus status="loading" />}

        {draftStatus === "error" && errorOperation && (
          <DraftPersistenceStatus operation={errorOperation} onRetry={retry} status="error" />
        )}

        <SelectionPresentation
          isEnabled={isHydrated}
          onActivate={startAnnotation}
          resetKey={conversationKey}
        />

        {editor.status === "quick" && activeProjection?.rect && (
          <AnnotationQuickInput
            onClose={() => setEditor({ status: "hidden" })}
            onSave={saveActiveAnnotation}
            rect={activeProjection.rect}
          />
        )}

        {editor.status === "expanded" && activeProjection?.rect && (
          <AnnotationEditor
            annotation={activeProjection.annotation}
            onCancel={() => setEditor({ status: "hidden" })}
            onDelete={() => deleteAnnotation(activeProjection.annotation.id)}
            onSave={saveActiveAnnotation}
            rect={activeProjection.rect}
          />
        )}

        {projectedAnnotations.map((projection) => {
          const position = projection.badge;
          return position ? (
            <AnnotationBadge
              entry={projection}
              key={projection.annotation.id}
              left={position.left}
              onEdit={openEditor}
              top={position.top}
            />
          ) : null;
        })}

        {isHydrated && annotations.length > 0 && composerLayout && (
          <AnnotationSummary
            annotations={projectedAnnotations}
            pendingDeletionCount={pendingDeletionCount}
            pendingDeletionExpiresAt={pendingDeletionExpiresAt}
            onClear={() => {
              if (clearAnnotations()) {
                discardPendingDeletions();
                setEditor({ status: "hidden" });
              }
            }}
            onEdit={openEditor}
            onRemove={deleteAnnotation}
            onSend={() => {
              const action = sendState.status === "failed" ? "retry" : "submit";
              sendActionsRef.current[action]();
            }}
            onUndo={discardPendingDeletions}
            position={composerLayout.summary}
            sendStatus={annotationSendStatus(sendState)}
            sendPosition={composerLayout.send}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

type SendActions = {
  submit: () => void;
  retry: () => void;
};

function annotationSendStatus(state: AnnotatedSendState): "idle" | "pending" | "failed" {
  if (state.status === "idle") {
    return "idle";
  }
  return state.status === "failed" ? "failed" : "pending";
}
