import { useCallback, useEffect, useRef, useState } from "react";

import type { DraftAnnotation } from "./annotation";
import { loadDraftAnnotations, saveDraftAnnotations } from "./draft-storage";

type DraftScopeState =
  | { status: "loading"; conversationKey: string }
  | {
      status: "ready";
      conversationKey: string;
      annotations: DraftAnnotation[];
      revision: number;
    }
  | {
      status: "error";
      conversationKey: string;
      annotations: DraftAnnotation[];
      revision: number;
      operation: "load" | "save";
    };

type AvailableDraftScopeState = Extract<DraftScopeState, { status: "ready" | "error" }>;

export function useDraftAnnotations(conversationKey: string) {
  const [scope, setScope] = useState<DraftScopeState>(() => loadingScope(conversationKey));
  const scopeRef = useRef(scope);
  const loadGeneration = useRef(0);
  const saveQueue = useRef(Promise.resolve());

  const commitScope = useCallback((nextScope: DraftScopeState) => {
    scopeRef.current = nextScope;
    setScope(nextScope);
  }, []);

  const loadScope = useCallback(
    (key: string) => {
      const generation = ++loadGeneration.current;
      commitScope(loadingScope(key));

      void loadDraftAnnotations(key)
        .then((annotations) => {
          if (generation !== loadGeneration.current) {
            return;
          }
          commitScope({ status: "ready", conversationKey: key, annotations, revision: 0 });
        })
        .catch((error: unknown) => {
          console.error("[QuoteCue] Failed to load draft annotations", error);
          if (generation !== loadGeneration.current) {
            return;
          }
          commitScope({
            status: "error",
            conversationKey: key,
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
      const save = () => saveDraftAnnotations(snapshot.conversationKey, snapshot.annotations);
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
          if (isCurrentRevision(current, snapshot)) {
            commitScope({ ...current, status: "error", operation: "save" });
          }
        });
    },
    [commitScope],
  );

  useEffect(() => {
    loadScope(conversationKey);
    return () => {
      loadGeneration.current += 1;
    };
  }, [conversationKey, loadScope]);

  const mutateAnnotations = useCallback(
    (mutate: (annotations: DraftAnnotation[]) => DraftAnnotation[]) => {
      const current = scopeRef.current;
      if (!canMutateScope(current, conversationKey)) {
        return;
      }
      const next = {
        ...current,
        annotations: mutate(current.annotations),
        revision: current.revision + 1,
      };
      commitScope(next);
      enqueueSave(next);
    },
    [commitScope, conversationKey, enqueueSave],
  );

  const visibleScope =
    scope.conversationKey === conversationKey ? scope : loadingScope(conversationKey);
  const annotations = visibleScope.status === "loading" ? [] : visibleScope.annotations;
  const isHydrated =
    visibleScope.status === "ready" ||
    (visibleScope.status === "error" && visibleScope.operation === "save");

  return {
    annotations,
    status: visibleScope.status,
    errorOperation: visibleScope.status === "error" ? visibleScope.operation : null,
    isHydrated,
    addAnnotation: useCallback(
      (annotation: DraftAnnotation) => mutateAnnotations((current) => [...current, annotation]),
      [mutateAnnotations],
    ),
    updateAnnotation: useCallback(
      (annotationId: string, comment: string) =>
        mutateAnnotations((current) =>
          current.map((annotation) =>
            annotation.id === annotationId ? { ...annotation, comment } : annotation,
          ),
        ),
      [mutateAnnotations],
    ),
    removeAnnotation: useCallback(
      (annotationId: string) =>
        mutateAnnotations((current) => current.filter(({ id }) => id !== annotationId)),
      [mutateAnnotations],
    ),
    clearAnnotations: useCallback(() => mutateAnnotations(() => []), [mutateAnnotations]),
    retry: useCallback(() => {
      if (visibleScope.status !== "error") {
        return;
      }
      if (visibleScope.operation === "load") {
        loadScope(conversationKey);
        return;
      }
      commitScope({
        status: "ready",
        conversationKey: visibleScope.conversationKey,
        annotations: visibleScope.annotations,
        revision: visibleScope.revision,
      });
      enqueueSave(visibleScope);
    }, [commitScope, conversationKey, enqueueSave, loadScope, visibleScope]),
  };
}

function loadingScope(conversationKey: string): DraftScopeState {
  return { status: "loading", conversationKey };
}

function canMutateScope(
  scope: DraftScopeState,
  conversationKey: string,
): scope is AvailableDraftScopeState {
  return (
    scope.conversationKey === conversationKey &&
    (scope.status === "ready" || (scope.status === "error" && scope.operation === "save"))
  );
}

function isCurrentRevision(
  current: DraftScopeState,
  saved: AvailableDraftScopeState,
): current is AvailableDraftScopeState {
  return (
    current.status !== "loading" &&
    current.conversationKey === saved.conversationKey &&
    current.revision === saved.revision
  );
}
