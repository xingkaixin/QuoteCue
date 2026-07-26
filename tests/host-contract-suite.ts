import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { restoreTextAnchorFromIndex } from "@/features/annotations/selection-anchor";
import type { Host, HostEnvironment, HostResult } from "@/features/host/dom-host";

export type CoreHostFixture = {
  assistantMessage: HTMLElement;
  composer: HTMLElement;
  sendControl: HTMLElement;
  surface: HTMLElement;
  userMessage: HTMLElement;
};

export type HostContractDefinition = {
  appendAssistantMessage: (text: string) => HTMLElement;
  appendUserMessage: (text: string) => void;
  conversation: {
    additionalMatchedPaths?: string[];
    id: string;
    matchedPath: string;
    unmatchedPath: string;
  };
  createHost: (environment: HostEnvironment) => Host;
  expectedMessageId: string;
  installFixture: () => CoreHostFixture;
  invalidateCapturedIdentity: (fixture: CoreHostFixture) => void;
  removeMessageIdentity: (fixture: CoreHostFixture) => void;
  name: string;
  selectionPresentation: "native-toolbar" | "overlay";
  setSendDisabled: (control: HTMLElement, isDisabled: boolean) => void;
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

    it("indexes only assistant messages and round-trips a captured anchor", () => {
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
      expect(
        restoreTextAnchorFromIndex(captured.anchor, siteHost.selection.messageIndex()),
      ).not.toBeNull();
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

    it("restores a selection spanning structured text nodes", () => {
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
        quote: "alphabeta",
      });
      expect(
        restoreTextAnchorFromIndex(captured.anchor, siteHost.selection.messageIndex()),
      ).not.toBeNull();
    });

    it("fails closed after the captured message identity changes", () => {
      const fixture = definition.installFixture();
      const siteHost = host();
      selectNodeContents(requiredText(fixture.assistantMessage.querySelector("strong")));
      const anchor = availableValue(siteHost.selection.capture()).anchor;

      definition.invalidateCapturedIdentity(fixture);

      expect(restoreTextAnchorFromIndex(anchor, siteHost.selection.messageIndex())).toBeNull();
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
  if (!text) {
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
