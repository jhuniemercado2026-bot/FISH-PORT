import { create } from "zustand";

export type MasterDataUpdatePayload = {
  resource?: string;
  action?: string;
  record?: Record<string, any> | null;
};

type MasterDataStore = {
  refreshKey: number;
  latestUpdate: MasterDataUpdatePayload | null;
  triggerRefresh: (payload?: MasterDataUpdatePayload | null) => void;
};

export const useMasterDataStore = create<MasterDataStore>((set) => ({
  refreshKey: 0,
  latestUpdate: null,
  triggerRefresh: (payload = null) =>
    set((state) => ({
      refreshKey: state.refreshKey + 1,
      latestUpdate: payload,
    })),
}));
