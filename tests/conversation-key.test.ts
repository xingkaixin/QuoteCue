import { afterEach, describe, expect, it, vi } from "vitest";

import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";

const host = createChatGptHost({ document, window });

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

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

  it("subscribes to history navigation without observing DOM changes", () => {
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const onNavigation = vi.fn();
    const stop = host.conversation.subscribe(onNavigation);

    window.history.pushState({}, "", "/c/conversation-b");
    window.history.replaceState({}, "", "/c/conversation-c");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(onNavigation).toHaveBeenCalledTimes(3);
    expect(observe).not.toHaveBeenCalled();

    stop();
    window.history.pushState({}, "", "/c/conversation-d");
    expect(onNavigation).toHaveBeenCalledTimes(3);
  });
});
