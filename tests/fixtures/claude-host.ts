import { requiredElement, setElementRect } from "./fixture-utils";

export type ClaudeHostFixture = {
  assistantMessage: HTMLElement;
  composer: HTMLElement;
  surface: HTMLElement;
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
      <div data-fixture="composer-surface" style="background-color: white; border-radius: 20px; border-top-left-radius: 20px; padding-top: 6px">
        <div data-testid="chat-input" contenteditable="true" role="textbox">${composerText}</div>
        <button type="button" aria-label="Press and hold to record"></button>
        <button type="button" aria-label="Use voice mode"></button>
      </div>
    </main>
  `;

  const assistantMessage = requiredElement<HTMLElement>('[data-rs-index="1"] [role="article"]');
  const composer = requiredElement<HTMLElement>('[data-testid="chat-input"]');
  const surface = requiredElement<HTMLElement>('[data-fixture="composer-surface"]');
  const voiceButton = requiredElement<HTMLButtonElement>('button[aria-label="Use voice mode"]');

  Object.defineProperty(composer, "innerText", {
    configurable: true,
    get: () => composer.textContent ?? "",
  });
  setElementRect(surface, new DOMRect(100, 690, 768, 102));
  setButtonRect(voiceButton, 828);
  setButtonRect(requiredElement('button[aria-label="Press and hold to record"]'), 788);

  return { assistantMessage, composer, surface, voiceButton };
}

export function replaceVoiceWithSend(onSend: (text: string) => void) {
  const voiceButton = requiredElement<HTMLButtonElement>('button[aria-label="Use voice mode"]');
  const sendButton = document.createElement("button");
  sendButton.type = "button";
  sendButton.setAttribute("aria-label", "Send message");
  setButtonRect(sendButton, 828);
  sendButton.addEventListener("click", () => {
    const composer = requiredElement<HTMLElement>('[data-testid="chat-input"]');
    onSend(composer.innerText);
  });
  voiceButton.replaceWith(sendButton);
  return sendButton;
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

export function appendClaudeSelectionToolbar() {
  const toolbar = document.createElement("div");
  toolbar.style.position = "fixed";
  const actionRow = document.createElement("div");
  const replyButton = document.createElement("button");
  replyButton.className = "claude-reply-action";
  replyButton.textContent = "Reply";
  actionRow.append(replyButton);
  toolbar.append(actionRow);
  setElementRect(toolbar, new DOMRect(100, 150, 160, 36));
  document.body.append(toolbar);
  return { actionRow, replyButton };
}

function setButtonRect(button: HTMLButtonElement, left: number) {
  setElementRect(button, new DOMRect(left, 748, 32, 32));
}
