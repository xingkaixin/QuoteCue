import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";
import type { Host, HostEnvironment, HostResult } from "@/features/host/dom-host";
import { QUOTECUE_NATIVE_ACTION_SELECTOR } from "@/lib/dom-identity";

import { requiredNativeAction } from "./fixtures/fixture-utils";

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
        reason: "anchor-unavailable",
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

    it("snapshots the configured composer", () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      const original = availableValue(siteHost.composer.snapshot());

      expect(original).toEqual({ element: fixture.composer, text: "Original question" });
    });

    it("owns composer replacement, dispatch, confirmation, and replay suppression", async () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      definition.setSendDisabled(fixture.sendControl, false);
      const onNativeSubmit = vi.fn();
      const stopListening = siteHost.composer.subscribeToSubmit(onNativeSubmit);
      fixture.sendControl.addEventListener("click", () => {
        const sentText = availableValue(siteHost.composer.snapshot()).text;
        definition.appendUserMessage(sentText);
      });
      const restoreTo = availableValue(siteHost.composer.snapshot());

      await expect(
        siteHost.composer.submit({
          restoreTo,
          signal: new AbortController().signal,
          text: "Replacement question",
        }),
      ).resolves.toEqual({ status: "available", value: "confirmed" });
      expect(availableValue(siteHost.composer.snapshot()).text).toBe("Replacement question");
      expect(onNativeSubmit).not.toHaveBeenCalled();
      stopListening();
    });

    it("restores the composer when submission is aborted before dispatch", async () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      definition.setSendDisabled(fixture.sendControl, false);
      const send = vi.fn();
      fixture.sendControl.addEventListener("click", send);
      const restoreTo = availableValue(siteHost.composer.snapshot());
      const controller = new AbortController();

      const result = siteHost.composer.submit({
        restoreTo,
        signal: controller.signal,
        text: "Replacement question",
      });
      controller.abort();

      await expect(result).resolves.toEqual({
        reason: "send-unavailable",
        status: "unavailable",
      });
      expect(availableValue(siteHost.composer.snapshot()).text).toBe("Original question");
      expect(send).not.toHaveBeenCalled();
    });

    it("reports replacement failure through the submit protocol", async () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      const restoreTo = availableValue(siteHost.composer.snapshot());
      fixture.composer.remove();

      await expect(
        siteHost.composer.submit({
          restoreTo,
          signal: new AbortController().signal,
          text: "Replacement question",
        }),
      ).resolves.toEqual({
        reason: "replace-failed",
        status: "unavailable",
      });
    });

    it("confirms only normalized user messages", async () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      definition.setSendDisabled(fixture.sendControl, false);
      let notifyDispatched: () => void = () => undefined;
      const dispatched = new Promise<void>((resolve) => {
        notifyDispatched = resolve;
      });
      fixture.sendControl.addEventListener("click", () => {
        definition.appendAssistantMessage("first \n second");
        notifyDispatched();
      });
      const result = siteHost.composer.submit({
        restoreTo: availableValue(siteHost.composer.snapshot()),
        signal: new AbortController().signal,
        text: "first\nsecond",
      });

      await dispatched;
      let isSettled = false;
      void result.then(() => {
        isSettled = true;
      });
      await nextFrame();
      expect(isSettled).toBe(false);

      definition.appendUserMessage("first \n second");
      await expect(result).resolves.toEqual({ status: "available", value: "confirmed" });
    });

    it("confirms a new user message after its character data completes", async () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      definition.setSendDisabled(fixture.sendControl, false);
      let userMessage: HTMLElement | null = null;
      let notifyDispatched: () => void = () => undefined;
      const dispatched = new Promise<void>((resolve) => {
        notifyDispatched = resolve;
      });
      fixture.sendControl.addEventListener("click", () => {
        userMessage = definition.appendUserMessage("pending");
        notifyDispatched();
      });
      const result = siteHost.composer.submit({
        restoreTo: availableValue(siteHost.composer.snapshot()),
        signal: new AbortController().signal,
        text: "completed message",
      });

      await dispatched;
      requiredText(userMessage).data = "completed message";
      await expect(result).resolves.toEqual({ status: "available", value: "confirmed" });
    });

    it("reserves and restores the configured composer row", () => {
      const fixture = definition.installFixture();
      fixture.surface.style.setProperty("padding-top", "7px", "important");
      fixture.sendControl.style.setProperty("visibility", "visible", "important");
      const siteHost = host();
      const release = siteHost.layout.reserveAnnotationRow(40);

      expect(fixture.surface.style.getPropertyValue("padding-top")).toBe("47px");
      expect(fixture.surface.style.getPropertyPriority("padding-top")).toBe("important");
      expect(fixture.sendControl.style.getPropertyValue("visibility")).toBe("hidden");
      expect(fixture.sendControl.style.getPropertyPriority("visibility")).toBe("important");
      expect(Object.keys(availableValue(siteHost.layout.current())).sort()).toEqual([
        "send",
        "summary",
      ]);

      release();
      expect(fixture.surface.style.getPropertyValue("padding-top")).toBe("7px");
      expect(fixture.surface.style.getPropertyPriority("padding-top")).toBe("important");
      expect(fixture.sendControl.style.getPropertyValue("visibility")).toBe("visible");
      expect(fixture.sendControl.style.getPropertyPriority("visibility")).toBe("important");
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

      expect(layout.send).toEqual({
        bottom: surfaceRect.bottom - 8,
        height: 36,
        left: surfaceRect.right - 44,
        right: surfaceRect.right - 8,
        top: surfaceRect.bottom - 44,
        width: 36,
      });
    });

    it("emits semantic selection capture intents", async () => {
      definition.installFixture();
      const onIntent = vi.fn();
      const stop = host().selection.observeCaptureIntent(onIntent);

      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));
      await nextFrame();
      expect(onIntent).toHaveBeenCalledOnce();
      expect(onIntent).toHaveBeenLastCalledWith("capture");

      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Escape" }));
      await nextFrame();
      expect(onIntent).toHaveBeenCalledTimes(2);
      expect(onIntent).toHaveBeenLastCalledWith("dismiss");

      window.dispatchEvent(new Event("scroll"));
      expect(onIntent).toHaveBeenLastCalledWith("dismiss");
      expect(onIntent).toHaveBeenCalledTimes(3);

      stop();
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextFrame();
      expect(onIntent).toHaveBeenCalledTimes(3);
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

    it("distinguishes a detached selection from a missing assistant message", () => {
      const detachedMessage = document.createElement("p");
      detachedMessage.textContent = "Detached selection";
      const range = document.createRange();
      range.selectNodeContents(detachedMessage);

      expect(host().selection.reveal(range)).toEqual({
        reason: "selection-detached",
        status: "unavailable",
      });
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
      async () => {
        const fixture = definition.installFixture();
        installSyntheticPasteSupport();
        const siteHost = host();
        definition.setSendDisabled(fixture.sendControl, false);
        fixture.composer.addEventListener("paste", (event) => {
          event.preventDefault();
          fixture.composer.textContent =
            (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
        });
        fixture.sendControl.addEventListener("click", () => {
          definition.appendUserMessage(availableValue(siteHost.composer.snapshot()).text);
        });

        await expect(
          siteHost.composer.submit({
            restoreTo: availableValue(siteHost.composer.snapshot()),
            signal: new AbortController().signal,
            text: "Replacement question",
          }),
        ).resolves.toEqual({ status: "available", value: "confirmed" });
        expect(document.execCommand).not.toHaveBeenCalled();
        expect(availableValue(siteHost.composer.snapshot()).text).toBe("Replacement question");
      },
    );

    it("sends annotations when the composer is empty", async () => {
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
        conversationIdentity: () => ({ kind: "identified", id: "conversation-test" }),
        host: siteHost,
        locale: () => "en",
        onSendConfirmed,
      });

      await expect(interceptor.submit()).resolves.toEqual({
        status: "confirmed",
        annotationIds: [annotation.id],
      });
      expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
        kind: "identified",
        id: "conversation-test",
      });
      interceptor.dispose();
    });

    it("ignores send events synthesized by host page script", () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      selectNodeContents(requiredText(fixture.assistantMessage.querySelector("strong")));
      const anchor = availableValue(siteHost.selection.capture()).anchor;
      definition.setSendDisabled(fixture.sendControl, false);
      const hostClick = vi.fn();
      fixture.sendControl.addEventListener("click", hostClick);
      const onSendConfirmed = vi.fn();
      const onStateChange = vi.fn();
      const interceptor = registerSendInterceptor({
        annotations: () =>
          numberAnnotations([
            { anchor, comment: "Explain the tradeoff", id: "annotation-contract" },
          ]),
        compilePrompt: compileAnnotatedPrompt,
        conversationIdentity: () => ({ kind: "identified", id: "conversation-test" }),
        host: siteHost,
        locale: () => "en",
        onSendConfirmed,
        onStateChange,
      });
      const composerText = availableValue(siteHost.composer.snapshot()).text;
      onStateChange.mockClear();

      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      fixture.sendControl.dispatchEvent(click);
      const enter = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" });
      fixture.composer.dispatchEvent(enter);

      expect(click.defaultPrevented).toBe(false);
      expect(enter.defaultPrevented).toBe(false);
      expect(hostClick).toHaveBeenCalledOnce();
      expect(availableValue(siteHost.composer.snapshot()).text).toBe(composerText);
      expect(onStateChange).not.toHaveBeenCalled();
      expect(onSendConfirmed).not.toHaveBeenCalled();
      interceptor.dispose();
    });

    it.skipIf(!definition.installSelectionToolbar)(
      "mounts a delayed native selection action",
      async () => {
        const siteHost = host();
        const stop = requiredNativeAction(siteHost).mount({
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
        const stop = requiredNativeAction(host()).mount({
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
      "stops native toolbar discovery after its time window",
      async () => {
        let now = 0;
        vi.spyOn(window.performance, "now").mockImplementation(() => now);
        const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
        const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");
        const stop = requiredNativeAction(host()).mount({
          label: "Add QuoteCue annotation",
          onActivate: vi.fn(),
          rect: selectionRectangle(),
        });

        document.body.append(document.createElement("span"));
        await Promise.resolve();
        expect(requestAnimationFrame).toHaveBeenCalledOnce();
        await new Promise<void>((resolve) => nativeRequestAnimationFrame(() => resolve()));

        requestAnimationFrame.mockClear();
        now = 2_000;
        document.body.append(document.createElement("span"));
        await Promise.resolve();
        expect(requestAnimationFrame).not.toHaveBeenCalled();
        stop();
      },
    );

    it.skipIf(!definition.installSelectionToolbar)(
      "finds a native toolbar from an endpoint fallback rectangle",
      () => {
        const { actionRow } =
          definition.installSelectionToolbar?.(new DOMRect(768, 49, 196, 36)) ?? missingToolbar();
        const stop = requiredNativeAction(host()).mount({
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
