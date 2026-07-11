import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const getMonthlyReportQueryOptions = (selectedMonth) => {
  const [year = "", month = ""] = String(selectedMonth || "").split("-");

  return {
    queryKey: ["monthly-report", selectedMonth],
    queryFn: async ({ signal }) => {
      if (!year || !month) {
        return { rows: [], totalRevenue: 0 };
      }

      const response = await api.get("/revenue-reports/monthly", {
        params: { year, month },
        signal,
      });

      return response.data ?? { rows: [], totalRevenue: 0 };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  };
};

export const useMonthlyReportDataQuery = (selectedMonth, queryOptions = {}) =>
  useQuery({
    ...getMonthlyReportQueryOptions(selectedMonth),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
