import { useCallback, useEffect, useRef, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";
import type { ConversationIdentity } from "@/features/host-port/host-port";
import { useI18n } from "@/features/i18n/I18nProvider";

import type { AnchoredSelection, AnnotationEditorState, DraftAnnotation } from "./annotation";
import type { ProjectedAnnotation } from "./annotation-projection";
import { sameConversationIdentity } from "./conversation-identity";
import { compileAnnotatedPrompt } from "./prompt-compiler";
import { registerSendInterceptor, type AnnotatedSendState } from "./register-send-interceptor";
import { useAnnotationProjection } from "./use-annotation-projection";
import { useConversationIdentity } from "./use-conversation-identity";
import { useDeferredAnnotationDeletion } from "./use-deferred-annotation-deletion";
import { useDraftAnnotations } from "./use-draft-annotations";

type SendController = ReturnType<typeof registerSendInterceptor>;

export function useAnnotationWorkspace() {
  const host = useHost();
  const { locale } = useI18n();
  const conversationIdentity = useConversationIdentity();
  const {
    annotations,
    status,
    errorOperation,
    isHydrated,
    addAnnotation,
    updateAnnotation,
    removeAnnotations,
    removeSentAnnotations,
    clearAnnotations,
    retry,
  } = useDraftAnnotations(conversationIdentity);
  const [sendState, setSendState] = useState<AnnotatedSendState>({ status: "idle" });
  const [editorState, setEditorState] = useState<AnnotationEditorState>({ status: "hidden" });
  const {
    discardPendingDeletions,
    pendingDeletionCount,
    pendingDeletionExpiresAt,
    requestDeletion,
    visibleAnnotations,
  } = useDeferredAnnotationDeletion(annotations, conversationIdentity, removeAnnotations);
  const activeAnnotationId = editorState.status === "hidden" ? null : editorState.annotationId;
  const projectedAnnotations = useAnnotationProjection(visibleAnnotations, activeAnnotationId);
  const activeProjection = projectedAnnotations.find(
    ({ annotation }) => annotation.id === activeAnnotationId,
  );
  const closeEditor = useCallback(() => setEditorState({ status: "hidden" }), []);
  const annotationsRef = useRef<readonly ProjectedAnnotation[]>(projectedAnnotations);
  const conversationIdentityRef = useRef(conversationIdentity);
  const localeRef = useRef(locale);
  const removeSentAnnotationsRef = useRef(removeSentAnnotations);
  const sendConversationIdentityRef = useRef<ConversationIdentity | null>(null);
  const sendControllerRef = useRef<SendController | null>(null);

  annotationsRef.current = projectedAnnotations;
  conversationIdentityRef.current = conversationIdentity;
  localeRef.current = locale;
  removeSentAnnotationsRef.current = removeSentAnnotations;

  useEffect(() => {
    const controller = registerSendInterceptor({
      annotations: () => {
        sendConversationIdentityRef.current = conversationIdentityRef.current;
        return annotationsRef.current;
      },
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => localeRef.current,
      onSendConfirmed: (sentAnnotations) => {
        const sentConversationIdentity = sendConversationIdentityRef.current;
        sendConversationIdentityRef.current = null;
        if (
          !sentConversationIdentity ||
          !sameConversationIdentity(conversationIdentityRef.current, sentConversationIdentity)
        ) {
          return;
        }
        removeSentAnnotationsRef.current(sentAnnotations);
        closeEditor();
      },
      onStateChange: setSendState,
    });
    sendControllerRef.current = controller;

    return () => {
      if (sendControllerRef.current === controller) {
        sendControllerRef.current = null;
      }
      controller.dispose();
    };
  }, [closeEditor, host]);

  useEffect(closeEditor, [closeEditor, conversationIdentity]);

  const startAnnotation = useCallback(
    (selection: AnchoredSelection) => {
      const annotation: DraftAnnotation = {
        id: crypto.randomUUID(),
        anchor: selection.anchor,
        comment: "",
      };
      if (!addAnnotation(annotation)) {
        return;
      }
      setEditorState({ status: "quick", annotationId: annotation.id });
      host.selection.clear();
    },
    [addAnnotation, host],
  );

  const saveActiveAnnotation = useCallback(
    (comment: string) => {
      if (editorState.status !== "hidden" && updateAnnotation(editorState.annotationId, comment)) {
        closeEditor();
      }
    },
    [closeEditor, editorState, updateAnnotation],
  );

  const openEditor = useCallback(
    (projection: ProjectedAnnotation) => {
      if (!projection.range) {
        return;
      }
      const reveal = host.selection.reveal(projection.range);
      if (reveal.status === "unavailable") {
        return;
      }

      const showEditor = () =>
        setEditorState({ status: "expanded", annotationId: projection.annotation.id });
      if (reveal.value === "visible") {
        showEditor();
        return;
      }
      requestAnimationFrame(showEditor);
    },
    [host],
  );

  const deleteAnnotation = useCallback(
    (annotationId: string) => {
      if (!requestDeletion(annotationId)) {
        return;
      }
      if (activeAnnotationId === annotationId) {
        closeEditor();
      }
    },
    [activeAnnotationId, closeEditor, requestDeletion],
  );

  const clearAll = useCallback(() => {
    if (!clearAnnotations()) {
      return;
    }
    discardPendingDeletions();
    closeEditor();
  }, [clearAnnotations, closeEditor, discardPendingDeletions]);

  const send = useCallback(() => {
    const controller = sendControllerRef.current;
    if (!controller) {
      return;
    }
    if (sendState.status === "failed" || sendState.status === "failed-before-attempt") {
      void controller.retry();
      return;
    }
    void controller.submit();
  }, [sendState.status]);

  return {
    draft: {
      errorOperation,
      isHydrated,
      retry,
      status,
    },
    editor: {
      close: closeEditor,
      projection: activeProjection,
      save: saveActiveAnnotation,
      status: editorState.status,
    },
    selection: {
      conversationIdentity,
      isEnabled: isHydrated,
      onActivate: startAnnotation,
    },
    summary: {
      annotations: projectedAnnotations,
      clear: clearAll,
      isVisible: isHydrated && annotations.length > 0,
      open: openEditor,
      pendingDeletionCount,
      pendingDeletionExpiresAt,
      remove: deleteAnnotation,
      send,
      sendState,
      undoDeletion: discardPendingDeletions,
    },
  };
}
