import type {
  DraftAnnotation,
  SelectionCapture,
  SelectionDraft,
  TextAnchor,
} from "@/features/annotations/annotation";
import {
  rangeEndpointRect,
  restoreTextAnchorFromIndex,
} from "@/features/annotations/selection-anchor";

const CONTEXT_LENGTH = 48;
const NATIVE_SELECTION_ACTION_ATTRIBUTE = "data-quotecue-native-action";
const SCROLLABLE_OVERFLOW_PATTERN = /auto|overlay|scroll/;
const SEND_ACCEPT_TIMEOUT_MS = 15_000;
const SEND_BUTTON_APPEAR_TIMEOUT_MS = 2_000;

export type HostUnavailableReason =
  | "assistant-message-unavailable"
  | "composer-surface-unavailable"
  | "composer-unavailable"
  | "selection-unavailable"
  | "send-control-unavailable";

export type HostResult<T> =
  | { status: "available"; value: T }
  | { status: "unavailable"; reason: HostUnavailableReason };

export type ComposerSnapshot = {
  element: HTMLElement;
  text: string;
};

export type HostComposerLayout = {
  action: HTMLElement | null;
  send: { height: number; left: number; top: number; width: number };
  summary: { left: number; top: number };
  surface: HTMLElement;
};

export type ComposerKind = "contenteditable" | "textarea";

export type SelectionActionMode = "native-toolbar" | "overlay";

export type SiteAdapter = {
  assistantMessageSelector: string;
  composerButtonSelector: string;
  composerKind: ComposerKind;
  composerSelector: string;
  conversationPathPattern: RegExp;
  selectionActionMode: SelectionActionMode;
  sendButtonSelector: string;
  userMessageSelector: string;
  isAssistantMessage?(message: HTMLElement): boolean;
  isSendButtonDisabled?(button: HTMLElement): boolean;
  messageId(message: HTMLElement): string | undefined;
  normalizeSubmittedText?(text: string): string;
};

type AcceptedSendWatcherOptions = {
  expectedText: string;
  onAccepted: () => void;
  onTimeout: () => void;
  signal: AbortSignal;
};

type SelectionRevealStatus = "scrolled" | "visible";

export type HostEnvironment = {
  document: Document;
  logger?: (message: string) => void;
  window: Window;
};

export function createDomHost(environment: HostEnvironment, adapter: SiteAdapter) {
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
    for (const message of root.querySelectorAll<HTMLElement>(adapter.assistantMessageSelector)) {
      if (adapter.isAssistantMessage && !adapter.isAssistantMessage(message)) {
        continue;
      }
      const messageId = adapter.messageId(message);
      if (messageId && !index.has(messageId)) {
        index.set(messageId, message);
      }
    }
    return index;
  }

  function restoreAnchor(anchor: TextAnchor): HostResult<Range> {
    const range = restoreTextAnchorFromIndex(anchor, messageIndex());
    return range ? available(range) : unavailable("assistant-message-unavailable");
  }

  function captureSelection(selection = hostWindow.getSelection()): HostResult<SelectionCapture> {
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return unavailable("selection-unavailable");
    }

    const range = selection.getRangeAt(0);
    const message = assistantMessageForRange(range);
    const displayQuote = selection.toString().trim();
    const quote = range.toString();
    if (!message || displayQuote.length === 0 || quote.length === 0) {
      return unavailable("assistant-message-unavailable");
    }
    if (displayQuote !== quote) {
      logger?.(
        `[QuoteCue host] selection text mismatch: rendered=${displayQuote.length}, dom=${quote.length}`,
      );
    }

    const start = textOffset(message, range.startContainer, range.startOffset);
    const end = textOffset(message, range.endContainer, range.endOffset);
    const messageText = message.textContent ?? "";
    const actionRect = rangeRect(range);
    return available({
      actionRect,
      anchor: {
        end,
        messageId: adapter.messageId(message) ?? "",
        prefix: messageText.slice(Math.max(0, start - CONTEXT_LENGTH), start),
        quote,
        ...(displayQuote === quote ? {} : { displayQuote }),
        start,
        suffix: messageText.slice(end, end + CONTEXT_LENGTH),
      },
      rect: rectangleSnapshot(rangeEndpointRect(range)),
    });
  }

  function selectionToolbar(selectionRect: SelectionDraft["rect"]) {
    let closest: SelectionToolbarCandidate | null = null;
    for (const element of hostDocument.body.children) {
      const candidate = selectionToolbarCandidate(element, selectionRect);
      if (candidate && (!closest || candidate.distance < closest.distance)) {
        closest = candidate;
      }
    }

    return closest?.actionRow ?? null;
  }

  function selectionToolbarCandidate(
    candidate: Element,
    selectionRect: SelectionDraft["rect"],
  ): SelectionToolbarCandidate | null {
    const rect = candidate.getBoundingClientRect();
    const horizontalOverlap =
      Math.min(selectionRect.right, rect.right) - Math.max(selectionRect.left, rect.left);
    const verticalDistance = Math.max(
      selectionRect.top - rect.bottom,
      rect.top - selectionRect.bottom,
      0,
    );
    const isNearbyFixedToolbar =
      !candidate.matches("[data-quotecue-host]") &&
      hostWindow.getComputedStyle(candidate).position === "fixed" &&
      rect.width >= 80 &&
      rect.width <= 480 &&
      rect.height >= 28 &&
      rect.height <= 80 &&
      horizontalOverlap > 0 &&
      verticalDistance <= 24;
    if (!isNearbyFixedToolbar) {
      return null;
    }

    const actionRow = Array.from(candidate.querySelectorAll("button"))
      .map((button) => button.parentElement)
      .find(
        (parent): parent is HTMLElement =>
          parent !== null &&
          parent.children.length > 0 &&
          Array.from(parent.children).every((child) => child.tagName === "BUTTON"),
      );
    return actionRow ? { actionRow, distance: verticalDistance } : null;
  }

  function mountSelectionAction(options: {
    label: string;
    onActivate: () => void;
    rect: SelectionDraft["rect"];
  }) {
    let action: HTMLButtonElement | null = null;

    const preserveSelection = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const removeAction = () => {
      action?.remove();
      action = null;
    };
    const insertAction = () => {
      if (action?.isConnected) {
        return;
      }

      const toolbar = selectionToolbar(options.rect);
      const sourceAction = toolbar?.querySelector<HTMLButtonElement>("button");
      if (!toolbar || !sourceAction) {
        return;
      }

      action = sourceAction.cloneNode(true) as HTMLButtonElement;
      action.setAttribute(NATIVE_SELECTION_ACTION_ATTRIBUTE, "");
      action.setAttribute("aria-label", options.label);
      action.removeAttribute("aria-describedby");
      action.removeAttribute("id");
      action.textContent = "QuoteCue";
      action.addEventListener("mousedown", preserveSelection, true);
      action.addEventListener("click", (event) => {
        preserveSelection(event);
        options.onActivate();
        removeAction();
      });
      toolbar.prepend(action);
    };
    const observer = new MutationObserver(insertAction);

    observer.observe(hostDocument.body, { childList: true, subtree: true });
    insertAction();

    return () => {
      observer.disconnect();
      removeAction();
    };
  }

  function selectionDraft(annotation: DraftAnnotation): HostResult<SelectionDraft> {
    const restored = restoreAnchor(annotation.anchor);
    return restored.status === "available"
      ? available({
          anchor: annotation.anchor,
          rect: rectangleSnapshot(rangeEndpointRect(restored.value)),
        })
      : restored;
  }

  function revealAnchor(anchor: TextAnchor): HostResult<SelectionRevealStatus> {
    const restored = restoreAnchor(anchor);
    if (restored.status === "unavailable") {
      return restored;
    }

    const range = restored.value;
    const endpointRect = rangeEndpointRect(range);
    const scrollContainer = nearestScrollContainer(range.endContainer);
    const viewportRect = scrollContainer
      ? scrollContainer.getBoundingClientRect()
      : visualViewportRect();

    if (endpointRect.bottom >= viewportRect.top && endpointRect.top <= viewportRect.bottom) {
      return available("visible");
    }

    const offset =
      endpointRect.top + endpointRect.height / 2 - (viewportRect.top + viewportRect.height / 2);
    if (scrollContainer) {
      scrollContainer.scrollTop += offset;
    } else {
      hostWindow.scrollBy({ behavior: "auto", top: offset });
    }
    return available("scrolled");
  }

  function nearestScrollContainer(node: Node) {
    let element = node instanceof HTMLElement ? node : node.parentElement;

    while (element) {
      const { overflowY } = hostWindow.getComputedStyle(element);
      if (
        SCROLLABLE_OVERFLOW_PATTERN.test(overflowY) &&
        element.scrollHeight > element.clientHeight
      ) {
        return element;
      }
      element = element.parentElement;
    }

    return null;
  }

  function visualViewportRect() {
    const viewport = hostWindow.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const height = viewport?.height ?? hostWindow.innerHeight;
    return { bottom: top + height, height, top };
  }

  function currentComposer() {
    return hostDocument.querySelector<HTMLElement>(adapter.composerSelector);
  }

  function composerText(composer: HTMLElement) {
    if (adapter.composerKind === "textarea" && composer instanceof HTMLTextAreaElement) {
      return composer.value;
    }
    return typeof composer.innerText === "string"
      ? composer.innerText
      : (composer.textContent ?? "");
  }

  function composerSnapshot(): HostResult<ComposerSnapshot> {
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
    if (adapter.composerKind === "textarea" && composer instanceof HTMLTextAreaElement) {
      setNativeTextareaValue(composer, text);
      composer.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }),
      );
      return composer.value === text;
    }

    selectComposerContents(composer);
    // 优先合成粘贴：富文本编辑器（Lexical/ProseMirror）对 paste 有完整处理，会接管事件
    // 并保留多行结构；execCommand("insertText") 在 Kimi 的 Lexical 上会触发原生与编辑器
    // 内部的双路插入（内容重复且丢失换行），只作为未接管粘贴时的降级
    if (dispatchSyntheticPaste(composer, text)) {
      logger?.("[QuoteCue host] composer paste replacement accepted");
      return true;
    }
    if (
      typeof hostDocument.execCommand === "function" &&
      hostDocument.execCommand("insertText", false, text)
    ) {
      // Lexical 类编辑器接受 beforeinput 后异步渲染 DOM，同步读回为空不代表插入失败；
      // 此处不因读回不匹配而中止（fallback 的 replaceChildren 反而会打乱编辑器内部状态），
      // 内容正确性由发送确认的全文强匹配兜底
      const isSynced = normalizedText(composer) === normalizedText(text);
      logger?.(`[QuoteCue host] composer command replacement: synced=${isSynced}`);
      if (!isSynced) {
        logComposerMismatch("command", composer, text);
      }
      return true;
    }

    const paragraph = hostDocument.createElement("p");
    paragraph.textContent = text;
    composer.replaceChildren(paragraph);
    composer.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }),
    );
    const isReplaced = normalizedText(composer) === normalizedText(text);
    logger?.(`[QuoteCue host] composer fallback replacement: matched=${isReplaced}`);
    if (!isReplaced) {
      logComposerMismatch("fallback", composer, text);
    }
    return isReplaced;
  }

  function logComposerMismatch(stage: string, composer: HTMLElement, expectedText: string) {
    if (!logger) {
      return;
    }
    const actual = normalizedText(composer);
    const expected = normalizedText(expectedText);
    const compact = (value: string) => value.replace(/\s/g, "");
    logger(
      `[QuoteCue host] composer ${stage} mismatch: actual=${actual.length}, expected=${expected.length}, compact=${compact(actual) === compact(expected)}, contains=${actual.includes(expected)}, contained=${expected.includes(actual)}, nfkc=${actual.normalize("NFKC") === expected.normalize("NFKC")}`,
    );
  }

  function restoreComposerText(snapshot: ComposerSnapshot, expectedText: string) {
    if (
      currentComposer() !== snapshot.element ||
      normalizedText(snapshot.element) !== normalizedText(expectedText)
    ) {
      return false;
    }
    return replaceComposerText(snapshot.element, snapshot.text);
  }

  function currentSendButton() {
    return hostDocument.querySelector<HTMLElement>(adapter.sendButtonSelector);
  }

  function isSendButtonAvailable(button: HTMLElement | null): button is HTMLElement {
    return (
      button !== null &&
      button.isConnected &&
      !button.matches(":disabled") &&
      button.getAttribute("aria-disabled") !== "true" &&
      !(adapter.isSendButtonDisabled?.(button) ?? false)
    );
  }

  function waitForSendButton(signal: AbortSignal) {
    const current = currentSendButton();
    if (isSendButtonAvailable(current)) {
      logger?.("[QuoteCue host] send control ready: immediate");
      return Promise.resolve(available(current));
    }
    if (signal.aborted) {
      return Promise.resolve(unavailable("send-control-unavailable"));
    }

    return new Promise<HostResult<HTMLElement>>((resolve) => {
      const finish = (result: HostResult<HTMLElement>) => {
        observer.disconnect();
        hostWindow.clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      };
      const findButton = () => {
        const button = currentSendButton();
        if (isSendButtonAvailable(button)) {
          logger?.("[QuoteCue host] send control ready: observed");
          finish(available(button));
        }
      };
      const onAbort = () => finish(unavailable("send-control-unavailable"));
      const observer = new MutationObserver(findButton);
      const timeout = hostWindow.setTimeout(() => {
        logger?.("[QuoteCue host] send control wait timed out");
        finish(unavailable("send-control-unavailable"));
      }, SEND_BUTTON_APPEAR_TIMEOUT_MS);

      signal.addEventListener("abort", onAbort, { once: true });
      observer.observe(hostDocument.body, {
        attributeFilter: ["aria-disabled", "class", "disabled"],
        attributes: true,
        childList: true,
        subtree: true,
      });
    });
  }

  function watchForAcceptedSend(options: AcceptedSendWatcherOptions) {
    const initialMessages = userMessages();
    const lastInitialMessage = initialMessages.at(-1);
    const existingMessageIds = new Set(
      initialMessages
        .map((message) => adapter.messageId(message))
        .filter((messageId): messageId is string => messageId !== undefined),
    );
    const isNewMessage = (message: HTMLElement) => {
      const messageId = adapter.messageId(message);
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
    const expectedText = normalizedText(options.expectedText);
    logger?.(`[QuoteCue host] send confirmation started: existing=${initialMessages.length}`);
    const observer = new MutationObserver(() => {
      const messages = userMessages();
      const acceptedMessage = messages.find((message) => {
        if (!isNewMessage(message)) {
          return false;
        }
        if ((message.textContent?.length ?? 0) < expectedText.length) {
          return false;
        }
        return normalizedText(message) === expectedText;
      });
      logger?.(
        `[QuoteCue host] send confirmation observed: total=${messages.length}, matched=${Boolean(acceptedMessage)}`,
      );
      if (acceptedMessage) {
        cleanup();
        options.onAccepted();
      }
    });
    const timeout = hostWindow.setTimeout(() => {
      logger?.("[QuoteCue host] send confirmation timed out");
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

  function currentLayout(): HostResult<HostComposerLayout> {
    const composer = currentComposer();
    if (!composer) {
      return unavailable("composer-unavailable");
    }

    const boundary = composer.closest<HTMLElement>("form");
    const surface = findComposerSurface(composer, boundary ?? hostDocument.body);
    if (!surface) {
      return unavailable("composer-surface-unavailable");
    }

    const rect = surface.getBoundingClientRect();
    const action = findComposerAction(boundary ?? surface, rect);
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
    const message = element?.closest<HTMLElement>(adapter.assistantMessageSelector) ?? null;
    return message && (!adapter.isAssistantMessage || adapter.isAssistantMessage(message))
      ? message
      : null;
  }

  function findComposerSurface(composer: HTMLElement, boundary: HTMLElement) {
    let candidate = composer.parentElement;
    while (candidate && candidate !== boundary) {
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

  function findComposerAction(root: HTMLElement, surfaceRect: DOMRect) {
    return Array.from(root.querySelectorAll<HTMLElement>(adapter.composerButtonSelector))
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
    return Array.from(hostDocument.querySelectorAll<HTMLElement>(adapter.userMessageSelector));
  }

  // 折叠空白后比较：宿主会把段落间换行重排（\n\n 与 \n、fallback 下甚至变空格），
  // 精确相等会漏认已发送的消息；折叠后仍是全文强匹配，不放松确认语义
  function normalizedText(value: HTMLElement | string) {
    const text = typeof value === "string" ? value : composerText(value);
    return adapter.normalizeSubmittedText?.(text) ?? text.replace(/\s+/g, " ").trim();
  }

  function selectComposerContents(composer: HTMLElement) {
    const selection = hostWindow.getSelection();
    const range = hostDocument.createRange();
    range.selectNodeContents(composer);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function subscribeToSubmit(callback: (event: Event, button: HTMLElement | null) => void) {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      const button =
        target instanceof Element ? target.closest<HTMLElement>(adapter.sendButtonSelector) : null;
      if (button) {
        callback(event, button);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isSubmitKey =
        target instanceof Element &&
        target.closest(adapter.composerSelector) !== null &&
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

  function setNativeTextareaValue(composer: HTMLTextAreaElement, text: string) {
    // React 受控 textarea 会忽略直接赋值，必须走原生 setter 再派发 input 事件
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) {
      setter.call(composer, text);
    } else {
      composer.value = text;
    }
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
          hostWindow.location.pathname.match(adapter.conversationPathPattern)?.[1] ??
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
    reportUnavailable(reason: HostUnavailableReason) {
      logger?.(`[QuoteCue host] unavailable: ${reason}`);
    },
    selection: {
      actionMode: adapter.selectionActionMode,
      capture: captureSelection,
      draft: selectionDraft,
      messageIndex,
      mountAction: mountSelectionAction,
      observeInvalidation: (callback: () => void) => observePage(callback, true),
      reveal: revealAnchor,
      restore: restoreAnchor,
    },
  };
}

export type Host = ReturnType<typeof createDomHost>;

// 编辑器 preventDefault 即表示接管了粘贴；返回 false 交由调用方降级
function dispatchSyntheticPaste(composer: HTMLElement, text: string) {
  if (typeof ClipboardEvent !== "function" || typeof DataTransfer !== "function") {
    return false;
  }
  const clipboardData = new DataTransfer();
  clipboardData.setData("text/plain", text);
  return !composer.dispatchEvent(
    new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
  );
}

function available<T>(value: T): HostResult<T> {
  return { status: "available", value };
}

function unavailable(reason: HostUnavailableReason): HostResult<never> {
  return { reason, status: "unavailable" };
}

type SelectionToolbarCandidate = {
  actionRow: HTMLElement;
  distance: number;
};

function rangeRect(range: Range) {
  const rect =
    typeof range.getBoundingClientRect === "function"
      ? range.getBoundingClientRect()
      : new DOMRect();
  return rectangleSnapshot(rect);
}

function rectangleSnapshot(rect: SelectionDraft["rect"]) {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}
