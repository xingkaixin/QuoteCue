import { chatGptHost } from "@/features/chatgpt/chatgpt-host";

import type { Host } from "./dom-host";

export function hostForHostname(hostname: string): Host {
  switch (hostname) {
    default:
      return chatGptHost;
  }
}

export const activeHost = hostForHostname(window.location.hostname);
