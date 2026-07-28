import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";

import { appendAssistantMessage, appendUserMessage } from "./fixtures/chatgpt-host";

const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"][data-message-id]';

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("host mutation signals", () => {
  it("does not rescan the document when an unrelated element is removed", async () => {
    installMessages(100);
    const host = createChatGptHost({ document, window });
    const stop = host.selection.observeInvalidation(() => undefined);
    const counters = installCounters();
    const unrelated = Array.from({ length: 100 }, () => {
      const node = document.createElement("div");
      node.className = "host-popover";
      document.body.append(node);
      return node;
    });

    for (const node of unrelated) {
      node.remove();
    }
    await flushMutations();

    expect(counters.messageScans()).toBe(0);
    expect(counters.disconnects()).toBe(0);
    expect(counters.observes()).toBe(0);
    stop();
  });

  it("rebuilds message observation when an observed message root detaches", async () => {
    const { messages } = installMessages(100);
    const host = createChatGptHost({ document, window });
    const stop = host.selection.observeInvalidation(() => undefined);
    const counters = installCounters();

    messages[0]?.remove();
    await flushMutations();

    expect(counters.messageScans()).toBeGreaterThan(0);
    expect(counters.disconnects()).toBe(1);
    stop();
  });

  it("rebuilds when an ancestor container holding message roots is removed", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const nested = appendAssistantMessage("nested-message", "nested answer");
    container.append(nested);
    installMessages(10);
    const host = createChatGptHost({ document, window });
    const stop = host.selection.observeInvalidation(() => undefined);
    const counters = installCounters();

    container.remove();
    await flushMutations();

    expect(counters.disconnects()).toBe(1);
    stop();
  });

  it("still reports content changes from a replaced message root", async () => {
    const { messages } = installMessages(3);
    const host = createChatGptHost({ document, window });
    const invalidations: string[] = [];
    const stop = host.selection.observeInvalidation((invalidation) => {
      invalidations.push(invalidation.reason);
    });

    const stale = messages[0];
    stale?.remove();
    const replacement = appendAssistantMessage("message-0", "replaced answer");
    await flushMutations();
    invalidations.length = 0;

    const text = replacement.firstChild;
    if (text) {
      text.textContent = "streamed answer";
    }
    await flushMutations();

    expect(invalidations).toContain("content");
    stop();
  });

  it("handles a batch that adds and removes nested message roots together", async () => {
    const { messages } = installMessages(5);
    const host = createChatGptHost({ document, window });
    const stop = host.selection.observeInvalidation(() => undefined);
    const counters = installCounters();

    messages[0]?.remove();
    appendAssistantMessage("message-added", "new answer");
    appendUserMessage("user-added", "new question");
    await flushMutations();

    expect(counters.disconnects()).toBe(1);
    stop();
  });
});

function installMessages(count: number) {
  const messages = Array.from({ length: count }, (_, index) =>
    appendAssistantMessage(`message-${index}`, `answer ${index}`),
  );
  appendUserMessage("user-0", "question");
  return { messages };
}

function installCounters() {
  const querySelectorAll = vi.spyOn(document, "querySelectorAll");
  const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
  const observe = vi.spyOn(MutationObserver.prototype, "observe");
  return {
    disconnects: () => disconnect.mock.calls.length,
    messageScans: () =>
      querySelectorAll.mock.calls.filter(([selector]) =>
        [USER_MESSAGE_SELECTOR, '[data-message-author-role="assistant"][data-message-id]'].includes(
          String(selector),
        ),
      ).length,
    observes: () => observe.mock.calls.length,
  };
}

function flushMutations() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
