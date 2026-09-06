import type { BrowserContext, Page, Worker } from "@playwright/test";

import { expect, test } from "./extension-fixture";

const DISPLAY_SETTINGS = [
  { width: 1280, colorScheme: "light", reducedMotion: "no-preference", zoom: 1 },
  { width: 360, colorScheme: "dark", reducedMotion: "reduce", zoom: 1 },
  { width: 720, colorScheme: "light", reducedMotion: "reduce", zoom: 2 },
] as const;

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
    .poll(() => page.frames().some((candidate) => candidate.url().includes("secure-field.html")))
    .toBe(true);
  const frame = page.frames().find((candidate) => candidate.url().includes("secure-field.html"))!;
  const field = frame.locator("input");
  await field.fill("Explain this fixture answer");
  await field.press("Tab");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.frames().some((candidate) => candidate.url().includes("secure-field.html")))
    .toBe(false);
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
  await expect(sentMessage).toContainText("Explain this fixture answer");
  await expect(sentMessage).toContainText("Supplemental question");
  await expect
    .poll(() => storedAnnotationCount(extensionWorker, draftKey("conversation-send")))
    .toBe(0);
});

test("removes sent annotations from another tab before its next native send", async ({
  context,
  extensionWorker,
}) => {
  const conversationId = "cross-tab-send";
  const key = draftKey(conversationId);
  const firstPage = await openConversation(context, conversationId);
  await addAnnotation(firstPage);
  await expect
    .poll(() => firstPage.frames().some((frame) => frame.url().includes("secure-field.html")))
    .toBe(true);
  const fieldFrame = firstPage.frames().find((frame) => frame.url().includes("secure-field.html"))!;
  const field = fieldFrame.locator("input");
  await field.fill("Clarify this shared fixture answer");
  await field.press("Tab");
  await firstPage.keyboard.press("Enter");
  await expect
    .poll(() => firstPage.frames().some((frame) => frame.url().includes("secure-field.html")))
    .toBe(false);
  await expect.poll(() => storedAnnotationCount(extensionWorker, key)).toBe(1);
  await expect(firstPage.locator("[data-testid=send-button]")).toBeHidden();

  const secondPage = await openConversation(context, conversationId);
  const secondSession = await context.newCDPSession(secondPage);
  const summaryVisible = async () => {
    const { nodes } = await secondSession.send("Accessibility.getFullAXTree");
    return nodes.some(
      (node) => node.role?.value === "button" && node.name?.value === "1 annotation",
    );
  };
  await expect.poll(summaryVisible).toBe(true);
  const nativeSend = secondPage.locator("[data-testid=send-button]");
  await expect(nativeSend).toBeHidden();

  await firstPage.locator("#prompt-textarea").press("Enter");
  await expect(firstPage.locator('[data-message-author-role="user"]')).toContainText(
    "[Annotation 1]",
  );
  await expect.poll(() => storedAnnotationCount(extensionWorker, key)).toBe(0);

  await expect.poll(summaryVisible).toBe(false);
  await expect(nativeSend).toBeVisible();
  await nativeSend.click();
  const secondSentMessage = secondPage.locator('[data-message-author-role="user"]');
  await expect(secondSentMessage).toHaveCount(1);
  await expect(secondSentMessage).toHaveText("Supplemental question");
});

test("preserves another tab's unsaved comment after its annotation is sent", async ({
  context,
  extensionWorker,
}) => {
  for (const { width, colorScheme, reducedMotion, zoom } of DISPLAY_SETTINGS) {
    const conversationId = `cross-tab-dirty-${width}`;
    const key = draftKey(conversationId);
    const firstPage = await openConversation(context, conversationId);
    await addAnnotation(firstPage);
    await expect
      .poll(() => firstPage.frames().some((frame) => frame.url().includes("secure-field.html")))
      .toBe(true);
    const firstFrame = firstPage
      .frames()
      .find((frame) => frame.url().includes("secure-field.html"))!;
    await firstFrame.locator("input").press("Tab");
    await firstPage.keyboard.press("Enter");
    await expect.poll(() => storedAnnotationCount(extensionWorker, key)).toBe(1);
    const originalAnnotationId = await extensionWorker.evaluate(async (storageKey) => {
      const extensionApi = Reflect.get(globalThis, "chrome") as {
        storage: { local: { get(key: string): Promise<Record<string, unknown>> } };
      };
      const stored = await extensionApi.storage.local.get(storageKey);
      return (stored[storageKey] as { annotations: { id: string }[] }).annotations[0]!.id;
    }, key);

    const secondPage = await openConversation(context, conversationId);
    await secondPage.setViewportSize({ width, height: 800 });
    await secondPage.emulateMedia({ colorScheme, reducedMotion });
    await secondPage.evaluate((scale) => {
      document.documentElement.style.zoom = String(scale);
    }, zoom);
    const nativeSend = secondPage.locator("[data-testid=send-button]");
    await expect(nativeSend).toBeHidden();
    const secondSession = await context.newCDPSession(secondPage);
    let badgeId: number | undefined;
    await expect(async () => {
      const { nodes } = await secondSession.send("Accessibility.getFullAXTree");
      badgeId = nodes.find(
        (node) => node.role?.value === "button" && node.name?.value === "View annotation 1",
      )?.backendDOMNodeId;
      expect(badgeId).toBeDefined();
    }).toPass();
    await secondSession.send("DOM.focus", { backendNodeId: badgeId });
    await secondPage.keyboard.press("Enter");
    await expect
      .poll(() => secondPage.frames().some((frame) => frame.url().includes("secure-field.html")))
      .toBe(true);
    const secondFrame = secondPage
      .frames()
      .find((frame) => frame.url().includes("secure-field.html"))!;
    const field = secondFrame.locator("textarea");
    const comment = "Unsaved synthetic cross-tab comment";
    await field.fill(comment);

    await firstPage.locator("#prompt-textarea").press("Enter");
    await expect(firstPage.locator('[data-message-author-role="user"]')).toContainText(
      "[Annotation 1]",
    );
    await expect.poll(() => storedAnnotationCount(extensionWorker, key)).toBe(0);
    await expect
      .poll(async () => {
        const { nodes } = await secondSession.send("Accessibility.getFullAXTree");
        return nodes.some(
          (node) => node.role?.value === "button" && node.name?.value === "1 annotation",
        );
      })
      .toBe(false);
    await expect(nativeSend).toBeVisible();
    expect(secondFrame.isDetached()).toBe(false);
    await expect(field).toHaveValue(comment);

    await field.press("Tab");
    await secondPage.keyboard.press("Tab");
    await secondPage.keyboard.press("Tab");
    let saveButtonId: number | undefined;
    await expect(async () => {
      const { nodes } = await secondSession.send("Accessibility.getFullAXTree");
      const save = nodes.find(
        (node) => node.role?.value === "button" && node.name?.value === "Save as new annotation",
      );
      saveButtonId = save?.backendDOMNodeId;
      expect(saveButtonId).toBeDefined();
      expect(save?.properties?.find((property) => property.name === "focused")?.value.value).toBe(
        true,
      );
    }).toPass();
    const { model } = await secondSession.send("DOM.getBoxModel", { backendNodeId: saveButtonId });
    const horizontalEdges = model.border.filter((_, index) => index % 2 === 0);
    const verticalEdges = model.border.filter((_, index) => index % 2 === 1);
    expect(Math.min(...horizontalEdges)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...horizontalEdges)).toBeLessThanOrEqual(width);
    expect(Math.min(...verticalEdges)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...verticalEdges)).toBeLessThanOrEqual(800);
    await secondPage.keyboard.press("Enter");
    await expect.poll(() => storedAnnotationCount(extensionWorker, key)).toBe(1);
    const saved = await extensionWorker.evaluate(
      async ({ storageKey, previousId, expectedComment }) => {
        const extensionApi = Reflect.get(globalThis, "chrome") as {
          storage: { local: { get(key: string): Promise<Record<string, unknown>> } };
        };
        const stored = await extensionApi.storage.local.get(storageKey);
        const annotation = (
          stored[storageKey] as {
            annotations: { id: string; comment: string }[];
          }
        ).annotations[0]!;
        return {
          hasNewId: annotation.id !== previousId,
          hasComment: annotation.comment === expectedComment,
        };
      },
      { storageKey: key, previousId: originalAnnotationId, expectedComment: comment },
    );
    expect(saved).toEqual({ hasNewId: true, hasComment: true });
    await secondPage.close();
    await firstPage.close();
  }
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

test("leaves streaming stop controls visible and clickable", async ({ context }) => {
  const page = await openConversation(context, "streaming");
  await addAnnotation(page);
  await page.locator("[data-testid=send-button]").evaluate((button) => {
    button.setAttribute("data-testid", "stop-button");
    button.textContent = "Stop";
    button.addEventListener(
      "click",
      (event) => {
        event.stopImmediatePropagation();
        button.setAttribute("data-stopped", "true");
      },
      { capture: true },
    );
  });
  const stop = page.locator("[data-testid=stop-button]");
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(stop).toHaveAttribute("data-stopped", "true");
  await stop.evaluate((button) => button.setAttribute("data-testid", "send-button"));
  await expect(page.locator("[data-testid=send-button]")).toBeHidden();
});

test("protects an unsaved comment when a native action is activated by keyboard", async ({
  context,
  extensionWorker,
}) => {
  const page = await openConversation(context, "dirty-editor");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await addAnnotation(page);
  await expect.poll(() => storedAnnotationCount(extensionWorker, draftKey("dirty-editor"))).toBe(1);
  await expect
    .poll(() => page.frames().some((candidate) => candidate.url().includes("secure-field.html")))
    .toBe(true);
  const frame = page.frames().find((candidate) => candidate.url().includes("secure-field.html"));
  expect(frame).toBeDefined();
  const field = frame!.locator("input, textarea");
  await field.fill("Unsaved fixture comment");
  await page.evaluate(() => {
    const paragraph = document.querySelector('[data-message-author-role="assistant"] p')!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Shift" }));
  });
  await page.locator("[data-quotecue-native-action]").press("Enter");
  await expect(field).toHaveValue("Unsaved fixture comment");
  expect(await storedAnnotationCount(extensionWorker, draftKey("dirty-editor"))).toBe(1);
});

async function openConversation(context: BrowserContext, conversationId: string) {
  const page = await context.newPage();
  await page.goto(`https://chatgpt.com/c/${conversationId}`);
  await expect(page.locator("quotecue-ui")).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector("quotecue-ui")?.shadowRoot)).toBeNull();
  return page;
}

test("retains summary keyboard focus when the pointer leaves across display settings", async ({
  context,
}) => {
  for (const { width, colorScheme, reducedMotion, zoom } of DISPLAY_SETTINGS) {
    const page = await openConversation(context, `summary-${width}`);
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme, reducedMotion });
    await page.evaluate((scale) => {
      document.documentElement.style.zoom = String(scale);
    }, zoom);
    await addAnnotation(page);
    await expect
      .poll(() => page.frames().some((frame) => frame.url().includes("secure-field.html")))
      .toBe(true);
    const fieldFrame = page.frames().find((frame) => frame.url().includes("secure-field.html"))!;
    await fieldFrame.locator("input, textarea").press("Tab");
    await page.keyboard.press("Enter");

    const session = await context.newCDPSession(page);
    let countButtonId: number | undefined;
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      countButtonId = nodes.find(
        (node) => node.role?.value === "button" && node.name?.value === "1 annotation",
      )?.backendDOMNodeId;
      expect(countButtonId).toBeDefined();
    }).toPass();
    const { model } = await session.send("DOM.getBoxModel", { backendNodeId: countButtonId });
    await page.mouse.move(
      (model.content[0]! + model.content[4]!) / 2,
      (model.content[1]! + model.content[5]!) / 2,
    );
    let editButtonId: number | undefined;
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      editButtonId = nodes.find(
        (node) => node.role?.value === "button" && node.name?.value === "Edit annotation 1",
      )?.backendDOMNodeId;
      expect(editButtonId).toBeDefined();
    }).toPass();
    await session.send("DOM.focus", { backendNodeId: editButtonId });
    await page.mouse.move(0, 0);
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      const edit = nodes.find((node) => node.backendDOMNodeId === editButtonId);
      expect(edit?.properties?.find((property) => property.name === "focused")?.value.value).toBe(
        true,
      );
    }).toPass();

    await page.keyboard.press("Escape");
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      expect(nodes.some((node) => node.role?.value === "dialog")).toBe(false);
      const count = nodes.find((node) => node.backendDOMNodeId === countButtonId);
      expect(count?.properties?.find((property) => property.name === "focused")?.value.value).toBe(
        true,
      );
    }).toPass();
    await page.keyboard.press("Enter");
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      expect(nodes.some((node) => node.role?.value === "dialog")).toBe(true);
    }).toPass();
    await page.close();
  }
});

test("clears unreadable drafts with the keyboard across display settings", async ({
  context,
  extensionWorker,
}) => {
  for (const { width, colorScheme, reducedMotion, zoom } of DISPLAY_SETTINGS) {
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

test("restores unidentified drafts only after keyboard confirmation across display settings", async ({
  context,
  extensionWorker,
}) => {
  for (const { width, colorScheme, reducedMotion, zoom } of DISPLAY_SETTINGS) {
    const conversationId = `restored-${width}`;
    const key = draftKey(conversationId);
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme, reducedMotion });
    await page.goto("https://chatgpt.com/");
    await expect(page.locator("quotecue-ui")).toHaveCount(1);
    expect(await page.evaluate(() => document.querySelector("quotecue-ui")?.shadowRoot)).toBeNull();
    await page.evaluate((scale) => {
      document.documentElement.style.zoom = String(scale);
    }, zoom);
    await addAnnotation(page);
    await expect
      .poll(() => page.frames().some((frame) => frame.url().includes("secure-field.html")))
      .toBe(true);
    const fieldFrame = page.frames().find((frame) => frame.url().includes("secure-field.html"))!;
    await fieldFrame.locator("input, textarea").press("Tab");
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.frames().some((frame) => frame.url().includes("secure-field.html")))
      .toBe(false);

    await page.evaluate((id) => history.pushState({}, "", `/c/${id}`), conversationId);
    await expect(page).toHaveURL(new RegExp(`/c/${conversationId}$`));
    const session = await context.newCDPSession(page);
    let restoreButtonId: number | undefined;
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      restoreButtonId = nodes.find(
        (node) =>
          node.role?.value === "button" && node.name?.value === "Restore to this conversation",
      )?.backendDOMNodeId;
      expect(restoreButtonId).toBeDefined();
    }).toPass();
    expect(await storedAnnotationCount(extensionWorker, key)).toBe(0);

    const { model } = await session.send("DOM.getBoxModel", { backendNodeId: restoreButtonId });
    const horizontalEdges = model.border.filter((_, index) => index % 2 === 0);
    const verticalEdges = model.border.filter((_, index) => index % 2 === 1);
    expect(
      Math.min(...horizontalEdges),
      `left edge at width=${width}, zoom=${zoom}`,
    ).toBeGreaterThanOrEqual(0);
    expect(Math.max(...horizontalEdges)).toBeLessThanOrEqual(width);
    expect(Math.min(...verticalEdges)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...verticalEdges)).toBeLessThanOrEqual(800);

    await session.send("DOM.focus", { backendNodeId: restoreButtonId });
    await page.keyboard.press("Enter");

    await expect.poll(() => storedAnnotationCount(extensionWorker, key)).toBe(1);
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      expect(
        nodes.some(
          (node) =>
            node.role?.value === "button" && node.name?.value === "Restore to this conversation",
        ),
      ).toBe(false);
    }).toPass();
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

test("retains focus and allows keyboard undo after deletion across display settings", async ({
  context,
}) => {
  for (const { width, colorScheme, reducedMotion, zoom } of DISPLAY_SETTINGS) {
    const page = await openConversation(context, `delete-focus-${width}`);
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme, reducedMotion });
    await page.evaluate((scale) => {
      document.documentElement.style.zoom = String(scale);
    }, zoom);
    await addAnnotation(page);
    await expect
      .poll(() => page.frames().some((frame) => frame.url().includes("secure-field.html")))
      .toBe(true);
    const fieldFrame = page.frames().find((frame) => frame.url().includes("secure-field.html"))!;
    await fieldFrame.locator("input").press("Enter");
    const session = await context.newCDPSession(page);
    let countButtonId: number | undefined;
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      countButtonId = nodes.find(
        (node) => node.role?.value === "button" && node.name?.value === "1 annotation",
      )?.backendDOMNodeId;
      expect(countButtonId).toBeDefined();
    }).toPass();
    await session.send("DOM.focus", { backendNodeId: countButtonId });
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const { nodes: deleteNodes } = await session.send("Accessibility.getFullAXTree");
    const deleteButton = deleteNodes.find(
      (node) => node.role?.value === "button" && node.name?.value === "Delete annotation 1",
    );
    expect(
      deleteButton?.properties?.find((property) => property.name === "focused")?.value.value,
    ).toBe(true);
    await page.keyboard.press("Enter");
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      const count = nodes.find((node) => node.backendDOMNodeId === countButtonId);
      expect(count?.name?.value).toBe("0 annotations");
      expect(count?.properties?.find((property) => property.name === "focused")?.value.value).toBe(
        true,
      );
    }).toPass();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(async () => {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      expect(nodes.some((node) => node.name?.value === "Delete annotation 1")).toBe(true);
    }).toPass();
    await page.close();
  }
});
