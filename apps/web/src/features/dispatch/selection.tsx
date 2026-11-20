"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

type Selection = { jobId: string | null; selectJob: (id: string) => void };
const SelectionContext = createContext<StoreApi<Selection> | null>(null);

export function DispatchSelection({ initialJob, children }: { initialJob: string | null; children: ReactNode }) {
  const [store] = useState(() => createStore<Selection>()((set) => ({
    jobId: initialJob,
    selectJob: (jobId) => set({ jobId }),
  })));
  return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>;
}

export function useJobSelection<T>(selector: (selection: Selection) => T): T {
  const store = useContext(SelectionContext);
  if (!store) throw new Error("Dispatch selection is unavailable");
  return useStore(store, selector);
}
