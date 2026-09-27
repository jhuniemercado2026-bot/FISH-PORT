import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getEcho } from "../lib/realtime";

const FEES_RELATED_QUERY_KEYS = [
  ["fees-data"],
  ["fees-lookups"],
  ["fee-report"],
  ["dockings-data"],
  ["docking-lookups"],
  ["banyera-data"],
  ["banyera-data", "lookups"],
  ["vehicle-tickets-data"],
  ["vehicle-tickets-lookups"],
];

const upsertFeeRecord = (fees, nextFee) => {
  const currentFees = Array.isArray(fees) ? fees : [];
  const nextFeeId = String(nextFee?.fee_id ?? "");
  if (!nextFeeId) return currentFees;

  const existingIndex = currentFees.findIndex((item) => String(item?.fee_id ?? "") === nextFeeId);
  if (existingIndex === -1) {
    return [...currentFees, nextFee];
  }

  const updatedFees = [...currentFees];
  updatedFees[existingIndex] = nextFee;
  return updatedFees;
};

const removeFeeRecord = (fees, targetFeeId) => {
  const currentFees = Array.isArray(fees) ? fees : [];
  const normalizedTargetId = String(targetFeeId ?? "");
  if (!normalizedTargetId) return currentFees;

  return currentFees.filter((item) => String(item?.fee_id ?? "") !== normalizedTargetId);
};

const applyFeeRealtimeUpdate = (queryClient, payload) => {
  const feeRecord = payload?.record;
  const action = String(payload?.action || "");
  const feeId = String(feeRecord?.fee_id ?? "");
  if (!feeId && !["deleted", "archived"].includes(action)) return;

  const updateFeeList = (current) => {
    if (!current || typeof current !== "object") return current;

    if (action === "deleted" || action === "archived") {
      return {
        ...current,
        fees: removeFeeRecord(current.fees, feeId || payload?.fee_id),
      };
    }

    return {
      ...current,
      fees: upsertFeeRecord(current.fees, feeRecord),
    };
  };

  queryClient.setQueryData(["fees-data"], (current) => {
    if (!current || typeof current !== "object") return current;

    if (action === "deleted" || action === "archived") {
      return {
        ...current,
        fees: removeFeeRecord(current.fees, feeId || payload?.fee_id),
      };
    }

    return {
      ...current,
      fees: upsertFeeRecord(current.fees, feeRecord),
    };
  });

  queryClient.setQueryData(["fees-lookups"], updateFeeList);
  queryClient.setQueryData(["docking-lookups"], updateFeeList);
  queryClient.setQueryData(["dockings-data"], updateFeeList);

  queryClient.setQueriesData({ queryKey: ["banyera-data", "lookups"] }, updateFeeList);
  queryClient.setQueriesData({ queryKey: ["vehicle-tickets-lookups"] }, updateFeeList);
};

const invalidateFeeQueries = (queryClient) => {
  FEES_RELATED_QUERY_KEYS.forEach((queryKey) => {
    void queryClient.invalidateQueries({
      queryKey,
      refetchType: "active",
    });
  });
};

export default function FeesRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const echo = getEcho();
    if (!echo) return undefined;

    const masterDataChannel = echo.channel("master-data");

    const handleMasterDataUpdate = (payload) => {
      const resource = String(payload?.resource || "");
      const action = String(payload?.action || "");

      if (resource !== "fees") return;
      if (!["created", "updated", "deleted", "archived", "restored", "changed"].includes(action)) {
        if (action && action !== "updated") return;
      }

      applyFeeRealtimeUpdate(queryClient, payload);
      invalidateFeeQueries(queryClient);
    };

    masterDataChannel.listen(".created", handleMasterDataUpdate);
    masterDataChannel.listen(".updated", handleMasterDataUpdate);
    masterDataChannel.listen(".deleted", handleMasterDataUpdate);
    masterDataChannel.listen(".archived", handleMasterDataUpdate);
    masterDataChannel.listen(".restored", handleMasterDataUpdate);
    masterDataChannel.listen(".changed", handleMasterDataUpdate);

    return () => {
      echo.leave("master-data");
    };
  }, [queryClient]);

  return null;
}
