import { createDomHost, type HostEnvironment, type SiteAdapter } from "@/features/host/dom-host";
import { textareaComposer } from "@/features/host/composer-access";
import { composerLayout } from "@/features/host/composer-layout";
import { messageAccess, sendControlAccess } from "@/features/host/site-capabilities";

const MESSAGE_ITEM_SELECTOR = "[data-virtual-list-item-key]";
const USER_MESSAGE_SELECTOR = `${MESSAGE_ITEM_SELECTOR}:has(> .ds-message.d29f3d7d)`;
// 发送/停止共用同一个圆形按钮，仅图标不同；用发送箭头的 path 前缀区分，避免拦截停止操作
const SEND_ICON_PATH_PREFIX = "M8.3125 0.981587";

const DEEPSEEK_ADAPTER: SiteAdapter = {
  composer: textareaComposer('textarea[name="search"]'),
  conversationPathPattern: /^\/a\/chat\/s\/([^/?#]+)/,
  layout: composerLayout(".ds-button--circle"),
  messages: messageAccess({
    assistantSelector: ".ds-assistant-message-main-content",
    id: (message) =>
      message.closest<HTMLElement>(MESSAGE_ITEM_SELECTOR)?.dataset.virtualListItemKey,
    userSelector: USER_MESSAGE_SELECTOR,
  }),
  selectionPresentation: { mode: "overlay" },
  sendControl: sendControlAccess(
    `.ds-button--circle:has(path[d^="${SEND_ICON_PATH_PREFIX}"])`,
    (button) => button.classList.contains("ds-button--disabled"),
  ),
};

export function createDeepSeekHost(environment: HostEnvironment) {
  return createDomHost(environment, DEEPSEEK_ADAPTER);
}

export const deepSeekHost = createDeepSeekHost({
  document,
  logger: import.meta.env.DEV ? (message) => console.debug(message) : undefined,
  window,
});
