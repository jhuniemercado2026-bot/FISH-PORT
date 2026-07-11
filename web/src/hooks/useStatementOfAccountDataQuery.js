import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

export const getStatementOfAccountDataQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  status = "all",
  boat = "",
  highlightBoatId = "",
  selectedOnly = false,
} = {}) => ({
  queryKey: ["statement-of-account-data", { page, perPage, search, status, boat, highlightBoatId, selectedOnly }],
  queryFn: async ({ signal }) => {
    const res = await api.get("/statement-of-account", {
      params: {
        page,
        per_page: perPage,
        search: search || undefined,
        status: status !== "all" ? status : undefined,
        boat: boat || undefined,
        highlight_boat_id: highlightBoatId || undefined,
        selected_only: selectedOnly ? 1 : undefined,
      },
      signal,
    });

    const boatRecords = res.data?.data ?? [];

    return {
      boatRecords,
      meta: res.data?.meta ?? {
        current_page: page,
        last_page: 1,
        per_page: perPage,
        total: boatRecords.length,
        from: boatRecords.length ? 1 : 0,
        to: boatRecords.length,
      },
      stats: res.data?.stats ?? {
        total_billed: 0,
        total_collected: 0,
        total_receivables: 0,
      },
      selectedBoatRecord: res.data?.selected_record ?? null,
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

const QUERY_OPTION_KEYS = new Set(["enabled", "staleTime", "refetchOnReconnect", "refetchOnWindowFocus", "placeholderData", "select", "retry"]);

const looksLikeQueryOptions = (value) =>
  value &&
  typeof value === "object" &&
  Object.keys(value).some((key) => QUERY_OPTION_KEYS.has(key)) &&
  !["page", "perPage", "search", "status", "boat", "highlightBoatId", "selectedOnly"].some((key) => Object.prototype.hasOwnProperty.call(value, key));

export const useStatementOfAccountDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;

  return useQuery({
    ...getStatementOfAccountDataQueryOptions(resolvedFilters),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};
