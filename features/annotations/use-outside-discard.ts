import type { RefObject } from "react";
import { useEffect } from "react";

import { isQuoteCueEvent } from "./is-quotecue-event";

export function useOutsideDiscard(
  rootRef: RefObject<HTMLElement | null>,
  requestDiscard: () => boolean,
) {
  useEffect(() => {
    const editor = rootRef.current;
    const rootNode = editor?.getRootNode();
    const shadowRoot = rootNode instanceof ShadowRoot ? rootNode : null;
    let focusFrame: number | undefined;
    let settleFrame: number | undefined;
    const cancelFocusCheck = () => {
      if (focusFrame !== undefined) {
        cancelAnimationFrame(focusFrame);
      }
      if (settleFrame !== undefined) {
        cancelAnimationFrame(settleFrame);
      }
    };
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
    const handleFocusOut = () => {
      cancelFocusCheck();
      // Cross-document iframe focus briefly clears the shadow root's active element.
      focusFrame = requestAnimationFrame(() => {
        settleFrame = requestAnimationFrame(() => {
          const currentEditor = rootRef.current;
          if (!currentEditor?.isConnected) {
            return;
          }

          const currentRoot = currentEditor.getRootNode();
          const activeElement =
            currentRoot instanceof Document || currentRoot instanceof ShadowRoot
              ? currentRoot.activeElement
              : null;
          if (!activeElement || !currentEditor.contains(activeElement)) {
            requestDiscard();
          }
        });
      });
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    shadowRoot?.addEventListener("pointerdown", handleOutsidePointerDown, true);
    editor?.addEventListener("focusout", handleFocusOut);
    return () => {
      cancelFocusCheck();
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      shadowRoot?.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      editor?.removeEventListener("focusout", handleFocusOut);
    };
  }, [requestDiscard, rootRef]);
}
