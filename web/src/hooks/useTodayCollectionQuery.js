import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

export const getTodayCollectionQueryOptions = ({ date = "", enabled = true } = {}) => ({
  queryKey: ["today-collection", { date }],
  queryFn: async ({ signal }) => {
    const res = await api.get("/remittances/today-collection", {
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

export const useTodayCollectionQuery = (params = {}, queryOptions = {}) =>
  useQuery({
    ...getTodayCollectionQueryOptions(params),
    ...queryOptions,
  });
