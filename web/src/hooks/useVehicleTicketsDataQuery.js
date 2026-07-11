import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { buildFiscalMeta, filterByFiscalYear } from "../lib/fiscalYear";
import { useFiscalYearStore } from "../store/fiscalYearStore";

const normalizeVehicleTypesResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  return [];
};

const VEHICLE_TICKETS_PAGE_SIZE = 10;
const VEHICLE_TICKETS_STALE_TIME = 5 * 60 * 1000;
const VEHICLE_TICKETS_GC_TIME = 30 * 60 * 1000;

export const getVehicleTicketsDataQueryOptions = ({
  page = 1,
  perPage = VEHICLE_TICKETS_PAGE_SIZE,
  search = "",
  status = "all",
  period = "all",
  vehicleType = "all",
  ticketType = "all",
  highlightTicketId = "",
  filters = {},
  sort = "latest",
  paginated = true,
  includeStats = true,
  includeLookups = false,
  fiscalYear,
  skipFiscalYear = false,
} = {}) => ({
  queryKey: [
    "vehicle-tickets-data",
    {
      page,
      perPage,
      search,
      status,
      filters: {
        period,
        vehicleType,
        ticketType,
        highlightTicketId,
        ...filters,
      },
      sort,
      paginated,
      includeStats,
      includeLookups,
      fiscalYear: skipFiscalYear ? undefined : fiscalYear,
      skipFiscalYear,
    },
  ],
  queryFn: async ({ signal }) => {
    const path = ticketType === 'daily'
      ? '/daily-vehicle-tickets'
      : ticketType === 'annual'
        ? '/annual-vehicle-tickets'
        : '/vehicle-tickets';

    const requests = [
      api.get(path, {
        signal,
        params: {
          page,
          per_page: perPage,
          search,
          status,
          period,
          vehicle_type: vehicleType,
          ticket_type: ticketType === 'all' ? ticketType : undefined,
          fiscal_year: skipFiscalYear ? undefined : fiscalYear,
          highlight_ticket_id: highlightTicketId,
          sort,
          include_stats: includeStats ? 1 : 0,
          all: paginated ? undefined : 1,
        },
      }),
    ];

    if (includeLookups) {
      requests.push(
        api.get("/vehicle-types", {
          params: { fiscal_year: skipFiscalYear ? undefined : fiscalYear, compact: 1 },
          signal,
        })
      );
      requests.push(api.get("/fees", { params: { compact: 1 }, signal }));
    }

    const [ticketsRes, vehicleTypesRes, feesRes] = await Promise.all(requests);

    const ticketsPayload = ticketsRes.data ?? {};
    const ticketsRaw = Array.isArray(ticketsPayload) ? ticketsPayload : ticketsPayload.data ?? [];
    const activeFiscalYear = skipFiscalYear ? undefined : fiscalYear;
    const tickets = filterByFiscalYear(ticketsRaw, ["ticket_date", "issued_at", "created_at"], activeFiscalYear);

    return {
      tickets,
      ticketsMeta: buildFiscalMeta(
        Array.isArray(ticketsPayload) ? null : ticketsPayload.meta,
        tickets,
        {
            current_page: 1,
            last_page: 1,
            per_page: perPage,
        }
      ),
      stats: Array.isArray(ticketsPayload)
        ? null
        : ticketsPayload.stats ?? null,
      vehicleTypes: normalizeVehicleTypesResponse(vehicleTypesRes?.data ?? []),
      fees: feesRes?.data ?? [],
    };
  },
  staleTime: VEHICLE_TICKETS_STALE_TIME,
  gcTime: VEHICLE_TICKETS_GC_TIME,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

export const getVehicleTicketsLookupsQueryOptions = ({ fiscalYear } = {}) => ({
  queryKey: ["vehicle-tickets-lookups", { fiscalYear }],
  queryFn: async ({ signal }) => {
    const [vehicleTypesRes, feesRes] = await Promise.all([
      api.get("/vehicle-types", { params: { fiscal_year: fiscalYear, compact: 1 }, signal }),
      api.get("/fees", { params: { compact: 1 }, signal }),
    ]);

    const rawVehicleTypes = vehicleTypesRes.data ?? [];
    const vehicleTypes = Array.isArray(rawVehicleTypes) ? rawVehicleTypes : rawVehicleTypes.data ?? [];

    return {
      vehicleTypes,
      fees: feesRes.data ?? [],
    };
  },
  staleTime: VEHICLE_TICKETS_STALE_TIME,
  gcTime: VEHICLE_TICKETS_GC_TIME,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

export const getVehicleTypesDataQueryOptions = ({
  page = 1,
  perPage = VEHICLE_TICKETS_PAGE_SIZE,
  search = "",
  status = "all",
  highlightVehicleTypeId = "",
  fiscalYear,
} = {}) => ({
  queryKey: ["vehicle-tickets-data", "vehicle-types", { page, perPage, search, status, highlightVehicleTypeId, fiscalYear }],
  queryFn: async ({ signal }) => {
    const response = await api.get("/vehicle-types", {
      signal,
      params: {
        paginated: 1,
        page,
        per_page: perPage,
        search,
        status,
        highlight_vehicle_type_id: highlightVehicleTypeId,
        fiscal_year: fiscalYear,
      },
    });

    const responseData = response.data ?? {};
    const vehicleTypes = Array.isArray(responseData) ? responseData : responseData.data ?? [];

    return {
      vehicleTypes,
      vehicleTypesMeta: Array.isArray(responseData)
        ? {
            current_page: 1,
            last_page: 1,
            per_page: perPage,
            total: vehicleTypes.length,
            from: vehicleTypes.length > 0 ? 1 : 0,
            to: vehicleTypes.length,
          }
        : responseData.meta ?? {
            current_page: 1,
            last_page: 1,
            per_page: perPage,
            total: 0,
            from: 0,
            to: 0,
          },
      vehicleTypesSummary: Array.isArray(responseData) ? {
        total: vehicleTypes.length,
        used: vehicleTypes.filter((type) => Number(type?.tickets_count ?? 0) > 0).length,
        unused: vehicleTypes.filter((type) => Number(type?.tickets_count ?? 0) === 0).length,
      } : responseData.summary ?? {
        total: 0,
        used: 0,
        unused: 0,
      },
    };
  },
  staleTime: VEHICLE_TICKETS_STALE_TIME,
  gcTime: VEHICLE_TICKETS_GC_TIME,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

const QUERY_OPTION_KEYS = new Set(["enabled", "staleTime", "gcTime", "refetchOnReconnect", "refetchOnWindowFocus", "placeholderData", "keepPreviousData", "select", "retry"]);

const looksLikeQueryOptions = (value) =>
  value &&
  typeof value === "object" &&
  Object.keys(value).some((key) => QUERY_OPTION_KEYS.has(key)) &&
  !["page", "perPage", "search", "status", "period", "vehicleType", "ticketType", "highlightTicketId", "filters", "sort", "paginated", "includeStats", "includeLookups", "skipFiscalYear"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );

export const useVehicleTicketsDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getVehicleTicketsDataQueryOptions({ ...resolvedFilters, fiscalYear: resolvedFilters.skipFiscalYear ? undefined : fiscalYear }),
    placeholderData: (previousData) => previousData,
    keepPreviousData: true,
    ...resolvedQueryOptions,
  });
};

export const useVehicleTicketsLookupsQuery = (queryOptions = {}) => {
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getVehicleTicketsLookupsQueryOptions({ fiscalYear }),
    placeholderData: (previousData) => previousData,
    keepPreviousData: true,
    ...queryOptions,
  });
};

export const useVehicleTypesDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);
  const activeFiscalYear = resolvedFilters.skipFiscalYear ? undefined : (resolvedFilters.fiscalYear || fiscalYear);

  return useQuery({
    ...getVehicleTypesDataQueryOptions({ ...resolvedFilters, fiscalYear: activeFiscalYear }),
    placeholderData: (previousData) => previousData,
    keepPreviousData: true,
    ...resolvedQueryOptions,
  });
};
