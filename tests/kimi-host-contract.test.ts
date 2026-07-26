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
  vi.unstubAllGlobals();
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
      annotations: () => [annotation()],
      host,
      locale: () => "zh-CN",
      onSendAccepted,
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-one"],
    });
    expect(onSendAccepted).toHaveBeenCalledWith([annotation()]);
    expect(fixture.composer.innerText).toContain("[批注 1]");
    interceptor.dispose();
  });

  it("takes over the editor through a synthetic paste before touching execCommand", async () => {
    const fixture = installKimiHostFixture("");
    installSyntheticPasteSupport();
    fixture.composer.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
      queueMicrotask(() => {
        fixture.composer.textContent = text;
        fixture.sendControl.classList.remove("disabled");
      });
    });
    fixture.sendControl.addEventListener("click", () => {
      appendKimiUserMessage("user-two", fixture.composer.innerText);
    });
    const interceptor = registerSendInterceptor({
      annotations: () => [annotation()],
      host: createKimiHost({ document, window }),
      locale: () => "zh-CN",
      onSendAccepted: vi.fn(),
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-one"],
    });
    expect(document.execCommand).not.toHaveBeenCalled();
    expect(fixture.composer.innerText).toContain("[批注 1]");
    interceptor.dispose();
  });

  it("accepts Lexical whitespace reflow without weakening non-whitespace matching", async () => {
    const fixture = installKimiHostFixture("");
    fixture.sendControl.classList.remove("disabled");
    vi.mocked(document.execCommand).mockImplementation((command, _showUi, value) => {
      if (command === "insertText") {
        fixture.composer.textContent = String(value).replaceAll("\n", "");
      }
      return true;
    });
    fixture.sendControl.addEventListener("click", () => {
      appendKimiUserMessage("user-two", fixture.composer.innerText);
    });
    const interceptor = registerSendInterceptor({
      annotations: () => [annotation()],
      host: createKimiHost({ document, window }),
      locale: () => "zh-CN",
      onSendAccepted: vi.fn(),
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-one"],
    });
    expect(fixture.composer.innerText).toContain("回答：[批注 1]选中文本：");
    interceptor.dispose();
  });

  it("accepts an unidentified optimistic user message after an unidentified predecessor", async () => {
    const fixture = installKimiHostFixture("");
    appendKimiUserMessage(undefined, "Previous optimistic message");
    const host = createKimiHost({ document, window });
    fixture.composer.addEventListener("input", () => {
      fixture.sendControl.classList.remove("disabled");
    });
    fixture.sendControl.addEventListener("click", () => {
      appendKimiUserMessage(undefined, fixture.composer.innerText);
    });
    const interceptor = registerSendInterceptor({
      annotations: () => [annotation()],
      host,
      locale: () => "zh-CN",
      onSendAccepted: vi.fn(),
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-one"],
    });
    interceptor.dispose();
  });
});

function installSyntheticPasteSupport() {
  class FakeDataTransfer {
    private store = new Map<string, string>();
    setData(type: string, value: string) {
      this.store.set(type, value);
    }
    getData(type: string) {
      return this.store.get(type) ?? "";
    }
  }
  class FakeClipboardEvent extends Event {
    clipboardData: FakeDataTransfer | null;
    constructor(type: string, init?: EventInit & { clipboardData?: FakeDataTransfer }) {
      super(type, init);
      this.clipboardData = init?.clipboardData ?? null;
    }
  }
  vi.stubGlobal("DataTransfer", FakeDataTransfer);
  vi.stubGlobal("ClipboardEvent", FakeClipboardEvent);
}

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
