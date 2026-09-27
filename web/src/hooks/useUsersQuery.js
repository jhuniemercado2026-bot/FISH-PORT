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

const getUserMatchKey = (user) => String(user?.user_id ?? user?.id ?? "");
const getUserEmailKey = (user) => String(user?.email || "").trim().toLowerCase();
const getUserDisplayName = (user) => {
  const direct = String(user?.full_name || "").trim();
  if (direct) return direct;

  const combined = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  if (combined) return combined;

  return String(user?.email || "").trim() || "—";
};

const upsertUserInList = (targetUser, currentUser) => {
  if (!currentUser) return currentUser;

  const currentId = getUserMatchKey(currentUser);
  const currentEmail = getUserEmailKey(currentUser);
  const targetId = getUserMatchKey(targetUser);
  const targetEmail = getUserEmailKey(targetUser);

  const isMatch = Boolean(
    (targetId && currentId && targetId === currentId)
    || (targetEmail && currentEmail && targetEmail === currentEmail)
  );

  if (!isMatch) return currentUser;

  const nextUser = {
    ...currentUser,
    ...targetUser,
    full_name: String(targetUser?.full_name || currentUser?.full_name || getUserDisplayName({ ...currentUser, ...targetUser })).trim() || "—",
  };

  return {
    ...nextUser,
    full_name: getUserDisplayName(nextUser),
  };
};

export const syncUsersQueryCache = (queryClient, updatedUser) => {
  if (!queryClient || !updatedUser) return;

  queryClient.getQueryCache().findAll({ queryKey: USERS_QUERY_KEY }).forEach((query) => {
    queryClient.setQueryData(query.queryKey, (data) => {
      if (!data) return data;

      if (Array.isArray(data)) {
        return data.map((item) => upsertUserInList(updatedUser, item));
      }

      if (Array.isArray(data.users)) {
        return {
          ...data,
          users: data.users.map((item) => upsertUserInList(updatedUser, item)),
        };
      }

      if (Array.isArray(data.data)) {
        return {
          ...data,
          data: data.data.map((item) => upsertUserInList(updatedUser, item)),
        };
      }

      return data;
    });
  });

  void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY, refetchType: "active" });
};

export const useUsersPageQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getUsersPageQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
