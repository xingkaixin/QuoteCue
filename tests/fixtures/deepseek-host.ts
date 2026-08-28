import { requiredElement, setElementRect } from "./fixture-utils";

const DEEPSEEK_SEND_ICON_PATH = "M8.3125 0.981587C8.66767 1.0545";
const DEEPSEEK_STOP_ICON_PATH = "M3 3H13V13H3Z";

export type DeepSeekHostFixture = {
  assistantContent: HTMLElement;
  composer: HTMLTextAreaElement;
  sendButton: HTMLElement;
  stopButton: HTMLElement;
  surface: HTMLElement;
  thinkContent: HTMLElement;
  userMessage: HTMLElement;
};

export function installDeepSeekHostFixture(): DeepSeekHostFixture {
  document.body.innerHTML = `
    <main>
      <div data-virtual-list-item-key="user-one">
        <div class="d29f3d7d ds-message">
          <div>Original question</div>
        </div>
      </div>
      <div data-virtual-list-item-key="assistant-one">
        <div class="ds-message">
          <div class="ds-think-content">Chain of thought text.</div>
          <div class="ds-assistant-message-main-content">
            <p>A <strong>focused answer</strong> for the contract fixture.</p>
          </div>
        </div>
      </div>
      <div data-fixture="composer-surface" style="background-color: white; border-radius: 22px; border-top-left-radius: 22px; padding-top: 5px">
        <textarea name="search">Original question</textarea>
        <div class="ds-button ds-button--circle" data-fixture="stop-control" role="button">
          <svg viewBox="0 0 16 16"><path d="${DEEPSEEK_STOP_ICON_PATH}"></path></svg>
        </div>
        <div class="ds-button ds-button--circle" role="button">
          <svg viewBox="0 0 16 16"><path d="${DEEPSEEK_SEND_ICON_PATH}"></path></svg>
        </div>
      </div>
    </main>
  `;

  const assistantContent = requiredElement<HTMLElement>(".ds-assistant-message-main-content");
  const composer = requiredElement<HTMLTextAreaElement>('textarea[name="search"]');
  const sendButton = requiredElement<HTMLElement>(
    `.ds-button--circle:has(path[d="${DEEPSEEK_SEND_ICON_PATH}"])`,
  );
  const stopButton = requiredElement<HTMLElement>('[data-fixture="stop-control"]');
  const surface = requiredElement<HTMLElement>('[data-fixture="composer-surface"]');
  const thinkContent = requiredElement<HTMLElement>(".ds-think-content");
  const userMessage = requiredElement<HTMLElement>('[data-virtual-list-item-key="user-one"]');

  setElementRect(surface, new DOMRect(100, 700, 400, 92));
  setElementRect(sendButton, new DOMRect(458, 750, 34, 34));

  return { assistantContent, composer, sendButton, stopButton, surface, thinkContent, userMessage };
}

export function appendUserMessageItem(itemKey: string, text: string) {
  const item = document.createElement("div");
  item.dataset.virtualListItemKey = itemKey;
  const message = document.createElement("div");
  message.className = "d29f3d7d ds-message";
  message.textContent = text;
  item.append(message);
  (document.querySelector("main") ?? document.body).append(item);
  return item;
}

export function appendAssistantMessageItem(itemKey: string, text: string) {
  const item = document.createElement("div");
  item.dataset.virtualListItemKey = itemKey;
  const message = document.createElement("div");
  message.className = "ds-message";
  const content = document.createElement("div");
  content.className = "ds-assistant-message-main-content";
  content.textContent = text;
  message.append(content);
  item.append(message);
  (document.querySelector("main") ?? document.body).append(item);
  return item;
}

export function setDeepSeekStreaming(control: HTMLElement, isStreaming: boolean) {
  control
    .querySelector("path")!
    .setAttribute("d", isStreaming ? DEEPSEEK_STOP_ICON_PATH : DEEPSEEK_SEND_ICON_PATH);
}
