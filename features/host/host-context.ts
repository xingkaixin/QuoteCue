import { createHostSignals } from "./host-signals";
import type { HostEnvironment } from "./host-environment";
import type { SiteAdapter } from "./site-adapter";

export type HostContext = HostEnvironment & {
  adapter: SiteAdapter;
  composerBoundary(composer: HTMLElement): HTMLElement | null;
  sendControl(composer: HTMLElement): HTMLElement | null;
  signals: ReturnType<typeof createHostSignals>;
};

export function createHostContext(environment: HostEnvironment, adapter: SiteAdapter): HostContext {
  const composerBoundary = (composer: HTMLElement) =>
    adapter.layout.boundarySelector
      ? composer.closest<HTMLElement>(adapter.layout.boundarySelector)
      : (composer.closest<HTMLElement>("form") ?? environment.document.body);
  return {
    composerBoundary,
    sendControl: (composer) =>
      composerBoundary(composer)?.querySelector<HTMLElement>(adapter.sendControl.selector) ?? null,
    ...environment,
    adapter,
    signals: createHostSignals(environment.document, environment.window, adapter.messages),
  };
}
