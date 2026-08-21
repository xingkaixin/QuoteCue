import type { HostEnvironment } from "./host-environment";
import { siteForHostname } from "./site-registry";

export function resolveActiveHost(hostname: string, environment: HostEnvironment) {
  const site = siteForHostname(hostname);
  return site ? { host: site.createHost(environment), site } : null;
}
