export type ChatGptHostFixture = {
  action: HTMLButtonElement;
  assistantMessage: HTMLElement;
  composer: HTMLElement;
  form: HTMLFormElement;
  surface: HTMLElement;
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

  Object.defineProperty(composer, "innerText", {
    configurable: true,
    get: () => composer.textContent ?? "",
  });
  Object.defineProperty(surface, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 792, height: 92, left: 100, right: 500, top: 700, width: 400 }),
  });
  Object.defineProperty(action, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 784, height: 36, left: 456, right: 492, top: 748, width: 36 }),
  });

  return { action, assistantMessage, composer, form, surface };
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
  document.body.append(composer);
  return composer;
}

export function appendSendButton(onClick: () => void = () => undefined) {
  const sendButton = document.createElement("button");
  sendButton.dataset.testid = "send-button";
  sendButton.addEventListener("click", onClick);
  document.body.append(sendButton);
  return sendButton;
}

export function appendSelectionToolbar() {
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
  Object.defineProperty(toolbar, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 186,
      height: 36,
      left: 100,
      right: 300,
      top: 150,
      width: 200,
      x: 100,
      y: 150,
      toJSON: () => ({}),
    }),
  });
  document.body.append(toolbar);
  return { actionRow, firstAction, lastAction, toolbar };
}

function requiredElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Fixture is missing ${selector}`);
  }
  return element;
}
