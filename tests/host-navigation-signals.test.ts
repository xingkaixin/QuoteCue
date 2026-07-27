import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let originalPushState: History["pushState"];
let originalReplaceState: History["replaceState"];

beforeEach(() => {
  originalPushState = window.history.pushState;
  originalReplaceState = window.history.replaceState;
});

afterEach(() => {
  window.history.pushState = originalPushState;
  window.history.replaceState = originalReplaceState;
  vi.resetModules();
});

describe("host navigation signals", () => {
  it("shares one reversible history patch across module instances", async () => {
    const firstModule = await import("@/features/chatgpt/chatgpt-host");
    const firstHost = firstModule.createChatGptHost({ document, window });
    const firstCallback = vi.fn();
    const stopFirst = firstHost.conversation.subscribe(firstCallback);

    vi.resetModules();
    const secondModule = await import("@/features/chatgpt/chatgpt-host");
    const secondHost = secondModule.createChatGptHost({ document, window });
    const secondCallback = vi.fn();
    const stopSecond = secondHost.conversation.subscribe(secondCallback);

    window.history.pushState({}, "", "/c/conversation-a");

    expect(firstCallback).toHaveBeenCalledOnce();
    expect(secondCallback).toHaveBeenCalledOnce();

    stopFirst();
    expect(window.history.pushState).not.toBe(originalPushState);
    stopSecond();
    expect(window.history.pushState).toBe(originalPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);
  });

  it("does not overwrite a history method changed by another owner", async () => {
    const { createChatGptHost } = await import("@/features/chatgpt/chatgpt-host");
    const host = createChatGptHost({ document, window });
    const stop = host.conversation.subscribe(vi.fn());
    const thirdPartyPushState = vi.fn();

    window.history.pushState = thirdPartyPushState;
    stop();

    expect(window.history.pushState).toBe(thirdPartyPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);
  });
});
