import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { ConversationIdentity } from "@/features/conversation/conversation-identity";

import type { DraftAnnotation } from "./annotation";
import { visibleDraftSnapshot } from "./draft-runtime";
import { useDraftRuntime } from "./DraftRuntimeProvider";

export { canMutateDraft } from "./draft-lifecycle";
export type { DraftState } from "./draft-lifecycle";

export function useDraftAnnotations(conversationIdentity: ConversationIdentity) {
  const runtime = useDraftRuntime();
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );

  useEffect(() => {
    runtime.activate(conversationIdentity);
  }, [conversationIdentity, runtime]);

  const { capacityExceeded, draft } = visibleDraftSnapshot(snapshot, conversationIdentity);
  const mutate = useCallback(
    (mutation: Parameters<typeof runtime.mutate>[1]) =>
      runtime.mutate(conversationIdentity, mutation),
    [conversationIdentity, runtime],
  );

  return {
    capacityExceeded,
    draft,
    addAnnotation: useCallback(
      (annotation: DraftAnnotation) => mutate({ kind: "add", annotation }),
      [mutate],
    ),
    updateAnnotation: useCallback(
      (annotationId: string, comment: string) => mutate({ kind: "update", annotationId, comment }),
      [mutate],
    ),
    discardAnnotations: useCallback(
      (annotationIds: readonly string[]) => mutate({ kind: "discard", annotationIds }),
      [mutate],
    ),
    removeConfirmedAnnotations: useCallback(
      (identity: ConversationIdentity, annotations: readonly DraftAnnotation[]) =>
        runtime.removeConfirmed(conversationIdentity, identity, annotations),
      [conversationIdentity, runtime],
    ),
    discardAllAnnotations: useCallback(() => mutate({ kind: "clear" }), [mutate]),
    retry: useCallback(() => runtime.retry(conversationIdentity), [conversationIdentity, runtime]),
  };
}
