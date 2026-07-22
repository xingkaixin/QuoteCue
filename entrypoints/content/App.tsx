import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AnnotationBadge } from "@/features/annotations/AnnotationBadge";
import { AnnotationEditor } from "@/features/annotations/AnnotationEditor";
import { AnnotationQuickInput } from "@/features/annotations/AnnotationQuickInput";
import { AnnotationSummary } from "@/features/annotations/AnnotationSummary";
import { DraftPersistenceStatus } from "@/features/annotations/DraftPersistenceStatus";
import { SelectionAction } from "@/features/annotations/SelectionAction";
import type {
  AnnotationEditorState,
  DraftAnnotation,
  SelectionDraft,
} from "@/features/annotations/annotation";
import { useAnnotationHighlights } from "@/features/annotations/use-annotation-highlights";
import { useConversationKey } from "@/features/annotations/use-conversation-key";
import { useDeferredAnnotationDeletion } from "@/features/annotations/use-deferred-annotation-deletion";
import { useDraftAnnotations } from "@/features/annotations/use-draft-annotations";
import { useSelectionOverlay } from "@/features/annotations/use-selection-overlay";
import {
  registerSendInterceptor,
  type AnnotatedSendState,
} from "@/features/chatgpt/register-send-interceptor";
import { chatGptHost } from "@/features/chatgpt/chatgpt-host";
import { useAnnotatedComposerLayout } from "@/features/chatgpt/use-annotated-composer-layout";
import { useI18n } from "@/features/i18n/I18nProvider";

export default function App() {
  const { locale } = useI18n();
  const conversationKey = useConversationKey();
  const {
    annotations,
    revision: draftRevision,
    status: draftStatus,
    errorOperation,
    isHydrated,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    clearAnnotations,
    retry,
  } = useDraftAnnotations(conversationKey);
  const [sendState, setSendState] = useState<AnnotatedSendState>({ status: "idle" });
  const [editor, setEditor] = useState<AnnotationEditorState>({ status: "hidden" });
  const { hasPendingDeletion, requestDeletion, undoDeletion, visibleAnnotations } =
    useDeferredAnnotationDeletion(annotations, conversationKey, removeAnnotation);
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
  const { dismissSelectionAction, selectionAction } = useSelectionOverlay(
    isHydrated,
    conversationKey,
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
  const draftRef = useRef({ annotations: visibleAnnotations, revision: draftRevision ?? 0 });
  const sendActionsRef = useRef<SendActions>({
    submit: () => undefined,
    retry: () => undefined,
  });

  draftRef.current = { annotations: visibleAnnotations, revision: draftRevision ?? 0 };

  useEffect(() => {
    const interceptor = registerSendInterceptor({
      draft: () => draftRef.current,
      locale: () => locale,
      onSendAccepted: (revision) => {
        if (clearAnnotations(revision)) {
          setEditor({ status: "hidden" });
          undoDeletion();
        }
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
  }, [clearAnnotations, locale, undoDeletion]);

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
    const restored = chatGptHost.selection.restore(annotation.anchor);
    if (restored.status === "unavailable") {
      return;
    }
    const range = restored.value;

    if (isRangeVisible(range)) {
      showExpandedEditor(annotation);
      return;
    }

    annotationElement(range)?.scrollIntoView({ behavior: "auto", block: "center" });
    requestAnimationFrame(() => showExpandedEditor(annotation));
  };

  const showExpandedEditor = (annotation: DraftAnnotation) => {
    const draft = chatGptHost.selection.draft(annotation);
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

        {selectionAction.status === "action" && (
          <SelectionAction
            draft={selectionAction.draft}
            onActivate={() => {
              startAnnotation(selectionAction.draft);
              dismissSelectionAction();
            }}
            onDismiss={dismissSelectionAction}
          />
        )}

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
            hasPendingDeletion={hasPendingDeletion}
            onClear={() => {
              clearAnnotations();
              setEditor({ status: "hidden" });
            }}
            onEdit={openEditor}
            onRemove={deleteAnnotation}
            onSend={() => {
              const action = sendState.status === "failed" ? "retry" : "submit";
              sendActionsRef.current[action]();
            }}
            onUndo={undoDeletion}
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

function isRangeVisible(range: Range) {
  const rect = range.getBoundingClientRect();
  return rect.bottom >= 0 && rect.top <= window.innerHeight;
}

function annotationElement(range: Range) {
  const node = range.startContainer;
  return node instanceof Element ? node : node.parentElement;
}
