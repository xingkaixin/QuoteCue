import { createContext, type ReactNode, useContext } from "react";

import type { DraftStore } from "./draft-store";

const DraftStoreContext = createContext<DraftStore | null>(null);

type DraftStoreProviderProps = {
  children: ReactNode;
  store: DraftStore;
};

export function DraftStoreProvider({ children, store }: DraftStoreProviderProps) {
  return <DraftStoreContext.Provider value={store}>{children}</DraftStoreContext.Provider>;
}

export function useDraftStore() {
  const store = useContext(DraftStoreContext);
  if (!store) {
    throw new Error("DraftStoreProvider is missing");
  }
  return store;
}
