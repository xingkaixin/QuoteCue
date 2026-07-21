const COMPOSER_SELECTOR = "#prompt-textarea[contenteditable='true']";
const SEND_BUTTON_SELECTOR = "button[data-testid='send-button']";
const SEND_ACCEPT_TIMEOUT_MS = 15_000;
const SEND_BUTTON_APPEAR_TIMEOUT_MS = 2_000;

export function composerText() {
  return composerElement()?.innerText ?? "";
}

export function replaceComposerText(text: string) {
  const composer = composerElement();
  if (!composer) {
    return false;
  }

  composer.focus();
  selectComposerContents(composer);

  if (document.execCommand("insertText", false, text)) {
    return true;
  }

  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  composer.replaceChildren(paragraph);
  composer.dispatchEvent(
    new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }),
  );
  return true;
}

export function sendButtonFromEvent(event: Event) {
  const target = event.target;
  return target instanceof Element ? target.closest<HTMLButtonElement>(SEND_BUTTON_SELECTOR) : null;
}

export function currentSendButton() {
  return document.querySelector<HTMLButtonElement>(SEND_BUTTON_SELECTOR);
}

export function waitForSendButton() {
  const current = currentSendButton();
  if (current) {
    return Promise.resolve(current);
  }

  return new Promise<HTMLButtonElement | null>((resolve) => {
    const observer = new MutationObserver(() => {
      const button = currentSendButton();
      if (!button) {
        return;
      }
      cleanup();
      resolve(button);
    });
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, SEND_BUTTON_APPEAR_TIMEOUT_MS);
    const cleanup = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };

    observer.observe(document.body, { childList: true, subtree: true });
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

export function watchForAcceptedSend(onAccepted: () => void) {
  const composer = composerElement();
  if (!composer) {
    return () => {};
  }

  let timeout: number;
  const observer = new MutationObserver(() => {
    if (composer.innerText.trim().length > 0) {
      return;
    }

    cleanup();
    onAccepted();
  });
  const cleanup = () => {
    observer.disconnect();
    window.clearTimeout(timeout);
  };

  observer.observe(composer, { childList: true, characterData: true, subtree: true });
  timeout = window.setTimeout(cleanup, SEND_ACCEPT_TIMEOUT_MS);
  return cleanup;
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
