import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "https://chatgpt.com",
      },
    },
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**"],
  },
});
