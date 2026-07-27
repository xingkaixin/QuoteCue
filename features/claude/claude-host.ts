import { createDomHost, type HostEnvironment } from "@/features/host/dom-host";
import {
  composerLayout,
  messageAccess,
  richTextComposer,
  sendControlAccess,
  type SiteAdapter,
} from "@/features/host/site-adapter";

const MESSAGE_SELECTOR = "[role='article']";
const USER_MESSAGE_MARKER = "[data-testid='user-message']";
const MESSAGE_INDEX_SELECTOR = "[data-rs-index]";

const CLAUDE_ADAPTER: SiteAdapter = {
  composer: richTextComposer("[data-testid='chat-input'][contenteditable='true']"),
  conversationPathPattern: /^\/chat\/([^/?#]+)/,
  layout: composerLayout("button"),
  messages: messageAccess({
    assistantSelector: MESSAGE_SELECTOR,
    id: (message) => message.closest<HTMLElement>(MESSAGE_INDEX_SELECTOR)?.dataset.rsIndex,
    isAssistant: (message) => message.querySelector(USER_MESSAGE_MARKER) === null,
    userSelector: USER_MESSAGE_MARKER,
  }),
  selectionPresentation: { mode: "native-toolbar" },
  sendControl: sendControlAccess("button[aria-label='Send message']"),
};

export function createClaudeHost(environment: HostEnvironment) {
  return createDomHost(environment, CLAUDE_ADAPTER);
}
