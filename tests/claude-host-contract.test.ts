import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { claudeHost, createClaudeHost } from "@/features/claude/claude-host";
import { hostForHostname } from "@/features/host/active-host";
import { registerSendInterceptor } from "@/features/host/register-send-interceptor";

import {
  appendClaudeSelectionToolbar,
  appendClaudeUserMessage,
  installClaudeHostFixture,
  replaceVoiceWithSend,
} from "./fixtures/claude-host";

beforeEach(() => {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => false),
  });
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Claude host contract", () => {
  it("registers Claude and isolates drafts by conversation path", () => {
    const host = createClaudeHost({ document, window });
    window.history.replaceState({}, "", "/chat/conversation-one");

    expect(hostForHostname("claude.ai")).toBe(claudeHost);
    expect(host.conversation.key("new-chat:tab-a")).toBe("conversation-one");

    window.history.replaceState({}, "", "/new");
    expect(host.conversation.key("new-chat:tab-a")).toBe("new-chat:tab-a");
  });

  it("anchors only assistant selections to the virtual message index", () => {
    const fixture = installClaudeHostFixture();
    selectNodeContents(fixture.assistantMessage.querySelector("strong")?.firstChild);
    const host = createClaudeHost({ document, window });
    const result = host.selection.capture();

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.value.anchor).toMatchObject({
        messageId: "1",
        quote: "focused answer",
      });
    }

    selectNodeContents(document.querySelector('[data-testid="user-message"]')?.firstChild);
    expect(host.selection.capture()).toEqual({
      reason: "assistant-message-unavailable",
      status: "unavailable",
    });
  });

  it("prepends QuoteCue to the native Reply action row", async () => {
    const onActivate = vi.fn();
    const stop = createClaudeHost({ document, window }).selection.mountAction({
      label: "Add QuoteCue annotation",
      onActivate,
      rect: { bottom: 220, height: 20, left: 100, right: 260, top: 200, width: 160 },
    });
    const { actionRow, replyButton } = appendClaudeSelectionToolbar();
    await Promise.resolve();

    const action = actionRow.querySelector<HTMLButtonElement>("[data-quotecue-native-action]");
    expect(actionRow.firstElementChild).toBe(action);
    expect(action?.nextElementSibling).toBe(replyButton);
    expect(action?.className).toBe(replyButton.className);
    expect(action?.textContent).toBe("QuoteCue");

    action?.click();
    expect(onActivate).toHaveBeenCalledOnce();
    stop();
  });

  it("uses the voice slot for layout and waits for the send button after composing", async () => {
    const fixture = installClaudeHostFixture("");
    const host = createClaudeHost({ document, window });
    const layout = host.layout.current();
    expect(layout.status).toBe("available");
    if (layout.status === "available") {
      expect(layout.value.surface).toBe(fixture.surface);
      expect(layout.value.action).toBe(fixture.voiceButton);
    }

    fixture.composer.addEventListener("input", () => {
      if (!document.querySelector('button[aria-label="Send message"]')) {
        replaceVoiceWithSend((text) => appendClaudeUserMessage(2, text));
      }
    });
    const onSendAccepted = vi.fn();
    const interceptor = registerSendInterceptor({
      draft: () => ({ annotations: [annotation()], revision: 1 }),
      host,
      locale: () => "en",
      onSendAccepted,
    });

    await expect(interceptor.submit()).resolves.toEqual({ status: "accepted", revision: 1 });
    expect(onSendAccepted).toHaveBeenCalledWith(1);
    expect(fixture.composer.innerText).toContain("[Annotation 1]");
    interceptor.dispose();
  });
});

function selectNodeContents(node: ChildNode | null | undefined) {
  if (!node) {
    throw new Error("Expected a text node");
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

function annotation(): DraftAnnotation {
  return {
    id: "annotation-one",
    anchor: {
      end: 16,
      messageId: "1",
      prefix: "A ",
      quote: "focused answer",
      start: 2,
      suffix: " for the contract fixture.",
    },
    comment: "Explain the tradeoff",
  };
}
