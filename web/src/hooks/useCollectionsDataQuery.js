import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { useFiscalYearStore } from "../store/fiscalYearStore";

const defaultMeta = (perPage = 10) => ({
  current_page: 1,
  last_page: 1,
  per_page: perPage,
  total: 0,
  from: 0,
  to: 0,
});

export const getCollectionsDataQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  period = "all",
  fiscalYear,
  skipFiscalYear = false,
} = {}) => ({
  queryKey: ["collections-data", { page, perPage, search, period, fiscalYear: skipFiscalYear ? undefined : fiscalYear, skipFiscalYear }],
  queryFn: async ({ signal }) => {
    const response = await api.get("/collections", {
      params: {
        page,
        per_page: perPage,
        search: search || undefined,
        period: period !== "all" ? period : undefined,
        fiscal_year: skipFiscalYear ? undefined : fiscalYear,
      },
      signal,
    });

    return {
      collections: response.data?.data ?? [],
      meta: response.data?.meta ?? defaultMeta(perPage),
      stats: response.data?.stats ?? {
        total_collections: 0,
        collections_today: 0,
        collection_records: 0,
        collection_categories: 0,
      },
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useCollectionsDataQuery = (filters = {}, queryOptions = {}) => {
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getCollectionsDataQueryOptions({ ...filters, fiscalYear: filters.skipFiscalYear ? undefined : fiscalYear }),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
};

const extractCollectionsReport = (payload) => ({
  rows: Array.isArray(payload?.rows) ? payload.rows : [],
  totalCollections: Number(payload?.totalCollections || 0),
  collectionRecords: Number(payload?.collectionRecords || 0),
});

export const getCollectionsReportQueryOptions = ({
  filterType = "daily",
  date = undefined,
  month = undefined,
  year = undefined,
} = {}) => ({
  queryKey: ["collections-report", { filterType, date, month, year }],
  queryFn: async ({ signal }) => {
    let params = {};

    if (filterType === "monthly" && month && year) {
      params = { month, year };
    } else if (filterType === "yearly" && year) {
      params = { year };
    } else if (filterType === "daily" && date) {
      params = { date };
    } else {
      return { rows: [], totalCollections: 0, collectionRecords: 0 };
    }

    const response = await api.get(`/collections/reports/${filterType}`, { params, signal });
    return extractCollectionsReport(response.data);
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useCollectionsReportDataQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getCollectionsReportQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
