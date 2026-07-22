import { useCallback, useEffect, useRef, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AnnotationBadge } from "@/features/annotations/AnnotationBadge";
import { AnnotationEditor } from "@/features/annotations/AnnotationEditor";
import { AnnotationQuickInput } from "@/features/annotations/AnnotationQuickInput";
import { AnnotationSummary } from "@/features/annotations/AnnotationSummary";
import type {
  AnnotationEditorState,
  DraftAnnotation,
  SelectionDraft,
} from "@/features/annotations/annotation";
import {
  restoreTextAnchor,
  selectionDraftFromAnnotation,
} from "@/features/annotations/selection-anchor";
import { useAnnotationHighlights } from "@/features/annotations/use-annotation-highlights";
import { useConversationKey } from "@/features/annotations/use-conversation-key";
import { useDraftAnnotations } from "@/features/annotations/use-draft-annotations";
import { useSelectionOverlay } from "@/features/annotations/use-selection-overlay";
import { registerSendInterceptor } from "@/features/chatgpt/register-send-interceptor";
import { useAnnotatedComposerLayout } from "@/features/chatgpt/use-annotated-composer-layout";
import { useI18n } from "@/features/i18n/I18nProvider";

export default function App() {
  const { locale } = useI18n();
  const conversationKey = useConversationKey();
  const {
    annotations,
    isHydrated,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    clearAnnotations,
  } = useDraftAnnotations(conversationKey);
  const [editor, setEditor] = useState<AnnotationEditorState>({ status: "hidden" });
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
  useSelectionOverlay(isHydrated ? startAnnotation : null);

  const activeAnnotationId = editor.status === "hidden" ? null : editor.annotationId;
  const activeAnnotation = annotations.find(({ id }) => id === activeAnnotationId);
  const badgePositions = useAnnotationHighlights(annotations, activeAnnotationId);
  const composerLayout = useAnnotatedComposerLayout(isHydrated && annotations.length > 0);
  const annotationsRef = useRef(annotations);
  const submitAnnotationsRef = useRef<() => boolean>(() => false);

  annotationsRef.current = annotations;

  useEffect(() => {
    const interceptor = registerSendInterceptor({
      annotations: () => annotationsRef.current,
      locale: () => locale,
      onSendAccepted: () => {
        clearAnnotations();
        setEditor({ status: "hidden" });
      },
    });
    submitAnnotationsRef.current = interceptor.submit;

    return () => {
      submitAnnotationsRef.current = () => false;
      interceptor.dispose();
    };
  }, [clearAnnotations, locale]);

  useEffect(() => setEditor({ status: "hidden" }), [conversationKey]);

  const saveActiveAnnotation = (comment: string) => {
    if (editor.status === "hidden") {
      return;
    }

    const annotationId = editor.annotationId;
    updateAnnotation(annotationId, comment);
    setEditor({ status: "hidden" });
  };

  const openEditor = (annotation: DraftAnnotation) => {
    const range = restoreTextAnchor(annotation.anchor);
    if (!range) {
      return;
    }

    if (isRangeVisible(range)) {
      showExpandedEditor(annotation);
      return;
    }

    annotationElement(range)?.scrollIntoView({ behavior: "auto", block: "center" });
    requestAnimationFrame(() => showExpandedEditor(annotation));
  };

  const showExpandedEditor = (annotation: DraftAnnotation) => {
    const draft = selectionDraftFromAnnotation(annotation);
    if (draft) {
      setEditor({ status: "expanded", annotationId: annotation.id, draft });
    }
  };

  const deleteAnnotation = (annotationId: string) => {
    removeAnnotation(annotationId);
    if (activeAnnotationId === annotationId) {
      setEditor({ status: "hidden" });
    }
  };

  return (
    <TooltipProvider delay={180}>
      <div data-quotecue-root>
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
            number={annotations.findIndex(({ id }) => id === position.annotation.id) + 1}
            onEdit={openEditor}
          />
        ))}

        {isHydrated && annotations.length > 0 && composerLayout && (
          <AnnotationSummary
            annotations={annotations}
            onClear={() => {
              clearAnnotations();
              setEditor({ status: "hidden" });
            }}
            onEdit={openEditor}
            onRemove={deleteAnnotation}
            onSend={() => submitAnnotationsRef.current()}
            position={composerLayout.summary}
            sendPosition={composerLayout.send}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function isRangeVisible(range: Range) {
  const rect = range.getBoundingClientRect();
  return rect.bottom >= 0 && rect.top <= window.innerHeight;
}

function annotationElement(range: Range) {
  const node = range.startContainer;
  return node instanceof Element ? node : node.parentElement;
}
