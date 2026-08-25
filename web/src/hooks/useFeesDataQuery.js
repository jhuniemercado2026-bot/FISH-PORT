import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const normalizeVehicleTypesResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  return [];
};

export const FEES_DATA_QUERY_KEY = ["fees-data"];
export const FEE_TYPE_OPTIONS = [
  { value: "Docking", label: "Docking" },
  { value: "Banyera", label: "Banyera" },
  { value: "Vehicle Ticket Daily", label: "Vehicle Ticket Daily" },
  { value: "Vehicle Ticket Annual", label: "Vehicle Ticket Annual" },
];

const getFeeSortTimestamp = (value) => {
  const timestamp = new Date(value ?? 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const sortFeesNewestFirst = (items) =>
  [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const createdAtDifference =
      getFeeSortTimestamp(right?.created_at) - getFeeSortTimestamp(left?.created_at);

    if (createdAtDifference !== 0) return createdAtDifference;

    return getFeeSortTimestamp(right?.effective_from) - getFeeSortTimestamp(left?.effective_from);
  });

// Shared fee page query options keep the page and future prefetching aligned.
export const getFeesDataQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  status = "all",
  feeType = "all",
  period = "all",
  highlightFeeId = "",
  paginated = false,
  includeLookups = true,
} = {}) => ({
  queryKey: ["fees-data", { page, perPage, search, status, feeType, period, highlightFeeId, paginated, includeLookups }],
  queryFn: async ({ signal }) => {
    const lookupFallback = { data: [] };
    const [feesRes, boatTypesRes, vehicleTypesRes] = await Promise.all([
      api.get("/fees", {
        params: {
          page,
          per_page: perPage,
          search,
          status,
          fee_type: feeType,
          period,
          highlight_fee_id: highlightFeeId,
          all: paginated ? undefined : 1,
        },
        signal,
      }),
      includeLookups ? api.get("/boat-types", { params: { all: 1 }, signal }) : Promise.resolve(lookupFallback),
      includeLookups ? api.get("/vehicle-types", { params: { compact: 1 }, signal }) : Promise.resolve(lookupFallback),
    ]);

    const feesPayload = feesRes.data ?? {};
    const fees = paginated ? (feesPayload.data ?? []) : sortFeesNewestFirst(feesPayload);

    return {
      feeTypes: FEE_TYPE_OPTIONS,
      fees,
      feesMeta: paginated ? (feesPayload.meta ?? {}) : null,
      stats: feesPayload.stats ?? {
        total_records: 0,
        active_fees: 0,
        active_fee_types: 0,
      },
      boatTypes: boatTypesRes.data ?? [],
      vehicleTypes: normalizeVehicleTypesResponse(vehicleTypesRes.data ?? []),
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

// Fee page data bundle: records plus form lookups.
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
  !["page", "perPage", "search", "status", "feeType", "highlightFeeId", "paginated", "includeLookups"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );

export const useFeesDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;

  return useQuery({
    ...getFeesDataQueryOptions(resolvedFilters),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};

export const getFeesLookupsQueryOptions = () => ({
  queryKey: ["fees-lookups"],
  queryFn: async ({ signal }) => {
    const [boatTypesRes, vehicleTypesRes] = await Promise.all([
      api.get("/boat-types", { params: { all: 1 }, signal }),
      api.get("/vehicle-types", { params: { compact: 1 }, signal }),
    ]);

    return {
      boatTypes: boatTypesRes.data ?? [],
      vehicleTypes: normalizeVehicleTypesResponse(vehicleTypesRes.data ?? []),
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

export const useFeesLookupsQuery = (queryOptions = {}) =>
  useQuery({
    ...getFeesLookupsQueryOptions(),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
