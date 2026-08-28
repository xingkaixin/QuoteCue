import { requiredElement, setElementRect } from "./fixture-utils";

export type KimiHostFixture = {
  assistantMessage: HTMLElement;
  composer: HTMLElement;
  sendControl: HTMLElement;
  surface: HTMLElement;
  userMessage: HTMLElement;
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
  const userMessage = requiredElement<HTMLElement>(".chat-content-item-user .user-content");

  Object.defineProperty(composer, "innerText", {
    configurable: true,
    get: () => composer.textContent ?? "",
  });
  setElementRect(surface, new DOMRect(100, 662, 768, 130));
  setElementRect(sendControl, new DOMRect(822, 744, 36, 36));

  return { assistantMessage, composer, sendControl, surface, userMessage };
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

export function appendKimiAssistantMessage(messageId: string, text: string) {
  const message = document.createElement("div");
  message.className = "chat-content-item chat-content-item-assistant";
  message.dataset.archerId = messageId;
  const content = document.createElement("div");
  content.className = "markdown-container";
  content.textContent = text;
  message.append(content);
  (document.querySelector("main") ?? document.body).append(message);
  return message;
}

export function setKimiStreaming(control: HTMLElement, isStreaming: boolean) {
  control.classList.toggle("send-button-container", !isStreaming);
  control.classList.toggle("stop-button-container", isStreaming);
}
