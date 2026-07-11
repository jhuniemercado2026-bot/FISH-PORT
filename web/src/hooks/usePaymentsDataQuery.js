import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { buildFiscalMeta, filterByFiscalYear } from "../lib/fiscalYear";
import { useFiscalYearStore } from "../store/fiscalYearStore";

const extractCollection = (payload, nestedKey = "") => {
  if (Array.isArray(payload)) return payload;
  if (nestedKey && Array.isArray(payload?.[nestedKey])) return payload[nestedKey];
  if (nestedKey && Array.isArray(payload?.[nestedKey]?.data)) return payload[nestedKey].data;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
};

export const getPaymentsDataQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  period = "all",
  status = "all",
  paginated = false,
  includePayments = true,
  includeFormData = false,
  highlightPaymentId = "",
  fiscalYear,
  skipFiscalYear = false,
} = {}) => ({
  queryKey: ["payments-data", { page, perPage, search, period, status, filters: { period }, paginated, includePayments, includeFormData, highlightPaymentId, fiscalYear: skipFiscalYear ? undefined : fiscalYear, skipFiscalYear }],
  queryFn: async ({ signal }) => {
    const [paymentsRes, billsRes, dockingsRes, banyeraRes, ticketsRes] = await Promise.all([
      api.get("/payments", {
        params: {
          page,
          per_page: perPage,
          search,
          period,
          status,
          fiscal_year: skipFiscalYear ? undefined : fiscalYear,
          all: paginated ? undefined : 1,
          include_payments: includePayments ? 1 : 0,
          include_paymentable: includeFormData ? 1 : undefined,
          highlight_payment_id: highlightPaymentId || undefined,
        },
        signal,
      }),
      includeFormData ? api.get("/bills", { params: { all: 1, fiscal_year: skipFiscalYear ? undefined : fiscalYear }, signal }) : Promise.resolve({ data: [] }),
      includeFormData ? api.get("/dockings", { params: { all: 1, fiscal_year: skipFiscalYear ? undefined : fiscalYear }, signal }) : Promise.resolve({ data: [] }),
      includeFormData ? api.get("/banyera-transactions", { params: { all: 1, fiscal_year: skipFiscalYear ? undefined : fiscalYear }, signal }) : Promise.resolve({ data: [] }),
      includeFormData ? api.get("/vehicle-tickets", { params: { all: 1, fiscal_year: skipFiscalYear ? undefined : fiscalYear }, signal }) : Promise.resolve({ data: [] }),
    ]);

    const paymentsPayload = paymentsRes.data ?? {};
    const paymentsRaw = includePayments ? extractCollection(paymentsPayload, "payments") : [];
    const activeFiscalYear = skipFiscalYear ? undefined : fiscalYear;
    const payments = filterByFiscalYear(paymentsRaw, ["payment_date", "created_at"], activeFiscalYear);

    return {
      payments,
      paymentsMeta: buildFiscalMeta(paymentsPayload.meta ?? paymentsPayload.payments_meta, payments, {
        current_page: 1,
        last_page: 1,
        per_page: perPage,
      }),
      stats: paymentsPayload.stats ?? null,
      paymentableBills: paymentsPayload.paymentable_bills ?? [],
      bills: filterByFiscalYear(extractCollection(billsRes.data), ["billing_date", "date_billed", "created_at"], activeFiscalYear),
      dockings: filterByFiscalYear(extractCollection(dockingsRes.data), ["docking_date", "created_at"], activeFiscalYear),
      banyeraTransactions: filterByFiscalYear(extractCollection(banyeraRes.data), ["transaction_date", "created_at"], activeFiscalYear),
      tickets: filterByFiscalYear(extractCollection(ticketsRes.data, "tickets"), ["ticket_date", "issued_at", "created_at"], activeFiscalYear),
    };
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
});

const QUERY_OPTION_KEYS = new Set(["enabled", "staleTime", "gcTime", "refetchOnReconnect", "refetchOnWindowFocus", "placeholderData", "select", "retry"]);

const looksLikeQueryOptions = (value) =>
  value &&
  typeof value === "object" &&
  Object.keys(value).some((key) => QUERY_OPTION_KEYS.has(key)) &&
  !["page", "perPage", "search", "period", "status", "paginated", "includePayments", "includeFormData", "highlightPaymentId", "skipFiscalYear"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );

export const usePaymentsDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getPaymentsDataQueryOptions({ ...resolvedFilters, fiscalYear: resolvedFilters.skipFiscalYear ? undefined : fiscalYear }),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};

export const getPaymentFormLookupsQueryOptions = () => ({
  queryKey: ["payments-form-lookups"],
  queryFn: async ({ signal }) => {
    try {
      const response = await api.get("/payments", {
        params: {
          include_payments: 0,
          include_paymentable: 1,
          page: 1,
          per_page: 1,
        },
        signal,
      });

      return {
        paymentableBills: response.data?.paymentable_bills ?? [],
      };
    } catch (error) {
      console.error("Error fetching payment form lookups:", error);
      return {
        paymentableBills: [],
      };
    }
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const usePaymentFormLookupsQuery = (queryOptions = {}) =>
  useQuery({
    ...getPaymentFormLookupsQueryOptions(),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });
