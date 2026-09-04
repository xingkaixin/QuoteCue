import { describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { registerSendInterceptor } from "@/features/annotations/register-send-interceptor";

import {
  availableValue,
  clearComposer,
  installSyntheticPasteSupport,
  requiredText,
  selectNodeContents,
} from "../fixtures/host-contract";

import type { HostContractDefinition } from "../host-contract-suite";

export function runSendHostContract(definition: HostContractDefinition) {
  describe("annotated send", () => {
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
      let sentText = "";
      fixture.sendControl.addEventListener("click", () => {
        sentText = availableValue(siteHost.composer.snapshot()).text;
        definition.appendUserMessage(sentText);
      });
      const annotation: DraftAnnotation = {
        anchor,
        comment: "Explain the tradeoff",
        id: "annotation-contract",
      };
      const onSendConfirmed = vi.fn();
      const interceptor = registerSendInterceptor({
        getSendInput: () => ({
          annotations: numberAnnotations([annotation]),
          conversationIdentity: {
            kind: "identified",
            id: "conversation-test",
            siteId: definition.siteId,
          },
          locale: "en",
        }),
        host: siteHost,
        onSendConfirmed,
      });

      interceptor.submit();
      await vi.waitFor(() =>
        expect(onSendConfirmed).toHaveBeenCalledWith([annotation], {
          kind: "identified",
          id: "conversation-test",
          siteId: definition.siteId,
        }),
      );
      expect(sentText).toContain("[Annotation 1]");
      expect(sentText).not.toContain("[Supplemental question]");
      interceptor.dispose();
    });

    it.each(["identified", "unidentified"] as const)(
      "rejects another transcript after sending from an %s conversation",
      async (source) => {
        window.history.replaceState(
          {},
          "",
          source === "identified"
            ? definition.conversation.matchedPath
            : definition.conversation.unmatchedPath,
        );
        const fixture = definition.installFixture();
        const siteHost = host();
        definition.setSendDisabled(fixture.sendControl, false);
        fixture.sendControl.addEventListener("click", () => {
          window.history.pushState({}, "", `${definition.conversation.matchedPath}-other`);
          fixture.assistantMessage.remove();
          fixture.userMessage.remove();
          definition.appendUserMessage("Replacement question");
        });

        await expect(
          siteHost.composer.submit({
            restoreTo: availableValue(siteHost.composer.snapshot()),
            signal: new AbortController().signal,
            text: "Replacement question",
          }),
        ).resolves.toEqual({ status: "unavailable", reason: "send-unavailable" });
      },
    );

    it("confirms an unidentified conversation after it acquires an ID", async () => {
      window.history.replaceState({}, "", definition.conversation.unmatchedPath);
      const fixture = definition.installFixture();
      const siteHost = host();
      definition.setSendDisabled(fixture.sendControl, false);
      fixture.sendControl.addEventListener("click", () => {
        window.history.replaceState({}, "", definition.conversation.matchedPath);
        definition.appendUserMessage("Replacement question");
      });

      await expect(
        siteHost.composer.submit({
          restoreTo: availableValue(siteHost.composer.snapshot()),
          signal: new AbortController().signal,
          text: "Replacement question",
        }),
      ).resolves.toEqual({ status: "available", value: "confirmed" });
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
        getSendInput: () => ({
          annotations: numberAnnotations([
            { anchor, comment: "Explain the tradeoff", id: "annotation-contract" },
          ]),
          conversationIdentity: {
            kind: "identified",
            id: "conversation-test",
            siteId: definition.siteId,
          },
          locale: "en",
        }),
        host: siteHost,
        onChange: onStateChange,
        onSendConfirmed,
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

    function host() {
      return definition.createHost({ document, window });
    }
  });
}
