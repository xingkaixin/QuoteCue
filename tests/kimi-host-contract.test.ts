import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";
import { createKimiHost } from "@/features/kimi/kimi-host";

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
    const onSendConfirmed = vi.fn();
    const interceptor = registerSendInterceptor({
      annotations: () => numberAnnotations([annotation()]),
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => "zh-CN",
      onSendConfirmed,
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-one"],
    });
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation()]);
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
      annotations: () => numberAnnotations([annotation()]),
      compilePrompt: compileAnnotatedPrompt,
      host: createKimiHost({ document, window }),
      locale: () => "zh-CN",
      onSendConfirmed: vi.fn(),
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-one"],
    });
    expect(document.execCommand).not.toHaveBeenCalled();
    expect(fixture.composer.innerText).toContain("[批注 1]");
    interceptor.dispose();
  });

  it("confirms Lexical whitespace reflow without weakening non-whitespace matching", async () => {
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
      annotations: () => numberAnnotations([annotation()]),
      compilePrompt: compileAnnotatedPrompt,
      host: createKimiHost({ document, window }),
      locale: () => "zh-CN",
      onSendConfirmed: vi.fn(),
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-one"],
    });
    expect(fixture.composer.innerText).toContain("回答：[批注 1]选中文本：");
    interceptor.dispose();
  });

  it("confirms an optimistic user message without a host id after another such message", async () => {
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
      annotations: () => numberAnnotations([annotation()]),
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => "zh-CN",
      onSendConfirmed: vi.fn(),
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
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

function annotation(): DraftAnnotation {
  return {
    id: "annotation-one",
    anchor: {
      end: 16,
      format: "exact",
      messageId: "assistant-one",
      prefix: "A ",
      quote: "focused answer",
      start: 2,
      suffix: " for the contract fixture.",
    },
    comment: "解释权衡",
  };
}
