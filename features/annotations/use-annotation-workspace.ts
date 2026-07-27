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
import { canMutateDraft, useDraftAnnotations } from "./use-draft-annotations";

type SendController = ReturnType<typeof registerSendInterceptor>;

export function useAnnotationWorkspace() {
  const host = useHost();
  const { locale } = useI18n();
  const conversationIdentity = useConversationIdentity();
  const {
    draft,
    addAnnotation,
    updateAnnotation,
    discardAnnotations,
    removeConfirmedAnnotations,
    discardAllAnnotations,
    retry,
  } = useDraftAnnotations(conversationIdentity);
  const annotations = draft.status === "loading" ? [] : draft.annotations;
  const isDraftMutable = canMutateDraft(draft);
  const [sendState, setSendState] = useState<AnnotatedSendState>({ status: "idle" });
  const [editorState, setEditorState] = useState<AnnotationEditorState>({ status: "hidden" });
  const {
    discardPendingDeletions,
    pendingDeletionCount,
    pendingDeletionExpiresAt,
    requestDeletion,
    visibleAnnotations,
  } = useDeferredAnnotationDeletion(annotations, conversationIdentity, discardAnnotations);
  const activeAnnotationId = editorState.status === "hidden" ? null : editorState.annotationId;
  const projectedAnnotations = useAnnotationProjection(visibleAnnotations, activeAnnotationId);
  const activeProjection = projectedAnnotations.find(
    ({ annotation }) => annotation.id === activeAnnotationId,
  );
  const activeResolution = activeProjection?.resolution;
  const closeEditor = useCallback(() => setEditorState({ status: "hidden" }), []);

  useEffect(() => {
    if (activeResolution === "unresolved") {
      closeEditor();
    }
  }, [activeResolution, closeEditor]);

  const annotationsRef = useRef<readonly ProjectedAnnotation[]>(projectedAnnotations);
  const conversationIdentityRef = useRef(conversationIdentity);
  const localeRef = useRef(locale);
  const removeConfirmedAnnotationsRef = useRef(removeConfirmedAnnotations);
  const sendConversationIdentityRef = useRef<ConversationIdentity | null>(null);
  const sendControllerRef = useRef<SendController | null>(null);

  annotationsRef.current = projectedAnnotations;
  conversationIdentityRef.current = conversationIdentity;
  localeRef.current = locale;
  removeConfirmedAnnotationsRef.current = removeConfirmedAnnotations;

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
        removeConfirmedAnnotationsRef.current(sentAnnotations);
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
      if (projection.resolution !== "resolved") {
        return;
      }
      const reveal = host.selection.reveal(projection.geometry.range);
      if (reveal.status === "unavailable") {
        host.reportUnavailable(reveal.reason);
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
    if (!discardAllAnnotations()) {
      return;
    }
    discardPendingDeletions();
    closeEditor();
  }, [closeEditor, discardAllAnnotations, discardPendingDeletions]);

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
      retry,
      state: draft,
    },
    editor: {
      close: closeEditor,
      projection: activeProjection,
      save: saveActiveAnnotation,
      status: editorState.status,
    },
    selection: {
      conversationIdentity,
      isEnabled: isDraftMutable,
      onActivate: startAnnotation,
    },
    summary: {
      annotations: projectedAnnotations,
      clear: clearAll,
      isVisible: isDraftMutable && annotations.length > 0,
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
