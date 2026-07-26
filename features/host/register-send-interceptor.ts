import type { DraftAnnotation } from "@/features/annotations/annotation";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import type { SupportedLocale } from "@/features/i18n/messages";

import { activeHost } from "./active-host";
import type { ComposerSnapshot, Host } from "./dom-host";

export type AnnotatedSendFailureReason =
  | "composer-unavailable"
  | "confirmation-timeout"
  | "disposed"
  | "no-annotations"
  | "replace-failed"
  | "send-unavailable";

export type AnnotatedSendResult =
  | { status: "accepted"; annotationIds: string[] }
  | { status: "failed"; reason: AnnotatedSendFailureReason };

export type AnnotatedSendState =
  | { status: "idle" }
  | { status: "preparing"; attemptId: string }
  | { status: "replaying"; attemptId: string }
  | { status: "awaiting-confirmation"; attemptId: string }
  | { status: "failed"; attemptId: string | null; reason: AnnotatedSendFailureReason };

type SendInterceptorOptions = {
  annotations: () => readonly DraftAnnotation[];
  host?: Host;
  locale: () => SupportedLocale;
  onSendAccepted: (annotations: readonly DraftAnnotation[]) => void;
  onStateChange?: (state: AnnotatedSendState) => void;
};

type SendAttempt = {
  id: string;
  snapshot: ComposerSnapshot;
  compiledText: string;
  annotations: readonly DraftAnnotation[];
  controller: AbortController;
  result: Promise<AnnotatedSendResult>;
  resolve: (result: AnnotatedSendResult) => void;
};

type StartedSend = {
  isOwned: boolean;
  result: Promise<AnnotatedSendResult>;
};

export function registerSendInterceptor(options: SendInterceptorOptions) {
  const host = options.host ?? activeHost;
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
    options.onSendAccepted(attempt.annotations);
    setState({ status: "idle" });
    attempt.resolve({
      status: "accepted",
      annotationIds: attempt.annotations.map(({ id }) => id),
    });
  };

  const finishFailed = (attempt: SendAttempt, reason: AnnotatedSendFailureReason) => {
    if (activeAttempt !== attempt) {
      return;
    }
    attempt.controller.abort();
    host.composer.restoreText(attempt.snapshot, attempt.compiledText);
    activeAttempt = null;
    lastFailedAttempt = attempt;
    setState({ status: "failed", attemptId: attempt.id, reason });
    attempt.resolve({ status: "failed", reason });
  };

  const replaySend = (attempt: SendAttempt, initialButton: HTMLElement | null) => {
    queueMicrotask(() => {
      void (async () => {
        const sendButtonResult = host.composer.isButtonAvailable(initialButton)
          ? { status: "available" as const, value: initialButton }
          : await host.composer.waitForButton(attempt.controller.signal);
        if (activeAttempt !== attempt) {
          return;
        }
        if (sendButtonResult.status === "unavailable") {
          host.reportUnavailable(sendButtonResult.reason);
          finishFailed(attempt, "send-unavailable");
          return;
        }
        const sendButton = sendButtonResult.value;

        host.composer.watchAcceptedSend({
          expectedText: attempt.compiledText,
          signal: attempt.controller.signal,
          onAccepted: () => finishAccepted(attempt),
          onTimeout: () => finishFailed(attempt, "confirmation-timeout"),
        });
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
    initialButton: HTMLElement | null,
    source: "custom" | "native",
    retryOriginalText?: string,
  ): StartedSend => {
    if (isDisposed) {
      return failedResult("disposed");
    }
    if (activeAttempt) {
      return { isOwned: true, result: activeAttempt.result };
    }

    const annotations = snapshotAnnotations(options.annotations());
    if (annotations.length === 0) {
      return failedResult("no-annotations");
    }

    const snapshotResult = host.composer.snapshot();
    if (snapshotResult.status === "unavailable") {
      host.reportUnavailable(snapshotResult.reason);
      return failBeforeOwnership("composer-unavailable", source, setState);
    }
    const snapshot = snapshotResult.value;
    // 空 composer 时发送控件多半只是因缺少输入而不可用；批注文本补入后即可用,
    // 所以仍接管发送。非空时保持不接管,把真正被阻塞的发送留给页面自己处理。
    const isRecoverableBySend = snapshot.text.trim().length === 0;
    if (
      source === "native" &&
      !host.composer.isButtonAvailable(initialButton) &&
      !isRecoverableBySend
    ) {
      return failedResult("send-unavailable");
    }
    if (source === "custom" && initialButton && !host.composer.isButtonAvailable(initialButton)) {
      host.reportUnavailable("send-control-unavailable");
      return failBeforeOwnership("send-unavailable", source, setState);
    }
    const originalText =
      retryOriginalText && snapshot.text.trim().length === 0 ? retryOriginalText : snapshot.text;
    const ownedSnapshot = { ...snapshot, text: originalText };
    const compiledText = compileAnnotatedPrompt(annotations, originalText, options.locale());
    const attempt = createAttempt(ownedSnapshot, compiledText, annotations);
    activeAttempt = attempt;
    lastFailedAttempt = null;
    setState({ status: "preparing", attemptId: attempt.id });

    let isReplaced = false;
    try {
      isReplaced = host.composer.replaceText(snapshot.element, compiledText);
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

  const prepareNativeSend = (event: Event, button: HTMLElement | null) => {
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

  const stopListening = host.composer.subscribeToSubmit((event, button) => {
    if (isDispatchingReplay) {
      return;
    }
    prepareNativeSend(event, button);
  });
  options.onStateChange?.(state);

  return {
    getState: () => state,
    submit: (button: HTMLElement | null = null) => beginSend(button, "custom").result,
    retry: () => beginSend(null, "custom", lastFailedAttempt?.snapshot.text).result,
    dispose() {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      stopListening();
      if (activeAttempt) {
        finishFailed(activeAttempt, "disposed");
      }
    },
  };
}

function createAttempt(
  snapshot: ComposerSnapshot,
  compiledText: string,
  annotations: readonly DraftAnnotation[],
): SendAttempt {
  let resolve: (result: AnnotatedSendResult) => void = () => undefined;
  const result = new Promise<AnnotatedSendResult>((resultResolve) => {
    resolve = resultResolve;
  });
  return {
    id: crypto.randomUUID(),
    snapshot,
    compiledText,
    annotations,
    controller: new AbortController(),
    result,
    resolve,
  };
}

function snapshotAnnotations(annotations: readonly DraftAnnotation[]): DraftAnnotation[] {
  return annotations.map((annotation) => ({
    ...annotation,
    anchor: { ...annotation.anchor },
  }));
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
