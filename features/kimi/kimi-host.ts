import { createDomHost, type HostEnvironment, type SiteAdapter } from "@/features/host/dom-host";
import { richTextComposer } from "@/features/host/composer-access";
import { composerLayout } from "@/features/host/composer-layout";
import { messageAccess, sendControlAccess } from "@/features/host/site-capabilities";

const MESSAGE_ITEM_SELECTOR = ".chat-content-item";

const KIMI_ADAPTER: SiteAdapter = {
  composer: richTextComposer('[data-lexical-editor="true"][contenteditable="true"]', (text) =>
    text.replace(/\s/g, ""),
  ),
  conversationPathPattern: /^\/chat\/([^/?#]+)/,
  layout: composerLayout(".send-button-container"),
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
  return createDomHost(environment, KIMI_ADAPTER);
}

export const kimiHost = createKimiHost({
  document,
  logger: import.meta.env.DEV ? (message) => console.debug(message) : undefined,
  window,
});
