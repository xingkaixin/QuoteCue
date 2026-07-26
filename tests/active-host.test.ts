import { describe, expect, it } from "vitest";

import { hostForHostname } from "@/features/host/active-host";
import { SITE_REGISTRY } from "@/features/host/site-registry";

describe("active host selection", () => {
  it.each(SITE_REGISTRY)("creates the registered $hostname host", ({ hostname }) => {
    expect(hostForHostname(hostname, { document, window })).not.toBeNull();
  });

  it("rejects unregistered hostnames", () => {
    expect(hostForHostname("example.com", { document, window })).toBeNull();
  });
});
