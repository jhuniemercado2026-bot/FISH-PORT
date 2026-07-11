import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { buildFiscalMeta } from "../lib/fiscalYear";
import { useFiscalYearStore } from "../store/fiscalYearStore";

export const ACTIVITY_LOGS_QUERY_KEY = ["activity-logs-data"];

const buildActivityLogsParams = ({
  search = "",
  module = "all",
  user = "all",
  status = "all",
  period = "all",
  page = 1,
  perPage = 10,
  sort = "created_at_desc",
  paginated = true,
  fiscalYear,
} = {}) => ({
  search: search?.trim() || undefined,
  module: module && module !== "all" ? module : undefined,
  user: user && user !== "all" ? user : undefined,
  status: status && status !== "all" ? status : undefined,
  period: period && period !== "all" ? period : undefined,
  page,
  per_page: perPage,
  sort,
  paginated: paginated ? 1 : undefined,
  fiscal_year: fiscalYear,
});

export const getActivityLogsQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  module = "all",
  user = "all",
  status = "all",
  period = "all",
  sort = "created_at_desc",
  paginated = true,
  fiscalYear,
} = {}) => ({
  queryKey: [
    ...ACTIVITY_LOGS_QUERY_KEY,
    {
      page,
      perPage,
      search,
      status,
      period,
      filters: { module, user },
      sort,
      paginated,
      fiscalYear,
    },
  ],
  queryFn: async ({ signal }) => {
    const filters = { page, perPage, search, module, user, status, period, sort, paginated, fiscalYear };
    const res = await api.get("/activity-logs", {
      params: buildActivityLogsParams(filters),
      signal,
    });

    const logs = res.data?.data ?? [];
    return {
      logs,
      meta: buildFiscalMeta(res.data?.meta, logs, {
        current_page: 1,
        last_page: 1,
        per_page: filters.perPage ?? 20,
        stats: {
          total_logs: 0,
          info_count: 0,
          warning_count: 0,
          critical_count: 0,
          today_count: 0,
        },
      }),
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  placeholderData: (previousData) => previousData,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

export const useActivityLogsQuery = (filters = {}, queryOptions = {}) => {
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getActivityLogsQueryOptions({ ...filters, fiscalYear }),
    ...queryOptions,
  });
};
