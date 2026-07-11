import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

export const getTodaySystemCashReceivedQueryOptions = ({ date = "", enabled = true } = {}) => ({
  queryKey: ["today-system-cash-received", { date }],
  queryFn: async ({ signal }) => {
    const res = await api.get("/remittances/today-system-cash-received", {
      params: { date },
      signal,
    });

    return res.data ?? {};
  },
  enabled: Boolean(enabled && date),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchInterval: false,
});

export const useTodaySystemCashReceivedQuery = (params = {}, queryOptions = {}) =>
  useQuery({
    ...getTodaySystemCashReceivedQueryOptions(params),
    ...queryOptions,
  });
