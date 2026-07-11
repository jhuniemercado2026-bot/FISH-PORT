import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { buildFiscalMeta, filterByFiscalYear } from "../lib/fiscalYear";
import { useFiscalYearStore } from "../store/fiscalYearStore";

const BANYERA_QUERY_STALE_TIME = 5 * 60 * 1000;
const BANYERA_QUERY_GC_TIME = 30 * 60 * 1000;

// Shared banyera query options keep the page and future prefetching aligned.
export const getBanyeraDataQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  status = "all",
  period = "all",
  fishType = "all",
  filters = {},
  sort = "transaction_date_desc",
  highlightBanyeraId = "",
  paginated = false,
  includeLookups = true,
  fiscalYear,
  skipFiscalYear = false,
} = {}) => ({
  queryKey: [
    "banyera-data",
    paginated ? "transactions" : "all",
    { page, perPage, search, status, period, fishType, filters, sort, highlightBanyeraId, paginated, includeLookups, fiscalYear: skipFiscalYear ? undefined : fiscalYear, skipFiscalYear },
  ],
  queryFn: async ({ signal }) => {
    const lookupFallback = { data: [] };
    const [txRes, clsRes, boatsRes, feesRes] = await Promise.allSettled([
      api.get("/banyera-transactions", {
        signal,
        params: {
          include_voided: 1,
          page,
          per_page: perPage,
          search,
          status,
          period,
          fish_type: fishType,
          filters,
          sort,
          fiscal_year: skipFiscalYear ? undefined : fiscalYear,
          highlight_banyera_id: highlightBanyeraId,
          all: paginated ? undefined : 1,
        },
      }),
      includeLookups ? api.get("/fish-classifications", { signal, params: fiscalYear ? { fiscal_year: fiscalYear } : {} }) : Promise.resolve(lookupFallback),
      includeLookups ? api.get("/boats", { params: { all: 1 }, signal }) : Promise.resolve(lookupFallback),
      includeLookups ? api.get("/fees", { params: { compact: 1 }, signal }) : Promise.resolve(lookupFallback),
    ]);

    const transactionsRaw =
      txRes.status === "fulfilled"
        ? (Array.isArray(txRes.value.data) ? txRes.value.data : txRes.value.data?.data ?? [])
        : [];
    const activeFiscalYear = skipFiscalYear ? undefined : fiscalYear;
    const transactions = filterByFiscalYear(transactionsRaw, ["transaction_date", "created_at"], activeFiscalYear);

    const transactionsMeta =
      txRes.status === "fulfilled" && !Array.isArray(txRes.value.data)
        ? txRes.value.data?.meta
        : null;

    const stats =
      txRes.status === "fulfilled" && !Array.isArray(txRes.value.data)
        ? txRes.value.data?.stats
        : null;

    const classifications =
      clsRes.status === "fulfilled"
        ? (clsRes.value.data ?? [])
        : [];

    const boatsRaw =
      boatsRes.status === "fulfilled"
        ? (boatsRes.value.data ?? [])
        : [];

    const fees =
      feesRes.status === "fulfilled"
        ? (feesRes.value.data ?? [])
        : [];

    return {
      transactions,
      transactionsMeta: buildFiscalMeta(transactionsMeta, transactions, {
        current_page: 1,
        last_page: 1,
        per_page: perPage,
      }),
      stats: stats ?? {
        total_records: transactions.filter((transaction) => !transaction?.voided_at).length,
        today_count: 0,
        today_total_fee: 0,
      },
      classifications,
      boats: boatsRaw.filter((boat) => !boat.deleted_at),
      fees,
    };
  },
  staleTime: BANYERA_QUERY_STALE_TIME,
  gcTime: BANYERA_QUERY_GC_TIME,
  refetchOnWindowFocus: false,
});

export const getBanyeraLookupsQueryOptions = ({ fiscalYear } = {}) => ({
  queryKey: ["banyera-data", "lookups", { fiscalYear }],
  queryFn: async ({ signal }) => {
    const lookupFallback = { data: [] };
    const [clsRes, boatsRes, feesRes] = await Promise.allSettled([
      api.get("/fish-classifications", { signal, params: fiscalYear ? { fiscal_year: fiscalYear } : {} }),
      api.get("/boats", { params: { all: 1 }, signal }),
      api.get("/fees", { params: { compact: 1 }, signal }),
    ]);

    const rawClassifications =
      clsRes.status === "fulfilled"
        ? clsRes.value.data
        : [];
    const classifications = Array.isArray(rawClassifications)
      ? rawClassifications
      : Array.isArray(rawClassifications?.data)
        ? rawClassifications.data
        : [];

    const boatsRaw =
      boatsRes.status === "fulfilled"
        ? (boatsRes.value.data ?? [])
        : [];

    const fees =
      feesRes.status === "fulfilled"
        ? (feesRes.value.data ?? [])
        : [];

    return {
      classifications,
      boats: boatsRaw.filter((boat) => !boat.deleted_at),
      fees,
    };
  },
  staleTime: BANYERA_QUERY_STALE_TIME,
  gcTime: BANYERA_QUERY_GC_TIME,
  refetchOnWindowFocus: false,
});

export const getFishClassificationsDataQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  status = "all",
  highlightClassificationId = "",
  fiscalYear,
  paginated = true,
} = {}) => ({
  queryKey: ["banyera-data", "fish-classifications", { page, perPage, search, status, highlightClassificationId, fiscalYear, paginated }],
  queryFn: async ({ signal }) => {
    const response = await api.get("/fish-classifications", {
      signal,
      params: {
        paginated: paginated ? 1 : 0,
        page,
        per_page: perPage,
        search,
        status,
        highlight_classification_id: highlightClassificationId,
        fiscal_year: fiscalYear,
      },
    });

    if (paginated) {
      return {
        classifications: response.data?.data ?? [],
        classificationsMeta: response.data?.meta ?? {
          current_page: 1,
          last_page: 1,
          per_page: perPage,
          total: 0,
          from: 0,
          to: 0,
        },
        summary: response.data?.summary ?? {
          total: 0,
          used: 0,
          unused: 0,
        },
      };
    }

    const classifications = response.data ?? [];
    return {
      classifications,
      classificationsMeta: {
        current_page: 1,
        last_page: 1,
        per_page: classifications.length,
        total: classifications.length,
        from: classifications.length > 0 ? 1 : 0,
        to: classifications.length,
      },
      summary: {
        total: classifications.length,
        used: classifications.filter((item) => Number(item?.fish_using_count ?? 0) > 0).length,
        unused: classifications.filter((item) => Number(item?.fish_using_count ?? 0) === 0).length,
      },
    };
  },
  staleTime: BANYERA_QUERY_STALE_TIME,
  gcTime: BANYERA_QUERY_GC_TIME,
  refetchOnWindowFocus: false,
});

const QUERY_OPTION_KEYS = new Set([
  "enabled",
  "staleTime",
  "refetchOnReconnect",
  "refetchOnWindowFocus",
  "placeholderData",
  "select",
  "retry",
]);

const looksLikeQueryOptions = (value) =>
  value &&
  typeof value === "object" &&
  Object.keys(value).some((key) => QUERY_OPTION_KEYS.has(key)) &&
  !["page", "perPage", "search", "status", "period", "fishType", "filters", "sort", "highlightBanyeraId", "paginated", "includeLookups", "skipFiscalYear"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );

// Banyera page data bundle: transactions plus supporting lookups.
export const useBanyeraDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getBanyeraDataQueryOptions({ ...resolvedFilters, fiscalYear: resolvedFilters.skipFiscalYear ? undefined : fiscalYear }),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};

export const useBanyeraLookupsQuery = (queryOptions = {}) =>
  (() => {
    const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);
    return useQuery({
      ...getBanyeraLookupsQueryOptions({ fiscalYear }),
      placeholderData: (previousData) => previousData,
      ...queryOptions,
    });
  })();

const extractBanyeraReportPayload = (payload) => ({
  rows: Array.isArray(payload?.rows) ? payload.rows : [],
  banyeraTransactions: Array.isArray(payload?.banyeraTransactions) ? payload.banyeraTransactions : (Array.isArray(payload?.rows) ? payload.rows : []),
  totalRevenue: Number(payload?.totalRevenue ?? 0),
  total_records: Number(payload?.total_records ?? 0),
});

export const getBanyeraReportQueryOptions = ({
  filterType = "daily",
  selectedDate,
  selectedMonth,
  selectedYear,
} = {}) => ({
  queryKey: ["banyera-report", { filterType, selectedDate, selectedMonth, selectedYear }],
  queryFn: async ({ signal }) => {
    if (filterType === "daily") {
      if (!selectedDate) return extractBanyeraReportPayload(null);
      const response = await api.get("/banyera-reports/daily", {
        params: { date: selectedDate },
        signal,
      });
      return extractBanyeraReportPayload(response.data);
    }

    if (filterType === "monthly") {
      if (!selectedMonth || !selectedYear) return extractBanyeraReportPayload(null);
      const response = await api.get("/banyera-reports/monthly", {
        params: { month: String(selectedMonth).split("-")[1], year: selectedYear },
        signal,
      });
      return extractBanyeraReportPayload(response.data);
    }

    if (filterType === "yearly") {
      if (!selectedYear) return extractBanyeraReportPayload(null);
      const response = await api.get("/banyera-reports/yearly", {
        params: { year: selectedYear },
        signal,
      });
      return extractBanyeraReportPayload(response.data);
    }

    return extractBanyeraReportPayload(null);
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useBanyeraReportDataQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getBanyeraReportQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });

export const useFishClassificationsDataQuery = (filters = {}, queryOptions = {}) =>
  (() => {
    const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);
    const resolvedFilters = { ...filters, fiscalYear };
    return useQuery({
      ...getFishClassificationsDataQueryOptions(resolvedFilters),
      placeholderData: (previousData) => previousData,
      ...queryOptions,
    });
  })();
