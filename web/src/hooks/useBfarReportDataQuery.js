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
} = {}) => ({
  queryKey: ["bfar-report", { filterType, selectedDate, selectedMonth, selectedYear }],
  queryFn: async ({ signal }) => {
    if (filterType === "daily") {
      if (!selectedDate) return extractBfarReportPayload(null);
      const response = await api.get("/bfar-reports/daily", {
        params: { date: selectedDate },
        signal,
      });
      return extractBfarReportPayload(response.data);
    }

    if (filterType === "monthly") {
      if (!selectedMonth || !selectedYear) return extractBfarReportPayload(null);
      const response = await api.get("/bfar-reports/monthly", {
        params: { month: String(selectedMonth).split("-")[1], year: selectedYear },
        signal,
      });
      return extractBfarReportPayload(response.data);
    }

    if (filterType === "yearly") {
      if (!selectedYear) return extractBfarReportPayload(null);
      const response = await api.get("/bfar-reports/yearly", {
        params: { year: selectedYear },
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
