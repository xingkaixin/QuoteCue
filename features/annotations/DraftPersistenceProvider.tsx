import { createContext, type ReactNode, useContext, useMemo } from "react";

import { createDraftPersistence, type DraftPersistence } from "./draft-persistence";
import type { DraftStore } from "./draft-store";

const DraftPersistenceContext = createContext<DraftPersistence | null>(null);

type DraftPersistenceProviderProps = {
  children: ReactNode;
  store: DraftStore;
};

export function DraftPersistenceProvider({ children, store }: DraftPersistenceProviderProps) {
  const persistence = useMemo(() => createDraftPersistence(store), [store]);
  return (
    <DraftPersistenceContext.Provider value={persistence}>
      {children}
    </DraftPersistenceContext.Provider>
  );
}

export function useDraftPersistence() {
  const persistence = useContext(DraftPersistenceContext);
  if (!persistence) {
    throw new Error("DraftPersistenceProvider is missing");
  }
  return persistence;
}
