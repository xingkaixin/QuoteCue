import { describe, expect, it } from "vitest";

import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";

const host = createChatGptHost({ document, window });

describe("conversation keys", () => {
  it("uses the URL conversation id when one exists", () => {
    window.history.replaceState({}, "", "/c/conversation-a");

    expect(host.conversation.key("new-chat:tab-a")).toBe("conversation-a");
  });

  it("isolates new chats with a unique temporary key", () => {
    window.history.replaceState({}, "", "/");
    const firstKey = `new-chat:${crypto.randomUUID()}`;
    const secondKey = `new-chat:${crypto.randomUUID()}`;

    expect(firstKey).toMatch(/^new-chat:/);
    expect(secondKey).toMatch(/^new-chat:/);
    expect(firstKey).not.toBe(secondKey);
    expect(host.conversation.key(firstKey)).toBe(firstKey);
    expect(host.conversation.key(secondKey)).toBe(secondKey);
  });
});
