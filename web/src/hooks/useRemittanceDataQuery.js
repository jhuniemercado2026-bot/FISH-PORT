import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { buildFiscalMeta, filterByFiscalYear } from "../lib/fiscalYear";
import { useFiscalYearStore } from "../store/fiscalYearStore";

export const getRemittanceDataQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  period = "all",
  status = "all",
  highlightRemittanceId = "",
  paginated = false,
  fiscalYear,
} = {}) => ({
  queryKey: ["remittances-data", { page, perPage, search, status, filters: { period }, sort: "date_desc", highlightRemittanceId, paginated, fiscalYear }],
  queryFn: async ({ signal }) => {
    const res = await api.get("/remittances", {
      params: {
        page,
        per_page: perPage,
        search,
        period,
        status,
        fiscal_year: fiscalYear,
        highlight_remittance_id: highlightRemittanceId,
        all: paginated ? undefined : 1,
      },
      signal,
    });

    const payload = res.data ?? {};
    const rawRemittances = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.remittances)
        ? payload.remittances
        : [];
    const remittances = filterByFiscalYear(rawRemittances, ["date", "remittance_date", "created_at"], fiscalYear);

    return {
      remittances,
      remittancesMeta: buildFiscalMeta(payload.meta ?? payload.remittances_meta, remittances, {
        current_page: 1,
        last_page: 1,
        per_page: perPage,
      }),
      transactionLock: payload.transaction_lock ?? null,
      stats: payload.stats ?? null,
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

const QUERY_OPTION_KEYS = new Set(["enabled", "staleTime", "gcTime", "refetchOnReconnect", "refetchOnWindowFocus", "placeholderData", "select", "retry"]);

const looksLikeQueryOptions = (value) =>
  value &&
  typeof value === "object" &&
  Object.keys(value).some((key) => QUERY_OPTION_KEYS.has(key)) &&
  !["page", "perPage", "search", "period", "status", "highlightRemittanceId", "paginated"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );

export const useRemittanceDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getRemittanceDataQueryOptions({ ...resolvedFilters, fiscalYear }),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};
