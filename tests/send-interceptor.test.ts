import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import { MAX_COMPILED_PROMPT_LENGTH } from "@/features/annotations/draft-capacity";
import {
  registerSendInterceptor,
  type AnnotatedSendState,
} from "@/features/annotations/register-send-interceptor";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import type { ConversationIdentity, Host } from "@/features/host-port/host-port";

import {
  appendComposer as installComposer,
  appendSendButton as installSendButton,
  appendUserMessage as installUserMessage,
  installChatGptHostFixture,
} from "./fixtures/chatgpt-host";
import { createFakeHost } from "./fixtures/fake-host";

const annotation = {
  id: "annotation-1",
  anchor: {
    format: "exact" as const,
    messageId: "message-1",
    quote: "selected text",
    prefix: "",
    suffix: "",
    start: 0,
    end: 13,
  },
  comment: "",
};

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
    const result = interceptor.submit();
    let replayedText = "";
    const onNativeSend = vi.fn(() => {
      replayedText = composer.textContent ?? "";
      composer.replaceChildren();
      installUserMessage("user-message-1", replayedText);
    });
    installSendButton(onNativeSend);

    await expect(result).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });

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
    const interceptor = registerSendInterceptor({
      annotations: () => numberAnnotations(currentAnnotations),
      compilePrompt: compileAnnotatedPrompt,
      conversationIdentity: () => ({
        kind: "identified",
        id: "conversation-test",
        siteId: "chatgpt",
      }),
      host: createChatGptHost({ document, window }),
      locale: () => "en",
      onSendConfirmed,
    });
    installSendButton(() => {
      const compiledPrompt = composer.textContent ?? "";
      currentAnnotations = [{ ...annotation, comment: "edited while awaiting confirmation" }];
      composer.replaceChildren();
      installUserMessage("user-message-1", compiledPrompt);
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
      kind: "identified",
      id: "conversation-test",
      siteId: "chatgpt",
    });
    interceptor.dispose();
  });

  it("restores the original composer when the send button never appears", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const interceptor = createInterceptor();

    const result = interceptor.submit();
    await vi.advanceTimersByTimeAsync(2_001);

    await expect(result).resolves.toEqual({ status: "failed", reason: "send-unavailable" });
    expect(composer.textContent).toBe("original question");
    interceptor.dispose();
  });

  it("does not overwrite user edits while rolling back a failed attempt", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const interceptor = createInterceptor();

    const result = interceptor.submit();
    composer.textContent = "user edited after failure";
    await vi.advanceTimersByTimeAsync(2_001);

    await expect(result).resolves.toEqual({ status: "failed", reason: "send-unavailable" });
    expect(composer.textContent).toBe("user edited after failure");
    interceptor.dispose();
  });

  it("returns the active attempt for repeated submit calls without recompiling", async () => {
    const composer = installComposer("original question");
    const interceptor = createInterceptor();

    const firstAttempt = interceptor.submit();
    const secondAttempt = interceptor.submit();
    const thirdAttempt = interceptor.submit();

    expect(secondAttempt).toBe(firstAttempt);
    expect(thirdAttempt).toBe(firstAttempt);
    expect(composer.textContent?.match(/\[Annotation 1\]/g)).toHaveLength(1);

    interceptor.dispose();
    await expect(firstAttempt).resolves.toEqual({ status: "failed", reason: "disposed" });
  });

  it("retries failed attempts without nesting the compiled prompt", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const interceptor = createInterceptor();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = interceptor.submit();
      expect(composer.textContent?.match(/\[Annotation 1\]/g)).toHaveLength(1);
      expect(composer.textContent?.match(/\[Supplemental question\]/g)).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2_001);
      await expect(result).resolves.toEqual({ status: "failed", reason: "send-unavailable" });
      expect(composer.textContent).toBe("original question");
    }

    interceptor.dispose();
  });

  it("restores an owned composer when disposed", async () => {
    const composer = installComposer("original question");
    const interceptor = createInterceptor();

    const result = interceptor.submit();
    interceptor.dispose();

    await expect(result).resolves.toEqual({ status: "failed", reason: "disposed" });
    expect(composer.textContent).toBe("original question");
  });

  it("settles a failed attempt when the host rejects composer replacement", async () => {
    const host = createFakeHost();
    vi.spyOn(host.composer, "snapshot").mockReturnValue({
      status: "available",
      value: { element: host.elements.composer, text: "original question" },
    });
    vi.spyOn(host.composer, "submit").mockResolvedValue({
      reason: "replace-failed",
      status: "unavailable",
    });
    const interceptor = createInterceptor(undefined, { host });

    let result: ReturnType<typeof interceptor.submit> | undefined;
    expect(() => {
      result = interceptor.submit();
    }).not.toThrow();

    await expect(result).resolves.toEqual({ status: "failed", reason: "replace-failed" });
    const nextResult = interceptor.submit();
    expect(nextResult).not.toBe(result);
    await expect(nextResult).resolves.toEqual({ status: "failed", reason: "replace-failed" });
    interceptor.dispose();
  });

  it("settles a failed attempt when the host submission rejects", async () => {
    const host = createFakeHost();
    vi.spyOn(host.composer, "submit").mockRejectedValue(new Error("host submit failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { host, onStateChange });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "failed",
      reason: "send-unavailable",
    });
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", reason: "send-unavailable" }),
    );
    expect(consoleError).toHaveBeenCalledWith("[QuoteCue] Failed to replay annotated send");
    interceptor.dispose();
  });

  it("reports composer access failure without creating a send attempt", async () => {
    const host = createFakeHost();
    vi.spyOn(host.composer, "snapshot").mockReturnValue({
      status: "unavailable",
      reason: "composer-unavailable",
    });
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { host, onStateChange });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "failed",
      reason: "composer-unavailable",
    });
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: "failed",
      reason: "composer-unavailable",
    });
    interceptor.dispose();
  });

  it("settles a confirmed attempt when its completion callback throws", async () => {
    const composer = installComposer("original question");
    const onSendConfirmed = vi.fn(() => {
      throw new Error("confirmation callback failed");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed, { onStateChange });
    installSendButton(() => {
      const compiledPrompt = composer.textContent ?? "";
      composer.replaceChildren();
      installUserMessage("confirmed-user-message", compiledPrompt);
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    expect(onStateChange.mock.calls.map(([state]) => state)).toEqual([
      { status: "idle" },
      { status: "sending" },
      { status: "confirmed" },
    ]);
    expect(consoleError).toHaveBeenCalledWith("[QuoteCue] Failed to apply confirmed annotations");
    interceptor.dispose();
  });

  it("declines a native send intent when there are no annotations", () => {
    const host = createFakeHost();
    host.elements.composer.textContent = "original question";
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { annotations: [], host, onStateChange });
    onStateChange.mockClear();
    const event = new Event("click", { cancelable: true });

    host.controls.emitSubmitIntent({ event, isSendAvailable: true });

    expect(event.defaultPrevented).toBe(false);
    expect(host.elements.composer.textContent).toBe("original question");
    expect(onStateChange).not.toHaveBeenCalled();
    interceptor.dispose();
  });

  it("declines a native send intent when the send control is unavailable", () => {
    const host = createFakeHost();
    vi.spyOn(host.composer, "snapshot").mockReturnValue({
      status: "available",
      value: { element: host.elements.composer, text: "original question" },
    });
    const submit = vi.spyOn(host.composer, "submit");
    const interceptor = createInterceptor(undefined, { host });
    const event = new Event("click", { cancelable: true });

    host.controls.emitSubmitIntent({ event, isSendAvailable: false });

    expect(event.defaultPrevented).toBe(false);
    expect(submit).not.toHaveBeenCalled();
    interceptor.dispose();
  });

  it("blocks a native send when the compiled follow-up exceeds capacity", () => {
    const host = createFakeHost();
    host.elements.composer.textContent = "original question";
    const submit = vi.spyOn(host.composer, "submit");
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, {
      compilePrompt: () => "x".repeat(MAX_COMPILED_PROMPT_LENGTH + 1),
      host,
      onStateChange,
    });
    const event = new Event("click", { cancelable: true });

    host.controls.emitSubmitIntent({ event, isSendAvailable: true });

    expect(event.defaultPrevented).toBe(true);
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
    const event = new Event("click", { cancelable: true });

    host.controls.emitSubmitIntent({ event, isSendAvailable: false });

    expect(event.defaultPrevented).toBe(true);
    expect(submit).toHaveBeenCalledOnce();
    interceptor.dispose();
  });

  it("retries a host replacement failure with the original question", async () => {
    const host = createFakeHost();
    vi.spyOn(host.composer, "snapshot").mockReturnValue({
      status: "available",
      value: { element: host.elements.composer, text: "original question" },
    });
    const submit = vi
      .spyOn(host.composer, "submit")
      .mockResolvedValueOnce({ reason: "replace-failed", status: "unavailable" })
      .mockResolvedValueOnce({ status: "available", value: "confirmed" });
    const onSendConfirmed = vi.fn();
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed, { host, onStateChange });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "failed",
      reason: "replace-failed",
    });
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", reason: "replace-failed" }),
    );

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    const retriedText = submit.mock.calls[1]?.[0].text ?? "";
    expect(retriedText).toContain("[Supplemental question]\noriginal question");
    expect(retriedText.match(/\[Annotation 1\]/g)).toHaveLength(1);
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
      kind: "identified",
      id: "conversation-test",
      siteId: "chatgpt",
    });
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: "confirmed",
    });
    interceptor.dispose();
  });

  it("fails a custom submit before changing a disabled send control", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const sendButton = installSendButton();
    sendButton.disabled = true;
    const interceptor = createInterceptor();

    const result = interceptor.submit();
    await vi.advanceTimersByTimeAsync(2_001);
    await expect(result).resolves.toEqual({
      status: "failed",
      reason: "send-unavailable",
    });
    expect(composer.textContent).toBe("original question");
    interceptor.dispose();
  });

  it("trusts a truthy insertText command while the editor renders asynchronously", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    vi.mocked(document.execCommand).mockReturnValue(true);
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { onStateChange });

    const result = interceptor.submit();
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "sending" }));
    await vi.advanceTimersByTimeAsync(2_001);

    await expect(result).resolves.toEqual({ status: "failed", reason: "send-unavailable" });
    expect(composer.textContent).toBe("original question");
    interceptor.dispose();
  });

  it("scopes send-control observation to the shared composer surface", async () => {
    const fixture = installChatGptHostFixture();
    fixture.action.disabled = true;
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const querySelector = vi.spyOn(document, "querySelector");
    const host = createChatGptHost({ document, window });
    fixture.action.addEventListener("click", () => {
      installUserMessage("submitted-message", fixture.composer.textContent ?? "");
    });

    const result = host.composer.submit({
      restoreTo: availableComposer(host),
      signal: new AbortController().signal,
      text: "compiled prompt",
    });
    expect(observe).toHaveBeenCalledWith(
      fixture.surface,
      expect.objectContaining({ attributes: true, childList: true, subtree: true }),
    );
    querySelector.mockClear();

    const unrelated = document.createElement("div");
    document.body.append(unrelated);
    unrelated.classList.add("animated");
    await Promise.resolve();
    expect(querySelector).not.toHaveBeenCalled();

    fixture.action.disabled = false;
    await expect(result).resolves.toEqual({ status: "available", value: "confirmed" });
    expect(
      querySelector.mock.calls.filter(
        ([selector]) => selector === "button[data-testid='send-button']",
      ),
    ).toHaveLength(1);
  });

  it("coalesces confirmation scans to one per animation frame", async () => {
    vi.useFakeTimers();
    const fixture = installChatGptHostFixture();
    fixture.action.disabled = false;
    const host = createChatGptHost({ document, window });
    const querySelectorAll = vi.spyOn(document, "querySelectorAll");
    const controller = new AbortController();
    const result = host.composer.submit({
      restoreTo: availableComposer(host),
      signal: controller.signal,
      text: "message that does not exist",
    });
    await Promise.resolve();
    querySelectorAll.mockClear();
    const userMessageScanCount = () =>
      querySelectorAll.mock.calls.filter(
        ([selector]) => selector === '[data-message-author-role="user"][data-message-id]',
      ).length;

    for (let index = 0; index < 3; index += 1) {
      document.body.append(document.createElement("div"));
      await Promise.resolve();
    }

    expect(userMessageScanCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(17);
    expect(userMessageScanCount()).toBe(1);

    document.body.append(document.createElement("div"));
    await Promise.resolve();
    controller.abort();
    await expect(result).resolves.toEqual({
      reason: "send-unavailable",
      status: "unavailable",
    });
    await vi.advanceTimersByTimeAsync(17);
    expect(userMessageScanCount()).toBe(1);
  });

  it("does not register send work for an already aborted signal", async () => {
    vi.useFakeTimers();
    const fixture = installChatGptHostFixture();
    fixture.action.disabled = false;
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const setTimeout = vi.spyOn(window, "setTimeout");
    const send = vi.fn();
    fixture.action.addEventListener("click", send);
    const controller = new AbortController();
    controller.abort();
    const host = createChatGptHost({ document, window });

    await expect(
      host.composer.submit({
        restoreTo: availableComposer(host),
        signal: controller.signal,
        text: "compiled prompt",
      }),
    ).resolves.toEqual({
      reason: "send-unavailable",
      status: "unavailable",
    });
    vi.advanceTimersByTime(15_001);

    expect(observe).not.toHaveBeenCalled();
    expect(setTimeout.mock.calls.every(([, delay]) => delay === 0)).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(fixture.composer.textContent).toBe("Original question");
  });

  it("aborts a host submission when disposed", async () => {
    const host = createFakeHost();
    vi.spyOn(host.composer, "snapshot").mockReturnValue({
      status: "available",
      value: { element: host.elements.composer, text: "original question" },
    });
    let submittedSignal: AbortSignal | undefined;
    const submit = vi.spyOn(host.composer, "submit").mockImplementation(
      ({ signal }) =>
        new Promise((resolve) => {
          submittedSignal = signal;
          signal.addEventListener(
            "abort",
            () => resolve({ reason: "send-unavailable", status: "unavailable" }),
            { once: true },
          );
        }),
    );
    const interceptor = registerSendInterceptor({
      annotations: () => numberAnnotations([annotation]),
      compilePrompt: compileAnnotatedPrompt,
      conversationIdentity: () => ({
        kind: "identified",
        id: "conversation-test",
        siteId: "chatgpt",
      }),
      host,
      locale: () => "en",
      onSendConfirmed: vi.fn(),
    });

    const result = interceptor.submit();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    interceptor.dispose();
    await expect(result).resolves.toEqual({ status: "failed", reason: "disposed" });

    expect(submittedSignal?.aborted).toBe(true);
  });

  it("does not confirm a send when only the composer becomes empty", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const onSendConfirmed = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed);
    installSendButton(() => composer.replaceChildren());

    const result = interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);

    await expect(result).resolves.toEqual({
      status: "failed",
      reason: "confirmation-timeout",
    });
    expect(onSendConfirmed).not.toHaveBeenCalled();
    expect(composer.textContent).toBe("");
    interceptor.dispose();
  });

  it("skips rendered text reads for new messages shorter than the expected send", async () => {
    const composer = installComposer("original question");
    const logger = vi.fn();
    const host = createChatGptHost({ document, logger, window });
    let messageInnerTextReads = 0;
    installSendButton(() => {
      const message = installUserMessage("short-user-message", "short");
      Object.defineProperty(message, "innerText", {
        configurable: true,
        get: () => {
          messageInnerTextReads += 1;
          return message.textContent ?? "";
        },
      });
      composer.replaceChildren();
      message.textContent = "still short";
    });
    const interceptor = registerSendInterceptor({
      annotations: () => numberAnnotations([annotation]),
      compilePrompt: compileAnnotatedPrompt,
      conversationIdentity: () => ({
        kind: "identified",
        id: "conversation-test",
        siteId: "chatgpt",
      }),
      host,
      locale: () => "en",
      onSendConfirmed: vi.fn(),
    });

    const result = interceptor.submit();
    await vi.waitFor(() =>
      expect(logger).toHaveBeenCalledWith(
        "[QuoteCue host] send confirmation observed: total=1, matched=false",
      ),
    );
    expect(messageInnerTextReads).toBe(0);

    interceptor.dispose();
    await expect(result).resolves.toEqual({ status: "failed", reason: "disposed" });
  });

  it("retries an unconfirmed send with the original supplemental question", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const onSendConfirmed = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed);
    let sendCount = 0;
    let retriedText = "";
    installSendButton(() => {
      sendCount += 1;
      const compiledPrompt = composer.textContent ?? "";
      composer.replaceChildren();
      if (sendCount === 2) {
        retriedText = compiledPrompt;
        installUserMessage("retried-user-message", compiledPrompt);
      }
    });

    const firstResult = interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);
    await expect(firstResult).resolves.toEqual({
      status: "failed",
      reason: "confirmation-timeout",
    });

    const retryResult = interceptor.submit();
    await vi.advanceTimersByTimeAsync(17);
    await expect(retryResult).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    expect(retriedText).toContain("[Supplemental question]\noriginal question");
    expect(retriedText.match(/\[Annotation 1\]/g)).toHaveLength(1);
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
      kind: "identified",
      id: "conversation-test",
      siteId: "chatgpt",
    });
    interceptor.dispose();
  });

  it("never reuses a failed question from another conversation", async () => {
    vi.useFakeTimers();
    const composer = installComposer("question from conversation A");
    let identity: ConversationIdentity = {
      kind: "identified",
      id: "conversation-a",
      siteId: "chatgpt",
    };
    const interceptor = createInterceptor(vi.fn(), {
      conversationIdentity: () => identity,
    });
    let sentText = "";
    installSendButton(() => {
      sentText = composer.textContent ?? "";
      composer.replaceChildren();
    });

    await expect(
      (async () => {
        const result = interceptor.submit();
        await vi.advanceTimersByTimeAsync(15_001);
        return result;
      })(),
    ).resolves.toEqual({ status: "failed", reason: "confirmation-timeout" });
    expect(sentText).toContain("question from conversation A");

    identity = { kind: "identified", id: "conversation-b", siteId: "chatgpt" };
    interceptor.conversationChanged();
    sentText = "";

    void interceptor.submit();
    await vi.advanceTimersByTimeAsync(17);

    expect(sentText).not.toContain("question from conversation A");
    expect(sentText).not.toContain("[Supplemental question]");
    interceptor.dispose();
  });

  it("reports idle after leaving the conversation that failed", async () => {
    vi.useFakeTimers();
    installComposer("question from conversation A");
    let identity: ConversationIdentity = {
      kind: "identified",
      id: "conversation-a",
      siteId: "chatgpt",
    };
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(vi.fn(), {
      conversationIdentity: () => identity,
      onStateChange,
    });
    installSendButton();

    const result = interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);
    await expect(result).resolves.toEqual({ status: "failed", reason: "confirmation-timeout" });
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", reason: "confirmation-timeout" }),
    );

    identity = { kind: "identified", id: "conversation-b", siteId: "chatgpt" };
    interceptor.conversationChanged();

    expect(onStateChange).toHaveBeenLastCalledWith({ status: "idle" });
    interceptor.dispose();
  });

  it("keeps failure feedback while staying in the same conversation", async () => {
    vi.useFakeTimers();
    installComposer("question from conversation A");
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(vi.fn(), { onStateChange });
    installSendButton();

    const result = interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);
    await expect(result).resolves.toEqual({ status: "failed", reason: "confirmation-timeout" });

    interceptor.conversationChanged();

    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", reason: "confirmation-timeout" }),
    );
    interceptor.dispose();
  });

  it("confirms a matching user message after the composer node is replaced", async () => {
    const composer = installComposer("original question");
    const onSendConfirmed = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed);
    installSendButton(() => {
      const compiledPrompt = composer.textContent ?? "";
      composer.remove();
      installComposer();
      installUserMessage("user-message-after-replacement", compiledPrompt);
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
      kind: "identified",
      id: "conversation-test",
      siteId: "chatgpt",
    });
    interceptor.dispose();
  });

  it("confirms a sent message whose line breaks were reflowed by the host", async () => {
    const composer = installComposer();
    const onSendConfirmed = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed);
    installSendButton(() => {
      const reflowedText = (composer.textContent ?? "").replace(/\n{2,}/g, "\n");
      composer.replaceChildren();
      installUserMessage("reflowed-user-message", reflowedText);
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
      kind: "identified",
      id: "conversation-test",
      siteId: "chatgpt",
    });
    interceptor.dispose();
  });

  it("ignores old and mismatched user messages while awaiting confirmation", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    installUserMessage("old-message", "unrelated");
    const onSendConfirmed = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed);
    installSendButton(() => {
      const compiledPrompt = composer.textContent ?? "";
      composer.replaceChildren();
      installUserMessage("new-message", `${compiledPrompt} changed`);
    });

    const result = interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);

    await expect(result).resolves.toEqual({
      status: "failed",
      reason: "confirmation-timeout",
    });
    expect(onSendConfirmed).not.toHaveBeenCalled();
    interceptor.dispose();
  });
});

type CreateInterceptorOptions = {
  annotations?: readonly (typeof annotation)[];
  compilePrompt?: Parameters<typeof registerSendInterceptor>[0]["compilePrompt"];
  conversationIdentity?: () => ConversationIdentity;
  host?: Host;
  onStateChange?: (state: AnnotatedSendState) => void;
};

function createInterceptor(
  onSendConfirmed = vi.fn(),
  {
    annotations = [annotation],
    compilePrompt = compileAnnotatedPrompt,
    conversationIdentity = () =>
      ({ kind: "identified", id: "conversation-test", siteId: "chatgpt" }) as const,
    host = createChatGptHost({ document, window }),
    onStateChange,
  }: CreateInterceptorOptions = {},
) {
  return registerSendInterceptor({
    annotations: () => numberAnnotations(annotations),
    compilePrompt,
    conversationIdentity,
    host,
    locale: () => "en",
    onSendConfirmed,
    onStateChange,
  });
}

function availableComposer(host: Host) {
  const snapshot = host.composer.snapshot();
  if (snapshot.status === "unavailable") {
    throw new Error("Expected composer snapshot");
  }
  return snapshot.value;
}
