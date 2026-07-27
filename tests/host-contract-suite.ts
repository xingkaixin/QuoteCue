import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";
import type { Host, HostEnvironment, HostResult } from "@/features/host/dom-host";
import { QUOTECUE_NATIVE_ACTION_SELECTOR } from "@/lib/dom-identity";

export type CoreHostFixture = {
  assistantMessage: HTMLElement;
  composer: HTMLElement;
  sendControl: HTMLElement;
  surface: HTMLElement;
  userMessage: HTMLElement;
};

export type HostContractDefinition = {
  appendAssistantMessage: (text: string) => HTMLElement;
  appendUserMessage: (text: string) => HTMLElement;
  conversation: {
    additionalMatchedPaths?: string[];
    id: string;
    matchedPath: string;
    unmatchedPath: string;
  };
  createHost: (environment: HostEnvironment) => Host;
  expectedMessageId: string;
  installSelectionToolbar?: (rect?: DOMRect) => { actionRow: HTMLElement };
  installFixture: () => CoreHostFixture;
  removeMessageIdentity: (fixture: CoreHostFixture) => void;
  name: string;
  selectionPresentation: "native-toolbar" | "overlay";
  setSendDisabled: (control: HTMLElement, isDisabled: boolean) => void;
  supportsSyntheticPaste: boolean;
};

export function runHostContractSuite(definition: HostContractDefinition) {
  describe(`${definition.name} shared host contract`, () => {
    beforeEach(() => {
      window.history.replaceState({}, "", "/");
      document.body.replaceChildren();
      window.getSelection()?.removeAllRanges();
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: vi.fn(() => false),
      });
      vi.stubGlobal("ClipboardEvent", undefined);
      vi.stubGlobal("DataTransfer", undefined);
    });

    afterEach(() => {
      window.getSelection()?.removeAllRanges();
      window.history.replaceState({}, "", "/");
      document.body.replaceChildren();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("exposes the configured selection presentation", () => {
      expect(host().selection.presentation).toBe(definition.selectionPresentation);
    });

    it("identifies supported conversation paths and marks unmatched paths unidentified", () => {
      const siteHost = host();
      const matchedPaths = [
        definition.conversation.matchedPath,
        ...(definition.conversation.additionalMatchedPaths ?? []),
      ];
      for (const path of matchedPaths) {
        window.history.replaceState({}, "", path);
        expect(siteHost.conversation.identity("session-contract")).toEqual({
          kind: "identified",
          id: definition.conversation.id,
        });
      }

      window.history.replaceState({}, "", definition.conversation.unmatchedPath);
      expect(siteHost.conversation.identity("session-contract")).toEqual({
        kind: "unidentified",
        sessionKey: "session-contract",
      });
    });

    it("indexes only assistant messages and captures their anchors", () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      selectNodeContents(requiredText(fixture.assistantMessage.querySelector("strong")));

      const captured = availableValue(siteHost.selection.capture());
      expect(captured.anchor).toMatchObject({
        format: "exact",
        messageId: definition.expectedMessageId,
        quote: "focused answer",
      });
      expect([...siteHost.selection.messageIndex()]).toEqual([
        [definition.expectedMessageId, fixture.assistantMessage],
      ]);
      expect([...siteHost.selection.messageIndex().values()]).not.toContain(fixture.userMessage);
      siteHost.selection.clear();
      expect(window.getSelection()?.rangeCount).toBe(0);
    });

    it("rejects selections inside user messages", () => {
      const fixture = definition.installFixture();
      selectNodeContents(fixture.userMessage);

      expect(host().selection.capture()).toEqual({
        reason: "assistant-message-unavailable",
        status: "unavailable",
      });
    });

    it("rejects assistant selections without a message identity", () => {
      const fixture = definition.installFixture();
      definition.removeMessageIdentity(fixture);
      selectNodeContents(requiredText(fixture.assistantMessage.querySelector("strong")));

      expect(host().selection.capture()).toEqual({
        reason: "assistant-message-unavailable",
        status: "unavailable",
      });
    });

    it("rejects a selection spanning two assistant messages", () => {
      const fixture = definition.installFixture();
      const secondMessage = definition.appendAssistantMessage("Second assistant answer");
      const range = document.createRange();
      range.setStart(requiredText(fixture.assistantMessage.querySelector("strong")), 0);
      range.setEnd(secondMessage, secondMessage.childNodes.length);
      selectRange(range);

      expect(host().selection.capture()).toEqual({
        reason: "assistant-message-unavailable",
        status: "unavailable",
      });
    });

    it("captures a selection spanning structured text nodes", () => {
      const fixture = definition.installFixture();
      fixture.assistantMessage.innerHTML =
        "<table><tbody><tr><td>alpha</td><td>beta</td></tr></tbody></table>";
      const cells = fixture.assistantMessage.querySelectorAll("td");
      const range = document.createRange();
      range.setStart(requiredText(cells.item(0)), 0);
      range.setEnd(requiredText(cells.item(1)), 4);
      const selection = selectRange(range);
      const renderedText = vi.spyOn(selection, "toString").mockReturnValue("alpha beta");
      const siteHost = host();

      const captured = availableValue(siteHost.selection.capture());
      renderedText.mockRestore();
      expect(captured.anchor).toMatchObject({
        displayQuote: "alpha beta",
        end: 9,
        quote: "alphabeta",
        start: 0,
      });
    });

    it("snapshots, replaces, and restores the configured composer", () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      const original = availableValue(siteHost.composer.snapshot());

      expect(original).toEqual({ element: fixture.composer, text: "Original question" });
      expect(siteHost.composer.replaceText(fixture.composer, "Replacement question")).toBe(true);
      expect(availableValue(siteHost.composer.snapshot()).text).toBe("Replacement question");
      expect(siteHost.composer.restoreText(original, "Replacement question")).toBe(true);
      expect(availableValue(siteHost.composer.snapshot()).text).toBe("Original question");
    });

    it("resolves the configured send control and its disabled state", async () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      definition.setSendDisabled(fixture.sendControl, false);

      expect(siteHost.composer.isButtonAvailable(fixture.sendControl)).toBe(true);
      expect(
        availableValue(await siteHost.composer.waitForButton(new AbortController().signal)),
      ).toBe(fixture.sendControl);

      definition.setSendDisabled(fixture.sendControl, true);
      expect(siteHost.composer.isButtonAvailable(fixture.sendControl)).toBe(false);
    });

    it("confirms only normalized user messages", async () => {
      definition.installFixture();
      const siteHost = host();
      const onConfirmed = vi.fn();
      const onTimeout = vi.fn();
      const stop = siteHost.composer.watchConfirmedSend({
        expectedText: "first\nsecond",
        onConfirmed,
        onTimeout,
        signal: new AbortController().signal,
      });

      definition.appendAssistantMessage("first \n second");
      await Promise.resolve();
      expect(onConfirmed).not.toHaveBeenCalled();

      definition.appendUserMessage("first \n second");
      await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce());
      expect(onTimeout).not.toHaveBeenCalled();
      stop();
    });

    it("confirms a new user message after its character data completes", async () => {
      definition.installFixture();
      const onConfirmed = vi.fn();
      const stop = host().composer.watchConfirmedSend({
        expectedText: "completed message",
        onConfirmed,
        onTimeout: vi.fn(),
        signal: new AbortController().signal,
      });

      const userMessage = definition.appendUserMessage("pending");
      await Promise.resolve();
      expect(onConfirmed).not.toHaveBeenCalled();

      requiredText(userMessage).data = "completed message";
      await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce());
      stop();
    });

    it("finds the configured composer surface and action", () => {
      const fixture = definition.installFixture();
      const layout = availableValue(host().layout.current());

      expect(layout.surface).toBe(fixture.surface);
      expect(layout.action).toBe(fixture.sendControl);
    });

    it("reports a collapsed selection as unavailable", () => {
      definition.installFixture();
      window.getSelection()?.removeAllRanges();

      expect(host().selection.capture()).toEqual({
        reason: "selection-unavailable",
        status: "unavailable",
      });
    });

    it("reports a composer without a visual surface", () => {
      const fixture = definition.installFixture();
      fixture.surface.style.backgroundColor = "transparent";
      fixture.surface.style.borderTopLeftRadius = "0";

      expect(host().layout.current()).toEqual({
        reason: "composer-surface-unavailable",
        status: "unavailable",
      });
    });

    it("does not intercept Enter while an IME composition is active", () => {
      const fixture = definition.installFixture();
      const onSubmit = vi.fn();
      const stop = host().composer.subscribeToSubmit(onSubmit);
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        isComposing: true,
        key: "Enter",
      });

      fixture.composer.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(onSubmit).not.toHaveBeenCalled();
      stop();
    });

    it("uses the configured fallback send rectangle when no action is available", () => {
      const fixture = definition.installFixture();
      const surfaceRect = fixture.surface.getBoundingClientRect();
      fixture.sendControl.remove();
      for (const action of fixture.surface.querySelectorAll("button, [role='button']")) {
        action.remove();
      }

      const layout = availableValue(host().layout.current());

      expect(layout.action ?? null).toBeNull();
      expect(layout.send).toEqual({
        bottom: surfaceRect.bottom - 8,
        height: 36,
        left: surfaceRect.right - 44,
        right: surfaceRect.right - 8,
        top: surfaceRect.bottom - 44,
        width: 36,
      });
    });

    it("classifies viewport and message content invalidations", async () => {
      const fixture = definition.installFixture();
      const onInvalidation = vi.fn();
      const stop = host().selection.observeInvalidation(onInvalidation);

      window.dispatchEvent(new Event("resize"));
      expect(onInvalidation).toHaveBeenLastCalledWith({ reason: "layout" });

      onInvalidation.mockClear();
      requiredText(fixture.assistantMessage.querySelector("strong")).textContent = "updated answer";
      await vi.waitFor(() =>
        expect(onInvalidation).toHaveBeenCalledWith({
          dirtyMessageIds: new Set([definition.expectedMessageId]),
          reason: "content",
        }),
      );

      stop();
      onInvalidation.mockClear();
      requiredText(fixture.assistantMessage.querySelector("strong")).textContent =
        "detached observer";
      await Promise.resolve();
      expect(onInvalidation).not.toHaveBeenCalled();
    });

    it("does not classify composer character data as message content", async () => {
      const fixture = definition.installFixture();
      const composerText = document.createTextNode("composer text");
      fixture.composer.replaceChildren(composerText);
      const onInvalidation = vi.fn();
      const stop = host().selection.observeInvalidation(onInvalidation);

      composerText.data = "typed composer text";
      await Promise.resolve();

      expect(onInvalidation).not.toHaveBeenCalled();

      requiredText(fixture.assistantMessage.querySelector("strong")).data = "updated answer";
      await vi.waitFor(() =>
        expect(onInvalidation).toHaveBeenCalledWith({
          dirtyMessageIds: new Set([definition.expectedMessageId]),
          reason: "content",
        }),
      );
      stop();
    });

    it("centers an offscreen endpoint in the nearest scroll container", () => {
      const fixture = definition.installFixture();
      const scrollContainer = document.createElement("div");
      scrollContainer.style.overflowY = "auto";
      Object.defineProperties(scrollContainer, {
        clientHeight: { configurable: true, value: 400 },
        scrollHeight: { configurable: true, value: 1_200 },
        getBoundingClientRect: {
          configurable: true,
          value: () => new DOMRect(0, 100, 800, 400),
        },
      });
      scrollContainer.scrollTop = 50;
      fixture.assistantMessage.replaceWith(scrollContainer);
      scrollContainer.append(fixture.assistantMessage);
      const range = document.createRange();
      range.selectNodeContents(fixture.assistantMessage);
      Object.defineProperty(range, "getClientRects", {
        configurable: true,
        value: () => [new DOMRect(100, 900, 160, 20)],
      });

      expect(host().selection.reveal(range)).toEqual({
        status: "available",
        value: "scrolled",
      });
      expect(scrollContainer.scrollTop).toBe(660);
    });

    it.skipIf(!definition.supportsSyntheticPaste)(
      "uses synthetic paste before the rich-text fallback",
      () => {
        const fixture = definition.installFixture();
        installSyntheticPasteSupport();
        fixture.composer.addEventListener("paste", (event) => {
          event.preventDefault();
          fixture.composer.textContent =
            (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
        });

        expect(host().composer.replaceText(fixture.composer, "Replacement question")).toBe(true);
        expect(document.execCommand).not.toHaveBeenCalled();
        expect(availableValue(host().composer.snapshot()).text).toBe("Replacement question");
      },
    );

    it("takes over a native send when the composer is empty", async () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      selectNodeContents(requiredText(fixture.assistantMessage.querySelector("strong")));
      const anchor = availableValue(siteHost.selection.capture()).anchor;
      clearComposer(fixture.composer);
      definition.setSendDisabled(fixture.sendControl, true);
      fixture.composer.addEventListener("input", () => {
        definition.setSendDisabled(fixture.sendControl, false);
      });
      fixture.sendControl.addEventListener("click", () => {
        const text = availableValue(siteHost.composer.snapshot()).text;
        definition.appendUserMessage(text);
      });
      const annotation: DraftAnnotation = {
        anchor,
        comment: "Explain the tradeoff",
        id: "annotation-contract",
      };
      const onSendConfirmed = vi.fn();
      const interceptor = registerSendInterceptor({
        annotations: () => numberAnnotations([annotation]),
        compilePrompt: compileAnnotatedPrompt,
        host: siteHost,
        locale: () => "en",
        onSendConfirmed,
      });
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });

      fixture.sendControl.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(onSendConfirmed).toHaveBeenCalledWith([annotation]));
      interceptor.dispose();
    });

    it.skipIf(!definition.installSelectionToolbar)(
      "mounts a delayed native selection action",
      async () => {
        const siteHost = host();
        const stop = siteHost.selection.mountAction({
          label: "Add QuoteCue annotation",
          onActivate: vi.fn(),
          rect: selectionRectangle(),
        });

        const { actionRow } = definition.installSelectionToolbar?.() ?? missingToolbar();
        await nextFrame();

        expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();
        stop();
      },
    );

    it.skipIf(!definition.installSelectionToolbar)(
      "coalesces native toolbar discovery within a frame",
      async () => {
        const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
        const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");
        const stop = host().selection.mountAction({
          label: "Add QuoteCue annotation",
          onActivate: vi.fn(),
          rect: selectionRectangle(),
        });

        const { actionRow } = definition.installSelectionToolbar?.() ?? missingToolbar();
        await Promise.resolve();
        document.body.append(document.createElement("span"));
        await Promise.resolve();
        expect(requestAnimationFrame).toHaveBeenCalledOnce();

        await new Promise<void>((resolve) => nativeRequestAnimationFrame(() => resolve()));
        expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();

        document.body.append(document.createElement("span"));
        await Promise.resolve();
        expect(requestAnimationFrame).toHaveBeenCalledOnce();
        stop();
      },
    );

    it.skipIf(!definition.installSelectionToolbar)(
      "finds a native toolbar from an endpoint fallback rectangle",
      () => {
        const { actionRow } =
          definition.installSelectionToolbar?.(new DOMRect(768, 49, 196, 36)) ?? missingToolbar();
        const stop = host().selection.mountAction({
          label: "Add QuoteCue annotation",
          onActivate: vi.fn(),
          rect: {
            bottom: 88,
            height: 62,
            left: 436,
            right: 897,
            top: 26,
            width: 461,
          },
        });

        expect(actionRow.querySelector(QUOTECUE_NATIVE_ACTION_SELECTOR)).not.toBeNull();
        stop();
      },
    );
  });

  function host() {
    return definition.createHost({ document, window });
  }
}

function availableValue<T>(result: HostResult<T>) {
  if (result.status === "unavailable") {
    throw new Error(`Expected available host result, received ${result.reason}`);
  }
  return result.value;
}

function requiredText(node: Node | null) {
  if (!node) {
    throw new Error("Expected fixture text");
  }
  const text = node.nodeType === Node.TEXT_NODE ? node : node.firstChild;
  if (!(text instanceof Text)) {
    throw new Error("Expected fixture text");
  }
  return text;
}

function selectNodeContents(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  selectRange(range);
}

function selectRange(range: Range) {
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("Expected document selection");
  }
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

function clearComposer(composer: HTMLElement) {
  if (composer instanceof HTMLTextAreaElement) {
    composer.value = "";
    return;
  }
  composer.replaceChildren();
}

function installSyntheticPasteSupport() {
  class FakeDataTransfer {
    private store = new Map<string, string>();

    getData(type: string) {
      return this.store.get(type) ?? "";
    }

    setData(type: string, value: string) {
      this.store.set(type, value);
    }
  }

  class FakeClipboardEvent extends Event {
    clipboardData: FakeDataTransfer | null;

    constructor(type: string, init?: EventInit & { clipboardData?: FakeDataTransfer }) {
      super(type, init);
      this.clipboardData = init?.clipboardData ?? null;
    }
  }

  vi.stubGlobal("DataTransfer", FakeDataTransfer);
  vi.stubGlobal("ClipboardEvent", FakeClipboardEvent);
}

function missingToolbar(): never {
  throw new Error("Expected a native selection toolbar fixture");
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function selectionRectangle() {
  return { bottom: 220, height: 20, left: 100, right: 360, top: 200, width: 260 };
}
