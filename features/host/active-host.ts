import type { Host } from "@/features/host-port/host-port";

import type { HostEnvironment } from "./dom-host";
import { siteForHostname } from "./site-registry";

export function hostForHostname(hostname: string, environment: HostEnvironment): Host | null {
  return siteForHostname(hostname)?.createHost(environment) ?? null;
}

export const activeSite = siteForHostname(window.location.hostname);
export const activeHost = activeSite
  ? activeSite.createHost({
      document,
      logger: import.meta.env.DEV ? (message) => console.debug(message) : undefined,
      window,
    })
  : null;

export function requireActiveHost(): Host {
  if (!activeHost) {
    throw new Error(`QuoteCue does not support ${window.location.hostname}`);
  }
  return activeHost;
}
