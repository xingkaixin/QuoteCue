import { describe, expect, it } from "vitest";

import {
  conversationKeyFromPathname,
  createTemporaryConversationKey,
} from "@/features/annotations/conversation-key";

describe("conversation keys", () => {
  it("uses the URL conversation id when one exists", () => {
    expect(conversationKeyFromPathname("/c/conversation-a", "new-chat:tab-a")).toBe(
      "conversation-a",
    );
  });

  it("isolates new chats with a unique temporary key", () => {
    const firstKey = createTemporaryConversationKey();
    const secondKey = createTemporaryConversationKey();

    expect(firstKey).toMatch(/^new-chat:/);
    expect(secondKey).toMatch(/^new-chat:/);
    expect(firstKey).not.toBe(secondKey);
    expect(conversationKeyFromPathname("/", firstKey)).toBe(firstKey);
    expect(conversationKeyFromPathname("/", secondKey)).toBe(secondKey);
  });
});
