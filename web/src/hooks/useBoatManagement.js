import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const inFlightBoatManagementRequests = new Map();

const defaultMeta = (perPage = 10) => ({
  current_page: 1,
  last_page: 1,
  per_page: perPage,
  total: 0,
  from: 0,
  to: 0,
});

const normalizePaginatedResponse = (payload, perPage = 10) => {
  if (Array.isArray(payload)) {
    return {
      data: payload,
      meta: {
        ...defaultMeta(perPage),
        total: payload.length,
        from: payload.length ? 1 : 0,
        to: payload.length,
      },
    };
  }

  return {
    data: payload?.data ?? [],
    meta: payload?.meta ?? defaultMeta(perPage),
  };
};

const stableRequestKey = (params) =>
  JSON.stringify(
    Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {})
  );

export const getRegisteredBoatsDataQueryOptions = ({
  boatsPage = 1,
  boatTypesPage = 1,
  ownersPage = 1,
  perPage = 10,
  boatsSearch = "",
  boatsStatus = "all",
  owner = "all",
  boatType = "all",
  boatTypesSearch = "",
  boatTypesStatus = "all",
  boatTypesUsage = boatTypesStatus,
  ownersSearch = "",
  ownersStatus = "all",
  ownersUsage = ownersStatus,
  highlightBoatId = "",
  highlightBoatTypeId = "",
  highlightOwnerId = "",
  paginated = false,
  boatsPaginated = paginated,
  boatTypesPaginated = paginated,
  ownersPaginated = paginated,
  includeBoats = false,
  includeBoatTypes = false,
  includeOwners = false,
  boat = false,
} = {}) => ({
  queryKey: [
    "registered-boats-data",
    {
      boatsPage,
      boatTypesPage,
      ownersPage,
      perPage,
      boatsSearch,
      boatsStatus,
      owner,
      boatType,
      boatTypesSearch,
      boatTypesStatus,
      boatTypesUsage,
      ownersSearch,
      ownersStatus,
      ownersUsage,
      highlightBoatId,
      highlightBoatTypeId,
      highlightOwnerId,
      boatsPaginated,
      boatTypesPaginated,
      ownersPaginated,
      includeBoats,
      includeBoatTypes,
      includeOwners,
      boat,
    },
  ],
  queryFn: async () => {
    const params = {
      boats_page: boatsPage,
      boat_types_page: boatTypesPage,
      owners_page: ownersPage,
      per_page: perPage,
      boats_search: boatsSearch,
      boats_status: boatsStatus,
      owner,
      boat_type: boatType,
      boat_types_search: boatTypesSearch,
      boat_types_status: boatTypesStatus,
      boat_types_usage: boatTypesUsage,
      owners_search: ownersSearch,
      owners_status: ownersStatus,
      owners_usage: ownersUsage,
      highlight_boat_id: highlightBoatId,
      highlight_boat_type_id: highlightBoatTypeId,
      highlight_owner_id: highlightOwnerId,
      boats_paginated: boatsPaginated ? 1 : 0,
      boat_types_paginated: boatTypesPaginated ? 1 : 0,
      owners_paginated: ownersPaginated ? 1 : 0,
      include_boats: includeBoats ? 1 : 0,
      include_boat_types: includeBoatTypes ? 1 : 0,
      include_owners: includeOwners ? 1 : 0,
      boat: boat ? 1 : 0,
    };

    const requestKey = stableRequestKey(params);
    const existingRequest = inFlightBoatManagementRequests.get(requestKey);

    if (existingRequest) {
      return existingRequest;
    }

    const request = api
      .get("/boat-management", { params })
      .then((response) => ({
        boats: response.data?.boats ?? [],
        boatsMeta: response.data?.boatsMeta ?? defaultMeta(perPage),
        boatTypes: response.data?.boatTypes ?? [],
        boatTypesMeta: response.data?.boatTypesMeta ?? defaultMeta(perPage),
        owners: response.data?.owners ?? [],
        ownersMeta: response.data?.ownersMeta ?? defaultMeta(perPage),
        stats: response.data?.stats ?? {},
      }))
      .finally(() => {
        inFlightBoatManagementRequests.delete(requestKey);
      });

    inFlightBoatManagementRequests.set(requestKey, request);
    return request;
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
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

const REGISTERED_BOATS_FILTER_KEYS = [
  "boatsPage",
  "boatTypesPage",
  "ownersPage",
  "perPage",
  "boatsSearch",
  "boatsStatus",
  "owner",
  "boatType",
  "boatTypesSearch",
  "boatTypesStatus",
  "boatTypesUsage",
  "ownersSearch",
  "ownersStatus",
  "ownersUsage",
  "highlightBoatId",
  "highlightBoatTypeId",
  "highlightOwnerId",
  "paginated",
  "boatsPaginated",
  "boatTypesPaginated",
  "ownersPaginated",
  "includeBoats",
  "includeBoatTypes",
  "includeOwners",
  "boat",
];

const looksLikeQueryOptions = (value) =>
  value &&
  typeof value === "object" &&
  Object.keys(value).some((key) => QUERY_OPTION_KEYS.has(key)) &&
  !REGISTERED_BOATS_FILTER_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );

export const useRegisteredBoatsDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters)
    ? filters
    : queryOptions;

  return useQuery({
    ...getRegisteredBoatsDataQueryOptions(resolvedFilters),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};

export const getBoatsQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  status = "all",
  owner = "all",
  boatType = "all",
  highlightBoatId = "",
  boatsPaginated = true,
} = {}) => ({
  queryKey: ["boats", { page, perPage, search, status, owner, boatType, highlightBoatId, boatsPaginated }],
  queryFn: async () => {
    const params = {
      boats_page: page,
      per_page: perPage,
      search,
      status,
      owner,
      boat_type: boatType,
      highlight_boat_id: highlightBoatId,
      boats_paginated: boatsPaginated ? 1 : 0,
    };

    const response = await api.get("/boats", { params });

    return {
      boats: response.data?.boats ?? response.data?.data ?? [],
      boatsMeta: response.data?.boatsMeta ?? response.data?.meta ?? defaultMeta(perPage),
      stats: response.data?.stats ?? {},
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
  keepPreviousData: true,
  placeholderData: (previousData) => previousData,
});

export const useBoatsQuery = (filters = {}, queryOptions = {}) => {
  const { enabled, ...restFilters } = filters ?? {};

  return useQuery({
    ...getBoatsQueryOptions(restFilters),
    ...(typeof enabled === "boolean" ? { enabled } : {}),
    ...queryOptions,
  });
};

export const getBoatTypesQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  usage = "all",
  all = false,
  highlightBoatTypeId = "",
} = {}) => ({
  queryKey: ["boat-types", { page, perPage, search, usage, all, highlightBoatTypeId }],
  queryFn: async () => {
    const params = {
      types: 1,
      boat_types_page: page,
      per_page: perPage,
      boat_types_search: search,
      boat_types_usage: usage,
      boat_types_paginated: all ? 0 : 1,
      highlight_boat_type_id: highlightBoatTypeId,
      include_boats: 0,
      include_owners: 0,
      include_boat_types: 1,
    };

    if (all) {
      params.per_page = 100;
    }

    const response = await api.get("/boat-management", { params });

    return {
      boatTypes: response.data?.boatTypes ?? [],
      boatTypesMeta: response.data?.boatTypesMeta ?? defaultMeta(perPage),
      stats: response.data?.stats ?? {},
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
  keepPreviousData: true,
  placeholderData: (previousData) => previousData,
});

export const useBoatTypesQuery = (filters = {}, queryOptions = {}) => {
  const { enabled, ...restFilters } = filters ?? {};

  return useQuery({
    ...getBoatTypesQueryOptions(restFilters),
    ...(typeof enabled === "boolean" ? { enabled } : {}),
    ...queryOptions,
  });
};

export const getBoatOwnersQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  usage = "all",
  all = false,
  highlightOwnerId = "",
} = {}) => ({
  queryKey: ["boat-owners", { page, perPage, search, usage, all, highlightOwnerId }],
  queryFn: async () => {
    const params = {
      owners: 1,
      owners_page: page,
      per_page: perPage,
      owners_search: search,
      owners_usage: usage,
      owners_paginated: all ? 0 : 1,
      highlight_owner_id: highlightOwnerId,
      include_boats: 0,
      include_owners: 1,
      include_boat_types: 0,
    };

    if (all) {
      params.per_page = 100;
    }

    const response = await api.get("/boat-management", { params });

    return {
      owners: response.data?.owners ?? [],
      ownersMeta: response.data?.ownersMeta ?? defaultMeta(perPage),
      stats: response.data?.stats ?? {},
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
  keepPreviousData: true,
  placeholderData: (previousData) => previousData,
});

export const useBoatOwnersQuery = (filters = {}, queryOptions = {}) => {
  const { enabled, ...restFilters } = filters ?? {};

  return useQuery({
    ...getBoatOwnersQueryOptions(restFilters),
    ...(typeof enabled === "boolean" ? { enabled } : {}),
    ...queryOptions,
  });
};

export const getAddBoatDataQueryOptions = () => ({
  ...getRegisteredBoatsDataQueryOptions({ includeBoatTypes: true, includeOwners: true }),
  select: (data) => ({
    boatTypes: data?.boatTypes ?? [],
    owners: data?.owners ?? [],
  }),
});

export const useAddBoatDataQuery = (queryOptions = {}) =>
  useQuery({
    ...getAddBoatDataQueryOptions(),
    ...queryOptions,
  });

const extractRegisteredBoatsReport = (payload) => {
  // Backend may return either { boats: [...] } or { data: [...] }
  const boats = Array.isArray(payload?.boats)
    ? payload.boats
    : Array.isArray(payload?.data)
    ? payload.data
    : [];

  return { boats };
};

export const getRegisteredBoatsReportQueryOptions = () => ({
  queryKey: ["registered-boats-report"],
  queryFn: async ({ signal }) => {
    try {
      const response = await api.get("/registered-boats-reports", { signal });
      return extractRegisteredBoatsReport(response.data);
    } catch (error) {
      console.error("Error fetching registered boats report:", error);
      return extractRegisteredBoatsReport(null);
    }
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useRegisteredBoatsReportDataQuery = (queryOptions = {}) =>
  useQuery({
    ...getRegisteredBoatsReportQueryOptions(),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });

const extractOwnerInfoReport = (payload) => {
  // Backend may return owners under `owners` or `data`
  const owners = Array.isArray(payload?.owners)
    ? payload.owners
    : Array.isArray(payload?.data)
    ? payload.data
    : [];

  return { owners };
};

export const getOwnerInfoReportQueryOptions = () => ({
  queryKey: ["owner-info-report"],
  queryFn: async ({ signal }) => {
    try {
      const response = await api.get("/owner-info-reports", { signal });
      return extractOwnerInfoReport(response.data);
    } catch (error) {
      console.error("Error fetching owner info report:", error);
      return extractOwnerInfoReport(null);
    }
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useOwnerInfoReportDataQuery = (queryOptions = {}) =>
  useQuery({
    ...getOwnerInfoReportQueryOptions(),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
