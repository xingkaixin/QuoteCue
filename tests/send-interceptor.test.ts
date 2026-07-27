import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import {
  registerSendInterceptor,
  type AnnotatedSendState,
} from "@/features/annotations/register-send-interceptor";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import type { Host } from "@/features/host-port/host-port";

import {
  appendComposer as installComposer,
  appendSendButton as installSendButton,
  appendUserMessage as installUserMessage,
  installChatGptHostFixture,
} from "./fixtures/chatgpt-host";

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
      host: createChatGptHost({ document, window }),
      locale: () => "en",
      onSendConfirmed,
    });
    const sendButton = installSendButton(() => {
      const compiledText = composer.textContent ?? "";
      currentAnnotations = [{ ...annotation, comment: "edited while awaiting confirmation" }];
      composer.replaceChildren();
      installUserMessage("user-message-1", compiledText);
    });

    await expect(interceptor.submit(sendButton)).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation]);
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

  it("settles a failed attempt when restoring the composer throws", async () => {
    installComposer("original question");
    const host = createChatGptHost({ document, window });
    vi.spyOn(host.composer, "replaceText").mockReturnValue(false);
    vi.spyOn(host.composer, "restoreText").mockImplementation(() => {
      throw new Error("host restore failed");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const interceptor = createInterceptor(undefined, { host });

    let result: ReturnType<typeof interceptor.submit> | undefined;
    expect(() => {
      result = interceptor.submit();
    }).not.toThrow();

    await expect(result).resolves.toEqual({ status: "failed", reason: "replace-failed" });
    const nextResult = interceptor.submit();
    expect(nextResult).not.toBe(result);
    await expect(nextResult).resolves.toEqual({ status: "failed", reason: "replace-failed" });
    expect(consoleError).toHaveBeenCalledWith("[QuoteCue] Failed to restore composer text");
    interceptor.dispose();
  });

  it("settles a failed attempt when waiting for the send control rejects", async () => {
    installComposer("original question");
    const host = createChatGptHost({ document, window });
    vi.spyOn(host.composer, "waitForButton").mockRejectedValue(new Error("host wait failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const interceptor = createInterceptor(undefined, { host });

    await expect(interceptor.submit()).resolves.toEqual({
      status: "failed",
      reason: "send-unavailable",
    });
    expect(interceptor.getState()).toMatchObject({
      status: "failed",
      reason: "send-unavailable",
    });
    expect(consoleError).toHaveBeenCalledWith("[QuoteCue] Failed to replay annotated send");
    interceptor.dispose();
  });

  it("settles a confirmed attempt when its completion callback throws", async () => {
    const composer = installComposer("original question");
    const onSendConfirmed = vi.fn(() => {
      throw new Error("confirmation callback failed");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const interceptor = createInterceptor(onSendConfirmed);
    const sendButton = installSendButton(() => {
      const compiledText = composer.textContent ?? "";
      composer.replaceChildren();
      installUserMessage("confirmed-user-message", compiledText);
    });

    await expect(interceptor.submit(sendButton)).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    expect(interceptor.getState()).toEqual({ status: "idle" });
    expect(consoleError).toHaveBeenCalledWith("[QuoteCue] Failed to apply confirmed annotations");
    interceptor.dispose();
  });

  it("leaves native clicks untouched when there are no annotations", () => {
    const composer = installComposer("original question");
    const sendButton = installSendButton();
    const hostClick = vi.fn();
    sendButton.addEventListener("click", hostClick);
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { annotations: [], onStateChange });
    onStateChange.mockClear();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    expect(sendButton.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(hostClick).toHaveBeenCalledOnce();
    expect(composer.textContent).toBe("original question");
    expect(interceptor.getState()).toEqual({ status: "idle" });
    expect(onStateChange).not.toHaveBeenCalled();
    interceptor.dispose();
  });

  it("leaves native Enter untouched when there are no annotations", () => {
    const composer = installComposer("original question");
    installSendButton();
    const hostKeydown = vi.fn();
    composer.addEventListener("keydown", hostKeydown);
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(undefined, { annotations: [], onStateChange });
    onStateChange.mockClear();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });

    expect(composer.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(hostKeydown).toHaveBeenCalledOnce();
    expect(composer.textContent).toBe("original question");
    expect(interceptor.getState()).toEqual({ status: "idle" });
    expect(onStateChange).not.toHaveBeenCalled();
    interceptor.dispose();
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

  it.each([
    {
      failure: "returns false",
      replace(composer: HTMLElement, compiledText: string) {
        composer.textContent = compiledText;
        return false;
      },
    },
    {
      failure: "throws",
      replace(composer: HTMLElement, compiledText: string) {
        composer.textContent = compiledText;
        throw new Error("host editor failed");
      },
    },
  ])("rolls back and retries when composer replacement $failure", async ({ replace }) => {
    const composer = installComposer("original question");
    const host = createChatGptHost({ document, window });
    const originalReplace = host.composer.replaceText.bind(host.composer);
    vi.spyOn(host.composer, "replaceText")
      .mockImplementationOnce(replace)
      .mockImplementation(originalReplace);
    const onSendConfirmed = vi.fn();
    const onStateChange = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed, { host, onStateChange });
    let retriedText = "";
    const sendButton = installSendButton(() => {
      retriedText = composer.textContent ?? "";
      composer.replaceChildren();
      installUserMessage("retried-user-message", retriedText);
    });

    await expect(interceptor.submit(sendButton)).resolves.toEqual({
      status: "failed",
      reason: "replace-failed",
    });
    expect(composer.textContent).toBe("original question");
    expect(interceptor.getState()).toMatchObject({
      status: "failed",
      reason: "replace-failed",
    });
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", reason: "replace-failed" }),
    );

    await expect(interceptor.retry()).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    expect(retriedText).toContain("[Supplemental question]\noriginal question");
    expect(retriedText.match(/\[Annotation 1\]/g)).toHaveLength(1);
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation]);
    expect(interceptor.getState()).toEqual({ status: "idle" });
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

  it("scopes send-control observation to the shared composer surface", async () => {
    const fixture = installChatGptHostFixture();
    fixture.action.disabled = true;
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const querySelector = vi.spyOn(document, "querySelector");
    const host = createChatGptHost({ document, window });

    const result = host.composer.waitForButton(new AbortController().signal);
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
    await expect(result).resolves.toEqual({ status: "available", value: fixture.action });
    expect(querySelector).toHaveBeenCalledOnce();
  });

  it("coalesces confirmation scans to one per animation frame", async () => {
    vi.useFakeTimers();
    installChatGptHostFixture();
    const host = createChatGptHost({ document, window });
    const querySelectorAll = vi.spyOn(document, "querySelectorAll");
    const stop = host.composer.watchConfirmedSend({
      expectedText: "message that does not exist",
      onConfirmed: vi.fn(),
      onTimeout: vi.fn(),
      signal: new AbortController().signal,
    });
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
    stop();
    await vi.advanceTimersByTimeAsync(17);
    expect(userMessageScanCount()).toBe(1);
  });

  it("does not register confirmation work for an already aborted signal", () => {
    vi.useFakeTimers();
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const setTimeout = vi.spyOn(window, "setTimeout");
    const logger = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const host = createChatGptHost({ document, logger, window });
    const onConfirmed = vi.fn();
    const onTimeout = vi.fn();

    const stop = host.composer.watchConfirmedSend({
      expectedText: "compiled prompt",
      onConfirmed,
      onTimeout,
      signal: controller.signal,
    });
    vi.advanceTimersByTime(15_001);

    expect(logger).toHaveBeenCalledWith("[QuoteCue host] send confirmation skipped: aborted");
    expect(observe).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
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
    const watchConfirmedSend = vi.spyOn(host.composer, "watchConfirmedSend");
    const interceptor = registerSendInterceptor({
      annotations: () => numberAnnotations([annotation]),
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => "en",
      onSendConfirmed: vi.fn(),
    });

    const result = interceptor.submit();
    await vi.waitFor(() => expect(waitForButton).toHaveBeenCalledOnce());
    interceptor.dispose();
    await expect(result).resolves.toEqual({ status: "failed", reason: "disposed" });

    resolveButton({ status: "available", value: sendButton });
    await Promise.resolve();
    expect(watchConfirmedSend).not.toHaveBeenCalled();
    expect(composer.textContent).toBe("original question");
  });

  it("does not confirm a send when only the composer becomes empty", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    const onSendConfirmed = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed);
    const sendButton = installSendButton(() => composer.replaceChildren());

    const result = interceptor.submit(sendButton);
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
      annotations: () => numberAnnotations([annotation]),
      compilePrompt: compileAnnotatedPrompt,
      host,
      locale: () => "en",
      onSendConfirmed: vi.fn(),
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
    const onSendConfirmed = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed);
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

    const retryResult = interceptor.retry();
    await vi.advanceTimersByTimeAsync(17);
    await expect(retryResult).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    expect(retriedText).toContain("[Supplemental question]\noriginal question");
    expect(retriedText.match(/\[Annotation 1\]/g)).toHaveLength(1);
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation]);
    interceptor.dispose();
  });

  it("confirms a matching user message after the composer node is replaced", async () => {
    const composer = installComposer("original question");
    const onSendConfirmed = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed);
    const sendButton = installSendButton(() => {
      const compiledText = composer.textContent ?? "";
      composer.remove();
      installComposer();
      installUserMessage("user-message-after-replacement", compiledText);
    });

    await expect(interceptor.submit(sendButton)).resolves.toEqual({
      status: "confirmed",
      annotationIds: ["annotation-1"],
    });
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation]);
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
    expect(onSendConfirmed).toHaveBeenCalledWith([annotation]);
    interceptor.dispose();
  });

  it("ignores old and mismatched user messages while awaiting confirmation", async () => {
    vi.useFakeTimers();
    const composer = installComposer("original question");
    installUserMessage("old-message", "unrelated");
    const onSendConfirmed = vi.fn();
    const interceptor = createInterceptor(onSendConfirmed);
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
    expect(onSendConfirmed).not.toHaveBeenCalled();
    interceptor.dispose();
  });
});

type CreateInterceptorOptions = {
  annotations?: readonly (typeof annotation)[];
  host?: Host;
  onStateChange?: (state: AnnotatedSendState) => void;
};

function createInterceptor(
  onSendConfirmed = vi.fn(),
  {
    annotations = [annotation],
    host = createChatGptHost({ document, window }),
    onStateChange,
  }: CreateInterceptorOptions = {},
) {
  return registerSendInterceptor({
    annotations: () => numberAnnotations(annotations),
    compilePrompt: compileAnnotatedPrompt,
    host,
    locale: () => "en",
    onSendConfirmed,
    onStateChange,
  });
}
