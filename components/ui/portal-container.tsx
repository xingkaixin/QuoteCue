import { createContext, type ReactNode, useContext } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
  children,
  container,
}: {
  children: ReactNode;
  container: HTMLElement;
}) {
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  );
}

export function usePortalContainer() {
  const container = useContext(PortalContainerContext);
  if (!container) {
    throw new Error("QuoteCue portal container is unavailable");
  }
  return container;
}
