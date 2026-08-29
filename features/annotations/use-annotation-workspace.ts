import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";
import type { AnchoredSelection } from "@/features/host-port/host-port";

import { useI18n } from "@/features/i18n/I18nProvider";

import type { DraftAnnotation } from "./annotation";
import type { ProjectedAnnotation } from "./annotation-projection";
import { sameConversationIdentity } from "@/features/conversation/conversation-identity";
import { registerSendInterceptor } from "./register-send-interceptor";
import { useAnnotationProjection } from "./use-annotation-projection";
import { useConversationIdentity } from "./use-conversation-identity";
import { useDeferredAnnotationDeletion } from "./use-deferred-annotation-deletion";
import { canMutateDraft, useDraftAnnotations } from "./use-draft-annotations";

type SendController = ReturnType<typeof registerSendInterceptor>;
type AnnotationEditorState =
  | { status: "hidden" }
  | { status: "quick"; annotationId: string }
  | { status: "expanded"; annotationId: string };

export function useAnnotationWorkspace() {
  const host = useHost();
  const { locale } = useI18n();
  const conversationIdentity = useConversationIdentity();
  const {
    draft,
    capacityExceeded,
    addAnnotation,
    updateAnnotation,
    discardAnnotations,
    removeConfirmedAnnotations,
    discardAllAnnotations,
    retry,
  } = useDraftAnnotations(conversationIdentity);
  const annotations = draft.status === "loading" ? [] : draft.annotations;
  const isDraftMutable = canMutateDraft(draft);
  const [, notifySendChange] = useReducer((version: number) => version + 1, 0);
  const [editorState, setEditorState] = useState<AnnotationEditorState>({ status: "hidden" });
  const {
    discardPendingDeletions,
    pendingDeletionCount,
    pendingDeletionExpiresAt,
    requestDeletion,
    visibleAnnotations,
  } = useDeferredAnnotationDeletion(annotations, conversationIdentity, discardAnnotations);
  const actionableAnnotations = isDraftMutable ? visibleAnnotations : [];
  const activeAnnotationId = editorState.status === "hidden" ? null : editorState.annotationId;
  const projectedAnnotations = useAnnotationProjection(actionableAnnotations, activeAnnotationId);
  const activeProjection = projectedAnnotations.find(
    ({ annotation }) => annotation.id === activeAnnotationId,
  );
  const activeResolution = activeProjection?.resolution;
  const closeEditor = useCallback(() => setEditorState({ status: "hidden" }), []);

  useEffect(() => {
    if (!isDraftMutable || activeResolution === "unresolved") {
      closeEditor();
    }
  }, [activeResolution, closeEditor, isDraftMutable]);

  const sendInputRef = useRef({
    annotations: projectedAnnotations,
    conversationIdentity,
    locale,
  });
  const removeConfirmedAnnotationsRef = useRef(removeConfirmedAnnotations);
  const sendControllerRef = useRef<SendController | null>(null);
  const requestSessionDismissalRef = useRef<(() => boolean) | null>(null);
  const bindEditorSession = useCallback((requestDismissal: (() => boolean) | null) => {
    requestSessionDismissalRef.current = requestDismissal;
  }, []);

  sendInputRef.current = { annotations: projectedAnnotations, conversationIdentity, locale };
  removeConfirmedAnnotationsRef.current = removeConfirmedAnnotations;

  useEffect(() => {
    const controller = registerSendInterceptor({
      getSendInput: () => sendInputRef.current,
      host,
      onChange: notifySendChange,
      onSendConfirmed: (sentAnnotations, sentConversationIdentity) => {
        removeConfirmedAnnotationsRef.current(sentConversationIdentity, sentAnnotations);
        if (
          sameConversationIdentity(
            sendInputRef.current.conversationIdentity,
            sentConversationIdentity,
          )
        ) {
          closeEditor();
        }
      },
    });
    sendControllerRef.current = controller;

    return () => {
      if (sendControllerRef.current === controller) {
        sendControllerRef.current = null;
      }
      controller.dispose();
    };
  }, [closeEditor, host]);

  useEffect(() => {
    closeEditor();
  }, [closeEditor, conversationIdentity]);

  const sendState = sendControllerRef.current?.state(conversationIdentity) ?? { status: "idle" };

  useEffect(() => {
    if (
      draft.status !== "loading" &&
      actionableAnnotations.length === 0 &&
      sendState.status === "failed"
    ) {
      sendControllerRef.current?.draftEmptied(conversationIdentity);
    }
  }, [actionableAnnotations.length, conversationIdentity, draft.status, sendState.status]);

  const replaceEditorSession = useCallback((replace: () => void) => {
    if (requestSessionDismissalRef.current?.() !== false) {
      replace();
    }
  }, []);

  const startAnnotation = useCallback(
    (selection: AnchoredSelection) =>
      replaceEditorSession(() => {
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
      }),
    [addAnnotation, host, replaceEditorSession],
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
      if (
        projection.resolution !== "resolved" ||
        (editorState.status === "expanded" && editorState.annotationId === projection.annotation.id)
      ) {
        return;
      }
      replaceEditorSession(() => {
        const reveal = host.selection.reveal(projection.geometry.range);
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
      });
    },
    [editorState, host, replaceEditorSession],
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

  const deleteActiveAnnotation = useCallback(() => {
    if (editorState.status !== "hidden") {
      deleteAnnotation(editorState.annotationId);
    }
  }, [deleteAnnotation, editorState]);

  const clearAll = useCallback(() => {
    if (!discardAllAnnotations()) {
      return;
    }
    discardPendingDeletions();
    closeEditor();
  }, [closeEditor, discardAllAnnotations, discardPendingDeletions]);

  const send = useCallback(() => {
    sendControllerRef.current?.submit();
  }, []);
  return {
    draft: {
      capacityExceeded,
      retry,
      state: draft,
    },
    editor: {
      bindSession: bindEditorSession,
      close: closeEditor,
      delete: deleteActiveAnnotation,
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
