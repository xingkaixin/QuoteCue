import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";

let navigationDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  navigationDescriptor = Object.getOwnPropertyDescriptor(window, "navigation");
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
  if (navigationDescriptor) {
    Object.defineProperty(window, "navigation", navigationDescriptor);
  } else {
    Reflect.deleteProperty(window, "navigation");
  }
});

describe("host navigation signals", () => {
  it("reads the committed conversation after a Navigation API entry change", () => {
    const navigation = installNavigationSource();
    const host = createChatGptHost({ document, window });
    const identities = vi.fn(() => host.conversation.identity("session"));
    const stop = host.conversation.subscribe(identities);

    window.history.pushState({}, "", "/c/conversation-a");
    navigation.dispatchEvent(new Event("currententrychange"));

    expect(identities).toHaveReturnedWith({
      kind: "identified",
      id: "conversation-a",
      siteId: "chatgpt",
    });
    stop();
  });

  it("does not notify before a delayed navigation commits", () => {
    const navigation = installNavigationSource();
    const host = createChatGptHost({ document, window });
    const identities = vi.fn(() => host.conversation.identity("session"));
    const stop = host.conversation.subscribe(identities);

    navigation.dispatchEvent(new Event("navigate"));
    expect(identities).not.toHaveBeenCalled();

    window.history.pushState({}, "", "/c/conversation-a");
    navigation.dispatchEvent(new Event("currententrychange"));

    expect(identities).toHaveReturnedWith({
      kind: "identified",
      id: "conversation-a",
      siteId: "chatgpt",
    });
    stop();
  });

  it("keeps Navigation API subscriptions independent", () => {
    const navigation = installNavigationSource();
    const host = createChatGptHost({ document, window });
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const stopFirst = host.conversation.subscribe(firstCallback);
    const stopSecond = host.conversation.subscribe(secondCallback);

    navigation.dispatchEvent(new Event("currententrychange"));
    expect(firstCallback).toHaveBeenCalledOnce();
    expect(secondCallback).toHaveBeenCalledOnce();

    stopFirst();
    navigation.dispatchEvent(new Event("currententrychange"));
    expect(firstCallback).toHaveBeenCalledOnce();
    expect(secondCallback).toHaveBeenCalledTimes(2);

    stopSecond();
  });

  it("polls URL changes when the Navigation API is unavailable", async () => {
    vi.useFakeTimers();
    Reflect.deleteProperty(window, "navigation");
    const host = createChatGptHost({ document, window });
    const callback = vi.fn();
    const stop = host.conversation.subscribe(callback);

    window.history.pushState({}, "", "/c/conversation-a");
    await vi.advanceTimersByTimeAsync(999);
    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledOnce();

    stop();
    window.history.pushState({}, "", "/c/conversation-b");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(callback).toHaveBeenCalledOnce();
  });
});

function installNavigationSource() {
  const navigation = new EventTarget();
  Object.defineProperty(window, "navigation", { configurable: true, value: navigation });
  return navigation;
}
