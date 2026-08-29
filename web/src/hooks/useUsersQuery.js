import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

export const USERS_QUERY_KEY = ["users-data"];

const withProfileImageUrls = (users) => {
  const base = api.defaults.baseURL.replace("/api", "");

  return users.map((user) => {
    if (!user.profile_image_url && user.profile_image) {
      return {
        ...user,
        profile_image_url: `${base}/storage/${user.profile_image}`,
      };
    }

    return user;
  });
};

// Shared users query keeps account management data cached across the screen.
export const getUsersQueryOptions = () => ({
  queryKey: USERS_QUERY_KEY,
  queryFn: async ({ signal }) => {
    const res = await api.get("/users", { params: { all: 1 }, signal });
    const users = res.data?.data ?? [];

    return withProfileImageUrls(users);
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const getUsersPageQueryOptions = (queryFilters = {}) => {
  const {
    page = 1,
    perPage = 10,
    search = "",
    status = "all",
    role = "all",
    filters = {},
    sort = "created_at_desc",
    paginated = true,
    includeStats = true,
    excludeCurrent = false,
    highlightUserId = "",
  } = queryFilters;

  return {
    queryKey: [...USERS_QUERY_KEY, "page", { page, perPage, search, status, filters: { ...filters, role }, sort, paginated, includeStats, excludeCurrent, highlightUserId }],
    queryFn: async ({ signal }) => {
      const res = await api.get("/users", {
        params: {
          page,
          per_page: perPage,
          search: search || undefined,
          status: status !== "all" ? status : undefined,
          role: role !== "all" ? role : undefined,
          sort,
          paginated: paginated ? 1 : undefined,
          include_stats: includeStats ? 1 : 0,
          exclude_current: excludeCurrent ? 1 : undefined,
          highlight_user_id: highlightUserId || undefined,
        },
        signal,
      });

      return {
        users: withProfileImageUrls(res.data?.data ?? []),
        usersMeta: res.data?.meta ?? {
          current_page: page,
          last_page: 1,
          per_page: perPage,
          total: 0,
          from: null,
          to: null,
        },
        stats: res.data?.stats ?? { total: 0, online: 0, offline: 0, deactivated: 0 },
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  };
};

export const useUsersQuery = (queryOptions = {}) =>
  useQuery({
    ...getUsersQueryOptions(),
    ...queryOptions,
  });

export const useUsersPageQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getUsersPageQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
