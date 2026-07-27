import { describe, expect, it } from "vitest";

import { resolveActiveHost } from "@/features/host/active-host";
import { SITE_REGISTRY } from "@/features/host/site-registry";

describe("active host selection", () => {
  it.each(SITE_REGISTRY)("creates the registered $hostname host", ({ hostname }) => {
    expect(resolveActiveHost(hostname, { document, window })).toMatchObject({
      site: { hostname },
    });
  });

  it("rejects unregistered hostnames", () => {
    expect(resolveActiveHost("example.com", { document, window })).toBeNull();
  });
});
