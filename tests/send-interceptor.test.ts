import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { numberAnnotations } from "@/features/annotations/annotation-projection";
import type { ConversationIdentity } from "@/features/conversation/conversation-identity";
import {
  MAX_COMPILED_PROMPT_LENGTH,
  MAX_SELECTED_TEXT_LENGTH,
} from "@/features/annotations/draft-capacity";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";

import {
  appendComposer as installComposer,
  appendSendButton as installSendButton,
  appendUserMessage as installUserMessage,
} from "./fixtures/chatgpt-host";
import { createFakeHost, fakeComposerSnapshot } from "./fixtures/fake-host";
import { annotation, createInterceptor } from "./fixtures/send-interceptor";

beforeEach(() => {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => false),
  });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("registerSendInterceptor", () => {
  it("submits annotations without adding an empty supplemental question", async () => {
    const composer = installComposer();
    const onSendConfirmed = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed);
    interceptor.submit();
    let replayedText = "";
    const onNativeSend = vi.fn(() => {
      replayedText = composer.textContent ?? "";
      composer.replaceChildren();
      installUserMessage("user-message-1", replayedText);
    });
    installSendButton(onNativeSend);

    await vi.waitFor(() => expect(onSendConfirmed).toHaveBeenCalledOnce());

    expect(replayedText).toContain("[Annotation 1]");
    expect(replayedText).not.toContain("[Supplemental question]");
    expect(onNativeSend).toHaveBeenCalledOnce();
    expect(onSendConfirmed).toHaveBeenCalledOnce();
    interceptor.dispose();
  });

  it("confirms the annotation snapshot compiled before later draft changes", async () => {
    const composer = installComposer("original question");
    const onSendConfirmed = vi.fn();
    let currentAnnotations = [annotation];
    const getSendInput = vi.fn(() => ({
      annotations: numberAnnotations(currentAnnotations),
      conversationIdentity: {
        kind: "identified" as const,
        id: "conversation-test",
        siteId: "chatgpt" as const,
      },
      locale: "en" as const,
    }));
    const interceptor = registerSendInterceptor({
      getSendInput,
      host: createChatGptHost({ document, window }),
      onSendConfirmed,
    });
    installSendButton(() => {
      const compiledPrompt = composer.textContent ?? "";
      currentAnnotations = [{ ...annotation, comment: "edited while awaiting confirmation" }];
      composer.replaceChildren();
      installUserMessage("user-message-1", compiledPrompt);
    });

    interceptor.submit();
    await vi.waitFor(() =>
      expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
        kind: "identified",
        id: "conversation-test",
        siteId: "chatgpt",
      }),
    );
    expect(getSendInput).toHaveBeenCalledOnce();
    interceptor.dispose();
  });

  it("restores the original composer when the send button never appears", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { onStateChange });

    interceptor.submit();
    await vi.advanceTimersByTimeAsync(2_001);

    expect(onStateChange).toHaveBeenLastCalledWith({
      status: "failed",
      reason: "send-unavailable",
    });
    expect(composer.textContent).toBe("original question");
    interceptor.dispose();
  });

  it("does not overwrite user edits while rolling back a failed attempt", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { onStateChange });

    interceptor.submit();
    composer.textContent = "user edited after failure";
    await vi.advanceTimersByTimeAsync(2_001);

    expect(onStateChange).toHaveBeenLastCalledWith({
      status: "failed",
      reason: "send-unavailable",
    });
    expect(composer.textContent).toBe("user edited after failure");
    interceptor.dispose();
  });

  it("ignores repeated submit calls without recompiling", async () => {
    const composer = installComposer("original question");
    const interceptor = createInterceptor();

    interceptor.submit();
    interceptor.submit();
    interceptor.submit();

    expect(composer.textContent?.match(/\[Annotation 1\]/g)).toHaveLength(1);

    interceptor.dispose();
    await vi.waitFor(() => expect(composer.textContent).toBe("original question"));
  });

  it("allows another conversation to send while the first awaits confirmation", () => {
    const host = createFakeHost();
    let identity: ConversationIdentity = {
      kind: "identified",
      id: "conversation-a",
      siteId: "chatgpt",
    };
    const submit = vi
      .spyOn(host.composer, "submit")
      .mockImplementation(() => new Promise(() => undefined));
    const interceptor = createInterceptor(undefined, {
      conversationIdentity: () => identity,
      host,
    });

    interceptor.submit();
    identity = { kind: "identified", id: "conversation-b", siteId: "chatgpt" };
    const decision = host.controls.emitSubmitIntent({ isSendAvailable: true });

    expect(decision).toBe("claim");
    expect(submit).toHaveBeenCalledTimes(2);
    interceptor.dispose();
    expect(submit.mock.calls.every(([options]) => options.signal.aborted)).toBe(true);
  });

  it("retries failed attempts without nesting the compiled prompt", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { onStateChange });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      interceptor.submit();
      expect(composer.textContent?.match(/\[Annotation 1\]/g)).toHaveLength(1);
      expect(composer.textContent?.match(/\[Supplemental question\]/g)).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2_001);
      expect(onStateChange).toHaveBeenLastCalledWith({
        status: "failed",
        reason: "send-unavailable",
      });
      expect(composer.textContent).toBe("original question");
    }

    interceptor.dispose();
  });

  it.each([
    { composerText: "", expectedQuestion: "original question", source: "retained" },
    {
      composerText: "replacement question",
      expectedQuestion: "replacement question",
      source: "newly entered",
    },
  ])(
    "uses the $source question after consecutive failed retries",
    async ({ composerText, expectedQuestion }) => {
      vi.useFakeTimers();
      const composer = installComposer("original question");
      const onSendConfirmed = vi.fn();
      const onStateChange = vi.fn();
      const interceptor = createInterceptor(onSendConfirmed, { onStateChange });
      const sentPrompts: string[] = [];
      installSendButton(() => {
        const compiledPrompt = composer.textContent ?? "";
        sentPrompts.push(compiledPrompt);
        composer.replaceChildren();
        if (sentPrompts.length === 3) {
          installUserMessage("retried-user-message", compiledPrompt);
        }
      });

      for (let attempt = 0; attempt < 2; attempt += 1) {
        interceptor.submit();
        await vi.advanceTimersByTimeAsync(15_001);
        expect(onStateChange).toHaveBeenLastCalledWith({
          status: "failed",
          reason: "confirmation-timeout",
        });
        expect(composer.textContent).toBe("");
        expect(sentPrompts[attempt]).toContain("[Supplemental question]\noriginal question");
      }

      composer.textContent = composerText;
      interceptor.submit();
      await vi.advanceTimersByTimeAsync(17);

      expect(onSendConfirmed).toHaveBeenCalledOnce();
      expect(onStateChange).toHaveBeenLastCalledWith({ status: "idle" });
      expect(sentPrompts[2]).toContain(`[Supplemental question]\n${expectedQuestion}`);
      expect(sentPrompts[2]?.match(/\[Annotation 1\]/g)).toHaveLength(1);
      if (composerText) {
        expect(sentPrompts[2]).not.toContain("original question");
      }
      interceptor.dispose();
    },
  );

  it("restores an owned composer when disposed", async () => {
    const composer = installComposer("original question");
    const interceptor = createInterceptor();

    interceptor.submit();
    interceptor.dispose();

    await vi.waitFor(() => expect(composer.textContent).toBe("original question"));
  });

  it("settles a failed attempt when the host rejects composer replacement", async () => {
    const host = createFakeHost();
    vi.spyOn(host.composer, "snapshot").mockReturnValue({
      status: "available",
      value: fakeComposerSnapshot("original question"),
    });
    const submit = vi.spyOn(host.composer, "submit").mockResolvedValue({
      reason: "send-unavailable",
      status: "unavailable",
    });
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { host, onStateChange });

    expect(() => interceptor.submit()).not.toThrow();

    await vi.waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({
        status: "failed",
        reason: "send-unavailable",
      }),
    );
    interceptor.submit();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    interceptor.dispose();
  });

  it("settles a failed attempt when the host submission rejects", async () => {
    const host = createFakeHost();
    const error = new Error("host submit failed");
    vi.spyOn(host.composer, "submit").mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { host, onStateChange });

    interceptor.submit();
    await vi.waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({
        status: "failed",
        reason: "send-unavailable",
      }),
    );
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", reason: "send-unavailable" }),
    );
    expect(consoleError).toHaveBeenCalledWith("[QuoteCue] Failed to replay annotated send", error);
    interceptor.dispose();
  });

  it("reports composer access failure without creating a send attempt", async () => {
    const host = createFakeHost();
    vi.spyOn(host.composer, "snapshot").mockReturnValue({
      status: "unavailable",
    });
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { host, onStateChange });

    interceptor.submit();
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: "failed",
      reason: "composer-unavailable",
    });
    interceptor.dispose();
  });

  it("settles a confirmed attempt when its completion callback throws", async () => {
    const composer = installComposer("original question");
    const error = new Error("confirmation callback failed");
    const onSendConfirmed = vi.fn(() => {
      throw error;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed, { onStateChange });
    installSendButton(() => {
      const compiledPrompt = composer.textContent ?? "";
      composer.replaceChildren();
      installUserMessage("confirmed-user-message", compiledPrompt);
    });

    interceptor.submit();
    await vi.waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith({ status: "idle" }));
    expect(onStateChange.mock.calls.map(([state]) => state)).toEqual([
      { status: "idle" },
      { status: "sending" },
      { status: "idle" },
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      "[QuoteCue] Failed to apply confirmed annotations",
      error,
    );
    interceptor.dispose();
  });

  it("declines a native send intent when there are no annotations", () => {
    const host = createFakeHost();
    host.elements.composer.textContent = "original question";
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { annotations: [], host, onStateChange });
    onStateChange.mockClear();
    const decision = host.controls.emitSubmitIntent({ isSendAvailable: true });

    expect(decision).toBe("pass-through");
    expect(host.elements.composer.textContent).toBe("original question");
    expect(onStateChange).not.toHaveBeenCalled();
    interceptor.dispose();
  });

  it("declines a native send intent when the send control is unavailable", () => {
    const host = createFakeHost();
    vi.spyOn(host.composer, "snapshot").mockReturnValue({
      status: "available",
      value: fakeComposerSnapshot("original question"),
    });
    const submit = vi.spyOn(host.composer, "submit");
    const interceptor = createInterceptor(undefined, { host });
    const decision = host.controls.emitSubmitIntent({ isSendAvailable: false });

    expect(decision).toBe("pass-through");
    expect(submit).not.toHaveBeenCalled();
    interceptor.dispose();
  });

  it("blocks a native send when the compiled follow-up exceeds capacity", () => {
    const host = createFakeHost();
    host.elements.composer.textContent = "original question";
    const submit = vi.spyOn(host.composer, "submit");
    const onStateChange = vi.fn();
    const oversizedAnnotation = {
      ...annotation,
      anchor: { ...annotation.anchor, quote: "x".repeat(MAX_COMPILED_PROMPT_LENGTH + 1) },
    };
    const interceptor = createInterceptor(undefined, {
      annotations: [oversizedAnnotation],
      host,
      onStateChange,
    });
    const decision = host.controls.emitSubmitIntent({ isSendAvailable: true });

    expect(decision).toBe("claim");
    expect(submit).not.toHaveBeenCalled();
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: "failed",
      reason: "prompt-too-long",
    });
    interceptor.dispose();
  });

  it("takes over a native send intent when the composer is empty", () => {
    const host = createFakeHost();
    const submit = vi.spyOn(host.composer, "submit");
    const interceptor = createInterceptor(undefined, { host });
    const decision = host.controls.emitSubmitIntent({ isSendAvailable: false });

    expect(decision).toBe("claim");
    expect(submit).toHaveBeenCalledOnce();
    interceptor.dispose();
  });

  it("retries a host replacement failure with the original question", async () => {
    const host = createFakeHost();
    vi.spyOn(host.composer, "snapshot").mockReturnValue({
      status: "available",
      value: fakeComposerSnapshot("original question"),
    });
    const submit = vi
      .spyOn(host.composer, "submit")
      .mockResolvedValueOnce({ reason: "send-unavailable", status: "unavailable" })
      .mockResolvedValueOnce({ status: "available", value: "confirmed" });
    const onSendConfirmed = vi.fn();
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed, { host, onStateChange });

    interceptor.submit();
    await vi.waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({
        status: "failed",
        reason: "send-unavailable",
      }),
    );

    interceptor.submit();
    await vi.waitFor(() => expect(onSendConfirmed).toHaveBeenCalledOnce());
    const retriedText = submit.mock.calls[1]?.[0].text ?? "";
    expect(retriedText).toContain("[Supplemental question]\noriginal question");
    expect(retriedText.match(/\[Annotation 1\]/g)).toHaveLength(1);
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
      kind: "identified",
      id: "conversation-test",
      siteId: "chatgpt",
    });
    expect(onStateChange).toHaveBeenLastCalledWith({ status: "idle" });
    interceptor.dispose();
  });

  it("keeps the original question after an oversized retry", async () => {
    const host = createFakeHost();
    const identity = {
      kind: "identified" as const,
      id: "conversation-test",
      siteId: "chatgpt" as const,
    };
    let annotations = [annotation];
    vi.spyOn(host.composer, "snapshot")
      .mockReturnValueOnce({
        status: "available",
        value: fakeComposerSnapshot("original question"),
      })
      .mockReturnValue({ status: "available", value: fakeComposerSnapshot("") });
    const submit = vi
      .spyOn(host.composer, "submit")
      .mockResolvedValueOnce({ reason: "confirmation-timeout", status: "unavailable" })
      .mockResolvedValueOnce({ status: "available", value: "confirmed" });
    const onSendConfirmed = vi.fn();
    const onStateChange = vi.fn();
    const interceptor = registerSendInterceptor({
      getSendInput: () => ({
        annotations: numberAnnotations(annotations),
        conversationIdentity: identity,
        locale: "en",
      }),
      host,
      onChange: onStateChange,
      onSendConfirmed,
    });

    interceptor.submit();
    await vi.waitFor(() =>
      expect(interceptor.state(identity)).toEqual({
        status: "failed",
        reason: "confirmation-timeout",
      }),
    );

    annotations = Array.from({ length: 5 }, (_, index) => ({
      ...annotation,
      id: `oversized-${index}`,
      anchor: {
        ...annotation.anchor,
        messageId: `oversized-message-${index}`,
        quote: "x".repeat(MAX_SELECTED_TEXT_LENGTH),
      },
    }));
    interceptor.submit();
    expect(interceptor.state(identity)).toEqual({
      status: "failed",
      reason: "prompt-too-long",
    });
    expect(submit).toHaveBeenCalledOnce();

    annotations = [annotation];
    interceptor.submit();
    await vi.waitFor(() => expect(onSendConfirmed).toHaveBeenCalledOnce());

    const retry = submit.mock.calls[1]?.[0];
    expect(retry?.restoreText).toBe("original question");
    expect(retry?.text).toContain("[Supplemental question]\noriginal question");
    interceptor.dispose();
  });

  it("forgets failed input after the draft is cleared", async () => {
    const host = createFakeHost();
    const identity = {
      kind: "identified" as const,
      id: "conversation-test",
      siteId: "chatgpt" as const,
    };
    let annotations = [annotation];
    host.elements.composer.textContent = "obsolete question";
    const submit = vi
      .spyOn(host.composer, "submit")
      .mockResolvedValueOnce({ reason: "send-unavailable", status: "unavailable" })
      .mockResolvedValueOnce({ status: "available", value: "confirmed" });
    const onSendConfirmed = vi.fn();
    const onStateChange = vi.fn();
    const interceptor = registerSendInterceptor({
      getSendInput: () => ({
        annotations: numberAnnotations(annotations),
        conversationIdentity: identity,
        locale: "en",
      }),
      host,
      onChange: onStateChange,
      onSendConfirmed,
    });

    interceptor.submit();
    await vi.waitFor(() =>
      expect(interceptor.state(identity)).toEqual({
        status: "failed",
        reason: "send-unavailable",
      }),
    );

    annotations = [];
    interceptor.draftEmptied(identity);
    expect(interceptor.state(identity)).toEqual({ status: "idle" });

    annotations = [{ ...annotation, id: "replacement-annotation" }];
    host.elements.composer.textContent = "";
    interceptor.submit();
    await vi.waitFor(() => expect(onSendConfirmed).toHaveBeenCalledOnce());

    const retriedText = submit.mock.calls[1]?.[0].text ?? "";
    expect(retriedText).not.toContain("obsolete question");
    interceptor.dispose();
  });
});
