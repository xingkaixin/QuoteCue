import type {
  SelectionCapture,
  SelectionCaptureFailureReason,
  SelectionRect,
} from "@/features/host-port/host-port";
import { rangeEndpointRect } from "@/features/host-port/range-geometry";
import { parseTextAnchor } from "@/features/host-port/text-anchor";

import {
  available,
  unavailable,
  type HostContext,
  type HostResult,
  type SelectionCaptureIntent,
  type SelectionInvalidation,
} from "./host-context";
import { isQuoteCueEvent } from "./is-quotecue-event";

const CONTEXT_LENGTH = 48;

export function createSelectionAnchoring(context: HostContext) {
  const { adapter, document: hostDocument, logger, signals, window: hostWindow } = context;
  let messageById = new Map<string, HTMLElement>();

  function observeCaptureIntent(callback: (intent: SelectionCaptureIntent) => void) {
    let captureFrame: number | undefined;
    const scheduleCapture = (event: Event) => {
      if (isQuoteCueEvent(event) || (event instanceof KeyboardEvent && event.key === "Escape")) {
        return;
      }
      if (captureFrame !== undefined) {
        hostWindow.cancelAnimationFrame(captureFrame);
      }
      captureFrame = hostWindow.requestAnimationFrame(() => {
        captureFrame = undefined;
        callback("capture");
      });
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        callback("dismiss");
      }
    };
    const stopViewportObservation = signals.observeViewport(() => callback("dismiss"));

    hostDocument.addEventListener("mouseup", scheduleCapture, true);
    hostDocument.addEventListener("keyup", scheduleCapture, true);
    hostDocument.addEventListener("keydown", dismissOnEscape, true);

    return () => {
      if (captureFrame !== undefined) {
        hostWindow.cancelAnimationFrame(captureFrame);
      }
      hostDocument.removeEventListener("mouseup", scheduleCapture, true);
      hostDocument.removeEventListener("keyup", scheduleCapture, true);
      hostDocument.removeEventListener("keydown", dismissOnEscape, true);
      stopViewportObservation();
    };
  }

  function observeInvalidation(callback: (invalidation: SelectionInvalidation) => void) {
    const stopMutationObservation = signals.observeMutations(
      (records) => {
        const dirtyMessageIds = dirtyAssistantMessageIds(records);
        if (dirtyMessageIds === "all" || dirtyMessageIds.size > 0) {
          callback({ dirtyMessageIds, reason: "content" });
        }
      },
      {
        characterData: true,
        childList: true,
      },
    );
    const stopViewportObservation = signals.observeViewport(() => callback({ reason: "layout" }));

    return () => {
      stopMutationObservation();
      stopViewportObservation();
    };
  }

  function messageIndex(messageIds?: ReadonlySet<string>) {
    if (!messageIds || [...messageIds].some((messageId) => !isCachedMessageValid(messageId))) {
      rebuildMessageIndex();
    }
    if (!messageIds) {
      return new Map(messageById);
    }
    return new Map(
      [...messageIds].flatMap((messageId) => {
        const message = messageById.get(messageId);
        return message ? [[messageId, message] as const] : [];
      }),
    );
  }

  function rebuildMessageIndex() {
    const nextMessageById = new Map<string, HTMLElement>();
    for (const message of hostDocument.querySelectorAll<HTMLElement>(
      adapter.messages.assistantSelector,
    )) {
      if (!adapter.messages.isAssistant(message)) {
        continue;
      }
      const messageId = adapter.messages.id(message);
      if (messageId && !nextMessageById.has(messageId)) {
        nextMessageById.set(messageId, message);
      }
    }
    messageById = nextMessageById;
  }

  function isCachedMessageValid(messageId: string) {
    const message = messageById.get(messageId);
    return (
      message?.isConnected === true &&
      adapter.messages.isAssistant(message) &&
      adapter.messages.id(message) === messageId
    );
  }

  function dirtyAssistantMessageIds(records: readonly MutationRecord[]) {
    const dirtyMessageIds = new Set<string>();
    for (const record of records) {
      for (const message of assistantMessagesAffectedBy(record)) {
        if (!adapter.messages.isAssistant(message)) {
          continue;
        }
        const messageId = adapter.messages.id(message);
        if (!messageId) {
          return "all" as const;
        }
        dirtyMessageIds.add(messageId);
      }
    }
    return dirtyMessageIds;
  }

  function assistantMessagesAffectedBy(record: MutationRecord) {
    const messages = new Set<HTMLElement>();
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    const targetMessage = target?.closest<HTMLElement>(adapter.messages.assistantSelector);
    if (targetMessage) {
      messages.add(targetMessage);
    }
    if (record.type !== "childList") {
      return messages;
    }
    for (const node of [...record.addedNodes, ...record.removedNodes]) {
      if (!(node instanceof Element)) {
        continue;
      }
      if (node.matches(adapter.messages.assistantSelector)) {
        messages.add(node as HTMLElement);
      }
      for (const message of node.querySelectorAll<HTMLElement>(
        adapter.messages.assistantSelector,
      )) {
        messages.add(message);
      }
    }
    return messages;
  }

  function capture(
    selection = hostWindow.getSelection(),
  ): HostResult<SelectionCapture, SelectionCaptureFailureReason> {
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
    const anchor = parseTextAnchor({
      end,
      format: "exact",
      messageId: adapter.messages.id(message),
      prefix: messageText.slice(Math.max(0, start - CONTEXT_LENGTH), start),
      quote,
      ...(displayQuote === quote ? {} : { displayQuote }),
      start,
      suffix: messageText.slice(end, end + CONTEXT_LENGTH),
    });
    if (!anchor) {
      return unavailable("anchor-unavailable");
    }
    messageById.set(anchor.messageId, message);

    return available({
      actionRect,
      anchor,
      rect: rectangleSnapshot(rangeEndpointRect(range)),
    });
  }

  function clear() {
    hostWindow.getSelection()?.removeAllRanges();
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
    const message = element?.closest<HTMLElement>(adapter.messages.assistantSelector) ?? null;
    return message && adapter.messages.isAssistant(message) ? message : null;
  }

  return {
    capture,
    clear,
    messageIndex,
    observeCaptureIntent,
    observeInvalidation,
  };
}

function rangeRect(range: Range) {
  const rect =
    typeof range.getBoundingClientRect === "function"
      ? range.getBoundingClientRect()
      : new DOMRect();
  return rectangleSnapshot(rect);
}

function rectangleSnapshot(rect: SelectionRect): SelectionRect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}
