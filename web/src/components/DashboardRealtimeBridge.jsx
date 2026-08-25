import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DASHBOARD_QUERY_KEY } from "../hooks/useDashboardDataQuery";
import { getEcho } from "../lib/realtime";

const DASHBOARD_MASTER_RESOURCES = new Set([
  "boats",
  "users",
  "dashboard_targets",
]);

const invalidateDashboard = (queryClient) => {
  void queryClient.invalidateQueries({
    queryKey: DASHBOARD_QUERY_KEY,
    refetchType: "active",
  });
};

const syncDashboardTarget = (queryClient, payload) => {
  const record = payload?.record;
  const targetType = String(record?.target_type || "");
  const key = String(record?.key || "");

  if (!key || !["monthly", "yearly"].includes(targetType)) {
    return;
  }

  queryClient.setQueryData(DASHBOARD_QUERY_KEY, (current) => {
    if (!current) return current;

    if (targetType === "monthly") {
      return {
        ...current,
        monthlyTargets: {
          ...(current.monthlyTargets ?? {}),
          [key]: Number(record?.amount ?? 0),
        },
      };
    }

    return {
      ...current,
      yearlyTargets: {
        ...(current.yearlyTargets ?? {}),
        [key]: Number(record?.amount ?? 0),
      },
    };
  });
};

export default function DashboardRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const echo = getEcho();
    if (!echo) return undefined;

    const transactionsChannel = echo.channel("transactions");
    const masterDataChannel = echo.channel("master-data");

    const handleTransactionChange = () => {
      invalidateDashboard(queryClient);
    };

    transactionsChannel.listen(".created", handleTransactionChange);
    transactionsChannel.listen(".updated", handleTransactionChange);

    masterDataChannel.listen(".updated", (payload) => {
      const resource = String(payload?.resource || "");

      if (!DASHBOARD_MASTER_RESOURCES.has(resource)) {
        return;
      }

      if (resource === "dashboard_targets") {
        syncDashboardTarget(queryClient, payload);
      }

      invalidateDashboard(queryClient);
    });

    return () => {
      echo.leave("transactions");
      echo.leave("master-data");
    };
  }, [queryClient]);

  return null;
}
