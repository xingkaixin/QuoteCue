import { createDomHost, type HostEnvironment, type SiteAdapter } from "@/features/host/dom-host";

const CHATGPT_ADAPTER: SiteAdapter = {
  assistantMessageSelector: '[data-message-author-role="assistant"][data-message-id]',
  composerKind: "contenteditable",
  composerSelector: "#prompt-textarea[contenteditable='true']",
  conversationPathPattern: /^\/c\/([^/?#]+)/,
  sendButtonSelector: "button[data-testid='send-button']",
  userMessageSelector: '[data-message-author-role="user"][data-message-id]',
  messageId: (message) => message.dataset.messageId,
};

export function createChatGptHost(environment: HostEnvironment) {
  return createDomHost(environment, CHATGPT_ADAPTER);
}

export const chatGptHost = createChatGptHost({
  document,
  logger: import.meta.env.DEV ? (message) => console.debug(message) : undefined,
  window,
});
