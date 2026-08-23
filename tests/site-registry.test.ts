import { describe, expect, it } from "vitest";

import { SITE_REGISTRY, siteForHostname } from "@/features/host/site-registry";
import { SITE_URL_PATTERNS } from "@/features/host/site-urls";
import { SUPPORTED_SITES } from "@quotecue/shared/supported-sites";

describe("site registry", () => {
  it("owns one registration per hostname", () => {
    const hostnames = SITE_REGISTRY.map(({ hostname }) => hostname);

    expect(new Set(hostnames).size).toBe(hostnames.length);
    expect(hostnames.map((hostname) => siteForHostname(hostname)?.hostname)).toEqual(hostnames);
  });

  it("keeps every URL pattern aligned with its hostname", () => {
    for (const { hostname, urlPattern } of SITE_REGISTRY) {
      expect(new URL(urlPattern.replace("*", "")).hostname).toBe(hostname);
    }
  });

  it("derives the shared access patterns from the registry URLs", () => {
    expect(SITE_URL_PATTERNS).toEqual(SITE_REGISTRY.map(({ urlPattern }) => urlPattern));
  });

  it("registers every catalog site with its declared identity", () => {
    expect(
      SITE_REGISTRY.map(({ id, name, hostname, urlPattern }) => ({
        id,
        name,
        hostname,
        urlPattern,
      })),
    ).toEqual(SUPPORTED_SITES);
  });

  it("returns no registration for unsupported sites", () => {
    expect(siteForHostname("example.com")).toBeNull();
  });
});
