import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { createClaudeHost } from "@/features/claude/claude-host";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";
import { QUOTECUE_NATIVE_ACTION_SELECTOR } from "@/lib/dom-identity";

import {
  appendClaudeSelectionToolbar,
  appendClaudeUserMessage,
  enableClaudeSend,
  installClaudeHostFixture,
  setClaudeComposerText,
} from "./fixtures/claude-host";
import { requiredNativeAction } from "./fixtures/fixture-utils";

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
  it("keeps the host action stable across repeated layout reads", async () => {
    const fixture = installClaudeHostFixture("hello");
    const host = createClaudeHost({ document, window });
    const release = host.layout.reserveAnnotationRow(40);
    const readings = Array.from({ length: 3 }, () => {
      const layout = host.layout.current();
      return {
        left: layout.status === "available" ? layout.value.send.left : null,
        send: fixture.sendButton.style.visibility,
        voice: fixture.voiceButton.style.visibility,
      };
    });
    expect(readings).toEqual(Array(3).fill({ left: 828, send: "hidden", voice: "" }));
    setClaudeComposerText("");
    await vi.waitFor(() => expect(fixture.voiceButton.style.visibility).toBe("hidden"));
    for (let index = 0; index < 3; index++) {
      expect(host.layout.current()).toMatchObject({ value: { send: { left: 828 } } });
      expect(fixture.voiceButton.style.visibility).toBe("hidden");
      expect(fixture.sendButton.style.visibility).toBe("");
    }
    release();
    expect(fixture.voiceButton.style.visibility).toBe("");
  });

  it("prepends QuoteCue to the localized narrow native action row", async () => {
    const onActivate = vi.fn();
    const stop = requiredNativeAction(createClaudeHost({ document, window })).mount({
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

  it("uses the stable send control while ignoring localized voice and stop controls", async () => {
    const fixture = installClaudeHostFixture("");
    const host = createClaudeHost({ document, window });
    const layout = host.layout.current();
    expect(layout.status).toBe("available");

    fixture.composer.addEventListener("input", () => {
      if (fixture.sendButton.disabled) {
        enableClaudeSend((text) => appendClaudeUserMessage(2, text));
      }
    });
    const onSendConfirmed = vi.fn();
    const interceptor = registerSendInterceptor({
      getSendInput: () => ({
        annotations: numberAnnotations([annotation()]),
        conversationIdentity: {
          kind: "identified",
          id: "conversation-test",
          siteId: "claude",
        },
        locale: "en",
      }),
      host,
      onSendConfirmed,
    });

    interceptor.submit();
    await vi.waitFor(() =>
      expect(onSendConfirmed).toHaveBeenCalledWith([annotation()], {
        kind: "identified",
        id: "conversation-test",
        siteId: "claude",
      }),
    );
    expect(fixture.composer.innerText).toContain("[Annotation 1]");
    expect(fixture.voiceButton.disabled).toBe(false);
    interceptor.dispose();
  });

  it("tracks Claude's visible composer action while annotations are active", async () => {
    const fixture = installClaudeHostFixture("");
    const host = createClaudeHost({ document, window });
    const release = host.layout.reserveAnnotationRow(40);
    const refresh = vi.fn();
    const stop = host.layout.subscribe(refresh);
    refresh.mockClear();

    expect(fixture.voiceButton.style.visibility).toBe("hidden");
    expect(fixture.sendButton.style.visibility).toBe("");

    setClaudeComposerText("Japanese input");

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(fixture.voiceButton.classList).toContain("claude-fixture-hidden");
    expect(fixture.voiceButton.style.visibility).toBe("");
    expect(fixture.sendButton.style.visibility).toBe("hidden");

    release();
    stop();
    expect(fixture.sendButton.style.visibility).toBe("");
  });
});

function annotation(): DraftAnnotation {
  return {
    id: "annotation-one",
    anchor: {
      end: 16,
      format: "exact",
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
