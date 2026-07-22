const COMPOSER_SELECTOR = "#prompt-textarea[contenteditable='true']";
const SEND_BUTTON_SELECTOR = "button[data-testid='send-button']";
const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"][data-message-id]';
const SEND_ACCEPT_TIMEOUT_MS = 15_000;
const SEND_BUTTON_APPEAR_TIMEOUT_MS = 2_000;

export type ComposerSnapshot = {
  element: HTMLElement;
  text: string;
};

type AcceptedSendWatcherOptions = {
  expectedText: string;
  onAccepted: () => void;
  onTimeout: () => void;
  signal: AbortSignal;
};

export function currentComposerSnapshot(): ComposerSnapshot | null {
  const element = composerElement();
  return element ? { element, text: composerText(element) } : null;
}

export function composerText(composer: HTMLElement) {
  return typeof composer.innerText === "string" ? composer.innerText : (composer.textContent ?? "");
}

export function replaceComposerText(composer: HTMLElement, text: string) {
  if (!composer.isConnected) {
    return false;
  }

  composer.focus();
  selectComposerContents(composer);

  if (
    typeof document.execCommand === "function" &&
    document.execCommand("insertText", false, text)
  ) {
    return composerText(composer) === text;
  }

  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  composer.replaceChildren(paragraph);
  composer.dispatchEvent(
    new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }),
  );
  return composerText(composer) === text;
}

export function restoreComposerText(snapshot: ComposerSnapshot, expectedText: string) {
  if (composerElement() !== snapshot.element || composerText(snapshot.element) !== expectedText) {
    return false;
  }
  return replaceComposerText(snapshot.element, snapshot.text);
}

export function sendButtonFromEvent(event: Event) {
  const target = event.target;
  return target instanceof Element ? target.closest<HTMLButtonElement>(SEND_BUTTON_SELECTOR) : null;
}

export function currentSendButton() {
  return document.querySelector<HTMLButtonElement>(SEND_BUTTON_SELECTOR);
}

export function isSendButtonAvailable(
  button: HTMLButtonElement | null,
): button is HTMLButtonElement {
  return (
    button !== null &&
    button.isConnected &&
    !button.disabled &&
    button.getAttribute("aria-disabled") !== "true"
  );
}

export function waitForSendButton(signal: AbortSignal) {
  const current = currentSendButton();
  if (isSendButtonAvailable(current)) {
    return Promise.resolve(current);
  }
  if (signal.aborted) {
    return Promise.resolve(null);
  }

  return new Promise<HTMLButtonElement | null>((resolve) => {
    const finish = (button: HTMLButtonElement | null) => {
      observer.disconnect();
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      resolve(button);
    };
    const findButton = () => {
      const button = currentSendButton();
      if (isSendButtonAvailable(button)) {
        finish(button);
      }
    };
    const onAbort = () => finish(null);
    const observer = new MutationObserver(findButton);
    const timeout = window.setTimeout(() => finish(null), SEND_BUTTON_APPEAR_TIMEOUT_MS);

    signal.addEventListener("abort", onAbort, { once: true });
    observer.observe(document.body, {
      attributeFilter: ["aria-disabled", "disabled"],
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
}

export function isComposerEnter(event: KeyboardEvent) {
  const target = event.target;
  return (
    target instanceof Element &&
    target.closest(COMPOSER_SELECTOR) !== null &&
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.isComposing
  );
}

export function watchForAcceptedSend(options: AcceptedSendWatcherOptions) {
  const existingMessageIds = new Set(userMessages().map((message) => message.dataset.messageId));

  const cleanup = () => {
    observer.disconnect();
    window.clearTimeout(timeout);
    options.signal.removeEventListener("abort", cleanup);
  };
  const observer = new MutationObserver(() => {
    const acceptedMessage = userMessages().find(
      (message) =>
        !existingMessageIds.has(message.dataset.messageId) &&
        normalizedText(message) === normalizedText(options.expectedText),
    );
    if (!acceptedMessage) {
      return;
    }
    cleanup();
    options.onAccepted();
  });
  const timeout = window.setTimeout(() => {
    cleanup();
    options.onTimeout();
  }, SEND_ACCEPT_TIMEOUT_MS);

  options.signal.addEventListener("abort", cleanup, { once: true });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  return cleanup;
}

function userMessages() {
  return Array.from(document.querySelectorAll<HTMLElement>(USER_MESSAGE_SELECTOR));
}

function normalizedText(value: HTMLElement | string) {
  const text = typeof value === "string" ? value : composerText(value);
  return text.replace(/\r\n?/g, "\n").trim();
}

function composerElement() {
  return document.querySelector<HTMLElement>(COMPOSER_SELECTOR);
}

function selectComposerContents(composer: HTMLElement) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(composer);
  selection?.removeAllRanges();
  selection?.addRange(range);
}
