import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { registerSendInterceptor } from "@/features/host/register-send-interceptor";

import {
  appendComposer as installComposer,
  appendSendButton as installSendButton,
  appendUserMessage as installUserMessage,
} from "./fixtures/chatgpt-host";

const annotation = {
  id: "annotation-1",
  anchor: {
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
    const onSendAccepted = vi.fn();
    const interceptor = createInterceptor(onSendAccepted);
    const result = interceptor.submit();
    let replayedText = "";
    const onNativeSend = vi.fn(() => {
      replayedText = composer.textContent ?? "";
      composer.replaceChildren();
      installUserMessage("user-message-1", replayedText);
    });
    installSendButton(onNativeSend);

    await expect(result).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-1"],
    });

    expect(replayedText).toContain("[Annotation 1]");
    expect(replayedText).not.toContain("[Supplemental question]");
    expect(onNativeSend).toHaveBeenCalledOnce();
    expect(onSendAccepted).toHaveBeenCalledOnce();
    interceptor.dispose();
  });

  it("confirms the annotation snapshot compiled before later draft changes", async () => {
    const composer = installComposer("original question");
    const onSendAccepted = vi.fn();
    let currentAnnotations = [annotation];
    const interceptor = registerSendInterceptor({
      annotations: () => currentAnnotations,
      locale: () => "en",
      onSendAccepted,
    });
    const sendButton = installSendButton(() => {
      const compiledText = composer.textContent ?? "";
      currentAnnotations = [{ ...annotation, comment: "edited while awaiting confirmation" }];
      composer.replaceChildren();
      installUserMessage("user-message-1", compiledText);
    });

    await expect(interceptor.submit(sendButton)).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-1"],
    });
    expect(onSendAccepted).toHaveBeenCalledWith([annotation]);
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

  it("leaves native Enter untouched when no send button is available", () => {
    const composer = installComposer("original question");
    const interceptor = createInterceptor();
    const hostKeydown = vi.fn();
    composer.addEventListener("keydown", hostKeydown);
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });

    expect(composer.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(hostKeydown).toHaveBeenCalledOnce();
    expect(composer.textContent).toBe("original question");
    interceptor.dispose();
  });

  it("leaves a disabled native send control untouched", () => {
    const composer = installComposer("original question");
    const sendButton = installSendButton();
    sendButton.disabled = true;
    const interceptor = createInterceptor();
    const hostClick = vi.fn();
    sendButton.addEventListener("click", hostClick);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    expect(sendButton.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(hostClick).toHaveBeenCalledOnce();
    expect(composer.textContent).toBe("original question");
    interceptor.dispose();
  });

  it("fails a custom submit before changing a disabled send control", async () => {
    const composer = installComposer("original question");
    const sendButton = installSendButton();
    sendButton.disabled = true;
    const interceptor = createInterceptor();

    await expect(interceptor.submit(sendButton)).resolves.toEqual({
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
    const interceptor = createInterceptor();

    const result = interceptor.submit();
    expect(interceptor.getState()).toMatchObject({ status: "replaying" });
    await vi.advanceTimersByTimeAsync(2_001);

    await expect(result).resolves.toEqual({ status: "failed", reason: "send-unavailable" });
    expect(composer.textContent).toBe("original question");
    interceptor.dispose();
  });

  it("does not register confirmation work for an already aborted signal", () => {
    vi.useFakeTimers();
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const setTimeout = vi.spyOn(window, "setTimeout");
    const logger = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const host = createChatGptHost({ document, logger, window });
    const onAccepted = vi.fn();
    const onTimeout = vi.fn();

    const stop = host.composer.watchAcceptedSend({
      expectedText: "compiled prompt",
      onAccepted,
      onTimeout,
      signal: controller.signal,
    });
    vi.advanceTimersByTime(15_001);

    expect(logger).toHaveBeenCalledWith("[QuoteCue host] send confirmation skipped: aborted");
    expect(observe).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
    stop();
  });

  it("does not watch a send attempt disposed while waiting for its button", async () => {
    const composer = installComposer("original question");
    const sendButton = installSendButton();
    const host = createChatGptHost({ document, window });
    let resolveButton: (result: { status: "available"; value: HTMLElement }) => void = () =>
      undefined;
    const buttonResult = new Promise<{ status: "available"; value: HTMLElement }>((resolve) => {
      resolveButton = resolve;
    });
    const waitForButton = vi.spyOn(host.composer, "waitForButton").mockReturnValue(buttonResult);
    const watchAcceptedSend = vi.spyOn(host.composer, "watchAcceptedSend");
    const interceptor = registerSendInterceptor({
      annotations: () => [annotation],
      host,
      locale: () => "en",
      onSendAccepted: vi.fn(),
    });

    const result = interceptor.submit();
    await vi.waitFor(() => expect(waitForButton).toHaveBeenCalledOnce());
    interceptor.dispose();
    await expect(result).resolves.toEqual({ status: "failed", reason: "disposed" });

    resolveButton({ status: "available", value: sendButton });
    await Promise.resolve();
    expect(watchAcceptedSend).not.toHaveBeenCalled();
    expect(composer.textContent).toBe("original question");
  });

  it("does not accept a send when only the composer becomes empty", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const onSendAccepted = vi.fn();
    const interceptor = createInterceptor(onSendAccepted);
    const sendButton = installSendButton(() => composer.replaceChildren());

    const result = interceptor.submit(sendButton);
    await vi.advanceTimersByTimeAsync(15_001);

    await expect(result).resolves.toEqual({
      status: "failed",
      reason: "confirmation-timeout",
    });
    expect(onSendAccepted).not.toHaveBeenCalled();
    expect(composer.textContent).toBe("");
    interceptor.dispose();
  });

  it("skips rendered text reads for new messages shorter than the expected send", async () => {
    const composer = installComposer("original question");
    const logger = vi.fn();
    const host = createChatGptHost({ document, logger, window });
    let messageInnerTextReads = 0;
    const sendButton = installSendButton(() => {
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
      annotations: () => [annotation],
      host,
      locale: () => "en",
      onSendAccepted: vi.fn(),
    });

    const result = interceptor.submit(sendButton);
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
    const onSendAccepted = vi.fn();
    const interceptor = createInterceptor(onSendAccepted);
    let sendCount = 0;
    let retriedText = "";
    installSendButton(() => {
      sendCount += 1;
      const compiledText = composer.textContent ?? "";
      composer.replaceChildren();
      if (sendCount === 2) {
        retriedText = compiledText;
        installUserMessage("retried-user-message", compiledText);
      }
    });

    const firstResult = interceptor.submit();
    await vi.advanceTimersByTimeAsync(15_001);
    await expect(firstResult).resolves.toEqual({
      status: "failed",
      reason: "confirmation-timeout",
    });

    await expect(interceptor.retry()).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-1"],
    });
    expect(retriedText).toContain("[Supplemental question]\noriginal question");
    expect(retriedText.match(/\[Annotation 1\]/g)).toHaveLength(1);
    expect(onSendAccepted).toHaveBeenCalledWith([annotation]);
    interceptor.dispose();
  });

  it("accepts a matching user message after the composer node is replaced", async () => {
    const composer = installComposer("original question");
    const onSendAccepted = vi.fn();
    const interceptor = createInterceptor(onSendAccepted);
    const sendButton = installSendButton(() => {
      const compiledText = composer.textContent ?? "";
      composer.remove();
      installComposer();
      installUserMessage("user-message-after-replacement", compiledText);
    });

    await expect(interceptor.submit(sendButton)).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-1"],
    });
    expect(onSendAccepted).toHaveBeenCalledWith([annotation]);
    interceptor.dispose();
  });

  it("accepts a sent message whose line breaks were reflowed by the host", async () => {
    const composer = installComposer();
    const onSendAccepted = vi.fn();
    const interceptor = createInterceptor(onSendAccepted);
    installSendButton(() => {
      const reflowedText = (composer.textContent ?? "").replace(/\n{2,}/g, "\n");
      composer.replaceChildren();
      installUserMessage("reflowed-user-message", reflowedText);
    });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "accepted",
      annotationIds: ["annotation-1"],
    });
    expect(onSendAccepted).toHaveBeenCalledWith([annotation]);
    interceptor.dispose();
  });

  it("ignores old and mismatched user messages while awaiting confirmation", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    installUserMessage("old-message", "unrelated");
    const onSendAccepted = vi.fn();
    const interceptor = createInterceptor(onSendAccepted);
    const sendButton = installSendButton(() => {
      const compiledText = composer.textContent ?? "";
      composer.replaceChildren();
      installUserMessage("new-message", `${compiledText} changed`);
    });

    const result = interceptor.submit(sendButton);
    await vi.advanceTimersByTimeAsync(15_001);

    await expect(result).resolves.toEqual({
      status: "failed",
      reason: "confirmation-timeout",
    });
    expect(onSendAccepted).not.toHaveBeenCalled();
    interceptor.dispose();
  });
});

function createInterceptor(onSendAccepted = vi.fn()) {
  return registerSendInterceptor({
    annotations: () => [annotation],
    locale: () => "en",
    onSendAccepted,
  });
}
