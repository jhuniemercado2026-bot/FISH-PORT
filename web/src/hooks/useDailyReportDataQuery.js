import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const getDailyReportQueryOptions = (selectedDate) => ({
  queryKey: ["daily-report", selectedDate],
  queryFn: async ({ signal }) => {
    if (!selectedDate) {
      return { rows: [], totalRevenue: 0 };
    }

    const response = await api.get("/revenue-reports/daily", {
      params: { date: selectedDate },
      signal,
    });

    return response.data ?? { rows: [], totalRevenue: 0 };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useDailyReportDataQuery = (selectedDate, queryOptions = {}) =>
  useQuery({
    ...getDailyReportQueryOptions(selectedDate),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
