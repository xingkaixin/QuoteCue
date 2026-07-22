import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { captureAssistantSelection } from "@/features/annotations/selection-anchor";
import { registerSendInterceptor } from "@/features/chatgpt/register-send-interceptor";
import { useAnnotatedComposerLayout } from "@/features/chatgpt/use-annotated-composer-layout";

import { appendUserMessage, installChatGptHostFixture } from "./fixtures/chatgpt-host";

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => false),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
    },
  );
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ChatGPT host contract", () => {
  it("covers selection, layout, annotated send confirmation, and cleanup", async () => {
    const fixture = installChatGptHostFixture();
    const selectedText = fixture.assistantMessage.querySelector("strong")?.firstChild;
    if (!selectedText) {
      throw new Error("Expected fixture selection text");
    }
    const range = document.createRange();
    range.selectNodeContents(selectedText);
    window.getSelection()?.addRange(range);

    const selection = captureAssistantSelection();
    expect(selection?.anchor).toMatchObject({
      messageId: "assistant-one",
      quote: "focused answer",
    });

    const annotation: DraftAnnotation = {
      id: "annotation-one",
      anchor: selection?.anchor ?? missingAnchor(),
      comment: "Explain the tradeoff",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<LayoutProbe />));
    expect(container.textContent).toBe("112,708|456,748,36,36");

    let annotations = [annotation];
    const onSendAccepted = vi.fn(() => {
      annotations = [];
    });
    fixture.action.addEventListener("click", () => {
      const sentText = fixture.composer.textContent ?? "";
      appendUserMessage("user-one", sentText);
    });
    const interceptor = registerSendInterceptor({
      draft: () => ({ annotations, revision: 1 }),
      locale: () => "en",
      onSendAccepted,
    });

    await expect(interceptor.submit(fixture.action)).resolves.toEqual({
      status: "accepted",
      revision: 1,
    });
    expect(onSendAccepted).toHaveBeenCalledWith(1);
    expect(annotations).toEqual([]);

    interceptor.dispose();
    await act(async () => root.unmount());
    expect(fixture.surface.style.paddingTop).toBe("5px");
    expect(fixture.action.style.visibility).toBe("");
  });
});

function LayoutProbe() {
  const layout = useAnnotatedComposerLayout(true);
  return (
    <output>
      {layout
        ? `${layout.summary.left},${layout.summary.top}|${layout.send.left},${layout.send.top},${layout.send.width},${layout.send.height}`
        : "missing"}
    </output>
  );
}

function missingAnchor(): DraftAnnotation["anchor"] {
  throw new Error("Expected a captured anchor");
}
