import { createDomHost, type HostEnvironment, type SiteAdapter } from "@/features/host/dom-host";
import { richTextComposer } from "@/features/host/composer-access";
import { composerLayout } from "@/features/host/composer-layout";
import { messageAccess, sendControlAccess } from "@/features/host/site-capabilities";

const CHATGPT_ADAPTER: SiteAdapter = {
  composer: richTextComposer("#prompt-textarea[contenteditable='true']"),
  conversationPathPattern: /^\/c\/([^/?#]+)/,
  layout: composerLayout("button"),
  messages: messageAccess({
    assistantSelector: '[data-message-author-role="assistant"][data-message-id]',
    id: (message) => message.dataset.messageId,
    userSelector: '[data-message-author-role="user"][data-message-id]',
  }),
  selectionPresentation: { mode: "native-toolbar" },
  sendControl: sendControlAccess("button[data-testid='send-button']"),
};

export function createChatGptHost(environment: HostEnvironment) {
  return createDomHost(environment, CHATGPT_ADAPTER);
}

export const chatGptHost = createChatGptHost({
  document,
  logger: import.meta.env.DEV ? (message) => console.debug(message) : undefined,
  window,
});
