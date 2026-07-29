import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const extractBillingReport = (payload) => {
  if (!payload) {
    return {
      rows: [],
      bills: [],
      totalBillings: 0,
      totalPaid: 0,
      totalBalance: 0,
    };
  }

  const rows = Array.isArray(payload.rows)
    ? payload.rows
    : Array.isArray(payload.bills)
      ? payload.bills
      : [];

  return {
    rows,
    bills: rows,
    totalBillings: Number(payload.totalBillings || payload.totalBilling || 0),
    totalPaid: Number(payload.totalPaid || payload.totalPayments || 0),
    totalBalance: Number(payload.totalBalance || payload.totalBalanceDue || 0),
  };
};

export const getBillingReportQueryOptions = ({
  filterType = "daily",
  selectedDate,
  selectedMonth,
  selectedYear,
} = {}) => ({
  queryKey: ["billing-report", { filterType, selectedDate, selectedMonth, selectedYear }],
  queryFn: async ({ signal }) => {
    if (filterType === "daily") {
      if (!selectedDate) return extractBillingReport(null);
      const response = await api.get("/billing-reports/daily", {
        params: { date: selectedDate },
        signal,
      });
      return extractBillingReport(response.data);
    }

    if (filterType === "monthly") {
      if (!selectedMonth || !selectedYear) return extractBillingReport(null);
      const response = await api.get("/billing-reports/monthly", {
        params: { month: String(selectedMonth).split("-")[1], year: selectedYear },
        signal,
      });
      return extractBillingReport(response.data);
    }

    if (filterType === "yearly") {
      if (!selectedYear) return extractBillingReport(null);
      const response = await api.get("/billing-reports/yearly", {
        params: { year: selectedYear },
        signal,
      });
      return extractBillingReport(response.data);
    }

    return extractBillingReport(null);
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useBillingReportDataQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getBillingReportQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
