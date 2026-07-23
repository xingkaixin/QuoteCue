import { createDomHost, type HostEnvironment, type SiteAdapter } from "@/features/host/dom-host";

const MESSAGE_SELECTOR = "[role='article']";
const USER_MESSAGE_MARKER = "[data-testid='user-message']";
const MESSAGE_INDEX_SELECTOR = "[data-rs-index]";

const CLAUDE_ADAPTER: SiteAdapter = {
  assistantMessageSelector: MESSAGE_SELECTOR,
  composerButtonSelector: "button",
  composerKind: "contenteditable",
  composerSelector: "[data-testid='chat-input'][contenteditable='true']",
  conversationPathPattern: /^\/chat\/([^/?#]+)/,
  selectionActionMode: "native-toolbar",
  sendButtonSelector: "button[aria-label='Send message']",
  userMessageSelector: USER_MESSAGE_MARKER,
  isAssistantMessage: (message) => message.querySelector(USER_MESSAGE_MARKER) === null,
  messageId: (message) => message.closest<HTMLElement>(MESSAGE_INDEX_SELECTOR)?.dataset.rsIndex,
};

export function createClaudeHost(environment: HostEnvironment) {
  return createDomHost(environment, CLAUDE_ADAPTER);
}

export const claudeHost = createClaudeHost({
  document,
  logger: import.meta.env.DEV ? (message) => console.debug(message) : undefined,
  window,
});
