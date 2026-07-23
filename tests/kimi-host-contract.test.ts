import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { hostForHostname } from "@/features/host/active-host";
import { registerSendInterceptor } from "@/features/host/register-send-interceptor";
import { createKimiHost, kimiHost } from "@/features/kimi/kimi-host";

import { appendKimiUserMessage, installKimiHostFixture } from "./fixtures/kimi-host";

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

describe("Kimi host contract", () => {
  it("registers Kimi and isolates drafts by conversation path", () => {
    const host = createKimiHost({ document, window });
    window.history.replaceState({}, "", "/chat/conversation-one");

    expect(hostForHostname("www.kimi.com")).toBe(kimiHost);
    expect(host.conversation.key("new-chat:tab-a")).toBe("conversation-one");
    expect(host.selection.actionMode).toBe("overlay");

    window.history.replaceState({}, "", "/settings");
    expect(host.conversation.key("new-chat:tab-a")).toBe("new-chat:tab-a");
  });

  it("anchors assistant selections to the archer message id", () => {
    const fixture = installKimiHostFixture();
    selectNodeContents(fixture.assistantMessage.querySelector("strong")?.firstChild);

    const result = createKimiHost({ document, window }).selection.capture();

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.value.anchor).toMatchObject({
        messageId: "assistant-one",
        quote: "focused answer",
      });
    }
  });

  it("finds the editor surface and treats the disabled send control as unavailable", () => {
    const fixture = installKimiHostFixture("");
    const host = createKimiHost({ document, window });
    const layout = host.layout.current();

    expect(layout.status).toBe("available");
    if (layout.status === "available") {
      expect(layout.value.surface).toBe(fixture.surface);
      expect(layout.value.action).toBe(fixture.sendControl);
    }
    expect(host.composer.isButtonAvailable(fixture.sendControl)).toBe(false);
    fixture.sendControl.classList.remove("disabled");
    expect(host.composer.isButtonAvailable(fixture.sendControl)).toBe(true);
  });

  it("takes over an empty editor and confirms against user content only", async () => {
    const fixture = installKimiHostFixture("");
    const host = createKimiHost({ document, window });
    fixture.composer.addEventListener("input", () => {
      fixture.sendControl.classList.toggle(
        "disabled",
        fixture.composer.innerText.trim().length === 0,
      );
    });
    fixture.sendControl.addEventListener("click", () => {
      if (!fixture.sendControl.classList.contains("disabled")) {
        appendKimiUserMessage("user-two", fixture.composer.innerText);
      }
    });
    const onSendAccepted = vi.fn();
    const interceptor = registerSendInterceptor({
      draft: () => ({ annotations: [annotation()], revision: 1 }),
      host,
      locale: () => "zh-CN",
      onSendAccepted,
    });

    await expect(interceptor.submit()).resolves.toEqual({ status: "accepted", revision: 1 });
    expect(onSendAccepted).toHaveBeenCalledWith(1);
    expect(fixture.composer.innerText).toContain("[批注 1]");
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
      messageId: "assistant-one",
      prefix: "A ",
      quote: "focused answer",
      start: 2,
      suffix: " for the contract fixture.",
    },
    comment: "解释权衡",
  };
}
