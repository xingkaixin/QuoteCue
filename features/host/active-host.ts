import { chatGptHost } from "@/features/chatgpt/chatgpt-host";
import { claudeHost } from "@/features/claude/claude-host";
import { deepSeekHost } from "@/features/deepseek/deepseek-host";

import type { Host } from "./dom-host";

export function hostForHostname(hostname: string): Host {
  switch (hostname) {
    case "claude.ai":
      return claudeHost;
    case "chat.deepseek.com":
      return deepSeekHost;
    default:
      return chatGptHost;
  }
}

export const activeHost = hostForHostname(window.location.hostname);
