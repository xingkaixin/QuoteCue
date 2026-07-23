import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  alias: {
    "@": ".",
  },
  manifest: {
    name: "QuoteCue",
    description: "Annotate AI responses and send focused follow-up questions.",
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    },
    permissions: ["storage"],
    host_permissions: [
      "https://chatgpt.com/*",
      "https://chat.deepseek.com/*",
      "https://claude.ai/*",
    ],
    web_accessible_resources: [
      {
        resources: ["secure-field.html"],
        matches: ["https://chatgpt.com/*", "https://chat.deepseek.com/*", "https://claude.ai/*"],
      },
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
