import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerSendInterceptor } from "@/features/chatgpt/register-send-interceptor";

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

    await expect(result).resolves.toEqual({ status: "accepted", revision: 1 });

    expect(replayedText).toContain("[Annotation 1]");
    expect(replayedText).not.toContain("[Supplemental question]");
    expect(onNativeSend).toHaveBeenCalledOnce();
    expect(onSendAccepted).toHaveBeenCalledOnce();
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

  it("treats a no-op composer replacement as a failed preparation", async () => {
    const composer = installComposer("original question");
    vi.mocked(document.execCommand).mockReturnValue(true);
    const interceptor = createInterceptor();

    await expect(interceptor.submit()).resolves.toEqual({
      status: "failed",
      reason: "replace-failed",
    });
    expect(composer.textContent).toBe("original question");
    expect(interceptor.getState()).toMatchObject({ status: "failed", reason: "replace-failed" });
    interceptor.dispose();
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

    await expect(interceptor.retry()).resolves.toEqual({ status: "accepted", revision: 1 });
    expect(retriedText).toContain("[Supplemental question]\noriginal question");
    expect(retriedText.match(/\[Annotation 1\]/g)).toHaveLength(1);
    expect(onSendAccepted).toHaveBeenCalledWith(1);
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
      revision: 1,
    });
    expect(onSendAccepted).toHaveBeenCalledWith(1);
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
    draft: () => ({ annotations: [annotation], revision: 1 }),
    locale: () => "en",
    onSendAccepted,
  });
}

function installUserMessage(messageId: string, text: string) {
  const message = document.createElement("div");
  message.dataset.messageAuthorRole = "user";
  message.dataset.messageId = messageId;
  message.textContent = text;
  document.body.append(message);
  return message;
}

function installComposer(text = "") {
  const composer = document.createElement("div");
  composer.id = "prompt-textarea";
  composer.setAttribute("contenteditable", "true");
  composer.textContent = text;
  Object.defineProperty(composer, "innerText", {
    configurable: true,
    get: () => composer.textContent ?? "",
  });
  document.body.append(composer);
  return composer;
}

function installSendButton(onClick: () => void = () => undefined) {
  const sendButton = document.createElement("button");
  sendButton.dataset.testid = "send-button";
  sendButton.addEventListener("click", onClick);
  document.body.append(sendButton);
  return sendButton;
}
