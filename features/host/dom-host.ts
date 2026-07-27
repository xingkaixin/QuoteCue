import { createComposerDriver } from "./composer-driver";
import { createComposerLayout } from "./composer-layout";
import type { Host, HostUnavailableReason } from "@/features/host-port/host-port";
import { createHostContext, type HostEnvironment } from "./host-context";
import type { SiteAdapter } from "./site-adapter";
import { createSelectionSurface } from "./selection-surface";
import { createSendPipeline } from "./send-pipeline";
import { createTextNormalizer } from "./text-normalizer";

export type {
  AnchoredSelection,
  ComposerSnapshot,
  ConversationIdentity,
  Host,
  HostLayout,
  HostResult,
  HostUnavailableReason,
  SelectionCapture,
  SelectionCaptureIntent,
  SelectionInvalidation,
  SelectionPresentationMode,
  SelectionRect,
  TextAnchor,
} from "@/features/host-port/host-port";
export type { HostEnvironment } from "./host-context";

export function createDomHost(environment: HostEnvironment, adapter: SiteAdapter): Host {
  const context = createHostContext(environment, adapter);
  const textNormalizer = createTextNormalizer(adapter.composer);
  const composerDriver = createComposerDriver(context, textNormalizer);
  const sendPipeline = createSendPipeline(context, textNormalizer);
  const layout = createComposerLayout(context, composerDriver.current);
  const selection = createSelectionSurface(context);

  return {
    composer: {
      isButtonAvailable: sendPipeline.isButtonAvailable,
      replaceText: composerDriver.replaceText,
      restoreText: composerDriver.restoreText,
      snapshot: composerDriver.snapshot,
      subscribeToSubmit: sendPipeline.subscribeToSubmit,
      waitForButton: sendPipeline.waitForButton,
      watchConfirmedSend: sendPipeline.watchConfirmedSend,
    },
    conversation: {
      identity(sessionKey: string) {
        const conversationId = context.window.location.pathname.match(
          adapter.conversationPathPattern,
        )?.[1];
        return conversationId
          ? { kind: "identified" as const, id: conversationId }
          : { kind: "unidentified" as const, sessionKey };
      },
      subscribe: context.signals.subscribeNavigation,
    },
    layout,
    reportUnavailable(reason: HostUnavailableReason) {
      context.logger?.(`[QuoteCue host] unavailable: ${reason}`);
    },
    selection,
  };
}
