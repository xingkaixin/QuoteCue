export type KimiHostFixture = {
  assistantMessage: HTMLElement;
  composer: HTMLElement;
  sendControl: HTMLElement;
  surface: HTMLElement;
};

export function installKimiHostFixture(composerText = "Original question"): KimiHostFixture {
  document.body.innerHTML = `
    <main>
      <div class="chat-content-item chat-content-item-user" data-archer-id="user-one">
        <div class="segment segment-user">
          <div class="user-content">Original question</div>
        </div>
        <div class="message-actions">Edit Copy Share</div>
      </div>
      <div class="chat-content-item chat-content-item-assistant" data-archer-id="assistant-one">
        <div class="segment segment-assistant">
          <div class="markdown-container">
            <p>A <strong>focused answer</strong> for the contract fixture.</p>
          </div>
        </div>
      </div>
      <div class="chat-editor-content" style="background-color: white; border-radius: 24px; border-top-left-radius: 24px; padding-top: 6px">
        <div data-lexical-editor="true" contenteditable="true" role="textbox">${composerText}</div>
        <div class="send-button-container disabled"><svg aria-hidden="true"></svg></div>
      </div>
    </main>
  `;

  const assistantMessage = requiredElement<HTMLElement>(".chat-content-item-assistant");
  const composer = requiredElement<HTMLElement>('[data-lexical-editor="true"]');
  const sendControl = requiredElement<HTMLElement>(".send-button-container");
  const surface = requiredElement<HTMLElement>(".chat-editor-content");

  Object.defineProperty(composer, "innerText", {
    configurable: true,
    get: () => composer.textContent ?? "",
  });
  Object.defineProperty(surface, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 792, height: 130, left: 100, right: 868, top: 662, width: 768 }),
  });
  Object.defineProperty(sendControl, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 780, height: 36, left: 822, right: 858, top: 744, width: 36 }),
  });

  return { assistantMessage, composer, sendControl, surface };
}

export function appendKimiUserMessage(messageId: string | undefined, text: string) {
  const message = document.createElement("div");
  message.className = "chat-content-item chat-content-item-user";
  if (messageId) {
    message.dataset.archerId = messageId;
  }
  const content = document.createElement("div");
  content.className = "user-content";
  content.textContent = text;
  const actions = document.createElement("div");
  actions.className = "message-actions";
  actions.textContent = "Edit Copy Share";
  message.append(content, actions);
  (document.querySelector("main") ?? document.body).append(message);
  return message;
}

function requiredElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Fixture is missing ${selector}`);
  }
  return element;
}
