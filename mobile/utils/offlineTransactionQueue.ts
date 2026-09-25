import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { buildApiHeaders, getApiBaseUrl } from "../api/axios";
import { getAuthToken } from "../api/auth";

export type OfflineTransactionType = "docking" | "banyera" | "tickets" | "remittance";

export type OfflineTransactionDraft = {
  local_id: string;
  type: OfflineTransactionType;
  endpoint: string;
  payload: Record<string, any>;
  label: string;
  metadata?: Record<string, any>;
  created_at: string;
};

export type SyncedOfflineTransaction = {
  local_id: string;
  type: OfflineTransactionType;
  data: Record<string, any>;
};

const OFFLINE_TRANSACTION_QUEUE_KEY = "opol_fish_port.offline_transaction_queue";
const OFFLINE_DRAFT_SYNC_TIMEOUT_MS = 60000;

function isOfflineNetworkState(state: Awaited<ReturnType<typeof NetInfo.fetch>> | null) {
  return Boolean(
    state &&
      (state.isConnected === false || state.isInternetReachable === false)
  );
}

export type OfflineSyncProgress = {
  syncId: string;
  total: number;
  processed: number;
  synced: number;
  remaining: number;
  percentage: number;
  status: "started" | "progress" | "paused" | "finished";
};

type OfflineSyncResult = {
  synced: number;
  remaining: number;
  transactions: SyncedOfflineTransaction[];
  lockedDiscarded: number;
  lockedDraftIds: string[];
  duplicateDiscarded: number;
  duplicateDraftIds: string[];
  skippedOffline: boolean;
};

async function responseJson(response: Response) {
  return response.json().catch(() => null);
}

function isDuplicateDraftResponse(
  draft: OfflineTransactionDraft,
  response: Response,
  data: Record<string, any> | null
) {
  if (draft.type !== "docking" && draft.type !== "banyera") {
    return false;
  }

  if (response.status !== 409 && response.status !== 422) {
    return false;
  }

  const message = String(data?.message ?? "").toLowerCase();
  const code = String(data?.code ?? "").toLowerCase();

  return (
    code === "duplicate_record" ||
    message.includes("already exists") ||
    message.includes("duplicate")
  );
}

async function readQueue(): Promise<OfflineTransactionDraft[]> {
  const rawQueue = await AsyncStorage.getItem(OFFLINE_TRANSACTION_QUEUE_KEY);
  if (!rawQueue) return [];

  try {
    const parsed = JSON.parse(rawQueue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getOfflineTransactionDrafts() {
  return readQueue();
}

async function writeQueue(queue: OfflineTransactionDraft[]) {
  await AsyncStorage.setItem(OFFLINE_TRANSACTION_QUEUE_KEY, JSON.stringify(queue));
}

async function removeDraftFromQueue(localId: string) {
  const queue = await readQueue();
  const nextQueue = queue.filter((draft) => draft.local_id !== localId);

  if (nextQueue.length !== queue.length) {
    await writeQueue(nextQueue);
  }

  return nextQueue.length;
}

export async function queueOfflineTransaction({
  type,
  endpoint,
  payload,
  label,
  metadata,
}: {
  type: OfflineTransactionType;
  endpoint: string;
  payload: Record<string, any>;
  label: string;
  metadata?: Record<string, any>;
}) {
  const queue = await readQueue();
  const draft: OfflineTransactionDraft = {
    local_id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    endpoint,
    payload,
    label,
    metadata,
    created_at: new Date().toISOString(),
  };

  await writeQueue([...queue, draft]);
  return draft;
}

async function postDraft(draft: OfflineTransactionDraft, token: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, OFFLINE_DRAFT_SYNC_TIMEOUT_MS);

  try {
    return await fetch(`${getApiBaseUrl()}${draft.endpoint}`, {
      method: "POST",
      headers: buildApiHeaders(token),
      body: JSON.stringify(draft.payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function syncOfflineTransactions(
  onProgress?: (progress: OfflineSyncProgress) => void,
  onSyncedDraft?: (transaction: SyncedOfflineTransaction) => void
) {
  const token = getAuthToken();
  if (!token) {
    return {
      synced: 0,
      remaining: 0,
      transactions: [] as SyncedOfflineTransaction[],
      lockedDiscarded: 0,
      lockedDraftIds: [] as string[],
      duplicateDiscarded: 0,
      duplicateDraftIds: [] as string[],
      skippedOffline: false,
    };
  }

  const networkState = await NetInfo.fetch().catch(() => null);
  if (isOfflineNetworkState(networkState)) {
    const queue = await readQueue();
    return {
      synced: 0,
      remaining: queue.length,
      transactions: [] as SyncedOfflineTransaction[],
      lockedDiscarded: 0,
      lockedDraftIds: [] as string[],
      duplicateDiscarded: 0,
      duplicateDraftIds: [] as string[],
      skippedOffline: true,
    };
  }

  const queue = await readQueue();
  const syncId = `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const total = queue.length;
  const transactions: SyncedOfflineTransaction[] = [];
  const lockedDraftIds: string[] = [];
  const duplicateDraftIds: string[] = [];
  const pendingInitialDraftIds = new Set(queue.map((draft) => draft.local_id));
  let synced = 0;

  if (total === 0) {
    return {
      synced: 0,
      remaining: 0,
      transactions,
      lockedDiscarded: 0,
      lockedDraftIds,
      duplicateDiscarded: 0,
      duplicateDraftIds,
      skippedOffline: false,
    };
  }

  onProgress?.({
    syncId,
    total,
    processed: 0,
    synced: 0,
    remaining: total,
    percentage: 0,
    status: "started",
  });

  let processed = 0;

  for (const draft of queue) {
    let shouldStopSync = false;

    try {
      const response = await postDraft(draft, token);

      if (response.ok) {
        const data = await responseJson(response);
        synced += 1;

        await removeDraftFromQueue(draft.local_id);
        pendingInitialDraftIds.delete(draft.local_id);

        if (data) {
          const transaction = {
            local_id: draft.local_id,
            type: draft.type,
            data,
          };
          transactions.push(transaction);
          try {
            onSyncedDraft?.(transaction);
          } catch {
            // UI callbacks must not interrupt the queue drain.
          }
        }
      } else if (response.status === 423) {
        lockedDraftIds.push(draft.local_id);
        await removeDraftFromQueue(draft.local_id);
        pendingInitialDraftIds.delete(draft.local_id);
      } else {
        const data = await responseJson(response);
        if (isDuplicateDraftResponse(draft, response, data)) {
          duplicateDraftIds.push(draft.local_id);
          await removeDraftFromQueue(draft.local_id);
          pendingInitialDraftIds.delete(draft.local_id);
        } else {
          shouldStopSync = true;
        }
      }
    } catch {
      shouldStopSync = true;
    }

    processed = total - pendingInitialDraftIds.size;
    onProgress?.({
      syncId,
      total,
      processed,
      synced,
      remaining: pendingInitialDraftIds.size,
      percentage: Math.round((processed / total) * 100),
      status: shouldStopSync
        ? "paused"
        : processed === total
          ? "finished"
          : "progress",
    });

    if (shouldStopSync) {
      break;
    }
  }

  const latestQueue = await readQueue();

  return {
    synced,
    remaining: latestQueue.length,
    transactions,
    lockedDiscarded: lockedDraftIds.length,
    lockedDraftIds,
    duplicateDiscarded: duplicateDraftIds.length,
    duplicateDraftIds,
    skippedOffline: false,
  };
}

export async function submitOrQueueOfflineTransaction({
  type,
  endpoint,
  payload,
  label,
  token,
  metadata,
}: {
  type: OfflineTransactionType;
  endpoint: string;
  payload: Record<string, any>;
  label: string;
  token: string;
  metadata?: Record<string, any>;
}) {
  const networkState = await NetInfo.fetch().catch(() => null);

  if (isOfflineNetworkState(networkState)) {
    const draft = await queueOfflineTransaction({ type, endpoint, payload, label, metadata });
    return { queued: true, response: null, draft };
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      method: "POST",
      headers: buildApiHeaders(token),
      body: JSON.stringify(payload),
    });

    return { queued: false, response, draft: null };
  } catch {
    if (!networkState) {
      const draft = await queueOfflineTransaction({ type, endpoint, payload, label, metadata });
      return { queued: true, response: null, draft };
    }

    throw new Error("Unable to submit while connected.");
  }
}

export function startOfflineTransactionSync({
  onProgress,
  onSyncedDraft,
  onSynced,
  onLockedDraftsDiscarded,
  onDuplicateDraftsDiscarded,
}: {
  onProgress?: (progress: OfflineSyncProgress) => void;
  onSyncedDraft?: (transaction: SyncedOfflineTransaction) => void;
  onSynced?: (count: number, transactions: SyncedOfflineTransaction[]) => void;
  onLockedDraftsDiscarded?: (count: number, draftIds: string[]) => void;
  onDuplicateDraftsDiscarded?: (count: number, draftIds: string[]) => void;
} = {}) {
  let syncing = false;
  let nextRetryAt = 0;

  const runSync = async (options: { force?: boolean } = {}) => {
    if (syncing) return;
    if (!options.force && Date.now() < nextRetryAt) return;

    syncing = true;
    try {
      const result: OfflineSyncResult = await syncOfflineTransactions(
        onProgress,
        onSyncedDraft
      );
      if (result.synced > 0) {
        nextRetryAt = 0;
        onSynced?.(result.synced, result.transactions);
      }

      if (result.lockedDiscarded > 0) {
        nextRetryAt = 0;
        onLockedDraftsDiscarded?.(result.lockedDiscarded, result.lockedDraftIds);
      }

      if (result.duplicateDiscarded > 0) {
        nextRetryAt = 0;
        onDuplicateDraftsDiscarded?.(result.duplicateDiscarded, result.duplicateDraftIds);
      }

      if (result.skippedOffline) {
        nextRetryAt = 0;
      } else if (result.synced === 0 && result.lockedDiscarded === 0 && result.duplicateDiscarded === 0 && result.remaining > 0) {
        nextRetryAt = Date.now() + 10000;
      }
    } finally {
      syncing = false;
    }
  };

  void runSync();

  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      nextRetryAt = 0;
      void runSync({ force: true });
    }
  });

  const interval = setInterval(() => {
    void runSync();
  }, 30000);

  return () => {
    unsubscribe();
    clearInterval(interval);
  };
}
