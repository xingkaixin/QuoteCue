import { createDomHost, type HostEnvironment } from "@/features/host/dom-host";
import {
  composerLayout,
  messageAccess,
  richTextComposer,
  sendControlAccess,
  type SiteAdapter,
} from "@/features/host/site-adapter";

const CHATGPT_ADAPTER: SiteAdapter = {
  composer: richTextComposer("#prompt-textarea[contenteditable='true']"),
  conversationPathPattern: /^\/(?:c|g\/[^/?#]+\/c)\/([^/?#]+)/,
  layout: composerLayout("button", { boundarySelector: "form" }),
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
