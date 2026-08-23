import { afterEach, beforeEach, describe, vi } from "vitest";

import type { Host } from "@/features/host-port/host-port";
import type { HostEnvironment } from "@/features/host/host-environment";
import type { SupportedSiteId } from "@quotecue/shared/supported-sites";

import { runCoreHostContract } from "./host-contract/core";
import { runNativeActionHostContract } from "./host-contract/native-action";
import { runPresentationHostContract } from "./host-contract/presentation";
import { runSendHostContract } from "./host-contract/send";

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
  siteId: SupportedSiteId;
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

    runCoreHostContract(definition);
    runPresentationHostContract(definition);
    runSendHostContract(definition);
    runNativeActionHostContract(definition);
  });
}
