import type { BrowserContext, Page, Worker } from "@playwright/test";

import { expect, test } from "./extension-fixture";

const CHATGPT_FIXTURE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <style>
      body { margin: 0; font-family: sans-serif; }
      main { padding: 20px; }
      article { width: 480px; }
      article p { margin: 0; line-height: 20px; }
      form { margin-top: 80px; }
      [data-fixture="composer-surface"] { padding: 12px; width: 480px; }
      #prompt-textarea { min-height: 24px; }
      #selection-toolbar {
        position: fixed;
        left: 20px;
        top: 44px;
        width: 180px;
        height: 32px;
      }
    </style>
  </head>
  <body>
    <main>
      <article data-message-author-role="assistant" data-message-id="assistant-a">
        <p>A focused answer for the browser smoke test.</p>
      </article>
      <form>
        <div data-fixture="composer-surface">
          <div id="prompt-textarea" contenteditable="true">Supplemental question</div>
          <button type="button" data-testid="send-button">Send</button>
        </div>
      </form>
    </main>
    <div id="selection-toolbar"><div><button type="button">Copy</button></div></div>
    <script>
      const composer = document.querySelector("#prompt-textarea");
      composer.addEventListener("paste", (event) => {
        event.preventDefault();
        const text = event.clipboardData?.getData("text/plain") ?? "";
        composer.textContent = text;
        composer.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: text,
          inputType: "insertText",
        }));
      });
      document.querySelector("[data-testid=send-button]").addEventListener("click", () => {
        const message = document.createElement("article");
        message.dataset.messageAuthorRole = "user";
        message.dataset.messageId = crypto.randomUUID();
        message.textContent = composer.innerText;
        document.querySelector("main").append(message);
      });
    </script>
  </body>
</html>`;

test.beforeEach(async ({ context }) => {
  await context.route("https://chatgpt.com/**", async (route) => {
    if (route.request().resourceType() === "document") {
      await route.fulfill({ body: CHATGPT_FIXTURE, contentType: "text/html" });
      return;
    }
    await route.abort();
  });
});

test("sends an annotation through the loaded extension", async ({ context, extensionWorker }) => {
  const page = await openConversation(context, "conversation-send");
  await addAnnotation(page);
  await expect
    .poll(() => storedAnnotationCount(extensionWorker, draftKey("conversation-send")))
    .toBe(1);
  await expect
    .poll(() =>
      page.locator("[data-testid=send-button]").evaluate((element) => element.style.visibility),
    )
    .toBe("hidden");

  await page.locator("#prompt-textarea").press("Enter");

  const sentMessage = page.locator('[data-message-author-role="user"]');
  await expect(sentMessage).toContainText("[Annotation 1]");
  await expect(sentMessage).toContainText("A focused answer for the browser smoke test.");
  await expect(sentMessage).toContainText("Supplemental question");
  await expect
    .poll(() => storedAnnotationCount(extensionWorker, draftKey("conversation-send")))
    .toBe(0);
});

test("keeps browser storage isolated by committed conversation", async ({
  context,
  extensionWorker,
}) => {
  const page = await openConversation(context, "conversation-a");
  await addAnnotation(page);
  await expect
    .poll(() => storedAnnotationCount(extensionWorker, draftKey("conversation-a")))
    .toBe(1);

  await page.evaluate(() => {
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]');
    const paragraph = message?.querySelector("p");
    if (!message || !paragraph) {
      throw new Error("Missing assistant fixture");
    }
    message.dataset.messageId = "assistant-b";
    paragraph.textContent = "A second answer for another conversation.";
    history.pushState({}, "", "/c/conversation-b");
  });
  await expect(page).toHaveURL(/\/c\/conversation-b$/);
  await addAnnotation(page);

  await expect
    .poll(() => storedAnnotationCount(extensionWorker, draftKey("conversation-b")))
    .toBe(1);
  await expect
    .poll(() => storedAnnotationCount(extensionWorker, draftKey("conversation-a")))
    .toBe(1);
});

async function openConversation(context: BrowserContext, conversationId: string) {
  const page = await context.newPage();
  await page.goto(`https://chatgpt.com/c/${conversationId}`);
  await expect(page.locator("quotecue-ui")).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector("quotecue-ui")?.shadowRoot)).toBeNull();
  return page;
}

test("clears unreadable drafts with the keyboard across display settings", async ({
  context,
  extensionWorker,
}) => {
  for (const { width, colorScheme, reducedMotion, zoom } of [
    { width: 1280, colorScheme: "light", reducedMotion: "no-preference", zoom: 1 },
    { width: 360, colorScheme: "dark", reducedMotion: "reduce", zoom: 1 },
    { width: 720, colorScheme: "light", reducedMotion: "reduce", zoom: 2 },
  ] as const) {
    const key = draftKey("unreadable");
    await extensionWorker.evaluate(async (storageKey) => {
      const extensionApi = Reflect.get(globalThis, "chrome") as {
        storage: { local: { set(values: Record<string, unknown>): Promise<void> } };
      };
      await extensionApi.storage.local.set({
        [storageKey]: { version: 3, annotations: [{ id: "unreadable" }], updatedAt: Date.now() },
      });
    }, key);
    const page = await openConversation(context, "unreadable");
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme, reducedMotion });
    await page.evaluate((scale) => {
      document.documentElement.style.zoom = String(scale);
    }, zoom);
    const session = await context.newCDPSession(page);
    let clearButtonId: number | undefined;
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      clearButtonId = nodes.find(
        (node) => node.role?.value === "button" && node.name?.value === "Clear all annotations",
      )?.backendDOMNodeId;
      expect(clearButtonId).toBeDefined();
    }).toPass();
    await session.send("DOM.focus", { backendNodeId: clearButtonId });
    await page.keyboard.press("Enter");
    expect(await storedAnnotationCount(extensionWorker, key)).toBe(1);
    const { nodes } = await session.send("Accessibility.getFullAXTree");
    expect(nodes.some((node) => node.name?.value === "Confirm clearing all annotations")).toBe(
      true,
    );
    const { model } = await session.send("DOM.getBoxModel", { backendNodeId: clearButtonId });
    expect(Math.min(...model.border.filter((_, index) => index % 2 === 0))).toBeGreaterThanOrEqual(
      0,
    );
    expect(Math.max(...model.border.filter((_, index) => index % 2 === 0))).toBeLessThanOrEqual(
      width,
    );
    await page.keyboard.press("Enter");
    await expect.poll(() => storedAnnotationCount(extensionWorker, key)).toBe(0);
    await page.close();
  }
});

async function addAnnotation(page: Page) {
  const action = page.locator("[data-quotecue-native-action]");
  await expect(async () => {
    await page.evaluate(() => {
      const paragraph = document.querySelector('[data-message-author-role="assistant"] p');
      if (!paragraph) {
        throw new Error("Missing assistant text");
      }
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.keyboard.press("Shift");
    await expect(action).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await action.click();
}

function draftKey(conversationId: string) {
  return `quotecue:draft:chatgpt:${conversationId}`;
}

async function storedAnnotationCount(extensionWorker: Worker, key: string) {
  return extensionWorker.evaluate(async (storageKey) => {
    const extensionApi = Reflect.get(globalThis, "chrome") as {
      storage: { local: { get(key: string): Promise<Record<string, unknown>> } };
    };
    const stored = await extensionApi.storage.local.get(storageKey);
    const draft = stored[storageKey] as { annotations?: unknown[] } | undefined;
    return draft?.annotations?.length ?? 0;
  }, key);
}
