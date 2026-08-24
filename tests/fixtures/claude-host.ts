import { requiredElement, setElementRect } from "./fixture-utils";

export type ClaudeHostFixture = {
  assistantMessage: HTMLElement;
  composer: HTMLElement;
  sendButton: HTMLButtonElement;
  surface: HTMLElement;
  userMessage: HTMLElement;
  voiceButton: HTMLButtonElement;
};

export function installClaudeHostFixture(composerText = "Original question"): ClaudeHostFixture {
  document.body.innerHTML = `
    <main>
      <div data-rs-index="0">
        <article role="article" aria-label="Message 1 of 2">
          <div data-testid="user-message">Original question</div>
        </article>
      </div>
      <div data-rs-index="1">
        <article role="article" aria-label="Message 2 of 2">
          <p>A <strong>focused answer</strong> for the contract fixture.</p>
        </article>
      </div>
      <style>.claude-fixture-hidden { visibility: hidden; }</style>
      <fieldset data-fixture="composer-surface" style="background-color: white; border-radius: 20px; border-top-left-radius: 20px; padding-top: 6px">
        <div><div data-testid="chat-input" contenteditable="true" role="textbox">${composerText}</div></div>
        <button type="button" aria-label="按住以录音"></button>
        <button type="button" aria-label="使用语音模式" class="${composerText ? "claude-fixture-hidden" : ""}"></button>
        <button type="button" aria-label="停止回复"></button>
        <button type="button" data-testid="chat-input-send" aria-label="发送消息" class="${composerText ? "" : "claude-fixture-hidden"}" disabled></button>
      </fieldset>
    </main>
  `;

  const assistantMessage = requiredElement<HTMLElement>('[data-rs-index="1"] [role="article"]');
  const composer = requiredElement<HTMLElement>('[data-testid="chat-input"]');
  const surface = requiredElement<HTMLElement>('[data-fixture="composer-surface"]');
  const userMessage = requiredElement<HTMLElement>('[data-testid="user-message"]');
  const voiceButton = requiredElement<HTMLButtonElement>('button[aria-label="使用语音模式"]');
  const sendButton = requiredElement<HTMLButtonElement>('[data-testid="chat-input-send"]');

  Object.defineProperty(composer, "innerText", {
    configurable: true,
    get: () => composer.textContent ?? "",
  });
  setElementRect(surface, new DOMRect(100, 690, 768, 102));
  setButtonRect(voiceButton, 828);
  setButtonRect(requiredElement('button[aria-label="按住以录音"]'), 748);
  setButtonRect(requiredElement('button[aria-label="停止回复"]'), 708);
  setButtonRect(sendButton, 828);

  return { assistantMessage, composer, sendButton, surface, userMessage, voiceButton };
}

export function enableClaudeSend(onSend: (text: string) => void) {
  const sendButton = requiredElement<HTMLButtonElement>('[data-testid="chat-input-send"]');
  sendButton.disabled = false;
  sendButton.addEventListener("click", () => {
    const composer = requiredElement<HTMLElement>('[data-testid="chat-input"]');
    onSend(composer.innerText);
  });
  return sendButton;
}

export function setClaudeComposerText(text: string) {
  const composer = requiredElement<HTMLElement>('[data-testid="chat-input"]');
  const voiceButton = requiredElement<HTMLButtonElement>('button[aria-label="使用语音模式"]');
  const sendButton = requiredElement<HTMLButtonElement>('[data-testid="chat-input-send"]');
  composer.textContent = text;
  voiceButton.classList.toggle("claude-fixture-hidden", Boolean(text));
  sendButton.classList.toggle("claude-fixture-hidden", !text);
  composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
}

export function appendClaudeUserMessage(index: number, text: string) {
  const wrapper = document.createElement("div");
  wrapper.dataset.rsIndex = String(index);
  const message = document.createElement("article");
  message.setAttribute("role", "article");
  const content = document.createElement("div");
  content.dataset.testid = "user-message";
  content.textContent = text;
  message.append(content);
  wrapper.append(message);
  (document.querySelector("main") ?? document.body).append(wrapper);
  return message;
}

export function appendClaudeAssistantMessage(index: number, text: string) {
  const wrapper = document.createElement("div");
  wrapper.dataset.rsIndex = String(index);
  const message = document.createElement("article");
  message.setAttribute("role", "article");
  message.textContent = text;
  wrapper.append(message);
  (document.querySelector("main") ?? document.body).append(wrapper);
  return message;
}

export function appendClaudeSelectionToolbar(rect = new DOMRect(100, 150, 72, 34)) {
  const toolbar = document.createElement("div");
  toolbar.style.position = "fixed";
  const actionRow = document.createElement("div");
  const replyButton = document.createElement("button");
  replyButton.className = "claude-reply-action";
  replyButton.textContent = "返信";
  actionRow.append(replyButton);
  toolbar.append(actionRow);
  setElementRect(toolbar, rect);
  document.body.append(toolbar);
  return { actionRow, replyButton };
}

function setButtonRect(button: HTMLButtonElement, left: number) {
  setElementRect(button, new DOMRect(left, 748, 32, 32));
}
