import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const extractBfarReportPayload = (payload) => ({
  rows: Array.isArray(payload?.rows) ? payload.rows : [],
  bfarRows: Array.isArray(payload?.rows) ? payload.rows : [],
  total_records: Number(payload?.total_records ?? 0),
});

export const getBfarReportQueryOptions = ({
  filterType = "monthly",
  selectedDate,
  selectedMonth,
  selectedYear,
  userId,
} = {}) => ({
  queryKey: ["bfar-report", { filterType, selectedDate, selectedMonth, selectedYear, userId }],
  queryFn: async ({ signal }) => {
    const withUser = (params) => (userId && userId !== "all" ? { ...params, user_id: userId } : params);

    if (filterType === "daily") {
      if (!selectedDate) return extractBfarReportPayload(null);
      const response = await api.get("/bfar-reports/daily", {
        params: withUser({ date: selectedDate }),
        signal,
      });
      return extractBfarReportPayload(response.data);
    }

    if (filterType === "monthly") {
      if (!selectedMonth || !selectedYear) return extractBfarReportPayload(null);
      const response = await api.get("/bfar-reports/monthly", {
        params: withUser({ month: String(selectedMonth).split("-")[1], year: selectedYear }),
        signal,
      });
      return extractBfarReportPayload(response.data);
    }

    if (filterType === "yearly") {
      if (!selectedYear) return extractBfarReportPayload(null);
      const response = await api.get("/bfar-reports/yearly", {
        params: withUser({ year: selectedYear }),
        signal,
      });
      return extractBfarReportPayload(response.data);
    }

    return extractBfarReportPayload(null);
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useBfarReportDataQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getBfarReportQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
