import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationIdentity, IdentifiedConversation } from "@/features/host-port/host-port";

import { sameAnnotationSnapshot, type DraftAnnotation } from "./annotation";
import { sameConversationIdentity } from "./conversation-identity";
import { loadDraftAnnotations, saveDraftAnnotations } from "./draft-storage";

type DraftScopeState =
  | { status: "loading"; conversationIdentity: ConversationIdentity }
  | {
      status: "ready";
      conversationIdentity: ConversationIdentity;
      annotations: DraftAnnotation[];
      revision: number;
    }
  | {
      status: "error";
      conversationIdentity: IdentifiedConversation;
      annotations: DraftAnnotation[];
      revision: number;
      operation: "load" | "save";
    };

type AvailableDraftScopeState = Extract<DraftScopeState, { status: "ready" | "error" }>;

export function useDraftAnnotations(conversationIdentity: ConversationIdentity) {
  const [scope, setScope] = useState<DraftScopeState>(() => initialScope(conversationIdentity));
  const scopeRef = useRef(scope);
  const loadGeneration = useRef(0);
  const saveQueue = useRef(Promise.resolve());

  const commitScope = useCallback((nextScope: DraftScopeState) => {
    scopeRef.current = nextScope;
    setScope(nextScope);
  }, []);

  const loadScope = useCallback(
    (identity: ConversationIdentity) => {
      const generation = ++loadGeneration.current;
      if (identity.kind === "unidentified") {
        commitScope(readyScope(identity));
        return;
      }

      commitScope(loadingScope(identity));

      void saveQueue.current
        .then(() => loadDraftAnnotations(identity))
        .then((annotations) => {
          if (generation !== loadGeneration.current) {
            return;
          }
          commitScope({
            status: "ready",
            conversationIdentity: identity,
            annotations,
            revision: 0,
          });
        })
        .catch((error: unknown) => {
          console.error("[QuoteCue] Failed to load draft annotations", error);
          if (generation !== loadGeneration.current) {
            return;
          }
          commitScope({
            status: "error",
            conversationIdentity: identity,
            annotations: [],
            revision: 0,
            operation: "load",
          });
        });
    },
    [commitScope],
  );

  const enqueueSave = useCallback(
    (snapshot: AvailableDraftScopeState) => {
      const conversation = snapshot.conversationIdentity;
      if (conversation.kind === "unidentified") {
        return;
      }

      const save = () => saveDraftAnnotations(conversation, snapshot.annotations);
      const pendingSave = saveQueue.current.then(save, save);
      saveQueue.current = pendingSave.catch(() => undefined);

      void pendingSave
        .then(() => {
          const current = scopeRef.current;
          if (isCurrentRevision(current, snapshot)) {
            commitScope({ ...current, status: "ready" });
          }
        })
        .catch((error: unknown) => {
          console.error("[QuoteCue] Failed to save draft annotations", error);
          const current = scopeRef.current;
          if (
            isCurrentRevision(current, snapshot) &&
            current.conversationIdentity.kind === "identified"
          ) {
            commitScope({
              status: "error",
              conversationIdentity: current.conversationIdentity,
              annotations: current.annotations,
              revision: current.revision,
              operation: "save",
            });
          }
        });
    },
    [commitScope],
  );

  useEffect(() => {
    loadScope(conversationIdentity);
    return () => {
      loadGeneration.current += 1;
    };
  }, [conversationIdentity, loadScope]);

  const mutateAnnotations = useCallback(
    (
      mutate: (annotations: DraftAnnotation[]) => DraftAnnotation[] | null,
      expectedRevision?: number,
    ) => {
      const current = scopeRef.current;
      if (
        !canMutateScope(current, conversationIdentity) ||
        (expectedRevision !== undefined && current.revision !== expectedRevision)
      ) {
        return false;
      }
      const annotations = mutate(current.annotations);
      if (annotations === null) {
        return false;
      }
      if (annotations === current.annotations) {
        return true;
      }
      const next = {
        ...current,
        annotations,
        revision: current.revision + 1,
      };
      commitScope(next);
      enqueueSave(next);
      return true;
    },
    [commitScope, conversationIdentity, enqueueSave],
  );

  const visibleScope = sameConversationIdentity(scope.conversationIdentity, conversationIdentity)
    ? scope
    : loadingScope(conversationIdentity);
  const annotations = visibleScope.status === "loading" ? [] : visibleScope.annotations;
  const isHydrated =
    visibleScope.status === "ready" ||
    (visibleScope.status === "error" && visibleScope.operation === "save");

  return {
    annotations,
    revision: visibleScope.status === "loading" ? null : visibleScope.revision,
    status: visibleScope.status,
    errorOperation: visibleScope.status === "error" ? visibleScope.operation : null,
    isHydrated,
    addAnnotation: useCallback(
      (annotation: DraftAnnotation) => mutateAnnotations((current) => [...current, annotation]),
      [mutateAnnotations],
    ),
    updateAnnotation: useCallback(
      (annotationId: string, comment: string) =>
        mutateAnnotations((current) => {
          const index = current.findIndex((annotation) => annotation.id === annotationId);
          if (index < 0) {
            return null;
          }
          if (current[index]?.comment === comment) {
            return current;
          }
          return current.map((annotation, currentIndex) =>
            currentIndex === index ? { ...annotation, comment } : annotation,
          );
        }),
      [mutateAnnotations],
    ),
    removeAnnotations: useCallback(
      (annotationIds: readonly string[]) => {
        const removedIds = new Set(annotationIds);
        return mutateAnnotations((current) => current.filter(({ id }) => !removedIds.has(id)));
      },
      [mutateAnnotations],
    ),
    removeSentAnnotations: useCallback(
      (sentAnnotations: readonly DraftAnnotation[]) => {
        const sentById = new Map(sentAnnotations.map((sent) => [sent.id, sent]));
        return mutateAnnotations((current) =>
          current.filter((annotation) => {
            const sent = sentById.get(annotation.id);
            return !sent || !sameAnnotationSnapshot(annotation, sent);
          }),
        );
      },
      [mutateAnnotations],
    ),
    clearAnnotations: useCallback(
      (expectedRevision?: number) => mutateAnnotations(() => [], expectedRevision),
      [mutateAnnotations],
    ),
    retry: useCallback(() => {
      if (visibleScope.status !== "error") {
        return;
      }
      if (visibleScope.operation === "load") {
        loadScope(conversationIdentity);
        return;
      }
      commitScope({
        status: "ready",
        conversationIdentity: visibleScope.conversationIdentity,
        annotations: visibleScope.annotations,
        revision: visibleScope.revision,
      });
      enqueueSave(visibleScope);
    }, [commitScope, conversationIdentity, enqueueSave, loadScope, visibleScope]),
  };
}

function initialScope(conversationIdentity: ConversationIdentity): DraftScopeState {
  return conversationIdentity.kind === "identified"
    ? loadingScope(conversationIdentity)
    : readyScope(conversationIdentity);
}

function loadingScope(conversationIdentity: ConversationIdentity): DraftScopeState {
  return { status: "loading", conversationIdentity };
}

function readyScope(conversationIdentity: ConversationIdentity): DraftScopeState {
  return { status: "ready", conversationIdentity, annotations: [], revision: 0 };
}

function canMutateScope(
  scope: DraftScopeState,
  conversationIdentity: ConversationIdentity,
): scope is AvailableDraftScopeState {
  return (
    sameConversationIdentity(scope.conversationIdentity, conversationIdentity) &&
    (scope.status === "ready" || (scope.status === "error" && scope.operation === "save"))
  );
}

function isCurrentRevision(
  current: DraftScopeState,
  saved: AvailableDraftScopeState,
): current is AvailableDraftScopeState {
  return (
    current.status !== "loading" &&
    sameConversationIdentity(current.conversationIdentity, saved.conversationIdentity) &&
    current.revision === saved.revision
  );
}
