import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

export const REPORT_USERS_QUERY_KEY = ["report-users"];

export const getReportUsersQueryOptions = () => ({
  queryKey: REPORT_USERS_QUERY_KEY,
  queryFn: async ({ signal }) => {
    const res = await api.get("/revenue-reports/users", { signal });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useReportUsersQuery = (queryOptions = {}) =>
  useQuery({
    ...getReportUsersQueryOptions(),
    ...queryOptions,
  });
