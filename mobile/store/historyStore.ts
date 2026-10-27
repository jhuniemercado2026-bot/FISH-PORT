import { create } from "zustand";
import { getServerTimeMs } from "../utils/serverClock";
import type {
  OfflineSyncProgress,
  OfflineTransactionDraft,
  OfflineTransactionType,
} from "../utils/offlineTransactionQueue";

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
  remittance_id?: number | string | null;
  submitted_by?: number | string | null;
  unlock_at?: string | null;
  remittance_reference_no?: string | null;
};

export const isTransactionLockActive = (lock?: TransactionLockState | null) => {
  if (!lock?.is_locked) return false;
  if (!lock.unlock_at) return true;

  const unlockTime = Date.parse(lock.unlock_at);
  const now = getServerTimeMs();
  return now === null || !Number.isFinite(unlockTime) || unlockTime > now;
};

let transactionLockExpiryTimer: ReturnType<typeof setTimeout> | null = null;

const clearTransactionLockExpiryTimer = () => {
  if (transactionLockExpiryTimer) {
    clearTimeout(transactionLockExpiryTimer);
    transactionLockExpiryTimer = null;
  }
};

type HistoryStore = {
  refreshKey: number;
  syncedTransactions: SyncedHistoryTransaction[];
  queuedDrafts: OfflineTransactionDraft[];
  offlineSyncProgress: OfflineSyncProgress | null;
  offlineSyncModalVisible: boolean;
  transactionDetailCache: Record<string, Record<string, any>>;
  transactionLock: TransactionLockState | null;
  triggerRefresh: () => void;
  addSyncedTransactions: (transactions: SyncedHistoryTransaction[]) => void;
  addQueuedDrafts: (drafts: OfflineTransactionDraft[]) => void;
  removeQueuedDrafts: (draftIds: string[]) => void;
  setOfflineSyncProgress: (progress: OfflineSyncProgress | null) => void;
  setOfflineSyncModalVisible: (visible: boolean) => void;
  cacheTransactionDetail: (type: OfflineTransactionType, id: string | number, data: Record<string, any>) => void;
  setTransactionLock: (transactionLock: TransactionLockState | null) => void;
  clearTransactionLock: () => void;
};

const unwrapSyncedTransactionData = (data: Record<string, any>) => {
  if (data?.data && !Array.isArray(data.data)) return data.data;
  if (data?.transaction && !Array.isArray(data.transaction)) return data.transaction;
  if (data?.ticket && !Array.isArray(data.ticket)) return data.ticket;
  if (data?.docking && !Array.isArray(data.docking)) return data.docking;
  if (data?.banyera && !Array.isArray(data.banyera)) return data.banyera;
  if (data?.remittance && !Array.isArray(data.remittance)) return data.remittance;

  return data;
};

const transactionIdentity = (transaction: SyncedHistoryTransaction) => {
  const data = unwrapSyncedTransactionData(transaction.data);
  const id =
    data?.docking_id ??
    data?.banyera_id ??
    data?.ticket_id ??
    data?.remittance_id ??
    data?.id ??
    transaction.local_id;

  return `${transaction.type}:${id}`;
};

const transactionLocalIdentity = (transaction: SyncedHistoryTransaction) =>
  `${transaction.type}:local:${transaction.local_id}`;

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  refreshKey: Date.now(),
  syncedTransactions: [],
  queuedDrafts: [],
  offlineSyncProgress: null,
  offlineSyncModalVisible: false,
  transactionDetailCache: {},
  transactionLock: null,
  triggerRefresh: () => set({ refreshKey: Date.now() }),
  addSyncedTransactions: (transactions) =>
    set((state) => {
      const incomingIds = new Set(transactions.map(transactionIdentity));
      const incomingLocalIds = new Set(transactions.map(transactionLocalIdentity));
      const syncedTransactions = [
        ...state.syncedTransactions.filter(
          (transaction) =>
            !incomingIds.has(transactionIdentity(transaction)) &&
            !incomingLocalIds.has(transactionLocalIdentity(transaction))
        ),
        ...transactions,
      ];

      return {
        syncedTransactions,
        transactionDetailCache: transactions.reduce(
          (cache, transaction) => {
            const data = unwrapSyncedTransactionData(transaction.data);
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
      };
    }),
  addQueuedDrafts: (drafts) =>
    set((state) => {
      const existingIds = new Set(state.queuedDrafts.map((draft) => draft.local_id));
      const nextDrafts = drafts.filter((draft) => !existingIds.has(draft.local_id));

      return {
        queuedDrafts: [...state.queuedDrafts, ...nextDrafts],
      };
    }),
  removeQueuedDrafts: (draftIds) =>
    set((state) => {
      const draftIdSet = new Set(draftIds);

      return {
        queuedDrafts: state.queuedDrafts.filter((draft) => !draftIdSet.has(draft.local_id)),
        refreshKey: Date.now(),
      };
    }),
  setOfflineSyncProgress: (progress) => set({ offlineSyncProgress: progress }),
  setOfflineSyncModalVisible: (visible) => set({ offlineSyncModalVisible: visible }),
  cacheTransactionDetail: (type, id, data) =>
    set((state) => {
      const cacheKey = `${type}:${id}`;
      const previous = state.transactionDetailCache[cacheKey];
      const hasExistingBreakdown = Array.isArray(previous?.breakdown) && previous.breakdown.length > 0;
      const hasIncomingBreakdown = Array.isArray(data?.breakdown) && data.breakdown.length > 0;

      return {
        transactionDetailCache: {
          ...state.transactionDetailCache,
          [cacheKey]: {
            ...previous,
            ...data,
            breakdown: hasIncomingBreakdown || !hasExistingBreakdown
              ? data?.breakdown
              : previous.breakdown,
          },
        },
      };
    }),
  setTransactionLock: (transactionLock) => {
    const currentLock = get().transactionLock;

    if (isTransactionLockActive(transactionLock)) {
      clearTransactionLockExpiryTimer();
      set({ transactionLock });

      const unlockTime = transactionLock?.unlock_at ? Date.parse(transactionLock.unlock_at) : Number.NaN;
      const now = getServerTimeMs();
      if (Number.isFinite(unlockTime) && now !== null) {
        const remittanceId = transactionLock?.remittance_id;
        transactionLockExpiryTimer = setTimeout(() => {
          const latestLock = get().transactionLock;
          if (
            String(latestLock?.remittance_id ?? "") === String(remittanceId ?? "") &&
            !isTransactionLockActive(latestLock)
          ) {
            transactionLockExpiryTimer = null;
            set({ transactionLock: null });
          }
        }, Math.max(0, unlockTime - now + 100));
      }

      return;
    }

    if (isTransactionLockActive(currentLock)) return;

    clearTransactionLockExpiryTimer();
    set({ transactionLock });
  },
  clearTransactionLock: () => {
    clearTransactionLockExpiryTimer();
    set({ transactionLock: null });
  },
}));
