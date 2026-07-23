import { createDomHost, type HostEnvironment, type SiteAdapter } from "@/features/host/dom-host";

const MESSAGE_ITEM_SELECTOR = ".chat-content-item";

const KIMI_ADAPTER: SiteAdapter = {
  assistantMessageSelector: ".chat-content-item-assistant",
  composerButtonSelector: ".send-button-container",
  composerKind: "contenteditable",
  composerSelector: '[data-lexical-editor="true"][contenteditable="true"]',
  conversationPathPattern: /^\/chat\/([^/?#]+)/,
  selectionActionMode: "overlay",
  sendButtonSelector: ".send-button-container",
  userMessageSelector: ".chat-content-item-user .user-content",
  isSendButtonDisabled: (button) => button.classList.contains("disabled"),
  messageId: (message) => message.closest<HTMLElement>(MESSAGE_ITEM_SELECTOR)?.dataset.archerId,
  normalizeSubmittedText: (text) => text.replace(/\s/g, ""),
};

export function createKimiHost(environment: HostEnvironment) {
  return createDomHost(environment, KIMI_ADAPTER);
}

export const kimiHost = createKimiHost({
  document,
  logger: import.meta.env.DEV ? (message) => console.debug(message) : undefined,
  window,
});
