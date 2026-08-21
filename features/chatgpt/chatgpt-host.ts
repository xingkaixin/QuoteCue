import { createHostEngine, type HostEnvironment } from "@/features/host/dom-host";
import { richTextComposer } from "@/features/host/composer-access";
import {
  composerLayout,
  messageAccess,
  sendControlAccess,
  type SiteAdapter,
} from "@/features/host/site-adapter";

const CHATGPT_ADAPTER: SiteAdapter = {
  composer: richTextComposer("#prompt-textarea[contenteditable='true']"),
  conversationPathPattern: /^\/(?:c|g\/[^/?#]+\/c)\/([^/?#]+)/,
  layout: composerLayout("button", "form > div:has(#prompt-textarea)", {
    boundarySelector: "form",
  }),
  messages: messageAccess({
    assistantSelector: '[data-message-author-role="assistant"]',
    id: (message) => message.dataset.messageId,
    userSelector: '[data-message-author-role="user"][data-message-id]',
  }),
  selectionPresentation: { mode: "native-toolbar" },
  sendControl: sendControlAccess("button[data-testid='send-button']"),
};

export function createChatGptHost(environment: HostEnvironment) {
  return createHostEngine(environment, CHATGPT_ADAPTER);
}
