import type { ComposerSubmitOptions, ComposerSubmitResult } from "@/features/host-port/host-port";

import { available, once, unavailable, type HostContext, type HostResult } from "./host-context";
import type { ComposerDriver } from "./composer-driver";
import type { TextNormalizer } from "./text-normalizer";

const SEND_CONFIRM_TIMEOUT_MS = 15_000;
const SEND_BUTTON_APPEAR_TIMEOUT_MS = 2_000;

type ConfirmedSendWatcherOptions = {
  expectedText: string;
  onConfirmed: () => void;
  onTimeout: () => void;
  signal: AbortSignal;
};

export function createSendPipeline(
  context: HostContext,
  textNormalizer: TextNormalizer,
  composerDriver: ComposerDriver,
) {
  const { adapter, document: hostDocument, logger, signals, window: hostWindow } = context;
  const { normalizedRenderedText } = textNormalizer;

  const currentSendButton = () =>
    hostDocument.querySelector<HTMLElement>(adapter.sendControl.selector);
  let isDispatchingReplay = false;

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

    const initialMessages = userMessages();
    const lastInitialMessage = initialMessages.at(-1);
    const existingMessageIds = new Set(
      initialMessages
        .map((message) => adapter.messages.id(message))
        .filter((messageId): messageId is string => messageId !== undefined),
    );
    const isNewMessage = (message: HTMLElement) => {
      const messageId = adapter.messages.id(message);
      if (messageId) {
        return !existingMessageIds.has(messageId);
      }
      if (!lastInitialMessage) {
        return true;
      }
      return (
        lastInitialMessage.isConnected &&
        Boolean(
          lastInitialMessage.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING,
        )
      );
    };
    const expectedText = normalizedRenderedText(options.expectedText);
    logger?.(`[QuoteCue host] send confirmation started: existing=${initialMessages.length}`);
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
      const messages = userMessages();
      const confirmedMessage = messages.find((message) => {
        if (!isNewMessage(message)) {
          return false;
        }
        if ((message.textContent?.length ?? 0) < expectedText.length) {
          return false;
        }
        return normalizedRenderedText(message) === expectedText;
      });
      if (logger) {
        logger(
          `[QuoteCue host] send confirmation observed: total=${messages.length}, matched=${Boolean(confirmedMessage)}`,
        );
      }
      if (confirmedMessage) {
        cleanup();
        options.onConfirmed();
      }
    };
    const scheduleConfirmationScan = () => {
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
    const replaceResult = replaceComposer(options);
    if (replaceResult.status === "unavailable") {
      restoreComposer(options);
      return replaceResult;
    }

    let result: ComposerSubmitResult;
    try {
      const sendButtonResult = await waitForButton(options.signal);
      result =
        sendButtonResult.status === "available" && !options.signal.aborted
          ? await dispatchAndConfirm(sendButtonResult.value, options)
          : unavailable("send-unavailable");
    } catch {
      result = unavailable("send-unavailable");
    }

    if (result.status === "unavailable") {
      restoreComposer(options);
    }
    return result;
  }

  function replaceComposer(options: ComposerSubmitOptions) {
    try {
      return composerDriver.replaceText(options.restoreTo.element, options.text)
        ? available("replaced" as const)
        : unavailable("replace-failed" as const);
    } catch {
      return unavailable("replace-failed" as const);
    }
  }

  function restoreComposer(options: ComposerSubmitOptions) {
    try {
      composerDriver.restoreText(options.restoreTo, options.text);
    } catch {
      logger?.("[QuoteCue host] composer restore failed");
    }
  }

  async function dispatchAndConfirm(
    sendButton: HTMLElement,
    options: ComposerSubmitOptions,
  ): Promise<ComposerSubmitResult> {
    const confirmation = createConfirmation(options.text, options.signal);
    isDispatchingReplay = true;
    try {
      sendButton.click();
    } catch {
      confirmation.cancel();
    } finally {
      isDispatchingReplay = false;
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
    const onAbort = () => finish(unavailable("send-unavailable"));
    stopWatching = watchConfirmedSend({
      expectedText,
      onConfirmed: () => finish(available("confirmed")),
      onTimeout: () => finish(unavailable("confirmation-timeout")),
      signal,
    });
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    return { cancel: onAbort, result };
  }

  function subscribeToSubmit(callback: (event: Event, button: HTMLElement | null) => void) {
    const onClick = (event: MouseEvent) => {
      if (isDispatchingReplay) {
        return;
      }
      const target = event.target;
      const button =
        target instanceof Element
          ? target.closest<HTMLElement>(adapter.sendControl.selector)
          : null;
      if (button) {
        callback(event, button);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isDispatchingReplay) {
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
        callback(event, currentSendButton());
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

    const boundary = adapter.layout.boundarySelector
      ? composer.closest<HTMLElement>(adapter.layout.boundarySelector)
      : composer.closest<HTMLElement>("form");
    return boundary ?? composer.parentElement ?? hostDocument.body;
  }

  return { isButtonAvailable, submit, subscribeToSubmit, waitForButton, watchConfirmedSend };
}
