import { create } from "zustand";
import type { OfflineTransactionDraft, OfflineTransactionType } from "../utils/offlineTransactionQueue";

export type SyncedHistoryTransaction = {
  local_id: string;
  type: OfflineTransactionType;
  data: Record<string, any>;
};

export type TransactionLockState = {
  is_locked?: boolean | null;
  message?: string | null;
  date?: string | null;
  applies_to?: string | null;
  lock_scope?: string | null;
  submitted_by?: number | string | null;
  unlock_at?: string | null;
  remittance_reference_no?: string | null;
};

type HistoryStore = {
  refreshKey: number;
  syncedTransactions: SyncedHistoryTransaction[];
  queuedDrafts: OfflineTransactionDraft[];
  transactionDetailCache: Record<string, Record<string, any>>;
  transactionLock: TransactionLockState | null;
  triggerRefresh: () => void;
  addSyncedTransactions: (transactions: SyncedHistoryTransaction[]) => void;
  addQueuedDrafts: (drafts: OfflineTransactionDraft[]) => void;
  removeQueuedDrafts: (draftIds: string[]) => void;
  cacheTransactionDetail: (type: OfflineTransactionType, id: string | number, data: Record<string, any>) => void;
  setTransactionLock: (transactionLock: TransactionLockState | null) => void;
};

export const useHistoryStore = create<HistoryStore>((set) => ({
  refreshKey: Date.now(),
  syncedTransactions: [],
  queuedDrafts: [],
  transactionDetailCache: {},
  transactionLock: null,
  triggerRefresh: () => set({ refreshKey: Date.now() }),
  addSyncedTransactions: (transactions) =>
    set((state) => ({
      syncedTransactions: [...state.syncedTransactions, ...transactions],
      transactionDetailCache: transactions.reduce(
        (cache, transaction) => {
          const data = transaction.data;
          const id =
            data?.docking_id ??
            data?.banyera_id ??
            data?.ticket_id ??
            data?.remittance_id ??
            data?.id;

          if (id === undefined || id === null) return cache;

          return {
            ...cache,
            [`${transaction.type}:${id}`]: data,
          };
        },
        state.transactionDetailCache
      ),
    })),
  addQueuedDrafts: (drafts) =>
    set((state) => ({
      queuedDrafts: [...state.queuedDrafts, ...drafts],
    })),
  removeQueuedDrafts: (draftIds) =>
    set((state) => {
      const draftIdSet = new Set(draftIds);

      return {
        queuedDrafts: state.queuedDrafts.filter((draft) => !draftIdSet.has(draft.local_id)),
        refreshKey: Date.now(),
      };
    }),
  cacheTransactionDetail: (type, id, data) =>
    set((state) => ({
      transactionDetailCache: {
        ...state.transactionDetailCache,
        [`${type}:${id}`]: data,
      },
    })),
  setTransactionLock: (transactionLock) => set({ transactionLock }),
}));
