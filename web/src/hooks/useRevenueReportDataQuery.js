import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const extractRevenueReport = (payload) => {
  if (!payload) return { rows: [], totalRevenue: 0 };
  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    totalRevenue: Number(payload.totalRevenue || 0),
  };
};

export const getRevenueReportQueryOptions = ({
  filterType = "daily",
  date = undefined,
  month = undefined,
  year = undefined,
} = {}) => ({
  queryKey: [
    "revenue-report",
    { filterType, date, month, year },
  ],
  queryFn: async ({ signal }) => {
    try {
      let endpoint = "/revenue-reports/daily";
      let params = {};

      if (filterType === "monthly" && month && year) {
        endpoint = "/revenue-reports/monthly";
        params = { month, year };
      } else if (filterType === "yearly" && year) {
        endpoint = "/revenue-reports/yearly";
        params = { year };
      } else if (filterType === "daily" && date) {
        endpoint = "/revenue-reports/daily";
        params = { date };
      } else {
        return { rows: [], totalRevenue: 0 };
      }

      const response = await api.get(endpoint, { params, signal }).catch(err => {
        console.error(`Error fetching revenue report (${filterType}):`, err);
        return { data: { rows: [], totalRevenue: 0 } };
      });

      return extractRevenueReport(response.data);
    } catch (error) {
      console.error("Error fetching revenue report:", error);
      return { rows: [], totalRevenue: 0 };
    }
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useRevenueReportDataQuery = (filters = {}, queryOptions = {}) => {
  return useQuery({
    ...getRevenueReportQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
};
