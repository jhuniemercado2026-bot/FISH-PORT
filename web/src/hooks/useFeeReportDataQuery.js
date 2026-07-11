import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const extractFeeReportPayload = (payload) => ({
  fees: Array.isArray(payload?.fees) ? payload.fees : [],
  totalRecords: Number(payload?.total_records ?? 0),
});

export const getFeeReportQueryOptions = ({ year } = {}) => ({
  queryKey: ["fee-report", { year }],
  queryFn: async ({ signal }) => {
    if (!year) return extractFeeReportPayload(null);

    try {
      const response = await api.get("/fees-reports/yearly", {
        params: { year },
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
