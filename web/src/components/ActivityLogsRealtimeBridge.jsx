import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVITY_LOGS_QUERY_KEY } from "../hooks/useActivityLogsQuery";
import { getEcho } from "../lib/realtime";

const PAGE_SIZE_FALLBACK = 10;

const normalizeActivityLog = (log) => ({
  ...log,
  timestamp: log?.timestamp ?? log?.created_at,
  severity: log?.severity || "info",
});

const logDate = (log) => {
  const value = log?.created_at || log?.timestamp;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const isSameDay = (left, right) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const isSameMonth = (left, right) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

const matchesPeriod = (log, period) => {
  if (!period || period === "all") return true;

  const date = logDate(log);
  if (!date) return false;

  const now = new Date();
  if (period === "today") return isSameDay(date, now);
  if (period === "month") return isSameMonth(date, now);

  if (period === "week") {
    const start = new Date(now);
    const day = start.getDay() || 7;
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - day + 1);

    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    return date >= start && date < end;
  }

  return true;
};

const matchesSearch = (log, search) => {
  const query = String(search || "").trim().toLowerCase();
  if (!query) return true;

  return [
    log?.module,
    log?.user_name,
    log?.created_at,
    log?.timestamp,
  ].some((value) => String(value || "").toLowerCase().includes(query));
};

const matchesActivityFilters = (log, filters = {}) => {
  const moduleFilter = filters?.filters?.module;
  const userFilter = filters?.filters?.user;

  if (filters.status && filters.status !== "all" && log?.severity !== filters.status) {
    return false;
  }

  if (moduleFilter && moduleFilter !== "all" && log?.module !== moduleFilter) {
    return false;
  }

  if (userFilter && userFilter !== "all" && log?.user_name !== userFilter) {
    return false;
  }

  if (filters.fiscalYear) {
    const year = String(log?.created_at || log?.timestamp || "").slice(0, 4);
    if (year && year !== String(filters.fiscalYear)) return false;
  }

  return matchesPeriod(log, filters.period) && matchesSearch(log, filters.search);
};

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

const canReceiveActivityLog = (log, user) => {
  if (String(user?.role || "").toLowerCase() !== "inspector") return true;

  return String(log?.user_id ?? "") === String(user?.user_id ?? "");
};

const upsertActivityLog = (data, log, filters = {}) => {
  if (!data || !matchesActivityFilters(log, filters)) return data;

  const currentLogs = Array.isArray(data.logs) ? data.logs : [];
  const page = Number(filters.page || data.meta?.current_page || 1);
  const perPage = Number(filters.perPage || data.meta?.per_page || PAGE_SIZE_FALLBACK);
  const existingIndex = currentLogs.findIndex((item) => String(item?.id) === String(log?.id));
  const logsWithoutDuplicate = existingIndex === -1
    ? currentLogs
    : currentLogs.filter((item) => String(item?.id) !== String(log?.id));
  const nextLogs = page === 1 ? [log, ...logsWithoutDuplicate].slice(0, perPage) : logsWithoutDuplicate;
  const previousTotal = Number(data.meta?.total ?? currentLogs.length);
  const insertedNewLog = existingIndex === -1;

  return {
    ...data,
    logs: nextLogs,
    meta: {
      ...data.meta,
      total: insertedNewLog ? previousTotal + 1 : previousTotal,
      from: nextLogs.length ? Number(data.meta?.from || 1) : 0,
      to: nextLogs.length ? Math.min(Number(data.meta?.from || 1) + nextLogs.length - 1, insertedNewLog ? previousTotal + 1 : previousTotal) : 0,
    },
  };
};

export default function ActivityLogsRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const echo = getEcho();
    if (!echo) return undefined;

    const channel = echo.channel("activity-logs");

    channel.listen(".created", (payload) => {
      const log = payload?.log ? normalizeActivityLog(payload.log) : null;
      if (!log?.id) return;

      if (!canReceiveActivityLog(log, getCurrentUser())) return;

      queryClient
        .getQueryCache()
        .findAll({ queryKey: ACTIVITY_LOGS_QUERY_KEY })
        .forEach((query) => {
          const filters = query.queryKey?.[1] ?? {};
          queryClient.setQueryData(query.queryKey, (data) => upsertActivityLog(data, log, filters));
        });

      void queryClient.invalidateQueries({ queryKey: ACTIVITY_LOGS_QUERY_KEY, refetchType: "active" });
    });

    return () => {
      echo.leave("activity-logs");
    };
  }, [queryClient]);

  return null;
}
