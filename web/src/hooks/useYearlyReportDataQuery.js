import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const getYearlyReportQueryOptions = (selectedYear) => ({
  queryKey: ["yearly-report", selectedYear],
  queryFn: async ({ signal }) => {
    if (!selectedYear) {
      return { rows: [], totalRevenue: 0 };
    }

    const response = await api.get("/revenue-reports/yearly", {
      params: { year: selectedYear },
      signal,
    });

    return response.data ?? { rows: [], totalRevenue: 0 };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useYearlyReportDataQuery = (selectedYear, queryOptions = {}) =>
  useQuery({
    ...getYearlyReportQueryOptions(selectedYear),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
