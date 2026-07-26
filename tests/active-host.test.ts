import { describe, expect, it } from "vitest";

import { chatGptHost } from "@/features/chatgpt/chatgpt-host";
import { claudeHost } from "@/features/claude/claude-host";
import { deepSeekHost } from "@/features/deepseek/deepseek-host";
import { hostForHostname } from "@/features/host/active-host";
import { kimiHost } from "@/features/kimi/kimi-host";

describe("active host selection", () => {
  it.each([
    ["chatgpt.com", chatGptHost],
    ["claude.ai", claudeHost],
    ["chat.deepseek.com", deepSeekHost],
    ["www.kimi.com", kimiHost],
  ])("maps %s to its host", (hostname, expectedHost) => {
    expect(hostForHostname(hostname)).toBe(expectedHost);
  });
});
