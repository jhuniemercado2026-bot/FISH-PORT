import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getEcho } from "../lib/realtime";
import {
  updateBanyeraStatsInCache,
  upsertBanyeraTransactionInDataCache,
} from "../utils/banyeraCache";
import {
  syncDockingCalendarCache,
  updateDockingStatsInCache,
  upsertDockingInDataCache,
} from "../utils/dockingCache";
import {
  syncVehicleTypeUsageInCache,
  upsertVehicleTicketInCache,
} from "../utils/ticketsCache";
import { invalidateTodayCollection } from "../utils/remittanceCollectionCache";

const invalidateActiveTransactionQueries = (queryClient, queryKeys) => {
  queryKeys.forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey, refetchType: "active" });
  });
};

const hasDockingInCache = (queryClient, docking) => {
  const dockingId = String(docking?.docking_id ?? "");
  if (!dockingId) return false;

  return queryClient.getQueriesData({ queryKey: ["dockings-data"] }).some(([, data]) =>
    (data?.dockings ?? []).some((item) => String(item?.docking_id ?? "") === dockingId)
  );
};

const hasBanyeraInCache = (queryClient, transaction) => {
  const transactionId = String(transaction?.banyera_id ?? "");
  if (!transactionId) return false;

  return queryClient.getQueriesData({ queryKey: ["banyera-data"] }).some(([, data]) => {
    const transactions = Array.isArray(data?.transactions)
      ? data.transactions
      : Array.isArray(data?.data?.transactions)
        ? data.data.transactions
        : [];

    return transactions.some((item) => String(item?.banyera_id ?? "") === transactionId);
  });
};

const hasVehicleTicketInCache = (queryClient, ticket) => {
  const ticketId = String(ticket?.ticket_id ?? ticket?.id ?? "");
  if (!ticketId) return false;

  return queryClient.getQueriesData({ queryKey: ["vehicle-tickets-data"] }).some(([, data]) =>
    (data?.tickets ?? []).some((item) => String(item?.ticket_id ?? item?.id ?? "") === ticketId)
  );
};

const invalidateRemittanceQueries = (queryClient) => {
  invalidateActiveTransactionQueries(queryClient, [
    ["transaction-lock"],
    ["remittances-data"],
    ["remittance-report"],
    ["dashboard-data"],
    ["notifications-data"],
    ["today-collection"],
  ]);
};

const invalidateDockingQueries = (queryClient) => {
  invalidateActiveTransactionQueries(queryClient, [
    ["dockings-data"],
    ["dockings-calendar"],
    ["docking-lookups"],
    ["docking-report"],
    ["dashboard-data"],
    ["daily-report"],
    ["monthly-report"],
    ["yearly-report"],
    ["revenue-report"],
    ["billing-data"],
    ["billing-form-lookups"],
    ["owner-statement-data"],
    ["boat-statement-data"],
  ]);
};

const invalidateBanyeraQueries = (queryClient) => {
  invalidateActiveTransactionQueries(queryClient, [
    ["banyera-data"],
    ["banyera-report"],
    ["bfar-report"],
    ["dashboard-data"],
    ["daily-report"],
    ["monthly-report"],
    ["yearly-report"],
    ["revenue-report"],
    ["billing-data"],
    ["billing-form-lookups"],
    ["owner-statement-data"],
    ["boat-statement-data"],
  ]);
};

const invalidateBillingQueries = (queryClient) => {
  invalidateActiveTransactionQueries(queryClient, [
    ["billing-data"],
    ["billing-form-lookups"],
    ["billing-boats"],
    ["billing-payments"],
    ["billing-report"],
    ["payments-form-lookups"],
    ["payments-data"],
    ["dashboard-data"],
    ["daily-report"],
    ["monthly-report"],
    ["yearly-report"],
    ["revenue-report"],
    ["owner-statement-data"],
    ["boat-statement-data"],
    ["billing-report"],
  ]);
};

const invalidateVehicleTicketQueries = (queryClient) => {
  invalidateActiveTransactionQueries(queryClient, [
    ["vehicle-tickets-data"],
    ["vehicle-tickets-lookups"],
    ["vehicle-ticket-report"],
    ["collections-data"],
    ["today-collection"],
    ["dashboard-data"],
    ["daily-report"],
    ["monthly-report"],
    ["yearly-report"],
    ["revenue-report"],
  ]);
};

const invalidateBoatDependentLookups = (queryClient) => {
  invalidateActiveTransactionQueries(queryClient, [
    ["docking-lookups"],
    ["dockings-data"],
    ["banyera-data"],
    ["billing-boats"],
    ["billing-data"],
    ["billing-form-lookups"],
    ["payments-form-lookups"],
    ["owner-statement-data"],
    ["boat-statement-data"],
  ]);
};

const invalidateBoatManagementQueries = (queryClient) => {
  invalidateActiveTransactionQueries(queryClient, [
    ["registered-boats-data"],
    ["boats"],
    ["boat-types"],
    ["boat-owners"],
    ["registered-boats-report"],
    ["owner-info-report"],
  ]);
};

const invalidateFeeDependentLookups = (queryClient) => {
  invalidateActiveTransactionQueries(queryClient, [
    ["docking-lookups"],
    ["dockings-data"],
    ["banyera-data"],
    ["vehicle-tickets-lookups"],
    ["vehicle-tickets-data"],
    ["fees-lookups"],
    ["fees-data"],
    ["fee-report"],
  ]);
};

export default function TransactionsRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const echo = getEcho();
    if (!echo) return undefined;

    const channel = echo.channel("transactions");
    const masterDataChannel = echo.channel("master-data");

    channel.listen(".created", (payload) => {
      const type = payload?.type;
      const record = payload?.record;
      if (!type || !record) return;

      if (type === "docking") {
        const alreadyCached = hasDockingInCache(queryClient, record);
        upsertDockingInDataCache(queryClient, record, undefined, { insertIfMissing: true });
        syncDockingCalendarCache(queryClient, record, undefined, undefined, { insertIfMissing: true });
        if (!alreadyCached) {
          updateDockingStatsInCache(queryClient, record, "add");
        }
        invalidateDockingQueries(queryClient);
        return;
      }

      if (type === "banyera") {
        const alreadyCached = hasBanyeraInCache(queryClient, record);
        upsertBanyeraTransactionInDataCache(queryClient, record, { insertIfMissing: true });
        if (!alreadyCached) {
          updateBanyeraStatsInCache(queryClient, record, "add");
        }
        invalidateBanyeraQueries(queryClient);
        return;
      }

      if (type === "tickets") {
        const alreadyCached = hasVehicleTicketInCache(queryClient, record);
        if (!alreadyCached) {
          upsertVehicleTicketInCache(queryClient, record, { insertIfMissing: true });
          syncVehicleTypeUsageInCache(queryClient, record);
        }
        invalidateVehicleTicketQueries(queryClient);
        invalidateTodayCollection(
          queryClient,
          record.ticket_date || record.transaction_date || record.created_at
        );
        return;
      }

      if (type === "payment") {
        invalidateActiveTransactionQueries(queryClient, [
          ["collections-data"],
          ["payments-data"],
          ["billing-payments"],
          ["payments-form-lookups"],
          ["dashboard-data"],
          ["daily-report"],
          ["monthly-report"],
          ["yearly-report"],
          ["revenue-report"],
          ["today-collection"],
        ]);
        invalidateTodayCollection(
          queryClient,
          record.payment_date || record.date || record.created_at
        );
      }

      if (type === "remittance") {
        invalidateRemittanceQueries(queryClient);
      }

      if (type === "billing") {
        invalidateBillingQueries(queryClient);
      }
    });

    channel.listen(".updated", (payload) => {
      const type = payload?.type;
      const record = payload?.record;

      if (type === "docking" && record) {
        upsertDockingInDataCache(queryClient, record);
        syncDockingCalendarCache(queryClient, record, undefined, (docking) => Boolean(docking?.is_voided || docking?.voided_at));
        invalidateDockingQueries(queryClient);
        return;
      }

      if (type === "banyera" && record) {
        upsertBanyeraTransactionInDataCache(queryClient, record);
        invalidateBanyeraQueries(queryClient);
        return;
      }

      if (type === "tickets") {
        if (record) {
          upsertVehicleTicketInCache(queryClient, record);
          syncVehicleTypeUsageInCache(queryClient, record);
        }
        invalidateVehicleTicketQueries(queryClient);
        invalidateTodayCollection(
          queryClient,
          payload?.record?.ticket_date || payload?.record?.transaction_date || payload?.record?.created_at
        );
        return;
      }

      if (type === "remittance") {
        invalidateRemittanceQueries(queryClient);
      }

      if (type === "payment") {
        invalidateActiveTransactionQueries(queryClient, [
          ["billing-data"],
          ["billing-payments"],
          ["payments-form-lookups"],
          ["owner-statement-data"],
          ["boat-statement-data"],
        ]);
      }

      if (type === "billing") {
        invalidateBillingQueries(queryClient);
      }
    });

    masterDataChannel.listen(".updated", (payload) => {
      const resource = String(payload?.resource || "");

      if (["boats", "boat_types", "boat_owners"].includes(resource)) {
        invalidateBoatManagementQueries(queryClient);
        invalidateBoatDependentLookups(queryClient);
      }

      if (["fees", "fee_types"].includes(resource)) {
        invalidateFeeDependentLookups(queryClient);
      }

      if (resource === "fish_classifications") {
        invalidateActiveTransactionQueries(queryClient, [
          ["banyera-data"],
          ["banyera-report"],
          ["bfar-report"],
        ]);
      }

      if (["vehicle_types", "annual_vehicle_tickets"].includes(resource)) {
        invalidateVehicleTicketQueries(queryClient);
      }
    });

    return () => {
      echo.leave("transactions");
      echo.leave("master-data");
    };
  }, [queryClient]);

  return null;
}
