import { createHostEngine } from "@/features/host/dom-host";
import type { HostEnvironment } from "@/features/host/host-environment";
import { pasteFirstDomFallbackComposer } from "@/features/host/rich-text-composer";
import {
  composerLayout,
  messageAccess,
  sendControlAccess,
  type SiteAdapter,
} from "@/features/host/site-adapter";

const CHATGPT_ADAPTER: SiteAdapter = {
  composer: pasteFirstDomFallbackComposer("#prompt-textarea[contenteditable='true']"),
  conversationId: (pathname) => pathname.match(/^\/(?:c|g\/[^/?#]+\/c)\/([^/?#]+)/)?.[1] ?? null,
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
  return createHostEngine(environment, CHATGPT_ADAPTER, "chatgpt");
}
