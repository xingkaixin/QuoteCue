import { createComposerDriver } from "./composer-driver";
import { createComposerLayout } from "./composer-layout";
import {
  createHostContext,
  type HostEnvironment,
  type HostUnavailableReason,
  type SiteAdapter,
} from "./host-context";
import { createSelectionSurface } from "./selection-surface";
import { createSendPipeline } from "./send-pipeline";
import { createTextNormalizer } from "./text-normalizer";

export type {
  ComposerSnapshot,
  HostEnvironment,
  HostResult,
  HostUnavailableReason,
  SelectionInvalidationReason,
  SiteAdapter,
} from "./host-context";

export function createDomHost(environment: HostEnvironment, adapter: SiteAdapter) {
  const context = createHostContext(environment, adapter);
  const textNormalizer = createTextNormalizer(adapter);
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
      watchAcceptedSend: sendPipeline.watchAcceptedSend,
    },
    conversation: {
      key(temporaryConversationKey: string) {
        return (
          context.window.location.pathname.match(adapter.conversationPathPattern)?.[1] ??
          temporaryConversationKey
        );
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

export type Host = ReturnType<typeof createDomHost>;
