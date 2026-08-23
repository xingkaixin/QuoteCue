import { test as base, type BrowserContext, type Worker } from "@playwright/test";
import path from "node:path";

type ExtensionFixtures = {
  context: BrowserContext;
  extensionWorker: Worker;
};

export const test = base.extend<ExtensionFixtures>({
  context: async ({ playwright }, use) => {
    const extensionPath = path.resolve(".output/chrome-mv3");
    const context = await playwright.chromium.launchPersistentContext("", {
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      channel: "chromium",
      headless: true,
    });

    await use(context);
    await context.close();
  },
  extensionWorker: async ({ context }, use) => {
    const extensionWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(extensionWorker);
  },
});

export { expect } from "@playwright/test";
