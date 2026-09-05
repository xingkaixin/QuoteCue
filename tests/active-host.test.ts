import { afterEach, describe, expect, it } from "vitest";

import { resolveActiveHost } from "@/features/host/active-host";

afterEach(() => window.history.replaceState({}, "", "/"));

describe("active host selection", () => {
  it.each([
    { hostname: "chatgpt.com", siteId: "chatgpt", path: "/c/conversation-one" },
    { hostname: "claude.ai", siteId: "claude", path: "/chat/conversation-one" },
    { hostname: "chat.deepseek.com", siteId: "deepseek", path: "/a/chat/s/conversation-one" },
    { hostname: "www.kimi.com", siteId: "kimi", path: "/chat/conversation-one" },
  ])("creates the registered $hostname host", ({ hostname, siteId, path }) => {
    window.history.replaceState({}, "", path);
    const active = resolveActiveHost(hostname, { document, window });

    expect(active?.site.hostname).toBe(hostname);
    expect(active?.host.conversation.identity("session-one")).toEqual({
      kind: "identified",
      siteId,
      id: "conversation-one",
    });
  });

  it("rejects unregistered hostnames", () => {
    expect(resolveActiveHost("example.com", { document, window })).toBeNull();
  });
});
