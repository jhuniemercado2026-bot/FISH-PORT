import { create } from "zustand";

type HistoryStore = {
  refreshKey: number;
  triggerRefresh: () => void;
};

export const useHistoryStore = create<HistoryStore>((set) => ({
  refreshKey: Date.now(),
  triggerRefresh: () => set({ refreshKey: Date.now() }),
}));
