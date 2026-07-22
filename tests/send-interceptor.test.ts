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
    });
    installSendButton(onNativeSend);

    await expect(result).resolves.toEqual({ status: "accepted" });

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

  it("currently accepts a send when only the composer becomes empty", async () => {
    const composer = installComposer("original question");
    const onSendAccepted = vi.fn();
    const interceptor = createInterceptor(onSendAccepted);
    const sendButton = installSendButton(() => composer.replaceChildren());

    await expect(interceptor.submit(sendButton)).resolves.toEqual({ status: "accepted" });
    expect(onSendAccepted).toHaveBeenCalledOnce();
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
