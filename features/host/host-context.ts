import { createHostSignals } from "./host-signals";
import type { HostEnvironment } from "./host-environment";
import type { SiteAdapter } from "./site-adapter";

export type HostContext = HostEnvironment & {
  adapter: SiteAdapter;
  signals: ReturnType<typeof createHostSignals>;
};

export function createHostContext(environment: HostEnvironment, adapter: SiteAdapter): HostContext {
  return {
    ...environment,
    adapter,
    signals: createHostSignals(environment.document, environment.window, adapter.messages),
  };
}
