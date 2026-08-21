import { createHostEngine, type HostEnvironment } from "@/features/host/dom-host";
import { richTextComposer } from "@/features/host/composer-access";
import {
  composerLayout,
  messageAccess,
  sendControlAccess,
  type SiteAdapter,
} from "@/features/host/site-adapter";

const MESSAGE_ITEM_SELECTOR = ".chat-content-item";

const KIMI_ADAPTER: SiteAdapter = {
  composer: richTextComposer('[data-lexical-editor="true"][contenteditable="true"]', (text) =>
    text.replace(/\s/g, ""),
  ),
  conversationPathPattern: /^\/chat\/([^/?#]+)/,
  layout: composerLayout(".send-button-container", ".chat-editor-content"),
  messages: messageAccess({
    assistantSelector: ".chat-content-item-assistant",
    id: (message) => message.closest<HTMLElement>(MESSAGE_ITEM_SELECTOR)?.dataset.archerId,
    userSelector: ".chat-content-item-user .user-content",
  }),
  selectionPresentation: { mode: "overlay" },
  sendControl: sendControlAccess(".send-button-container", (button) =>
    button.classList.contains("disabled"),
  ),
};

export function createKimiHost(environment: HostEnvironment) {
  return createHostEngine(environment, KIMI_ADAPTER);
}
