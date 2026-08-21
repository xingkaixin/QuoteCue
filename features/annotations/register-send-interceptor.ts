import type { SupportedLocale } from "@/features/i18n/messages";
import type {
  ComposerSnapshot,
  ComposerSubmitDecision,
  ComposerSubmitIntent,
  ConversationIdentity,
  Host,
} from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";
import type { NumberedAnnotation } from "./annotation-projection";
import { sameConversationIdentity } from "./conversation-identity";
import { compiledPromptExceedsCapacity } from "./draft-capacity";

export type AnnotatedSendFailureReason =
  | "composer-unavailable"
  | "confirmation-timeout"
  | "disposed"
  | "no-annotations"
  | "prompt-too-long"
  | "replace-failed"
  | "send-unavailable";

type AnnotatedSendFailure = {
  status: "failed";
  reason: AnnotatedSendFailureReason;
};

export type AnnotatedSendResult =
  | { status: "confirmed"; annotationIds: string[] }
  | AnnotatedSendFailure;

export type AnnotatedSendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "confirmed" }
  | AnnotatedSendFailure;

type SendInterceptorOptions = {
  annotations: () => readonly NumberedAnnotation[];
  compilePrompt: (
    annotations: readonly NumberedAnnotation[],
    originalText: string,
    locale: SupportedLocale,
  ) => string;
  conversationIdentity: () => ConversationIdentity;
  host: Host;
  locale: () => SupportedLocale;
  onSendConfirmed: (
    annotations: readonly DraftAnnotation[],
    conversationIdentity: ConversationIdentity,
  ) => void;
  onStateChange?: (state: AnnotatedSendState) => void;
};

type SendAttempt = {
  conversationIdentity: ConversationIdentity;
  snapshot: ComposerSnapshot;
  compiledPrompt: string;
  annotations: readonly NumberedAnnotation[];
  controller: AbortController;
  failureOverride?: AnnotatedSendFailureReason;
  result: Promise<AnnotatedSendResult>;
  resolve: (result: AnnotatedSendResult) => void;
};

type FailedSendSnapshot = {
  conversationIdentity: ConversationIdentity;
  originalText: string;
};

type StartedSend = {
  isOwned: boolean;
  result: Promise<AnnotatedSendResult>;
};

export function registerSendInterceptor(options: SendInterceptorOptions) {
  const host = options.host;
  let activeAttempt: SendAttempt | null = null;
  let failedSendSnapshot: FailedSendSnapshot | null = null;
  let isDisposed = false;

  const reportError = (message: string) => {
    console.error(`[QuoteCue] ${message}`);
  };
  const runSafely = (failureMessage: string, operation: () => void) => {
    try {
      operation();
    } catch {
      reportError(failureMessage);
    }
  };

  const setState = (nextState: AnnotatedSendState) => {
    if (!isDisposed) {
      runSafely("Failed to report annotated send state", () => options.onStateChange?.(nextState));
    }
  };

  const abortAttempt = (attempt: SendAttempt) => {
    runSafely("Failed to stop annotated send work", () => attempt.controller.abort());
  };

  const finishConfirmed = (attempt: SendAttempt) => {
    if (activeAttempt !== attempt) {
      return;
    }
    activeAttempt = null;
    failedSendSnapshot = null;
    const sentAnnotations = attempt.annotations.map(({ annotation }) => annotation);
    abortAttempt(attempt);
    setState({ status: "confirmed" });
    attempt.resolve({
      status: "confirmed",
      annotationIds: sentAnnotations.map(({ id }) => id),
    });
    runSafely("Failed to apply confirmed annotations", () =>
      options.onSendConfirmed(sentAnnotations, attempt.conversationIdentity),
    );
  };

  const finishFailed = (attempt: SendAttempt, reason: AnnotatedSendFailureReason) => {
    if (activeAttempt !== attempt) {
      return;
    }
    activeAttempt = null;
    failedSendSnapshot = {
      conversationIdentity: attempt.conversationIdentity,
      originalText: attempt.snapshot.text,
    };
    abortAttempt(attempt);
    setState({ status: "failed", reason });
    attempt.resolve({ status: "failed", reason });
  };

  const replaySend = (attempt: SendAttempt) => {
    let submission: ReturnType<Host["composer"]["submit"]>;
    try {
      submission = host.composer.submit({
        restoreTo: attempt.snapshot,
        signal: attempt.controller.signal,
        text: attempt.compiledPrompt,
      });
    } catch {
      reportError("Failed to replay annotated send");
      finishFailed(attempt, "send-unavailable");
      return;
    }
    void submission
      .then((result) => {
        if (activeAttempt !== attempt) {
          return;
        }
        if (result.status === "available") {
          finishConfirmed(attempt);
        } else {
          finishFailed(attempt, attempt.failureOverride ?? result.reason);
        }
      })
      .catch(() => {
        reportError("Failed to replay annotated send");
        finishFailed(attempt, attempt.failureOverride ?? "send-unavailable");
      });
  };

  const beginSend = (
    isSendAvailable: boolean | undefined,
    source: "custom" | "native",
    retryOriginalText?: string,
  ): StartedSend => {
    if (isDisposed) {
      return failBeforeAttempt("disposed", source, setState);
    }
    if (activeAttempt) {
      return { isOwned: true, result: activeAttempt.result };
    }

    const annotations = snapshotAnnotations(options.annotations());
    if (annotations.length === 0) {
      return failBeforeAttempt("no-annotations", source, setState);
    }

    const snapshotResult = host.composer.snapshot();
    if (snapshotResult.status === "unavailable") {
      return failBeforeAttempt("composer-unavailable", source, setState);
    }
    const snapshot = snapshotResult.value;
    // 空 composer 时发送控件多半只是因缺少输入而不可用；批注文本补入后即可用,
    // 所以仍接管发送。非空时保持不接管,把真正被阻塞的发送留给页面自己处理。
    const isRecoverableBySend = snapshot.text.trim().length === 0;
    if (source === "native" && !isSendAvailable && !isRecoverableBySend) {
      return failedResult("send-unavailable");
    }
    const originalText =
      retryOriginalText && snapshot.text.trim().length === 0 ? retryOriginalText : snapshot.text;
    const ownedSnapshot = { ...snapshot, text: originalText };
    const compiledPrompt = options.compilePrompt(annotations, originalText, options.locale());
    if (compiledPromptExceedsCapacity(compiledPrompt)) {
      const result = { status: "failed", reason: "prompt-too-long" } as const;
      setState(result);
      return { isOwned: true, result: Promise.resolve(result) };
    }
    const attempt = createAttempt(
      options.conversationIdentity(),
      ownedSnapshot,
      compiledPrompt,
      annotations,
    );
    activeAttempt = attempt;
    failedSendSnapshot = null;
    setState({ status: "sending" });

    replaySend(attempt);
    return { isOwned: true, result: attempt.result };
  };

  const prepareNativeSend = ({ isSendAvailable }: ComposerSubmitIntent): ComposerSubmitDecision => {
    if (activeAttempt) {
      return "claim";
    }

    const started = beginSend(isSendAvailable, "native");
    return started.isOwned ? "claim" : "pass-through";
  };

  const stopListening = host.composer.subscribeToSubmit(prepareNativeSend);
  setState({ status: "idle" });

  return {
    submit: () => beginSend(undefined, "custom", failedSendSnapshot?.originalText).result,
    // A failed attempt's question belongs to the conversation that produced it. An active attempt
    // keeps running so it can still confirm after navigation.
    conversationChanged() {
      if (
        !failedSendSnapshot ||
        sameConversationIdentity(
          failedSendSnapshot.conversationIdentity,
          options.conversationIdentity(),
        )
      ) {
        return;
      }
      failedSendSnapshot = null;
      if (!activeAttempt) {
        setState({ status: "idle" });
      }
    },
    dispose() {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      stopListening();
      if (activeAttempt) {
        activeAttempt.failureOverride = "disposed";
        abortAttempt(activeAttempt);
      }
    },
  };
}

function createAttempt(
  conversationIdentity: ConversationIdentity,
  snapshot: ComposerSnapshot,
  compiledPrompt: string,
  annotations: readonly NumberedAnnotation[],
): SendAttempt {
  let resolve: (result: AnnotatedSendResult) => void = () => undefined;
  const result = new Promise<AnnotatedSendResult>((resultResolve) => {
    resolve = resultResolve;
  });
  return {
    conversationIdentity,
    snapshot,
    compiledPrompt,
    annotations,
    controller: new AbortController(),
    result,
    resolve,
  };
}

function snapshotAnnotations(annotations: readonly NumberedAnnotation[]): NumberedAnnotation[] {
  return annotations.map(({ annotation, ordinal }) => ({
    annotation: {
      ...annotation,
      anchor: { ...annotation.anchor },
    },
    ordinal,
  }));
}

function failedResult(reason: AnnotatedSendFailureReason): StartedSend {
  return { isOwned: false, result: Promise.resolve({ status: "failed", reason }) };
}

function failBeforeAttempt(
  reason: AnnotatedSendFailureReason,
  source: "custom" | "native",
  setState: (state: AnnotatedSendState) => void,
) {
  if (source === "custom") {
    setState({ status: "failed", reason });
  }
  return failedResult(reason);
}
