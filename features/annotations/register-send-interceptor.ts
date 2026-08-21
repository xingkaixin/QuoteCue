import type { SupportedLocale } from "@/features/i18n/messages";
import type {
  ComposerSnapshot,
  ComposerSubmitDecision,
  ComposerSubmitFailureReason,
  ComposerSubmitIntent,
  ConversationIdentity,
  Host,
} from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";
import type { NumberedAnnotation } from "./annotation-projection";
import { sameConversationIdentity } from "./conversation-identity";
import { compiledPromptExceedsCapacity } from "./draft-capacity";
import { compileAnnotatedPrompt } from "./prompt-compiler";

export type AnnotatedSendFailureReason =
  | "composer-unavailable"
  | "confirmation-timeout"
  | "prompt-too-long"
  | "send-unavailable";

type AnnotatedSendFailure = {
  status: "failed";
  reason: AnnotatedSendFailureReason;
};

export type AnnotatedSendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "confirmed" }
  | AnnotatedSendFailure;

type SendInterceptorOptions = {
  getSendInput: () => SendAttemptInput;
  host: Host;
  onSendConfirmed: (
    annotations: readonly DraftAnnotation[],
    conversationIdentity: ConversationIdentity,
  ) => void;
  onStateChange?: (state: AnnotatedSendState) => void;
};

type SendAttemptInput = {
  readonly annotations: readonly NumberedAnnotation[];
  readonly conversationIdentity: ConversationIdentity;
  readonly locale: SupportedLocale;
};

type SendAttempt = {
  conversationIdentity: ConversationIdentity;
  snapshot: ComposerSnapshot;
  compiledPrompt: string;
  annotations: readonly NumberedAnnotation[];
  controller: AbortController;
};

type FailedSendSnapshot = {
  conversationIdentity: ConversationIdentity;
  originalText: string;
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
          finishFailed(attempt, annotatedFailureReason(result.reason));
        }
      })
      .catch(() => {
        reportError("Failed to replay annotated send");
        finishFailed(attempt, "send-unavailable");
      });
  };

  const beginSend = (
    isSendAvailable: boolean | undefined,
    source: "custom" | "native",
    retryOriginalText?: string,
  ) => {
    if (isDisposed) {
      return false;
    }
    if (activeAttempt) {
      return true;
    }

    const sendInput = options.getSendInput();
    const annotations = snapshotAnnotations(sendInput.annotations);
    if (annotations.length === 0) {
      return false;
    }

    const snapshotResult = host.composer.snapshot();
    if (snapshotResult.status === "unavailable") {
      reportPreflightFailure("composer-unavailable", source, setState);
      return false;
    }
    const snapshot = snapshotResult.value;
    // 空 composer 时发送控件多半只是因缺少输入而不可用；批注文本补入后即可用,
    // 所以仍接管发送。非空时保持不接管,把真正被阻塞的发送留给页面自己处理。
    const isRecoverableBySend = snapshot.text.trim().length === 0;
    if (source === "native" && !isSendAvailable && !isRecoverableBySend) {
      return false;
    }
    const originalText =
      retryOriginalText && snapshot.text.trim().length === 0 ? retryOriginalText : snapshot.text;
    const ownedSnapshot = { ...snapshot, text: originalText };
    const compiledPrompt = compileAnnotatedPrompt(annotations, originalText, sendInput.locale);
    if (compiledPromptExceedsCapacity(compiledPrompt)) {
      const result = { status: "failed", reason: "prompt-too-long" } as const;
      setState(result);
      return true;
    }
    const attempt = createAttempt(
      sendInput.conversationIdentity,
      ownedSnapshot,
      compiledPrompt,
      annotations,
    );
    activeAttempt = attempt;
    failedSendSnapshot = null;
    setState({ status: "sending" });

    replaySend(attempt);
    return true;
  };

  const prepareNativeSend = ({ isSendAvailable }: ComposerSubmitIntent): ComposerSubmitDecision => {
    if (activeAttempt) {
      return "claim";
    }

    return beginSend(isSendAvailable, "native") ? "claim" : "pass-through";
  };

  const stopListening = host.composer.subscribeToSubmit(prepareNativeSend);
  setState({ status: "idle" });

  return {
    submit: () => {
      beginSend(undefined, "custom", failedSendSnapshot?.originalText);
    },
    // A failed attempt's question belongs to the conversation that produced it. An active attempt
    // keeps running so it can still confirm after navigation.
    conversationChanged(conversationIdentity: ConversationIdentity) {
      if (
        !failedSendSnapshot ||
        sameConversationIdentity(failedSendSnapshot.conversationIdentity, conversationIdentity)
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
  return {
    conversationIdentity,
    snapshot,
    compiledPrompt,
    annotations,
    controller: new AbortController(),
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

function reportPreflightFailure(
  reason: AnnotatedSendFailureReason,
  source: "custom" | "native",
  setState: (state: AnnotatedSendState) => void,
) {
  if (source === "custom") {
    setState({ status: "failed", reason });
  }
}

function annotatedFailureReason(reason: ComposerSubmitFailureReason): AnnotatedSendFailureReason {
  return reason === "confirmation-timeout" ? reason : "send-unavailable";
}
