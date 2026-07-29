import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

export const DASHBOARD_QUERY_KEY = ["dashboard-data"];

export const getDashboardDataQueryOptions = () => ({
  queryKey: DASHBOARD_QUERY_KEY,
  queryFn: async () => {
    const { data } = await api.get("/dashboard-data");

    return {
      boats: data?.boats ?? [],
      vehicleTickets: data?.vehicleTickets ?? [],
      banyeraTransactions: data?.banyeraTransactions ?? [],
      bills: data?.bills ?? [],
      payments: data?.payments ?? [],
      remittances: data?.remittances ?? [],
      dockings: data?.dockings ?? [],
      users: data?.users ?? [],
      monthlyTargets: data?.monthlyTargets ?? {},
      yearlyTargets: data?.yearlyTargets ?? {},
    };
  },
  staleTime: 30_000,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

export const useDashboardDataQuery = () =>
  useQuery(getDashboardDataQueryOptions());
