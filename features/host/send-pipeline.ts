import type {
  ComposerSubmitDecision,
  ComposerSubmitIntent,
  ComposerSubmitOptions,
  ComposerSubmitResult,
  HostResult,
} from "@/features/host-port/host-port";
import { readRenderedText } from "@/lib/rendered-text";

import type { ComposerDriver } from "./composer-driver";
import type { HostContext } from "./host-context";
import { available, failure, unavailable } from "./host-result";
import { once } from "./host-signals";

const SEND_CONFIRM_TIMEOUT_MS = 15_000;
const SEND_BUTTON_APPEAR_TIMEOUT_MS = 2_000;

type ConfirmedSendWatcherOptions = {
  expectedText: string;
  onConfirmed: () => void;
  onTimeout: () => void;
  signal: AbortSignal;
};

export function createSendPipeline(context: HostContext, composerDriver: ComposerDriver) {
  const { adapter, document: hostDocument, logger, signals, window: hostWindow } = context;

  function normalizedRenderedText(value: HTMLElement | string) {
    const text = typeof value === "string" ? value : readRenderedText(value);
    return adapter.composer.normalize(text);
  }

  const currentSendButton = () => {
    const composer = composerDriver.current();
    return composer ? context.sendControl(composer) : null;
  };

  function isButtonAvailable(button: HTMLElement | null): button is HTMLElement {
    return (
      button !== null &&
      button.isConnected &&
      !button.matches(":disabled") &&
      button.getAttribute("aria-disabled") !== "true" &&
      !adapter.sendControl.isDisabled(button)
    );
  }

  function waitForButton(signal: AbortSignal) {
    const current = currentSendButton();
    if (isButtonAvailable(current)) {
      logger?.("[QuoteCue host] send control ready: immediate");
      return Promise.resolve(available(current));
    }
    if (signal.aborted) {
      return Promise.resolve(unavailable("send-control-unavailable"));
    }

    return new Promise<HostResult<HTMLElement>>((resolve) => {
      let isFinished = false;
      let stopObserving: () => void = () => undefined;
      let timeout: number | undefined;
      const finish = (result: HostResult<HTMLElement>) => {
        if (isFinished) {
          return;
        }
        isFinished = true;
        stopObserving();
        if (timeout !== undefined) {
          hostWindow.clearTimeout(timeout);
        }
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      };
      const findButton = () => {
        const button = currentSendButton();
        if (isButtonAvailable(button)) {
          logger?.("[QuoteCue host] send control ready: observed");
          finish(available(button));
        }
      };
      const onAbort = () => finish(unavailable("send-control-unavailable"));
      const observer = new MutationObserver(findButton);
      observer.observe(sendControlObservationRoot(current), {
        attributeFilter: ["aria-disabled", "class", "disabled"],
        attributes: true,
        childList: true,
        subtree: true,
      });
      stopObserving = () => observer.disconnect();
      timeout = hostWindow.setTimeout(() => {
        logger?.("[QuoteCue host] send control wait timed out");
        finish(unavailable("send-control-unavailable"));
      }, SEND_BUTTON_APPEAR_TIMEOUT_MS);

      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function watchConfirmedSend(options: ConfirmedSendWatcherOptions) {
    if (options.signal.aborted) {
      logger?.("[QuoteCue host] send confirmation skipped: aborted");
      return () => undefined;
    }

    const expectedText = normalizedRenderedText(options.expectedText);
    const matchesExpectedText = (message: HTMLElement) =>
      (message.textContent?.length ?? 0) >= expectedText.length &&
      normalizedRenderedText(message) === expectedText;
    const initialMessages = userMessages();
    const existingMessageIds = new Set<string>();
    let hasMatchingBaseline = false;
    let hasUnidentifiedMatchingBaseline = false;
    for (const message of initialMessages) {
      const messageId = adapter.messages.id(message);
      if (messageId) {
        existingMessageIds.add(messageId);
      }
      if (matchesExpectedText(message)) {
        hasMatchingBaseline = true;
        hasUnidentifiedMatchingBaseline ||= !messageId;
      }
    }
    const initialMessageNodes = new WeakSet(initialMessages);
    const isNewMessage = (message: HTMLElement) => {
      if (initialMessageNodes.has(message)) {
        return false;
      }
      const messageId = adapter.messages.id(message);
      if (messageId) {
        return !hasUnidentifiedMatchingBaseline && !existingMessageIds.has(messageId);
      }
      // A repeated optimistic message cannot distinguish a new send from reconciliation.
      return !hasMatchingBaseline;
    };
    logger?.(`[QuoteCue host] send confirmation started: existing=${initialMessages.length}`);
    const candidateMessages = new Set<HTMLElement>();
    let confirmationFrame: number | undefined;
    let stopObserving: () => void = () => undefined;
    let timeout: number | undefined;
    const cleanup = once(() => {
      stopObserving();
      if (confirmationFrame !== undefined) {
        hostWindow.cancelAnimationFrame(confirmationFrame);
      }
      if (timeout !== undefined) {
        hostWindow.clearTimeout(timeout);
      }
      options.signal.removeEventListener("abort", cleanup);
    });
    const findConfirmedMessage = () => {
      const messages = [...candidateMessages];
      candidateMessages.clear();
      const confirmedMessage = messages.find((message) => {
        if (!message.isConnected || !message.matches(adapter.messages.userSelector)) {
          return false;
        }
        if (!isNewMessage(message)) {
          return false;
        }
        return matchesExpectedText(message);
      });
      if (logger) {
        logger(
          `[QuoteCue host] send confirmation observed: candidates=${messages.length}, matched=${Boolean(confirmedMessage)}`,
        );
      }
      if (confirmedMessage) {
        cleanup();
        options.onConfirmed();
      }
    };
    const scheduleConfirmationScan = (records: readonly MutationRecord[]) => {
      collectUserMessageCandidates(records, candidateMessages);
      if (candidateMessages.size === 0) {
        return;
      }
      if (confirmationFrame !== undefined) {
        return;
      }
      confirmationFrame = hostWindow.requestAnimationFrame(() => {
        confirmationFrame = undefined;
        findConfirmedMessage();
      });
    };
    stopObserving = signals.observeMutations(scheduleConfirmationScan, {
      characterData: true,
      childList: true,
    });
    timeout = hostWindow.setTimeout(() => {
      logger?.("[QuoteCue host] send confirmation timed out");
      cleanup();
      options.onTimeout();
    }, SEND_CONFIRM_TIMEOUT_MS);

    options.signal.addEventListener("abort", cleanup, { once: true });
    return cleanup;
  }

  async function submit(options: ComposerSubmitOptions): Promise<ComposerSubmitResult> {
    if (options.signal.aborted) {
      return failure("send-unavailable");
    }
    const replaced = await replaceComposer(options);
    if (!replaced) {
      logger?.("[QuoteCue host] composer replacement failed");
      restoreComposer(options);
      return failure("send-unavailable");
    }

    let result: ComposerSubmitResult;
    try {
      const sendButtonResult = await waitForButton(options.signal);
      result =
        sendButtonResult.status === "available" && !options.signal.aborted
          ? await dispatchAndConfirm(sendButtonResult.value, options)
          : failure("send-unavailable");
    } catch (error: unknown) {
      logger?.("[QuoteCue host] send submission failed", error);
      result = failure("send-unavailable");
    }

    if (result.status === "unavailable") {
      restoreComposer(options);
    }
    return result;
  }

  function replaceComposer(options: ComposerSubmitOptions) {
    try {
      return composerDriver.replaceText(options.restoreTo, options.text, options.signal);
    } catch (error: unknown) {
      logger?.("[QuoteCue host] composer replacement failed", error);
      return false;
    }
  }

  function restoreComposer(options: ComposerSubmitOptions) {
    try {
      composerDriver.restoreText(options.restoreTo, options.text, options.restoreText);
    } catch (error: unknown) {
      logger?.("[QuoteCue host] composer restore failed", error);
    }
  }

  async function dispatchAndConfirm(
    sendButton: HTMLElement,
    options: ComposerSubmitOptions,
  ): Promise<ComposerSubmitResult> {
    if (
      !composerDriver.isCurrent(options.restoreTo, options.text) ||
      currentSendButton() !== sendButton ||
      !isButtonAvailable(sendButton)
    ) {
      logger?.("[QuoteCue host] send target changed before dispatch");
      return failure("send-unavailable");
    }
    const confirmation = createConfirmation(options.text, options.signal);
    try {
      sendButton.click();
    } catch (error: unknown) {
      logger?.("[QuoteCue host] send dispatch failed", error);
      confirmation.cancel();
    }
    return confirmation.result;
  }

  function createConfirmation(expectedText: string, signal: AbortSignal) {
    let isFinished = false;
    let stopWatching: () => void = () => undefined;
    let resolveResult: (result: ComposerSubmitResult) => void = () => undefined;
    const result = new Promise<ComposerSubmitResult>((resolve) => {
      resolveResult = resolve;
    });
    const finish = (nextResult: ComposerSubmitResult) => {
      if (isFinished) {
        return;
      }
      isFinished = true;
      stopWatching();
      signal.removeEventListener("abort", onAbort);
      resolveResult(nextResult);
    };
    const onAbort = () => finish(failure("send-unavailable"));
    stopWatching = watchConfirmedSend({
      expectedText,
      onConfirmed: () => finish(available("confirmed")),
      onTimeout: () => finish(failure("confirmation-timeout")),
      signal,
    });
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    return { cancel: onAbort, result };
  }

  // Only the browser can produce a trusted event, so this is the boundary between a user
  // choosing to send and a host page script synthesizing a send. It also covers our own
  // replay click in dispatchAndConfirm, which is untrusted by the same rule.
  function subscribeToSubmit(callback: (intent: ComposerSubmitIntent) => ComposerSubmitDecision) {
    const dispatchIntent = (event: Event, isSendAvailable: boolean) => {
      if (callback({ isSendAvailable }) === "pass-through") {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onClick = (event: MouseEvent) => {
      if (!event.isTrusted) {
        return;
      }
      const target = event.target;
      const button =
        target instanceof Element
          ? target.closest<HTMLElement>(adapter.sendControl.selector)
          : null;
      if (button) {
        dispatchIntent(event, isButtonAvailable(button));
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.isTrusted) {
        return;
      }
      const target = event.target;
      const isSubmitKey =
        target instanceof Element &&
        target.closest(adapter.composer.selector) !== null &&
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.isComposing;
      if (isSubmitKey) {
        dispatchIntent(event, isButtonAvailable(currentSendButton()));
      }
    };

    hostWindow.addEventListener("click", onClick, true);
    hostWindow.addEventListener("keydown", onKeyDown, true);
    return () => {
      hostWindow.removeEventListener("click", onClick, true);
      hostWindow.removeEventListener("keydown", onKeyDown, true);
    };
  }

  function userMessages() {
    return Array.from(hostDocument.querySelectorAll<HTMLElement>(adapter.messages.userSelector));
  }

  function collectUserMessageCandidates(
    records: readonly MutationRecord[],
    candidates: Set<HTMLElement>,
  ) {
    const selector = adapter.messages.userSelector;
    const collectContainingMessage = (node: Node) => {
      const element = node instanceof Element ? node : node.parentElement;
      const containingMessage = element?.closest<HTMLElement>(selector);
      if (containingMessage) {
        candidates.add(containingMessage);
      }
    };
    const collectAddedMessages = (node: Node) => {
      collectContainingMessage(node);
      if (!(node instanceof Element)) {
        return;
      }
      for (const message of node.querySelectorAll<HTMLElement>(selector)) {
        candidates.add(message);
      }
    };

    for (const record of records) {
      collectContainingMessage(record.target);
      if (record.type !== "childList") {
        continue;
      }
      for (const node of record.addedNodes) {
        collectAddedMessages(node);
      }
    }
  }

  function sendControlObservationRoot(button: HTMLElement | null) {
    const composer = composerDriver.current();
    if (!composer) {
      return hostDocument.body;
    }

    if (button) {
      let commonAncestor: HTMLElement | null = composer;
      while (commonAncestor && !commonAncestor.contains(button)) {
        commonAncestor = commonAncestor.parentElement;
      }
      if (commonAncestor) {
        return commonAncestor;
      }
    }

    const boundary = context.composerBoundary(composer);
    return boundary ?? composer.parentElement ?? hostDocument.body;
  }

  return { submit, subscribeToSubmit };
}
