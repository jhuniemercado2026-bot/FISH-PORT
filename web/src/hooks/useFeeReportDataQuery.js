import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const FEE_REPORT_QUERY_VERSION = 2;

const extractFeeReportPayload = (payload) => {
  const fees = Array.isArray(payload?.fees) ? payload.fees : [];

  return {
    fees,
    totalRecords: fees.length,
  };
};

export const getFeeReportQueryOptions = ({ year, userId } = {}) => ({
  queryKey: ["fee-report", { year, userId, version: FEE_REPORT_QUERY_VERSION }],
  queryFn: async ({ signal }) => {
    if (!year) return extractFeeReportPayload(null);

    try {
      const response = await api.get("/fees-reports/yearly", {
        params: userId && userId !== "all" ? { year, user_id: userId } : { year },
        signal,
      });
      return extractFeeReportPayload(response.data);
    } catch (error) {
      console.error("Error fetching fee report:", error);
      return extractFeeReportPayload(null);
    }
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useFeeReportDataQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getFeeReportQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
