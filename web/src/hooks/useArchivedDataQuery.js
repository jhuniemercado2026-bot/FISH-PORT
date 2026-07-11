import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { filterByFiscalYear } from "../lib/fiscalYear";
import { useFiscalYearStore } from "../store/fiscalYearStore";

// Shared archive query options keep the archive page and future prefetching in sync.
export const getArchivedDataQueryOptions = ({
  type = "",
  page = 1,
  perPage = 10,
  search = "",
  paginated = false,
  fiscalYear,
  skipFiscalYear = false,
} = {}) => ({
  queryKey: ["archives-data", { type, page, perPage, search, paginated, fiscalYear: skipFiscalYear ? undefined : fiscalYear, skipFiscalYear }],
  queryFn: async ({ signal }) => {
    const activeFiscalYear = skipFiscalYear ? undefined : fiscalYear;
    const { data } = await api.get("/archives", {
      params: paginated
        ? {
            type,
            page,
            per_page: perPage,
            search: search?.trim() || undefined,
            fiscal_year: activeFiscalYear,
          }
        : { all: 1 },
      signal,
    });

    if (Array.isArray(data)) {
      return filterByFiscalYear(data, ["deleted_at", "archived_at", "created_at", "updated_at"], activeFiscalYear);
    }

    if (Array.isArray(data?.data)) {
      if (paginated) {
        return data;
      }

      return {
        ...data,
        data: filterByFiscalYear(data.data, ["deleted_at", "archived_at", "created_at", "updated_at"], activeFiscalYear),
      };
    }

    return data;
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
  !["type", "page", "perPage", "search", "paginated", "skipFiscalYear"].some((key) => Object.prototype.hasOwnProperty.call(value, key));

// Server-state hook for the superadmin archive page.
export const useArchivedDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getArchivedDataQueryOptions({ ...resolvedFilters, fiscalYear: resolvedFilters.skipFiscalYear ? undefined : fiscalYear }),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};
