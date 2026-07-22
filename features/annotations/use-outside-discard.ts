import type { RefObject } from "react";
import { useEffect } from "react";

import { isQuoteCueEvent } from "./is-quotecue-event";

export function useOutsideDiscard(
  rootRef: RefObject<HTMLElement | null>,
  requestDiscard: () => boolean,
) {
  useEffect(() => {
    const rootNode = rootRef.current?.getRootNode();
    const shadowRoot = rootNode instanceof ShadowRoot ? rootNode : null;
    const handleOutsidePointerDown = (event: Event) => {
      if (rootRef.current && event.composedPath().includes(rootRef.current)) {
        return;
      }
      if (!requestDiscard()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const handleDocumentPointerDown = (event: Event) => {
      if (shadowRoot && isQuoteCueEvent(event)) {
        return;
      }
      handleOutsidePointerDown(event);
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    shadowRoot?.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      shadowRoot?.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [requestDiscard, rootRef]);
}
