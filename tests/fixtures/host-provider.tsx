import { type ReactNode, useState } from "react";

import { HostProvider } from "@/features/host-port/HostProvider";
import type { Host } from "@/features/host-port/host-port";

import { createFakeHost } from "./fake-host";

type HostTestProviderProps = {
  children: ReactNode;
  host?: Host;
};

export function HostTestProvider({ children, host: providedHost }: HostTestProviderProps) {
  const [host] = useState(() => providedHost ?? createFakeHost());
  return <HostProvider host={host}>{children}</HostProvider>;
}
