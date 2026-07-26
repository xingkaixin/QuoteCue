import { available, once, unavailable, type HostContext, type HostResult } from "./host-context";
import type { TextNormalizer } from "./text-normalizer";

const SEND_CONFIRM_TIMEOUT_MS = 15_000;
const SEND_BUTTON_APPEAR_TIMEOUT_MS = 2_000;

type ConfirmedSendWatcherOptions = {
  expectedText: string;
  onConfirmed: () => void;
  onTimeout: () => void;
  signal: AbortSignal;
};

export function createSendPipeline(context: HostContext, textNormalizer: TextNormalizer) {
  const { adapter, document: hostDocument, logger, signals, window: hostWindow } = context;
  const { normalizedRenderedText } = textNormalizer;

  const currentSendButton = () =>
    hostDocument.querySelector<HTMLElement>(adapter.sendControl.selector);

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
      stopObserving = signals.observeMutations(findButton, {
        attributeFilter: ["aria-disabled", "class", "disabled"],
        childList: true,
      });
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
    let stopObserving: () => void = () => undefined;
    let timeout: number | undefined;
    const cleanup = once(() => {
      stopObserving();
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
      logger?.(
        `[QuoteCue host] send confirmation observed: total=${messages.length}, matched=${Boolean(confirmedMessage)}`,
      );
      if (confirmedMessage) {
        cleanup();
        options.onConfirmed();
      }
    };
    stopObserving = signals.observeMutations(findConfirmedMessage, {
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

  function subscribeToSubmit(callback: (event: Event, button: HTMLElement | null) => void) {
    const onClick = (event: MouseEvent) => {
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

  return { isButtonAvailable, subscribeToSubmit, waitForButton, watchConfirmedSend };
}
