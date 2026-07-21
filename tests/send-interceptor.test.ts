import { afterEach, describe, expect, it, vi } from "vitest";

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
  createdAt: 1,
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("registerSendInterceptor", () => {
  it("submits annotations when the composer has no supplemental question", async () => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });
    const composer = document.createElement("div");
    composer.id = "prompt-textarea";
    composer.setAttribute("contenteditable", "true");
    document.body.append(composer);

    const interceptor = registerSendInterceptor({
      annotations: () => [annotation],
      locale: () => "en",
      onSendAccepted: vi.fn(),
    });
    expect(interceptor.submit()).toBe(true);

    const sendButton = document.createElement("button");
    sendButton.dataset.testid = "send-button";
    const onNativeSend = vi.fn();
    sendButton.addEventListener("click", onNativeSend);
    document.body.append(sendButton);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(composer.textContent).toContain("[Annotation 1]");
    expect(composer.textContent).not.toContain("[Supplemental question]");
    expect(onNativeSend).toHaveBeenCalledOnce();

    interceptor.dispose();
  });
});
