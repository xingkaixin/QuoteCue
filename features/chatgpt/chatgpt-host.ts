import type {
  DraftAnnotation,
  SelectionDraft,
  TextAnchor,
} from "@/features/annotations/annotation";
import { restoreTextAnchorFromIndex } from "@/features/annotations/selection-anchor";

const ASSISTANT_MESSAGE_SELECTOR = '[data-message-author-role="assistant"][data-message-id]';
const COMPOSER_SELECTOR = "#prompt-textarea[contenteditable='true']";
const SEND_BUTTON_SELECTOR = "button[data-testid='send-button']";
const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"][data-message-id]';
const CONVERSATION_PATH_PATTERN = /^\/c\/([^/?#]+)/;
const CONTEXT_LENGTH = 48;
const SEND_ACCEPT_TIMEOUT_MS = 15_000;
const SEND_BUTTON_APPEAR_TIMEOUT_MS = 2_000;

export type ChatGptHostUnavailableReason =
  | "assistant-message-unavailable"
  | "composer-surface-unavailable"
  | "composer-unavailable"
  | "selection-unavailable"
  | "send-control-unavailable";

export type ChatGptHostResult<T> =
  | { status: "available"; value: T }
  | { status: "unavailable"; reason: ChatGptHostUnavailableReason };

export type ComposerSnapshot = {
  element: HTMLElement;
  text: string;
};

export type HostComposerLayout = {
  action: HTMLButtonElement | null;
  send: { height: number; left: number; top: number; width: number };
  summary: { left: number; top: number };
  surface: HTMLElement;
};

type AcceptedSendWatcherOptions = {
  expectedText: string;
  onAccepted: () => void;
  onTimeout: () => void;
  signal: AbortSignal;
};

type HostEnvironment = {
  document: Document;
  logger?: (message: string) => void;
  window: Window;
};

export function createChatGptHost(environment: HostEnvironment) {
  const { document: hostDocument, logger, window: hostWindow } = environment;

  function observePage(callback: () => void, includeViewport: boolean) {
    const observer = new MutationObserver(callback);
    observer.observe(hostDocument.body, { childList: true, subtree: true });
    if (includeViewport) {
      hostWindow.addEventListener("resize", callback);
      hostWindow.addEventListener("scroll", callback, true);
    }

    return () => {
      observer.disconnect();
      if (includeViewport) {
        hostWindow.removeEventListener("resize", callback);
        hostWindow.removeEventListener("scroll", callback, true);
      }
    };
  }

  function messageIndex(root: ParentNode = hostDocument) {
    const index = new Map<string, HTMLElement>();
    for (const message of root.querySelectorAll<HTMLElement>(ASSISTANT_MESSAGE_SELECTOR)) {
      const messageId = message.dataset.messageId;
      if (messageId && !index.has(messageId)) {
        index.set(messageId, message);
      }
    }
    return index;
  }

  function restoreAnchor(anchor: TextAnchor): ChatGptHostResult<Range> {
    const range = restoreTextAnchorFromIndex(anchor, messageIndex());
    return range ? available(range) : unavailable("assistant-message-unavailable");
  }

  function captureSelection(
    selection = hostWindow.getSelection(),
  ): ChatGptHostResult<SelectionDraft> {
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return unavailable("selection-unavailable");
    }

    const range = selection.getRangeAt(0);
    const message = assistantMessageForRange(range);
    const quote = selection.toString().trim();
    if (!message || quote.length === 0) {
      return unavailable("assistant-message-unavailable");
    }

    const start = textOffset(message, range.startContainer, range.startOffset);
    const end = textOffset(message, range.endContainer, range.endOffset);
    const messageText = message.textContent ?? "";
    return available({
      anchor: {
        end,
        messageId: message.dataset.messageId ?? "",
        prefix: messageText.slice(Math.max(0, start - CONTEXT_LENGTH), start),
        quote,
        start,
        suffix: messageText.slice(end, end + CONTEXT_LENGTH),
      },
      rect: rangeRect(range),
    });
  }

  function selectionDraft(annotation: DraftAnnotation): ChatGptHostResult<SelectionDraft> {
    const restored = restoreAnchor(annotation.anchor);
    return restored.status === "available"
      ? available({ anchor: annotation.anchor, rect: rangeRect(restored.value) })
      : restored;
  }

  function currentComposer() {
    return hostDocument.querySelector<HTMLElement>(COMPOSER_SELECTOR);
  }

  function composerText(composer: HTMLElement) {
    return typeof composer.innerText === "string"
      ? composer.innerText
      : (composer.textContent ?? "");
  }

  function composerSnapshot(): ChatGptHostResult<ComposerSnapshot> {
    const element = currentComposer();
    return element
      ? available({ element, text: composerText(element) })
      : unavailable("composer-unavailable");
  }

  function replaceComposerText(composer: HTMLElement, text: string) {
    if (!composer.isConnected) {
      return false;
    }

    composer.focus();
    selectComposerContents(composer);
    if (
      typeof hostDocument.execCommand === "function" &&
      hostDocument.execCommand("insertText", false, text)
    ) {
      return composerText(composer) === text;
    }

    const paragraph = hostDocument.createElement("p");
    paragraph.textContent = text;
    composer.replaceChildren(paragraph);
    composer.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }),
    );
    return composerText(composer) === text;
  }

  function restoreComposerText(snapshot: ComposerSnapshot, expectedText: string) {
    if (currentComposer() !== snapshot.element || composerText(snapshot.element) !== expectedText) {
      return false;
    }
    return replaceComposerText(snapshot.element, snapshot.text);
  }

  function currentSendButton() {
    return hostDocument.querySelector<HTMLButtonElement>(SEND_BUTTON_SELECTOR);
  }

  function isSendButtonAvailable(button: HTMLButtonElement | null): button is HTMLButtonElement {
    return (
      button !== null &&
      button.isConnected &&
      !button.disabled &&
      button.getAttribute("aria-disabled") !== "true"
    );
  }

  function waitForSendButton(signal: AbortSignal) {
    const current = currentSendButton();
    if (isSendButtonAvailable(current)) {
      return Promise.resolve(available(current));
    }
    if (signal.aborted) {
      return Promise.resolve(unavailable("send-control-unavailable"));
    }

    return new Promise<ChatGptHostResult<HTMLButtonElement>>((resolve) => {
      const finish = (result: ChatGptHostResult<HTMLButtonElement>) => {
        observer.disconnect();
        hostWindow.clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      };
      const findButton = () => {
        const button = currentSendButton();
        if (isSendButtonAvailable(button)) {
          finish(available(button));
        }
      };
      const onAbort = () => finish(unavailable("send-control-unavailable"));
      const observer = new MutationObserver(findButton);
      const timeout = hostWindow.setTimeout(
        () => finish(unavailable("send-control-unavailable")),
        SEND_BUTTON_APPEAR_TIMEOUT_MS,
      );

      signal.addEventListener("abort", onAbort, { once: true });
      observer.observe(hostDocument.body, {
        attributeFilter: ["aria-disabled", "disabled"],
        attributes: true,
        childList: true,
        subtree: true,
      });
    });
  }

  function watchForAcceptedSend(options: AcceptedSendWatcherOptions) {
    const existingMessageIds = new Set(userMessages().map((message) => message.dataset.messageId));
    const observer = new MutationObserver(() => {
      const acceptedMessage = userMessages().find(
        (message) =>
          !existingMessageIds.has(message.dataset.messageId) &&
          normalizedText(message) === normalizedText(options.expectedText),
      );
      if (acceptedMessage) {
        cleanup();
        options.onAccepted();
      }
    });
    const timeout = hostWindow.setTimeout(() => {
      cleanup();
      options.onTimeout();
    }, SEND_ACCEPT_TIMEOUT_MS);
    const cleanup = () => {
      observer.disconnect();
      hostWindow.clearTimeout(timeout);
      options.signal.removeEventListener("abort", cleanup);
    };

    options.signal.addEventListener("abort", cleanup, { once: true });
    observer.observe(hostDocument.body, { childList: true, characterData: true, subtree: true });
    return cleanup;
  }

  function currentLayout(): ChatGptHostResult<HostComposerLayout> {
    const composer = currentComposer();
    const form = composer?.closest<HTMLFormElement>("form");
    const surface = composer && form ? findComposerSurface(composer, form) : null;
    if (!composer || !form) {
      return unavailable("composer-unavailable");
    }
    if (!surface) {
      return unavailable("composer-surface-unavailable");
    }

    const rect = surface.getBoundingClientRect();
    const action = findComposerAction(form, rect);
    const actionRect = action?.getBoundingClientRect();
    return available({
      action,
      send: actionRect
        ? {
            height: actionRect.height,
            left: actionRect.left,
            top: actionRect.top,
            width: actionRect.width,
          }
        : { height: 36, left: rect.right - 44, top: rect.bottom - 44, width: 36 },
      summary: { left: rect.left + 12, top: rect.top + 8 },
      surface,
    });
  }

  function assistantMessageForRange(range: Range) {
    const startMessage = closestAssistantMessage(range.startContainer);
    const endMessage = closestAssistantMessage(range.endContainer);
    return startMessage === endMessage ? startMessage : null;
  }

  function textOffset(root: HTMLElement, node: Node, offset: number) {
    const range = hostDocument.createRange();
    range.setStart(root, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  function closestAssistantMessage(node: Node) {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest<HTMLElement>(ASSISTANT_MESSAGE_SELECTOR) ?? null;
  }

  function findComposerSurface(composer: HTMLElement, form: HTMLFormElement) {
    let candidate = composer.parentElement;
    while (candidate && candidate !== form) {
      const style = hostWindow.getComputedStyle(candidate);
      const hasRoundedBackground =
        Number.parseFloat(style.borderTopLeftRadius) > 0 &&
        style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        style.backgroundColor !== "transparent";
      if (hasRoundedBackground) {
        return candidate;
      }
      candidate = candidate.parentElement;
    }
    return null;
  }

  function findComposerAction(form: HTMLFormElement, surfaceRect: DOMRect) {
    return Array.from(form.querySelectorAll<HTMLButtonElement>("button"))
      .map((button) => ({ button, rect: button.getBoundingClientRect() }))
      .filter(({ rect }) => {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          centerX >= surfaceRect.left &&
          centerX <= surfaceRect.right &&
          centerY >= surfaceRect.top &&
          centerY <= surfaceRect.bottom
        );
      })
      .sort((left, right) => right.rect.right - left.rect.right)[0]?.button;
  }

  function userMessages() {
    return Array.from(hostDocument.querySelectorAll<HTMLElement>(USER_MESSAGE_SELECTOR));
  }

  function normalizedText(value: HTMLElement | string) {
    const text = typeof value === "string" ? value : composerText(value);
    return text.replace(/\r\n?/g, "\n").trim();
  }

  function selectComposerContents(composer: HTMLElement) {
    const selection = hostWindow.getSelection();
    const range = hostDocument.createRange();
    range.selectNodeContents(composer);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function subscribeToSubmit(callback: (event: Event, button: HTMLButtonElement | null) => void) {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      const button =
        target instanceof Element ? target.closest<HTMLButtonElement>(SEND_BUTTON_SELECTOR) : null;
      if (button) {
        callback(event, button);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isSubmitKey =
        target instanceof Element &&
        target.closest(COMPOSER_SELECTOR) !== null &&
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

  return {
    composer: {
      isButtonAvailable: isSendButtonAvailable,
      replaceText: replaceComposerText,
      restoreText: restoreComposerText,
      snapshot: composerSnapshot,
      subscribeToSubmit,
      waitForButton: waitForSendButton,
      watchAcceptedSend: watchForAcceptedSend,
    },
    conversation: {
      key(temporaryConversationKey: string) {
        return (
          hostWindow.location.pathname.match(CONVERSATION_PATH_PATTERN)?.[1] ??
          temporaryConversationKey
        );
      },
      subscribe(callback: () => void) {
        const stopObserving = observePage(callback, false);
        hostWindow.addEventListener("popstate", callback);
        return () => {
          stopObserving();
          hostWindow.removeEventListener("popstate", callback);
        };
      },
    },
    layout: {
      current: currentLayout,
      subscribe: (callback: () => void) => observePage(callback, true),
    },
    reportUnavailable(reason: ChatGptHostUnavailableReason) {
      logger?.(`[QuoteCue host] unavailable: ${reason}`);
    },
    selection: {
      capture: captureSelection,
      draft: selectionDraft,
      messageIndex,
      observeInvalidation: (callback: () => void) => observePage(callback, true),
      restore: restoreAnchor,
    },
  };
}

export type ChatGptHost = ReturnType<typeof createChatGptHost>;

export const chatGptHost = createChatGptHost({
  document,
  logger: import.meta.env.DEV ? (message) => console.debug(message) : undefined,
  window,
});

function available<T>(value: T): ChatGptHostResult<T> {
  return { status: "available", value };
}

function unavailable(reason: ChatGptHostUnavailableReason): ChatGptHostResult<never> {
  return { reason, status: "unavailable" };
}

function rangeRect(range: Range) {
  const rect =
    typeof range.getBoundingClientRect === "function"
      ? range.getBoundingClientRect()
      : new DOMRect();
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}
