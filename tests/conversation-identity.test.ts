import { afterEach, describe, expect, it, vi } from "vitest";

import {
  conversationIdentityKey,
  sameConversationIdentity,
} from "@/features/conversation/conversation-identity";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { createClaudeHost } from "@/features/claude/claude-host";

const host = createChatGptHost({ document, window });
const claudeHost = createClaudeHost({ document, window });
const navigationDescriptor = Object.getOwnPropertyDescriptor(window, "navigation");

afterEach(() => {
  window.history.replaceState({}, "", "/");
  if (navigationDescriptor) {
    Object.defineProperty(window, "navigation", navigationDescriptor);
  } else {
    Reflect.deleteProperty(window, "navigation");
  }
  vi.restoreAllMocks();
});

describe("conversation identities", () => {
  it("uses the URL conversation id when one exists", () => {
    window.history.replaceState({}, "", "/c/conversation-a");

    expect(host.conversation.identity("session-a")).toEqual({
      kind: "identified",
      id: "conversation-a",
      siteId: "chatgpt",
    });
  });

  it("identifies ChatGPT GPT conversations", () => {
    window.history.replaceState({}, "", "/g/gizmo-a/c/conversation-a");

    expect(host.conversation.identity("session-a")).toEqual({
      kind: "identified",
      id: "conversation-a",
      siteId: "chatgpt",
    });
  });

  it("keeps equal host conversation ids distinct across sites", () => {
    window.history.replaceState({}, "", "/c/shared-id");
    const chatGptIdentity = host.conversation.identity("chatgpt-session");
    window.history.replaceState({}, "", "/chat/shared-id");
    const claudeIdentity = claudeHost.conversation.identity("claude-session");

    expect(chatGptIdentity).toMatchObject({ kind: "identified", id: "shared-id" });
    expect(claudeIdentity).toMatchObject({ kind: "identified", id: "shared-id" });
    expect(sameConversationIdentity(chatGptIdentity, claudeIdentity)).toBe(false);
    expect(conversationIdentityKey(chatGptIdentity)).not.toBe(
      conversationIdentityKey(claudeIdentity),
    );
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

  it("subscribes to history navigation without observing DOM changes", async () => {
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const onNavigation = vi.fn();
    const navigation = new EventTarget();
    Object.defineProperty(window, "navigation", { configurable: true, value: navigation });
    const stop = host.conversation.subscribe(onNavigation);

    navigation.dispatchEvent(new Event("navigate"));
    window.history.pushState({}, "", "/c/conversation-b");
    await Promise.resolve();

    expect(onNavigation).toHaveBeenCalledOnce();
    expect(observe).not.toHaveBeenCalled();

    stop();
    navigation.dispatchEvent(new Event("navigate"));
    window.history.pushState({}, "", "/c/conversation-d");
    await Promise.resolve();
    expect(onNavigation).toHaveBeenCalledOnce();
  });
});
