import { useEffect, useState } from "react";

import type { SelectionActionState, SelectionDraft } from "./annotation";
import { captureAssistantSelection } from "./selection-anchor";

const ROOT_ATTRIBUTE = "data-quotecue-root";
const NATIVE_ACTION_ATTRIBUTE = "data-quotecue-native-action";
const PORTAL_ATTRIBUTE = "data-quotecue-portal";
const NATIVE_ACTION_LABELS = new Set(["询问 ChatGPT", "Ask ChatGPT"]);

export function useSelectionOverlay(onActivate: (draft: SelectionDraft) => void) {
  const [overlay, setOverlay] = useState<SelectionActionState>({ status: "hidden" });

  useEffect(() => {
    const captureSelection = (event: Event) => {
      if (event.composedPath().some(isQuoteCueElement)) {
        return;
      }

      requestAnimationFrame(() => {
        const draft = captureAssistantSelection();
        setOverlay(draft ? { status: "action", draft } : { status: "hidden" });
      });
    };

    document.addEventListener("mouseup", captureSelection, true);
    document.addEventListener("keyup", captureSelection, true);

    return () => {
      document.removeEventListener("mouseup", captureSelection, true);
      document.removeEventListener("keyup", captureSelection, true);
    };
  }, []);

  useEffect(() => {
    if (overlay.status !== "action") {
      removeNativeAction();
      return;
    }

    const insertAction = () => {
      const menu = nativeSelectionMenu();
      if (!menu || menu.querySelector(`[${NATIVE_ACTION_ATTRIBUTE}]`)) {
        return;
      }

      const sourceButton = menu.querySelector("button:last-child");
      if (!sourceButton) {
        return;
      }

      const action = sourceButton.cloneNode(true) as HTMLButtonElement;
      action.setAttribute(NATIVE_ACTION_ATTRIBUTE, "");
      action.removeAttribute("aria-describedby");
      action.classList.add("border-y-0", "border-e-0", "border-s", "border-solid");
      action.textContent = "QuoteCue";
      action.addEventListener("mousedown", preserveSelection, true);
      action.addEventListener("click", (event) => {
        preserveSelection(event);
        onActivate(overlay.draft);
        setOverlay({ status: "hidden" });
        removeNativeAction();
      });
      menu.append(action);
    };
    const observer = new MutationObserver(insertAction);

    observer.observe(document.body, { childList: true, subtree: true });
    insertAction();

    return () => {
      observer.disconnect();
      removeNativeAction();
    };
  }, [onActivate, overlay]);
}

function isQuoteCueElement(target: EventTarget) {
  return (
    target instanceof Element &&
    target.closest(`[${ROOT_ATTRIBUTE}], [${NATIVE_ACTION_ATTRIBUTE}], [${PORTAL_ATTRIBUTE}]`) !==
      null
  );
}

function nativeSelectionMenu() {
  const nativeAction = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => NATIVE_ACTION_LABELS.has(button.textContent?.trim() ?? ""),
  );
  const menu = nativeAction?.parentElement;

  return menu && Array.from(menu.children).every((child) => child instanceof HTMLButtonElement)
    ? menu
    : null;
}

function preserveSelection(event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function removeNativeAction() {
  document.querySelector(`[${NATIVE_ACTION_ATTRIBUTE}]`)?.remove();
}
