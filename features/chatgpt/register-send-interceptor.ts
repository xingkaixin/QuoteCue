import type { DraftAnnotation } from "@/features/annotations/annotation";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import type { SupportedLocale } from "@/features/i18n/messages";

import {
  currentComposerSnapshot,
  currentSendButton,
  isComposerEnter,
  isSendButtonAvailable,
  replaceComposerText,
  restoreComposerText,
  sendButtonFromEvent,
  waitForSendButton,
  watchForAcceptedSend,
  type ComposerSnapshot,
} from "./composer";

export type AnnotatedSendFailureReason =
  | "composer-unavailable"
  | "confirmation-timeout"
  | "disposed"
  | "no-annotations"
  | "replace-failed"
  | "send-unavailable";

export type AnnotatedSendResult =
  | { status: "accepted"; revision: number }
  | { status: "failed"; reason: AnnotatedSendFailureReason };

export type AnnotatedSendState =
  | { status: "idle" }
  | { status: "preparing"; attemptId: string }
  | { status: "replaying"; attemptId: string }
  | { status: "awaiting-confirmation"; attemptId: string }
  | { status: "failed"; attemptId: string | null; reason: AnnotatedSendFailureReason };

type SendInterceptorOptions = {
  draft: () => { annotations: DraftAnnotation[]; revision: number };
  locale: () => SupportedLocale;
  onSendAccepted: (revision: number) => void;
  onStateChange?: (state: AnnotatedSendState) => void;
};

type SendAttempt = {
  id: string;
  snapshot: ComposerSnapshot;
  compiledText: string;
  revision: number;
  controller: AbortController;
  result: Promise<AnnotatedSendResult>;
  resolve: (result: AnnotatedSendResult) => void;
};

type StartedSend = {
  isOwned: boolean;
  result: Promise<AnnotatedSendResult>;
};

export function registerSendInterceptor(options: SendInterceptorOptions) {
  let activeAttempt: SendAttempt | null = null;
  let lastFailedAttempt: SendAttempt | null = null;
  let isDispatchingReplay = false;
  let isDisposed = false;
  let state: AnnotatedSendState = { status: "idle" };

  const setState = (nextState: AnnotatedSendState) => {
    state = nextState;
    if (!isDisposed) {
      options.onStateChange?.(state);
    }
  };

  const finishAccepted = (attempt: SendAttempt) => {
    if (activeAttempt !== attempt) {
      return;
    }
    attempt.controller.abort();
    activeAttempt = null;
    lastFailedAttempt = null;
    options.onSendAccepted(attempt.revision);
    setState({ status: "idle" });
    attempt.resolve({ status: "accepted", revision: attempt.revision });
  };

  const finishFailed = (attempt: SendAttempt, reason: AnnotatedSendFailureReason) => {
    if (activeAttempt !== attempt) {
      return;
    }
    attempt.controller.abort();
    restoreComposerText(attempt.snapshot, attempt.compiledText);
    activeAttempt = null;
    lastFailedAttempt = attempt;
    setState({ status: "failed", attemptId: attempt.id, reason });
    attempt.resolve({ status: "failed", reason });
  };

  const replaySend = (attempt: SendAttempt, initialButton: HTMLButtonElement | null) => {
    queueMicrotask(() => {
      void (async () => {
        const sendButton = isSendButtonAvailable(initialButton)
          ? initialButton
          : await waitForSendButton(attempt.controller.signal);
        if (!isSendButtonAvailable(sendButton)) {
          finishFailed(attempt, "send-unavailable");
          return;
        }

        watchForAcceptedSend({
          expectedText: attempt.compiledText,
          signal: attempt.controller.signal,
          onAccepted: () => finishAccepted(attempt),
          onTimeout: () => finishFailed(attempt, "confirmation-timeout"),
        });
        if (activeAttempt !== attempt) {
          return;
        }
        setState({ status: "awaiting-confirmation", attemptId: attempt.id });
        isDispatchingReplay = true;
        try {
          sendButton.click();
        } catch {
          finishFailed(attempt, "send-unavailable");
        } finally {
          isDispatchingReplay = false;
        }
      })();
    });
  };

  const beginSend = (
    initialButton: HTMLButtonElement | null,
    source: "custom" | "native",
    retryOriginalText?: string,
  ): StartedSend => {
    if (isDisposed) {
      return failedResult("disposed");
    }
    if (activeAttempt) {
      return { isOwned: true, result: activeAttempt.result };
    }

    const { annotations, revision } = options.draft();
    if (annotations.length === 0) {
      return failedResult("no-annotations");
    }
    if (source === "native" && !isSendButtonAvailable(initialButton)) {
      return failedResult("send-unavailable");
    }
    if (source === "custom" && initialButton && !isSendButtonAvailable(initialButton)) {
      return failBeforeOwnership("send-unavailable", source, setState);
    }

    const snapshot = currentComposerSnapshot();
    if (!snapshot) {
      return failBeforeOwnership("composer-unavailable", source, setState);
    }
    const originalText =
      retryOriginalText && snapshot.text.trim().length === 0 ? retryOriginalText : snapshot.text;
    const ownedSnapshot = { ...snapshot, text: originalText };
    const compiledText = compileAnnotatedPrompt(annotations, originalText, options.locale());
    const attempt = createAttempt(ownedSnapshot, compiledText, revision);
    activeAttempt = attempt;
    lastFailedAttempt = null;
    setState({ status: "preparing", attemptId: attempt.id });

    let isReplaced = false;
    try {
      isReplaced = replaceComposerText(snapshot.element, compiledText);
    } catch {
      isReplaced = false;
    }
    if (!isReplaced) {
      finishFailed(attempt, "replace-failed");
      return { isOwned: false, result: attempt.result };
    }

    setState({ status: "replaying", attemptId: attempt.id });
    replaySend(attempt, initialButton);
    return { isOwned: true, result: attempt.result };
  };

  const prepareNativeSend = (event: Event, button: HTMLButtonElement | null) => {
    if (activeAttempt) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const started = beginSend(button, "native");
    if (!started.isOwned) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onClick = (event: MouseEvent) => {
    if (isDispatchingReplay) {
      return;
    }
    const sendButton = sendButtonFromEvent(event);
    if (sendButton) {
      prepareNativeSend(event, sendButton);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isComposerEnter(event)) {
      prepareNativeSend(event, currentSendButton());
    }
  };

  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKeyDown, true);
  options.onStateChange?.(state);

  return {
    getState: () => state,
    submit: (button: HTMLButtonElement | null = null) => beginSend(button, "custom").result,
    retry: () => beginSend(null, "custom", lastFailedAttempt?.snapshot.text).result,
    dispose() {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown, true);
      if (activeAttempt) {
        finishFailed(activeAttempt, "disposed");
      }
    },
  };
}

function createAttempt(
  snapshot: ComposerSnapshot,
  compiledText: string,
  revision: number,
): SendAttempt {
  let resolve: (result: AnnotatedSendResult) => void = () => undefined;
  const result = new Promise<AnnotatedSendResult>((resultResolve) => {
    resolve = resultResolve;
  });
  return {
    id: crypto.randomUUID(),
    snapshot,
    compiledText,
    revision,
    controller: new AbortController(),
    result,
    resolve,
  };
}

function failedResult(reason: AnnotatedSendFailureReason): StartedSend {
  return { isOwned: false, result: Promise.resolve({ status: "failed", reason }) };
}

function failBeforeOwnership(
  reason: AnnotatedSendFailureReason,
  source: "custom" | "native",
  setState: (state: AnnotatedSendState) => void,
) {
  if (source === "custom") {
    setState({ status: "failed", attemptId: null, reason });
  }
  return failedResult(reason);
}
