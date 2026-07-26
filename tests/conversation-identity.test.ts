import { afterEach, describe, expect, it, vi } from "vitest";

import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";

const host = createChatGptHost({ document, window });

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("conversation identities", () => {
  it("uses the URL conversation id when one exists", () => {
    window.history.replaceState({}, "", "/c/conversation-a");

    expect(host.conversation.identity("session-a")).toEqual({
      kind: "identified",
      id: "conversation-a",
    });
  });

  it("identifies ChatGPT GPT conversations", () => {
    window.history.replaceState({}, "", "/g/gizmo-a/c/conversation-a");

    expect(host.conversation.identity("session-a")).toEqual({
      kind: "identified",
      id: "conversation-a",
    });
  });

  it("keeps unidentified sessions distinct without a magic prefix", () => {
    window.history.replaceState({}, "", "/");
    const firstSessionKey = crypto.randomUUID();
    const secondSessionKey = crypto.randomUUID();

    expect(firstSessionKey).not.toBe(secondSessionKey);
    expect(host.conversation.identity(firstSessionKey)).toEqual({
      kind: "unidentified",
      sessionKey: firstSessionKey,
    });
    expect(host.conversation.identity(secondSessionKey)).toEqual({
      kind: "unidentified",
      sessionKey: secondSessionKey,
    });
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
