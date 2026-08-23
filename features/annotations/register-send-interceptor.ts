import type { SupportedLocale } from "@/features/i18n/messages";
import {
  conversationIdentityKey,
  sameConversationIdentity,
  type ConversationIdentity,
} from "@/features/conversation/conversation-identity";
import type {
  ComposerSnapshot,
  ComposerSubmitDecision,
  ComposerSubmitIntent,
  Host,
} from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";
import type { NumberedAnnotation } from "./annotation-projection";
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

export type AnnotatedSendState = { status: "idle" } | { status: "sending" } | AnnotatedSendFailure;

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
  restoreText: string;
  compiledPrompt: string;
  annotations: readonly NumberedAnnotation[];
  controller: AbortController;
};

type SendSession =
  | { status: "sending"; attempt: SendAttempt }
  | (AnnotatedSendFailure & { originalText?: string });

export function registerSendInterceptor(options: SendInterceptorOptions) {
  const host = options.host;
  const sendSessions = new Map<string, SendSession>();
  let currentConversationIdentity: ConversationIdentity | null = null;
  let isDisposed = false;

  const reportError = (message: string, error?: unknown) => {
    if (error === undefined) {
      console.error(`[QuoteCue] ${message}`);
      return;
    }
    console.error(`[QuoteCue] ${message}`, error);
  };
  const runSafely = (failureMessage: string, operation: () => void) => {
    try {
      operation();
    } catch (error: unknown) {
      reportError(failureMessage, error);
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

  const setConversationState = (
    conversationIdentity: ConversationIdentity,
    state: AnnotatedSendState,
  ) => {
    if (
      currentConversationIdentity &&
      sameConversationIdentity(currentConversationIdentity, conversationIdentity)
    ) {
      setState(state);
    }
  };

  const stateForConversation = (conversationIdentity: ConversationIdentity): AnnotatedSendState => {
    const session = sendSessions.get(conversationIdentityKey(conversationIdentity));
    if (!session) {
      return { status: "idle" };
    }
    if (session.status === "sending") {
      return { status: "sending" };
    }
    return { status: "failed", reason: session.reason };
  };

  const recordFailure = (
    conversationIdentity: ConversationIdentity,
    reason: AnnotatedSendFailureReason,
    originalText?: string,
  ) => {
    sendSessions.set(conversationIdentityKey(conversationIdentity), {
      ...(originalText === undefined ? {} : { originalText }),
      reason,
      status: "failed",
    });
    setConversationState(conversationIdentity, { status: "failed", reason });
  };

  const finishConfirmed = (attempt: SendAttempt) => {
    const key = conversationIdentityKey(attempt.conversationIdentity);
    const session = sendSessions.get(key);
    if (session?.status !== "sending" || session.attempt !== attempt) {
      return;
    }
    sendSessions.delete(key);
    const sentAnnotations = attempt.annotations.map(({ annotation }) => annotation);
    abortAttempt(attempt);
    setConversationState(attempt.conversationIdentity, { status: "idle" });
    runSafely("Failed to apply confirmed annotations", () =>
      options.onSendConfirmed(sentAnnotations, attempt.conversationIdentity),
    );
  };

  const finishFailed = (attempt: SendAttempt, reason: AnnotatedSendFailureReason) => {
    const key = conversationIdentityKey(attempt.conversationIdentity);
    const session = sendSessions.get(key);
    if (session?.status !== "sending" || session.attempt !== attempt) {
      return;
    }
    abortAttempt(attempt);
    recordFailure(attempt.conversationIdentity, reason, attempt.snapshot.text);
  };

  const replaySend = (attempt: SendAttempt) => {
    let submission: ReturnType<Host["composer"]["submit"]>;
    try {
      submission = host.composer.submit({
        restoreTo: attempt.snapshot,
        restoreText: attempt.restoreText,
        signal: attempt.controller.signal,
        text: attempt.compiledPrompt,
      });
    } catch (error: unknown) {
      reportError("Failed to replay annotated send", error);
      finishFailed(attempt, "send-unavailable");
      return;
    }
    void submission
      .then((result) => {
        if (result.status === "available") {
          finishConfirmed(attempt);
        } else {
          finishFailed(attempt, result.reason);
        }
      })
      .catch((error: unknown) => {
        reportError("Failed to replay annotated send", error);
        finishFailed(attempt, "send-unavailable");
      });
  };

  const beginSend = (isSendAvailable: boolean | undefined, source: "custom" | "native") => {
    if (isDisposed) {
      return false;
    }

    const sendInput = options.getSendInput();
    currentConversationIdentity = sendInput.conversationIdentity;
    const conversationKey = conversationIdentityKey(sendInput.conversationIdentity);
    const currentSession = sendSessions.get(conversationKey);
    if (currentSession?.status === "sending") {
      return true;
    }
    const annotations = snapshotAnnotations(sendInput.annotations);
    if (annotations.length === 0) {
      return false;
    }

    const snapshotResult = host.composer.snapshot();
    if (snapshotResult.status === "unavailable") {
      if (source === "custom") {
        recordFailure(sendInput.conversationIdentity, "composer-unavailable");
      }
      return false;
    }
    const snapshot = snapshotResult.value;
    // 空 composer 时发送控件多半只是因缺少输入而不可用；批注文本补入后即可用,
    // 所以仍接管发送。非空时保持不接管,把真正被阻塞的发送留给页面自己处理。
    const isRecoverableBySend = snapshot.text.trim().length === 0;
    if (source === "native" && !isSendAvailable && !isRecoverableBySend) {
      return false;
    }
    const retryOriginalText =
      source === "custom" && currentSession?.status === "failed"
        ? currentSession.originalText
        : undefined;
    const originalText =
      retryOriginalText !== undefined && snapshot.text.trim().length === 0
        ? retryOriginalText
        : snapshot.text;
    const compiledPrompt = compileAnnotatedPrompt(annotations, originalText, sendInput.locale);
    if (compiledPromptExceedsCapacity(compiledPrompt)) {
      recordFailure(sendInput.conversationIdentity, "prompt-too-long");
      return true;
    }
    const attempt = createAttempt(
      sendInput.conversationIdentity,
      snapshot,
      originalText,
      compiledPrompt,
      annotations,
    );
    sendSessions.set(conversationKey, { status: "sending", attempt });
    setState({ status: "sending" });

    replaySend(attempt);
    return true;
  };

  const prepareNativeSend = ({ isSendAvailable }: ComposerSubmitIntent): ComposerSubmitDecision => {
    return beginSend(isSendAvailable, "native") ? "claim" : "pass-through";
  };

  const stopListening = host.composer.subscribeToSubmit(prepareNativeSend);
  setState({ status: "idle" });

  return {
    submit: () => beginSend(undefined, "custom"),
    draftEmptied(conversationIdentity: ConversationIdentity) {
      const key = conversationIdentityKey(conversationIdentity);
      if (sendSessions.get(key)?.status !== "failed") {
        return;
      }
      sendSessions.delete(key);
      setConversationState(conversationIdentity, { status: "idle" });
    },
    conversationChanged(conversationIdentity: ConversationIdentity) {
      currentConversationIdentity = conversationIdentity;
      setState(stateForConversation(conversationIdentity));
    },
    dispose() {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      stopListening();
      for (const session of sendSessions.values()) {
        if (session.status === "sending") {
          abortAttempt(session.attempt);
        }
      }
      sendSessions.clear();
    },
  };
}

function createAttempt(
  conversationIdentity: ConversationIdentity,
  snapshot: ComposerSnapshot,
  restoreText: string,
  compiledPrompt: string,
  annotations: readonly NumberedAnnotation[],
): SendAttempt {
  return {
    conversationIdentity,
    snapshot,
    restoreText,
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
