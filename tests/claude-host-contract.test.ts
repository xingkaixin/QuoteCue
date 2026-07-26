import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import { createClaudeHost } from "@/features/claude/claude-host";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";
import { QUOTECUE_NATIVE_ACTION_SELECTOR } from "@/lib/dom-identity";

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
  it("prepends QuoteCue to the native Reply action row", async () => {
    const onActivate = vi.fn();
    const stop = createClaudeHost({ document, window }).selection.mountAction({
      label: "Add QuoteCue annotation",
      onActivate,
      rect: { bottom: 220, height: 20, left: 100, right: 260, top: 200, width: 160 },
    });
    const { actionRow, replyButton } = appendClaudeSelectionToolbar();
    await nextFrame();

    const action = actionRow.querySelector<HTMLButtonElement>(QUOTECUE_NATIVE_ACTION_SELECTOR);
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
      annotations: () => numberAnnotations([annotation()]),
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => "en",
      onSendAccepted,
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-one"],
    });
    expect(onSendAccepted).toHaveBeenCalledWith([annotation()]);
    expect(fixture.composer.innerText).toContain("[Annotation 1]");
    interceptor.dispose();
  });
});

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

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
