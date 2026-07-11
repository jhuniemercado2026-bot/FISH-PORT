import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { useFiscalYearStore } from "../store/fiscalYearStore";

const normalizeNotification = (row) => ({
  ...row,
  notification_id: row?.notification_id ?? null,
  recipient_user_id: row?.recipient_user_id ?? null,
  sender_user_id: row?.sender_user_id ?? null,
  related_type: row?.related_type ?? "",
  related_id: row?.related_id ?? null,
  title: row?.title ?? "",
  message: row?.message ?? "",
  is_read: Boolean(row?.is_read),
  read_at: row?.read_at ?? null,
  created_at: row?.created_at ?? null,
});

export const getNotificationsDataQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  status = "all",
  paginated = false,
  fiscalYear,
} = {}) => ({
  queryKey: ["notifications-data", { page, perPage, search, status, filters: { status }, paginated, fiscalYear }],
  queryFn: async ({ signal }) => {
    const res = await api.get("/notifications", {
      params: {
        page,
        per_page: perPage,
        search,
        status,
        fiscal_year: fiscalYear,
        all: paginated ? undefined : 1,
      },
      signal,
    });
    const notifications = Array.isArray(res.data?.notifications)
      ? res.data.notifications.map(normalizeNotification)
      : [];

    return {
      notifications,
      notificationsMeta: res.data?.notifications_meta ?? {
        current_page: 1,
        last_page: 1,
        per_page: perPage,
        total: notifications.length,
        from: notifications.length ? 1 : 0,
        to: notifications.length,
      },
      totalCount: Number(res.data?.total_count ?? notifications.length),
      readCount: Number(res.data?.read_count ?? notifications.filter((row) => row.is_read).length),
      unreadCount: Number(
        res.data?.unread_count ?? notifications.filter((row) => !row.is_read).length
      ),
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
  !["page", "perPage", "search", "status", "paginated"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );

export const useNotificationsDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getNotificationsDataQueryOptions({ ...resolvedFilters, fiscalYear }),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};
