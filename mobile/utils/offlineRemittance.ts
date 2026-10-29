import type { OfflineTransactionDraft } from "./offlineTransactionQueue";

type CollectionRow = { transaction: string; type_name: string; cash_received: number };

export function getOfflineRemittanceLock(drafts: OfflineTransactionDraft[], userId: string | number | undefined, date: string) {
  if (userId == null) return null;
  const remittance = drafts.find((draft) => draft.type === "remittance"
    && String(draft.owner_user_id) === String(userId) && draft.payload.date === date);
  return remittance ? {
    is_locked: true,
    applies_to: "transactions",
    date,
    message: "Today's remittance is saved offline. Transactions are view-only for the rest of today while it waits to sync.",
  } : null;
}

// Dates in transaction payloads are Manila calendar dates. Keep them unchanged
// even when the queue is uploaded on a later day.
export function buildOfflineRemittanceCollection({
  date, userId, cached, history = {}, historySavedAt, drafts, syncedTransactions = [],
}: {
  date: string;
  userId: string | number;
  cached?: { amount: string; hasSubmittedRemittance: boolean; breakdown: any[]; saved_at?: string } | null;
  history?: Record<string, any[]>;
  historySavedAt?: string;
  drafts: OfflineTransactionDraft[];
  syncedTransactions?: { local_id: string; type: string; data: Record<string, any> }[];
}) {
  const owned = (record: any) => String(record.created_by ?? record.submitted_by ?? "") === String(userId);
  const rows: CollectionRow[] = [];
  const add = (type: string, payload: any, metadata: any = {}) => {
    if (payload.voided_at) return;
    const recordDate = payload.ticket_date ?? payload.docking_date ?? payload.transaction_date;
    if (String(recordDate ?? "").slice(0, 10) !== date) return;
    if (type !== "tickets" && payload.boat_category !== "visiting") return;
    const amount = Number(type === "tickets" ? payload.ticket_fee : type === "docking"
      ? payload.docking_fee : payload.total_fee ?? payload.items?.reduce(
        (sum: number, item: any) => sum + Number(item.subtotal ?? 0), 0));
    if (!Number.isFinite(amount) || amount <= 0) return;
    rows.push({
      transaction: type === "tickets" ? "Vehicle Ticket" : `Visiting Boat for ${type === "docking" ? "Docking" : "Banyera"}`,
      type_name: metadata.vehicle_type_name ?? metadata.boat_name ?? payload.visiting_boat_name ?? "-",
      cash_received: amount,
    });
  };
  const localHistory: Record<string, any[]> = {};
  for (const type of ["tickets", "docking", "banyera", "remittance"]) {
    const idField = type === "tickets" ? "ticket_id" : type === "docking" ? "docking_id"
      : type === "banyera" ? "banyera_id" : "remittance_id";
    const records = new Map<string, any>();
    (history[type] ?? []).filter((record) => !record.__isDraft).forEach((record, index) => {
      records.set(String(record[idField] ?? record.id ?? `cached-${index}`), record);
    });
    syncedTransactions.filter((transaction) => transaction.type === type).forEach((transaction) => {
      const data = transaction.data;
      const record = data.data ?? data.remittance ?? data.transaction ?? data.ticket ?? data.docking ?? data.banyera ?? data;
      records.set(String(record[idField] ?? record.id ?? transaction.local_id), record);
    });
    localHistory[type] = [...records.values()].filter(owned);
  }
  for (const type of ["tickets", "docking", "banyera"]) {
    localHistory[type].forEach((record) => add(type, record));
  }
  const historyRows = rows.splice(0);
  const historyAmount = historyRows.reduce((sum, row) => sum + row.cash_received, 0);
  const cachedAmount = Number(cached?.amount ?? 0);
  // A cached zero may predate today's transactions. History and the summary
  // describe the same server collections, so use one baseline, never add both.
  const cacheTime = Date.parse(cached?.saved_at ?? "");
  const hasNewerHistory = !Number.isFinite(cacheTime) || Date.parse(historySavedAt ?? "") > cacheTime
    || Object.values(localHistory).flat().some((record) => Date.parse(record.updated_at ?? record.created_at ?? "") > cacheTime);
  const useHistory = !cached || (hasNewerHistory && historyAmount > cachedAmount);
  const baselineAmount = useHistory ? historyAmount : cachedAmount;
  const syncedLocalIds = new Set(syncedTransactions.map((transaction) => transaction.local_id));
  const ownedDrafts = drafts.filter((draft) => String(draft.owner_user_id ?? "") === String(userId)
    && !syncedLocalIds.has(draft.local_id));
  ownedDrafts.forEach((draft) => add(draft.type, draft.payload, draft.metadata));
  const hasSubmittedRemittance = Boolean(cached?.hasSubmittedRemittance
    || localHistory.remittance.some((record) => String(record.date).slice(0, 10) === date)
    || ownedDrafts.some((draft) => draft.type === "remittance" && draft.payload.date === date));
  const amount = baselineAmount + rows.reduce((sum, row) => sum + row.cash_received, 0);
  return {
    date,
    amount: hasSubmittedRemittance ? "0" : amount.toFixed(2),
    hasSubmittedRemittance,
    breakdown: hasSubmittedRemittance ? [] : [...(useHistory ? historyRows : cached?.breakdown ?? []), ...rows],
  };
}
