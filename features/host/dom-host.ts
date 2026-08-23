import type { Host } from "@/features/host-port/host-port";
import type { SupportedSiteId } from "@quotecue/shared/supported-sites";

import { createComposerDriver } from "./composer-driver";
import { createComposerLayout } from "./composer-layout";
import { createHostContext } from "./host-context";
import type { HostEnvironment } from "./host-environment";
import { createNativeActionMount } from "./native-action-mount";
import { createSelectionAnchoring } from "./selection-anchoring";
import { createSelectionReveal } from "./selection-reveal";
import { createSelectionVisuals } from "./selection-visuals";
import type { SiteAdapter } from "./site-adapter";
import { createSendPipeline } from "./send-pipeline";

export function createHostEngine(
  environment: HostEnvironment,
  adapter: SiteAdapter,
  siteId: SupportedSiteId,
): Host {
  const context = createHostContext(environment, adapter);
  const composerDriver = createComposerDriver(context);
  const sendPipeline = createSendPipeline(context, composerDriver);
  const layout = createComposerLayout(context, composerDriver.current);
  const anchoring = createSelectionAnchoring(context);
  const reveal = createSelectionReveal(context);
  const visuals = createSelectionVisuals(context);
  const selection: Host["selection"] =
    adapter.selectionPresentation.mode === "native-toolbar"
      ? {
          ...anchoring,
          ...visuals,
          nativeAction: {
            mount: createNativeActionMount(context, adapter.selectionPresentation.toolbarBounds),
          },
          presentation: "native-toolbar",
          reveal,
        }
      : {
          ...anchoring,
          ...visuals,
          presentation: "overlay",
          reveal,
        };

  return {
    composer: {
      snapshot: composerDriver.snapshot,
      submit: sendPipeline.submit,
      subscribeToSubmit: sendPipeline.subscribeToSubmit,
    },
    conversation: {
      identity(sessionKey: string) {
        const conversationId = adapter.conversationId(context.window.location.pathname);
        return conversationId
          ? { kind: "identified" as const, id: conversationId, siteId }
          : { kind: "unidentified" as const, sessionKey };
      },
      subscribe: context.signals.subscribeNavigation,
    },
    layout,
    selection,
  };
}
