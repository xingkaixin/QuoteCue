import { createHostEngine } from "@/features/host/dom-host";
import type { HostEnvironment } from "@/features/host/host-environment";
import { pasteFirstDomFallbackComposer } from "@/features/host/rich-text-composer";
import { messageAccess, sendControlAccess, type SiteAdapter } from "@/features/host/site-adapter";

const MESSAGE_SELECTOR = "[role='article']";
const USER_MESSAGE_MARKER = "[data-testid='user-message']";
const MESSAGE_INDEX_SELECTOR = "[data-rs-index]";

const CLAUDE_ADAPTER: SiteAdapter = {
  composer: pasteFirstDomFallbackComposer("[data-testid='chat-input'][contenteditable='true']"),
  conversationId: (pathname) => pathname.match(/^\/chat\/([^/?#]+)/)?.[1] ?? null,
  layout: {
    actionSelector: "button",
    surfaceSelector: "fieldset:has([data-testid=chat-input])",
    visibleActionsOnly: true,
  },
  messages: messageAccess({
    assistantSelector: MESSAGE_SELECTOR,
    id: (message) => message.closest<HTMLElement>(MESSAGE_INDEX_SELECTOR)?.dataset.rsIndex,
    isAssistant: (message) => message.querySelector(USER_MESSAGE_MARKER) === null,
    userSelector: USER_MESSAGE_MARKER,
  }),
  selectionPresentation: { mode: "native-toolbar" },
  sendControl: sendControlAccess("button[data-testid='chat-input-send']"),
};

export function createClaudeHost(environment: HostEnvironment) {
  return createHostEngine(environment, CLAUDE_ADAPTER, "claude");
}
