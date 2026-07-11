import { create } from "zustand";

type OverviewCounts = {
  banyera: number;
  docking: number;
  tickets: number;
};

type HomeStore = {
  overviewCounts: OverviewCounts;
  banyeraRecords: any[];
  dockingRecords: any[];
  ticketRecords: any[];
  isLoading: boolean;
  userFullName: string;
  userEmail: string;
  userId?: number | string | null;
  setHomeData: (data: {
    overviewCounts?: OverviewCounts;
    banyeraRecords?: any[];
    dockingRecords?: any[];
    ticketRecords?: any[];
    isLoading?: boolean;
    userFullName?: string;
    userEmail?: string;
    userId?: number | string | null;
  }) => void;
  clearHomeData: () => void;
};

const initialOverviewCounts: OverviewCounts = {
  banyera: 0,
  docking: 0,
  tickets: 0,
};

export const useHomeStore = create<HomeStore>((set) => ({
  overviewCounts: initialOverviewCounts,
  banyeraRecords: [],
  dockingRecords: [],
  ticketRecords: [],
  isLoading: false,
  userFullName: "",
  userEmail: "",
  userId: undefined,
  setHomeData: (data) =>
    set((state) => ({
      ...state,
      overviewCounts: data.overviewCounts ?? state.overviewCounts,
      banyeraRecords: data.banyeraRecords ?? state.banyeraRecords,
      dockingRecords: data.dockingRecords ?? state.dockingRecords,
      ticketRecords: data.ticketRecords ?? state.ticketRecords,
      isLoading: data.isLoading ?? state.isLoading,
      userFullName: data.userFullName ?? state.userFullName,
      userEmail: data.userEmail ?? state.userEmail,
      userId: data.userId ?? state.userId,
    })),
  clearHomeData: () =>
    set({
      overviewCounts: initialOverviewCounts,
      banyeraRecords: [],
      dockingRecords: [],
      ticketRecords: [],
      isLoading: false,
      userFullName: "",
      userEmail: "",
      userId: undefined,
    }),
}));
