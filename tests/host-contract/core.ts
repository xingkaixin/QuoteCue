import { describe, expect, it, vi } from "vitest";

import {
  availableValue,
  nextFrame,
  requiredText,
  selectNodeContents,
  selectRange,
} from "../fixtures/host-contract";

import type { HostContractDefinition } from "../host-contract-suite";

export function runCoreHostContract(definition: HostContractDefinition) {
  describe("core behavior", () => {
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
          siteId: definition.siteId,
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

    it("fails closed when assistant message identities are duplicated", () => {
      const fixture = definition.installFixture();
      const duplicate = fixture.assistantMessage.cloneNode(true) as HTMLElement;
      fixture.assistantMessage.after(duplicate);
      const logger = vi.fn();
      const siteHost = definition.createHost({ document, logger, window });

      expect(siteHost.selection.messageIndex().has(definition.expectedMessageId)).toBe(false);
      expect(logger).toHaveBeenCalledWith("[QuoteCue host] duplicate assistant message identity");
    });

    it("invalidates a cached message identity when a duplicate is added", async () => {
      const fixture = definition.installFixture();
      const logger = vi.fn();
      const siteHost = definition.createHost({ document, logger, window });
      const onInvalidation = vi.fn();
      const stop = siteHost.selection.observeInvalidation(onInvalidation);
      expect(siteHost.selection.messageIndex().get(definition.expectedMessageId)).toBe(
        fixture.assistantMessage,
      );

      fixture.assistantMessage.after(fixture.assistantMessage.cloneNode(true));
      await vi.waitFor(() =>
        expect(onInvalidation).toHaveBeenCalledWith({
          dirtyMessageIds: new Set([definition.expectedMessageId]),
          reason: "content",
        }),
      );

      expect(
        siteHost.selection
          .messageIndex(new Set([definition.expectedMessageId]))
          .has(definition.expectedMessageId),
      ).toBe(false);
      expect(logger).toHaveBeenCalledWith("[QuoteCue host] duplicate assistant message identity");
      stop();
    });

    it("rejects selections inside user messages", () => {
      const fixture = definition.installFixture();
      selectNodeContents(fixture.userMessage);

      expect(host().selection.capture()).toEqual({ status: "unavailable" });
    });

    it("rejects assistant selections without a message identity", () => {
      const fixture = definition.installFixture();
      definition.removeMessageIdentity(fixture);
      selectNodeContents(requiredText(fixture.assistantMessage.querySelector("strong")));
      const logger = vi.fn();
      const siteHost = definition.createHost({ document, logger, window });

      expect(siteHost.selection.capture()).toEqual({ status: "unavailable" });
      expect(logger).toHaveBeenCalledWith("[QuoteCue host] unavailable: anchor-unavailable");
    });

    it("rejects a selection spanning two assistant messages", () => {
      const fixture = definition.installFixture();
      const secondMessage = definition.appendAssistantMessage("Second assistant answer");
      const range = document.createRange();
      range.setStart(requiredText(fixture.assistantMessage.querySelector("strong")), 0);
      range.setEnd(secondMessage, secondMessage.childNodes.length);
      selectRange(range);

      expect(host().selection.capture()).toEqual({ status: "unavailable" });
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
      definition.installFixture();
      const siteHost = host();
      const original = availableValue(siteHost.composer.snapshot());

      expect(original).toEqual({ text: "Original question" });
    });

    it("rejects a composer snapshot not created by the host", async () => {
      const fixture = definition.installFixture();
      const siteHost = host();

      await expect(
        siteHost.composer.submit({
          restoreTo: { text: "Original question" },
          signal: new AbortController().signal,
          text: "Replacement question",
        }),
      ).resolves.toEqual({ reason: "send-unavailable", status: "unavailable" });
      expect(fixture.composer.textContent).toBe("Original question");
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
      const logger = vi.fn();
      const siteHost = definition.createHost({ document, logger, window });
      const restoreTo = availableValue(siteHost.composer.snapshot());
      fixture.composer.remove();

      await expect(
        siteHost.composer.submit({
          restoreTo,
          signal: new AbortController().signal,
          text: "Replacement question",
        }),
      ).resolves.toEqual({
        reason: "send-unavailable",
        status: "unavailable",
      });
      expect(logger).toHaveBeenCalledWith("[QuoteCue host] composer replacement failed");
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

    function host() {
      return definition.createHost({ document, window });
    }
  });
}
