import { useEffect, useState } from "react";

import type { DraftAnnotation } from "./annotation";
import { loadDraftAnnotations, saveDraftAnnotations } from "./draft-storage";

export function useDraftAnnotations(conversationKey: string) {
  const [annotations, setAnnotations] = useState<DraftAnnotation[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setIsHydrated(false);
    setAnnotations([]);

    void loadDraftAnnotations(conversationKey)
      .then((storedAnnotations) => {
        if (!isCurrent) {
          return;
        }
        setAnnotations(storedAnnotations);
        setIsHydrated(true);
      })
      .catch((error: unknown) => {
        console.error("[QuoteCue] Failed to load draft annotations", error);
        if (isCurrent) {
          setIsHydrated(true);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [conversationKey]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    void saveDraftAnnotations(conversationKey, annotations).catch((error: unknown) => {
      console.error("[QuoteCue] Failed to save draft annotations", error);
    });
  }, [annotations, conversationKey, isHydrated]);

  return { annotations, isHydrated, setAnnotations };
}
