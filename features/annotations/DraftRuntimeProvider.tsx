import { createContext, type ReactNode, useContext, useMemo } from "react";

import { createDraftPersistence } from "./draft-persistence";
import { createDraftRuntime, type DraftRuntime } from "./draft-runtime";
import type { DraftStore } from "./draft-store";

const DraftRuntimeContext = createContext<DraftRuntime | null>(null);

type DraftRuntimeProviderProps = {
  children: ReactNode;
  store: DraftStore;
};

export function DraftRuntimeProvider({ children, store }: DraftRuntimeProviderProps) {
  const runtime = useMemo(() => createDraftRuntime(createDraftPersistence(store)), [store]);
  return <DraftRuntimeContext.Provider value={runtime}>{children}</DraftRuntimeContext.Provider>;
}

export function useDraftRuntime() {
  const runtime = useContext(DraftRuntimeContext);
  if (!runtime) {
    throw new Error("DraftRuntimeProvider is missing");
  }
  return runtime;
}
