export const DEEPSEEK_SEND_ICON_PATH = "M8.3125 0.981587C8.66767 1.0545";

export type DeepSeekHostFixture = {
  assistantContent: HTMLElement;
  composer: HTMLTextAreaElement;
  sendButton: HTMLElement;
  surface: HTMLElement;
  thinkContent: HTMLElement;
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
        <div class="ds-button ds-button--circle" role="button">
          <svg viewBox="0 0 16 16"><path d="${DEEPSEEK_SEND_ICON_PATH}"></path></svg>
        </div>
      </div>
    </main>
  `;

  const assistantContent = requiredElement<HTMLElement>(".ds-assistant-message-main-content");
  const composer = requiredElement<HTMLTextAreaElement>('textarea[name="search"]');
  const sendButton = requiredElement<HTMLElement>(".ds-button--circle");
  const surface = requiredElement<HTMLElement>('[data-fixture="composer-surface"]');
  const thinkContent = requiredElement<HTMLElement>(".ds-think-content");

  Object.defineProperty(surface, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 792, height: 92, left: 100, right: 500, top: 700, width: 400 }),
  });
  Object.defineProperty(sendButton, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 784, height: 34, left: 458, right: 492, top: 750, width: 34 }),
  });

  return { assistantContent, composer, sendButton, surface, thinkContent };
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

function requiredElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Fixture is missing ${selector}`);
  }
  return element;
}
