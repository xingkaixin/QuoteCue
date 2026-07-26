import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AnnotationBadge } from "@/features/annotations/AnnotationBadge";
import { AnnotationEditor } from "@/features/annotations/AnnotationEditor";
import { AnnotationQuickInput } from "@/features/annotations/AnnotationQuickInput";
import { AnnotationSummary } from "@/features/annotations/AnnotationSummary";
import { DraftPersistenceStatus } from "@/features/annotations/DraftPersistenceStatus";
import { SelectionPresentation } from "@/features/annotations/SelectionPresentation";
import type {
  AnnotationEditorState,
  DraftAnnotation,
  SelectionDraft,
} from "@/features/annotations/annotation";
import { useAnnotationHighlights } from "@/features/annotations/use-annotation-highlights";
import { useConversationKey } from "@/features/annotations/use-conversation-key";
import { useDeferredAnnotationDeletion } from "@/features/annotations/use-deferred-annotation-deletion";
import { useDraftAnnotations } from "@/features/annotations/use-draft-annotations";
import {
  registerSendInterceptor,
  type AnnotatedSendState,
} from "@/features/host/register-send-interceptor";
import { requireActiveHost } from "@/features/host/active-host";
import { useAnnotatedComposerLayout } from "@/features/host/use-annotated-composer-layout";
import { useI18n } from "@/features/i18n/I18nProvider";

export default function App() {
  const host = requireActiveHost();
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
    undoDeletions,
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
      setEditor({ status: "quick", annotationId: annotation.id, draft });
      window.getSelection()?.removeAllRanges();
    },
    [addAnnotation],
  );
  const activeAnnotationId = editor.status === "hidden" ? null : editor.annotationId;
  const activeAnnotation = visibleAnnotations.find(({ id }) => id === activeAnnotationId);
  const { badgePositions, unresolvedAnnotationIds } = useAnnotationHighlights(
    visibleAnnotations,
    activeAnnotationId,
  );
  const annotationNumberById = useMemo(
    () => new Map(visibleAnnotations.map(({ id }, index) => [id, index + 1])),
    [visibleAnnotations],
  );
  const composerLayout = useAnnotatedComposerLayout(isHydrated && annotations.length > 0);
  const annotationsRef = useRef(visibleAnnotations);
  const sendActionsRef = useRef<SendActions>({
    submit: () => undefined,
    retry: () => undefined,
  });

  annotationsRef.current = visibleAnnotations;

  useEffect(() => {
    const interceptor = registerSendInterceptor({
      annotations: () => annotationsRef.current,
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
  }, [locale, removeSentAnnotations]);

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

  const openEditor = (annotation: DraftAnnotation) => {
    const reveal = host.selection.reveal(annotation.anchor);
    if (reveal.status === "unavailable") {
      return;
    }

    if (reveal.value === "visible") {
      showExpandedEditor(annotation);
      return;
    }

    requestAnimationFrame(() => showExpandedEditor(annotation));
  };

  const showExpandedEditor = (annotation: DraftAnnotation) => {
    const draft = host.selection.draft(annotation);
    if (draft.status === "available") {
      setEditor({ status: "expanded", annotationId: annotation.id, draft: draft.value });
    }
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

        {editor.status === "quick" && (
          <AnnotationQuickInput
            draft={editor.draft}
            onClose={() => setEditor({ status: "hidden" })}
            onSave={saveActiveAnnotation}
          />
        )}

        {editor.status === "expanded" && activeAnnotation && (
          <AnnotationEditor
            annotation={activeAnnotation}
            draft={editor.draft}
            onCancel={() => setEditor({ status: "hidden" })}
            onDelete={() => deleteAnnotation(activeAnnotation.id)}
            onSave={saveActiveAnnotation}
          />
        )}

        {badgePositions.map((position) => (
          <AnnotationBadge
            {...position}
            key={position.annotation.id}
            number={annotationNumberById.get(position.annotation.id) ?? 0}
            onEdit={openEditor}
          />
        ))}

        {isHydrated && annotations.length > 0 && composerLayout && (
          <AnnotationSummary
            annotations={visibleAnnotations}
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
            onUndo={undoDeletions}
            position={composerLayout.summary}
            sendStatus={annotationSendStatus(sendState)}
            sendPosition={composerLayout.send}
            unresolvedAnnotationIds={unresolvedAnnotationIds}
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
