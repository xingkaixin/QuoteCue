import { createContext, type ReactNode, useContext } from "react";

import type { Host } from "./host-port";

const HostContext = createContext<Host | null>(null);

type HostProviderProps = {
  children: ReactNode;
  host: Host;
};

export function HostProvider({ children, host }: HostProviderProps) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

export function useHost() {
  const host = useContext(HostContext);
  if (!host) {
    throw new Error("HostProvider is missing");
  }
  return host;
}
