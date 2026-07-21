import type { DraftAnnotation } from "@/features/annotations/annotation";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import type { SupportedLocale } from "@/features/i18n/messages";

import {
  composerText,
  isComposerEnter,
  replaceComposerText,
  sendButtonFromEvent,
  waitForSendButton,
  watchForAcceptedSend,
} from "./composer";

type SendInterceptorOptions = {
  annotations: () => DraftAnnotation[];
  locale: () => SupportedLocale;
  onSendAccepted: () => void;
};

export function registerSendInterceptor(options: SendInterceptorOptions) {
  let isReplayingSend = false;
  let stopWatchingSend: (() => void) | undefined;

  const replaySend = (button: HTMLButtonElement | null) => {
    queueMicrotask(() => {
      void (async () => {
        const sendButton = button ?? (await waitForSendButton());
        if (!sendButton) {
          isReplayingSend = false;
          return;
        }

        stopWatchingSend?.();
        stopWatchingSend = watchForAcceptedSend(options.onSendAccepted);
        sendButton.click();
      })();
    });
  };

  const submit = (button: HTMLButtonElement | null = null) => {
    if (isReplayingSend) {
      return false;
    }

    const annotations = options.annotations();
    if (annotations.length === 0) {
      return false;
    }

    const prompt = compileAnnotatedPrompt(annotations, composerText(), options.locale());
    if (!replaceComposerText(prompt)) {
      return false;
    }

    isReplayingSend = true;
    replaySend(button);
    return true;
  };

  const prepareAnnotatedSend = (event: Event, button: HTMLButtonElement | null) => {
    if (options.annotations().length === 0) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    submit(button);
  };

  const onClick = (event: MouseEvent) => {
    const sendButton = sendButtonFromEvent(event);
    if (!sendButton) {
      return;
    }
    if (isReplayingSend) {
      isReplayingSend = false;
      return;
    }

    prepareAnnotatedSend(event, sendButton);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isComposerEnter(event) || isReplayingSend) {
      return;
    }

    prepareAnnotatedSend(event, null);
  };

  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKeyDown, true);

  return {
    submit,
    dispose() {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown, true);
      stopWatchingSend?.();
    },
  };
}
