import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const extractVehicleTicketReportPayload = (payload) => ({
  tickets: Array.isArray(payload?.tickets) ? payload.tickets : [],
  fees: Array.isArray(payload?.fees) ? payload.fees : [],
  totalRecords: Number(payload?.total_records ?? 0),
  totalTicketFee: Number(payload?.total_ticket_fee ?? 0),
  ticketType: payload?.ticket_type ?? null,
});

export const getVehicleTicketReportQueryOptions = ({
  filterType = "daily",
  selectedDate,
  selectedMonth,
  selectedYear,
  ticketType = "daily",
} = {}) => ({
  queryKey: ["vehicle-ticket-report", { filterType, selectedDate, selectedMonth, selectedYear, ticketType }],
  queryFn: async ({ signal }) => {
    if (filterType === "daily") {
      if (!selectedDate || !ticketType) return extractVehicleTicketReportPayload(null);
      const response = await api.get("/vehicle-ticket-reports/daily", {
        params: { date: selectedDate, ticket_type: ticketType },
        signal,
      });
      return extractVehicleTicketReportPayload(response.data);
    }

    if (filterType === "monthly") {
      if (!selectedMonth || !selectedYear || !ticketType) return extractVehicleTicketReportPayload(null);
      const [year, month] = String(selectedMonth).split("-");
      const response = await api.get("/vehicle-ticket-reports/monthly", {
        params: { month, year: selectedYear, ticket_type: ticketType },
        signal,
      });
      return extractVehicleTicketReportPayload(response.data);
    }

    if (filterType === "yearly") {
      if (!selectedYear || !ticketType) return extractVehicleTicketReportPayload(null);
      const response = await api.get("/vehicle-ticket-reports/yearly", {
        params: { year: selectedYear, ticket_type: ticketType },
        signal,
      });
      return extractVehicleTicketReportPayload(response.data);
    }

    return extractVehicleTicketReportPayload(null);
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useVehicleTicketReportDataQuery = (filters = {}, queryOptions = {}) =>
  useQuery({
    ...getVehicleTicketReportQueryOptions(filters),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
