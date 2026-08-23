import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { SelectionPresentation } from "@/features/annotations/SelectionPresentation";
import { createDeepSeekHost } from "@/features/deepseek/deepseek-host";
import { I18nProvider } from "@/features/i18n/I18nProvider";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";
import type { AnchoredSelection } from "@/features/annotations/annotation";

import {
  appendAssistantMessageItem,
  appendUserMessageItem,
  installDeepSeekHostFixture,
} from "./fixtures/deepseek-host";
import { HostTestProvider } from "./fixtures/host-provider";

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
  document.documentElement.lang = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DeepSeek host contract", () => {
  it("rejects selections inside collapsible think content", () => {
    const fixture = installDeepSeekHostFixture();
    const host = createDeepSeekHost({ document, window });
    selectNodeContents(fixture.thinkContent.firstChild);

    expect(host.selection.capture()).toEqual({ status: "unavailable" });
  });

  it("uses the send control without activating the stop control", async () => {
    const fixture = installDeepSeekHostFixture();
    const host = createDeepSeekHost({ document, window });
    const onStop = vi.fn();
    fixture.stopButton.addEventListener("click", onStop);
    fixture.sendButton.addEventListener("click", () => {
      appendUserMessageItem("user-two", fixture.composer.value);
    });
    const snapshot = host.composer.snapshot();
    if (snapshot.status === "unavailable") {
      throw new Error("Expected the DeepSeek composer");
    }

    await expect(
      host.composer.submit({
        restoreTo: snapshot.value,
        signal: new AbortController().signal,
        text: "Replacement question",
      }),
    ).resolves.toEqual({
      status: "available",
      value: "confirmed",
    });
    expect(onStop).not.toHaveBeenCalled();
  });

  it("does not read a streaming assistant response as a send confirmation candidate", async () => {
    const fixture = installDeepSeekHostFixture();
    const logger = vi.fn();
    const host = createDeepSeekHost({ document, logger, window });
    let assistantInnerTextReads = 0;
    fixture.sendButton.addEventListener("click", () => {
      const assistant = appendAssistantMessageItem("assistant-two", "streaming");
      Object.defineProperty(assistant, "innerText", {
        configurable: true,
        get: () => {
          assistantInnerTextReads += 1;
          return assistant.textContent ?? "";
        },
      });
      assistant.textContent = "streaming response";
    });
    const interceptor = registerSendInterceptor({
      getSendInput: () => ({
        annotations: numberAnnotations([
          { id: "annotation-one", anchor: emptyAnchor(), comment: "Explain the tradeoff" },
        ]),
        conversationIdentity: {
          kind: "identified",
          id: "conversation-test",
          siteId: "deepseek",
        },
        locale: "en",
      }),
      host,
      onSendConfirmed: vi.fn(),
    });

    interceptor.submit();
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => {
        resolve();
      }),
    );
    expect(assistantInnerTextReads).toBe(0);
    expect(
      logger.mock.calls.some(([message]) =>
        String(message).startsWith("[QuoteCue host] send confirmation observed"),
      ),
    ).toBe(false);

    interceptor.dispose();
  });

  it("renders the floating QuoteCue action for overlay hosts", async () => {
    const fixture = installDeepSeekHostFixture();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onActivate = vi.fn();
    const host = createDeepSeekHost({ document, window });
    document.documentElement.lang = "ja";

    await act(async () =>
      root.render(
        <I18nProvider>
          <HostTestProvider host={host}>
            <OverlayHarness onActivate={onActivate} />
          </HostTestProvider>
        </I18nProvider>,
      ),
    );
    selectNodeContents(fixture.assistantContent.querySelector("strong")?.firstChild);
    await act(async () => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextFrame();
    });

    const action = container.querySelector<HTMLButtonElement>(
      'button[aria-label="QuoteCue 注釈を追加"]',
    );
    expect(action).not.toBeNull();
    expect(action?.textContent).toContain("QuoteCue");

    await act(async () => action?.click());
    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate.mock.calls[0]?.[0].anchor.quote).toBe("focused answer");
    expect(container.querySelector("button")).toBeNull();

    await act(async () => root.unmount());
  });
});

function OverlayHarness({ onActivate }: { onActivate: (selection: AnchoredSelection) => void }) {
  return (
    <SelectionPresentation
      conversationIdentity={{ kind: "identified", id: "conversation-a", siteId: "deepseek" }}
      isEnabled
      onActivate={onActivate}
    />
  );
}

function selectNodeContents(node: ChildNode | null | undefined) {
  if (!node) {
    throw new Error("Expected a text node");
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  Object.defineProperty(range, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 260, height: 60, left: 100, right: 800, top: 200, width: 700 }),
  });
  Object.defineProperty(range, "getClientRects", {
    configurable: true,
    value: () => [new DOMRect(100, 200, 260, 20), new DOMRect(100, 240, 120, 20)],
  });
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

function emptyAnchor() {
  return {
    end: 13,
    format: "exact" as const,
    messageId: "assistant-one",
    prefix: "",
    quote: "selected text",
    start: 0,
    suffix: "",
  };
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
