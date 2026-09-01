import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { buildFiscalMeta, filterByFiscalYear } from "../lib/fiscalYear";
import { useFiscalYearStore } from "../store/fiscalYearStore";

// Shared docking query options keep the page and future prefetching aligned.
export const getDockingsDataQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  status = "all",
  dockingStatus = status,
  period = "all",
  dockingPeriod = period,
  boatType = "all",
  boatTypeId = boatType,
  highlightDockingId = "",
  paginated = false,
  includeLookups = false,
  fiscalYear,
  skipFiscalYear = false,
} = {}) => ({
  queryKey: ["dockings-data", { page, perPage, search, dockingStatus, dockingPeriod, boatTypeId, highlightDockingId, paginated, includeLookups, fiscalYear: skipFiscalYear ? undefined : fiscalYear, skipFiscalYear }],
  queryFn: async ({ signal }) => {
    const lookupFallback = { data: [] };
    const [dockingsRes, boatsRes, feesRes] = await Promise.all([
      api.get("/dockings", {
        params: {
          page,
          per_page: perPage,
          search,
          status: dockingStatus,
          docking_status: dockingStatus,
          period: dockingPeriod,
          docking_period: dockingPeriod,
          boat_type: boatTypeId,
          boat_type_id: boatTypeId,
          fiscal_year: skipFiscalYear ? undefined : fiscalYear,
          highlight_docking_id: highlightDockingId,
          all: paginated ? undefined : 1,
        },
        signal,
      }),
      includeLookups ? api.get("/boats", { params: { all: 1 }, signal }) : Promise.resolve(lookupFallback),
      includeLookups ? api.get("/fees", { params: { compact: 1 }, signal }) : Promise.resolve(lookupFallback),
    ]);

    const dockingsPayload = dockingsRes.data ?? {};
    const dockings = filterByFiscalYear(dockingsPayload.data ?? [], ["docking_date", "created_at"], skipFiscalYear ? undefined : fiscalYear);

    return {
      dockings,
      dockingsMeta: buildFiscalMeta(dockingsPayload.meta, dockings, {
        current_page: 1,
        last_page: 1,
        per_page: perPage,
      }),
      stats: dockingsPayload.stats ?? {
        total_records: 0,
        logged_today: 0,
        total_fee_today: 0,
      },
      boats: boatsRes.data,
      users: [],
      fees: feesRes.data,
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

// Docking page data bundle: records plus form lookups.
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
  !["page", "perPage", "search", "status", "dockingStatus", "period", "dockingPeriod", "boatType", "boatTypeId", "highlightDockingId", "paginated", "includeLookups", "skipFiscalYear"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );

export const useDockingsDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getDockingsDataQueryOptions({ ...resolvedFilters, fiscalYear: resolvedFilters.skipFiscalYear ? undefined : fiscalYear }),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};

export const getDockingLookupsQueryOptions = () => ({
  queryKey: ["docking-lookups"],
  queryFn: async ({ signal }) => {
    const [boatsRes, feesRes] = await Promise.all([
      api.get("/boats", { params: { all: 1 }, signal }),
      api.get("/fees", { params: { compact: 1 }, signal }),
    ]);

    return {
      boats: boatsRes.data ?? [],
      users: [],
      fees: feesRes.data ?? [],
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

export const useDockingLookupsQuery = (queryOptions = {}) =>
  useQuery({
    ...getDockingLookupsQueryOptions(),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });

const extractDockingReportPayload = (payload) => ({
  dockings: Array.isArray(payload?.rows) ? payload.rows : [],
  total_fee: Number(payload?.total_fee ?? 0),
  total_records: Number(payload?.total_records ?? 0),
});

export const getDockingReportQueryOptions = ({
  filterType = "daily",
  selectedDate,
  selectedMonth,
  selectedYear,
  userId,
} = {}) => ({
  queryKey: ["docking-report", { filterType, selectedDate, selectedMonth, selectedYear, userId }],
  queryFn: async ({ signal }) => {
    const withUser = (params) => (userId && userId !== "all" ? { ...params, user_id: userId } : params);

    if (filterType === "daily") {
      if (!selectedDate) return extractDockingReportPayload(null);
      const response = await api.get("/docking-reports/daily", {
        params: withUser({ date: selectedDate }),
        signal,
      });
      return extractDockingReportPayload(response.data);
    }

    if (filterType === "monthly") {
      if (!selectedMonth || !selectedYear) return extractDockingReportPayload(null);
      const response = await api.get("/docking-reports/monthly", {
        params: withUser({
          month: String(selectedMonth).split("-")[1],
          year: selectedYear,
        }),
        signal,
      });
      return extractDockingReportPayload(response.data);
    }

    if (filterType === "yearly") {
      if (!selectedYear) return extractDockingReportPayload(null);
      const response = await api.get("/docking-reports/yearly", {
        params: withUser({ year: selectedYear }),
        signal,
      });
      return extractDockingReportPayload(response.data);
    }

    return extractDockingReportPayload(null);
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useDockingReportDataQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getDockingReportQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });

export const getDockingCalendarQueryOptions = ({ start, end } = {}) => ({
  queryKey: ["dockings-calendar", { start, end }],
  queryFn: async ({ signal }) => {
    const response = await api.get("/docking-calendar", {
      params: { start, end },
      signal,
    });

    return response.data?.data ?? [];
  },
  enabled: Boolean(start && end),
  staleTime: 5 * 60 * 1000,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

export const useDockingCalendarQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getDockingCalendarQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
