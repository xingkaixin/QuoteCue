import { requiredElement, setElementRect } from "./fixture-utils";

export type ChatGptHostFixture = {
  action: HTMLButtonElement;
  assistantMessage: HTMLElement;
  composer: HTMLElement;
  form: HTMLFormElement;
  surface: HTMLElement;
  userMessage: HTMLElement;
};

export function installChatGptHostFixture(): ChatGptHostFixture {
  document.body.innerHTML = `
    <main>
      <article data-message-author-role="assistant" data-message-id="assistant-one">
        <p>A <strong>focused answer</strong> for the contract fixture.</p>
      </article>
      <form>
        <div data-fixture="composer-surface" style="background-color: white; border-radius: 28px; border-top-left-radius: 28px; padding-top: 5px">
          <div><div id="prompt-textarea" contenteditable="true">Original question</div></div>
          <button type="button" data-testid="send-button" aria-label="Send"></button>
        </div>
      </form>
    </main>
  `;

  const assistantMessage = requiredElement<HTMLElement>(
    '[data-message-author-role="assistant"][data-message-id]',
  );
  const composer = requiredElement<HTMLElement>("#prompt-textarea");
  const form = requiredElement<HTMLFormElement>("form");
  const surface = requiredElement<HTMLElement>('[data-fixture="composer-surface"]');
  const action = requiredElement<HTMLButtonElement>('button[data-testid="send-button"]');
  const userMessage = appendUserMessage("user-initial", "Original question");

  Object.defineProperty(composer, "innerText", {
    configurable: true,
    get: () => composer.textContent ?? "",
  });
  setElementRect(surface, new DOMRect(100, 700, 400, 92));
  setElementRect(action, new DOMRect(456, 748, 36, 36));

  return { action, assistantMessage, composer, form, surface, userMessage };
}

export function appendUserMessage(messageId: string, text: string) {
  const message = document.createElement("div");
  message.dataset.messageAuthorRole = "user";
  message.dataset.messageId = messageId;
  message.textContent = text;
  (document.querySelector("main") ?? document.body).append(message);
  return message;
}

export function appendAssistantMessage(messageId: string, text: string) {
  const message = document.createElement("article");
  message.dataset.messageAuthorRole = "assistant";
  message.dataset.messageId = messageId;
  message.textContent = text;
  document.body.append(message);
  return message;
}

export function appendComposer(text = "") {
  const composer = document.createElement("div");
  composer.id = "prompt-textarea";
  composer.setAttribute("contenteditable", "true");
  composer.textContent = text;
  Object.defineProperty(composer, "innerText", {
    configurable: true,
    get: () => composer.textContent ?? "",
  });
  const form = document.createElement("form");
  const surface = document.createElement("div");
  surface.append(composer);
  form.append(surface);
  document.body.append(form);
  return composer;
}

export function appendSendButton(onClick: () => void = () => undefined) {
  const sendButton = document.createElement("button");
  sendButton.dataset.testid = "send-button";
  sendButton.addEventListener("click", onClick);
  requiredElement("form:has(#prompt-textarea) > div").append(sendButton);
  return sendButton;
}

export function appendSelectionToolbar(rect = new DOMRect(100, 150, 200, 36)) {
  const toolbar = document.createElement("div");
  toolbar.style.position = "fixed";
  const actionRow = document.createElement("div");
  const firstAction = document.createElement("button");
  const lastAction = document.createElement("button");
  firstAction.className = "native-action";
  firstAction.setAttribute("aria-describedby", "native-tooltip");
  firstAction.textContent = "Localized action one";
  lastAction.textContent = "Localized action two";
  actionRow.append(firstAction, lastAction);
  toolbar.append(actionRow);
  setElementRect(toolbar, rect);
  document.body.append(toolbar);
  return { actionRow, firstAction, lastAction, toolbar };
}

export function setChatGptStreaming(control: HTMLElement, isStreaming: boolean) {
  control.dataset.testid = isStreaming ? "stop-button" : "send-button";
}
