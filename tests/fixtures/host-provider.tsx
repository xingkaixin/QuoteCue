import { type ReactNode, useState } from "react";

import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { HostProvider } from "@/features/host-port/HostProvider";
import type { Host } from "@/features/host-port/host-port";

type HostTestProviderProps = {
  children: ReactNode;
  host?: Host;
};

export function HostTestProvider({ children, host: providedHost }: HostTestProviderProps) {
  const [host] = useState(() => providedHost ?? createChatGptHost({ document, window }));
  return <HostProvider host={host}>{children}</HostProvider>;
}
