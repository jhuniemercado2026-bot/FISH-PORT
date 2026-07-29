import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

export const getTransactionLockQueryOptions = ({ staleTime = 5 * 60 * 1000 } = {}) => ({
  queryKey: ["transaction-lock"],
  queryFn: async ({ signal }) => {
    const res = await api.get("/transaction-lock", { signal });
    const payload = res.data ?? {};

    return {
      transaction_lock: payload.transaction_lock ?? null,
    };
  },
  staleTime,
  cacheTime: 30 * 60 * 1000,
  refetchOnMount: true,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchInterval: false,
  refetchIntervalInBackground: false,
});

export const useTransactionLockOnlyQuery = (options = {}) => {
  return useQuery({
    ...getTransactionLockQueryOptions(),
    ...options,
  });
};

export default useTransactionLockOnlyQuery;
