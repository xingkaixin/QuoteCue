import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { numberAnnotations } from "@/features/annotations/annotation-projection";
import type { ConversationIdentity } from "@/features/conversation/conversation-identity";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";

import {
  appendComposer as installComposer,
  appendSendButton as installSendButton,
  appendUserMessage as installUserMessage,
  installChatGptHostFixture,
} from "./fixtures/chatgpt-host";
import { createFakeHost, fakeComposerSnapshot } from "./fixtures/fake-host";
import { annotation, availableComposer, createInterceptor } from "./fixtures/send-interceptor";

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

describe("annotated send host integration", () => {
  it("fails a custom submit before changing a disabled send control", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const sendButton = installSendButton();
    sendButton.disabled = true;
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

  it("trusts a truthy insertText command while the editor renders asynchronously", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    vi.mocked(document.execCommand).mockReturnValue(true);
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { onStateChange });

    interceptor.submit();
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "sending" }));
    await vi.advanceTimersByTimeAsync(2_001);

    expect(onStateChange).toHaveBeenLastCalledWith({
      status: "failed",
      reason: "send-unavailable",
    });
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

  it("logs the underlying send dispatch error", async () => {
    const fixture = installChatGptHostFixture();
    fixture.action.disabled = false;
    const error = new Error("host click failed");
    fixture.action.click = () => {
      throw error;
    };
    const logger = vi.fn();
    const host = createChatGptHost({ document, logger, window });

    await expect(
      host.composer.submit({
        restoreTo: availableComposer(host),
        signal: new AbortController().signal,
        text: "compiled prompt",
      }),
    ).resolves.toEqual({ reason: "send-unavailable", status: "unavailable" });
    expect(logger).toHaveBeenCalledWith("[QuoteCue host] send dispatch failed", error);
  });

  it("checks only changed user messages and coalesces them by animation frame", async () => {
    vi.useFakeTimers();
    const fixture = installChatGptHostFixture();
    fixture.action.disabled = false;
    for (let index = 0; index < 200; index += 1) {
      installUserMessage(`existing-${index}`, `old message ${index}`);
    }
    const logger = vi.fn();
    const host = createChatGptHost({ document, logger, window });
    const querySelectorAll = vi.spyOn(document, "querySelectorAll");
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");
    const controller = new AbortController();
    const result = host.composer.submit({
      restoreTo: availableComposer(host),
      signal: controller.signal,
      text: "message that does not exist",
    });
    await Promise.resolve();
    querySelectorAll.mockClear();
    requestAnimationFrame.mockClear();
    logger.mockClear();
    const userMessageScanCount = () =>
      querySelectorAll.mock.calls.filter(
        ([selector]) => selector === '[data-message-author-role="user"][data-message-id]',
      ).length;

    for (let index = 0; index < 3; index += 1) {
      document.body.append(document.createElement("div"));
      await Promise.resolve();
    }

    expect(userMessageScanCount()).toBe(0);
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    const candidate = installUserMessage("candidate", "short");
    await Promise.resolve();
    candidate.textContent = "still short";
    await Promise.resolve();
    candidate.textContent = "not the expected message";
    await Promise.resolve();

    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(17);
    expect(userMessageScanCount()).toBe(0);
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(
      "[QuoteCue host] send confirmation observed: candidates=1, matched=false",
    );

    document.body.append(document.createElement("div"));
    await Promise.resolve();
    controller.abort();
    await expect(result).resolves.toEqual({
      reason: "send-unavailable",
      status: "unavailable",
    });
    await vi.advanceTimersByTimeAsync(17);
    expect(userMessageScanCount()).toBe(0);
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
      value: fakeComposerSnapshot("original question"),
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
      getSendInput: () => ({
        annotations: numberAnnotations([annotation]),
        conversationIdentity: {
          kind: "identified",
          id: "conversation-test",
          siteId: "chatgpt",
        },
        locale: "en",
      }),
      host,
      onSendConfirmed: vi.fn(),
    });

    interceptor.submit();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    interceptor.dispose();

    expect(submittedSignal?.aborted).toBe(true);
  });

  it("does not confirm a send when only the composer becomes empty", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const onSendConfirmed = vi.fn();
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed, { onStateChange });
    installSendButton(() => composer.replaceChildren());

    interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);

    expect(onStateChange).toHaveBeenLastCalledWith({
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
      getSendInput: () => ({
        annotations: numberAnnotations([annotation]),
        conversationIdentity: {
          kind: "identified",
          id: "conversation-test",
          siteId: "chatgpt",
        },
        locale: "en",
      }),
      host,
      onSendConfirmed: vi.fn(),
    });

    interceptor.submit();
    await vi.waitFor(() =>
      expect(logger).toHaveBeenCalledWith(
        "[QuoteCue host] send confirmation observed: candidates=1, matched=false",
      ),
    );
    expect(messageInnerTextReads).toBe(0);

    interceptor.dispose();
  });

  it("retries an unconfirmed send with the original supplemental question", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const onSendConfirmed = vi.fn();
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed, { onStateChange });
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

    interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: "failed",
      reason: "confirmation-timeout",
    });

    interceptor.submit();
    await vi.advanceTimersByTimeAsync(17);
    expect(onStateChange).toHaveBeenLastCalledWith({ status: "idle" });
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
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(vi.fn(), {
      conversationIdentity: () => identity,
      onStateChange,
    });
    let sentText = "";
    installSendButton(() => {
      sentText = composer.textContent ?? "";
      composer.replaceChildren();
    });

    interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: "failed",
      reason: "confirmation-timeout",
    });
    expect(sentText).toContain("question from conversation A");

    identity = { kind: "identified", id: "conversation-b", siteId: "chatgpt" };
    interceptor.conversationChanged(identity);
    sentText = "";

    interceptor.submit();
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

    interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", reason: "confirmation-timeout" }),
    );

    identity = { kind: "identified", id: "conversation-b", siteId: "chatgpt" };
    interceptor.conversationChanged(identity);

    expect(onStateChange).toHaveBeenLastCalledWith({ status: "idle" });
    interceptor.dispose();
  });

  it("keeps failure feedback while staying in the same conversation", async () => {
    vi.useFakeTimers();
    installComposer("question from conversation A");
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(vi.fn(), { onStateChange });
    installSendButton();

    interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);

    interceptor.conversationChanged({
      kind: "identified",
      id: "conversation-test",
      siteId: "chatgpt",
    });

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

    interceptor.submit();
    await vi.waitFor(() =>
      expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
        kind: "identified",
        id: "conversation-test",
        siteId: "chatgpt",
      }),
    );
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

    interceptor.submit();
    await vi.waitFor(() =>
      expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
        kind: "identified",
        id: "conversation-test",
        siteId: "chatgpt",
      }),
    );
    interceptor.dispose();
  });

  it("ignores old and mismatched user messages while awaiting confirmation", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    installUserMessage("old-message", "unrelated");
    const onSendConfirmed = vi.fn();
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed, { onStateChange });
    installSendButton(() => {
      const compiledPrompt = composer.textContent ?? "";
      composer.replaceChildren();
      installUserMessage("new-message", `${compiledPrompt} changed`);
    });

    interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);

    expect(onStateChange).toHaveBeenLastCalledWith({
      status: "failed",
      reason: "confirmation-timeout",
    });
    expect(onSendConfirmed).not.toHaveBeenCalled();
    interceptor.dispose();
  });
});
