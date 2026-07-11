import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const extractRemittanceReport = (payload) => {
  if (!payload) {
    return {
      rows: [],
      totalRemittances: 0,
      totalTodaysCashReceived: 0,
      totalSurplus: 0,
      totalDeficit: 0,
    };
  }

  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    totalRemittances: Number(payload.totalRemittances || 0),
    totalTodaysCashReceived: Number(payload.totalTodaysCashReceived || 0),
    totalSurplus: Number(payload.totalSurplus || 0),
    totalDeficit: Number(payload.totalDeficit || 0),
  };
};

export const getRemittanceReportQueryOptions = ({
  filterType = "daily",
  selectedDate,
  selectedMonth,
  selectedYear,
} = {}) => {
  return {
    queryKey: ["remittance-report", { filterType, selectedDate, selectedMonth, selectedYear }],
    queryFn: async ({ signal }) => {
      if (filterType === "daily") {
        if (!selectedDate) return extractRemittanceReport(null);
        const response = await api.get("/remittance-reports/daily", {
          params: { date: selectedDate },
          signal,
        });
        return extractRemittanceReport(response.data);
      }

      if (filterType === "monthly") {
        if (!selectedMonth || !selectedYear) return extractRemittanceReport(null);
        const response = await api.get("/remittance-reports/monthly", {
          params: { month: String(selectedMonth).split("-")[1], year: selectedYear },
          signal,
        });
        return extractRemittanceReport(response.data);
      }

      if (filterType === "yearly") {
        if (!selectedYear) return extractRemittanceReport(null);
        const response = await api.get("/remittance-reports/yearly", {
          params: { year: selectedYear },
          signal,
        });
        return extractRemittanceReport(response.data);
      }

      return extractRemittanceReport(null);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  };
};

export const useRemittanceReportDataQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getRemittanceReportQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
