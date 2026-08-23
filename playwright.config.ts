import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  testDir: "tests/e2e",
  timeout: 30_000,
  workers: 1,
});
