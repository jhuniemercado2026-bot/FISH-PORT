import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { buildFiscalMeta, filterByFiscalYear } from "../lib/fiscalYear";
import { useFiscalYearStore } from "../store/fiscalYearStore";

const extractCollection = (payload, nestedKey = "") => {
  if (Array.isArray(payload)) return payload;
  if (nestedKey && Array.isArray(payload?.[nestedKey])) return payload[nestedKey];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

export const getBillingDataQueryOptions = ({
  page = 1,
  perPage = 10,
  search = "",
  status = "all",
  period = "all",
  boat = "all",
  sort = "created_at_desc",
  highlightBillId = "",
  paginated = false,
  includeBoats = true,
  includeFormData = false,
  includePayments = false,
  compact = false,
  fiscalYear,
  skipFiscalYear = false,
} = {}) => ({
  queryKey: [
    "billing-data",
    {
      page,
      perPage,
      search,
      status,
      filters: { period, boat },
      sort,
      highlightBillId,
      paginated,
      includeBoats,
      includeFormData,
      includePayments,
      compact,
      fiscalYear: skipFiscalYear ? undefined : fiscalYear,
      skipFiscalYear,
    },
  ],
  queryFn: async ({ signal }) => {
    try {
      const [billsRes, boatsRes, dockingsRes, banyeraRes, paymentsRes] = await Promise.all([
        api.get("/bills", {
          params: {
            page,
            per_page: perPage,
            search,
            status,
            period,
            boat,
            sort,
            fiscal_year: skipFiscalYear ? undefined : fiscalYear,
            highlight_bill_id: highlightBillId,
            all: paginated ? undefined : 1,
            compact: compact ? 1 : undefined,
          },
          signal,
        }).catch(err => {
          console.error("Error fetching bills:", err);
          return { data: { data: [], meta: { current_page: 1, last_page: 1, per_page: perPage, total: 0, from: 0, to: 0 }, stats: { total_records: 0, total_payment_records: 0, today_records: 0, today_payments: 0 } } };
        }),
        includeBoats ? api.get("/boats", { params: { all: 1 }, signal }).catch(err => {
          console.error("Error fetching boats:", err);
          return { data: [] };
        }) : Promise.resolve({ data: [] }),
        includeFormData ? api.get("/dockings", { params: { all: 1, fiscal_year: skipFiscalYear ? undefined : fiscalYear }, signal }).catch(err => {
          console.error("Error fetching dockings:", err);
          return { data: [] };
        }) : Promise.resolve({ data: [] }),
        includeFormData ? api.get("/banyera-transactions", { params: { all: 1, fiscal_year: skipFiscalYear ? undefined : fiscalYear }, signal }).catch(err => {
          console.error("Error fetching banyera transactions:", err);
          return { data: [] };
        }) : Promise.resolve({ data: [] }),
        includePayments ? api.get("/payments", { params: { all: 1, fiscal_year: skipFiscalYear ? undefined : fiscalYear }, signal }).catch(err => {
          console.error("Error fetching payments:", err);
          return { data: { payments: [] } };
        }) : Promise.resolve({ data: { payments: [] } }),
      ]);

      const billsPayload = billsRes.data ?? {};
      const billsRaw = Array.isArray(billsPayload) ? billsPayload : billsPayload.data ?? [];
      const activeFiscalYear = skipFiscalYear ? undefined : fiscalYear;
      const bills = filterByFiscalYear(billsRaw, ["billing_date", "date_billed", "created_at"], activeFiscalYear);
      const dockings = filterByFiscalYear(extractCollection(dockingsRes?.data), ["docking_date", "created_at"], activeFiscalYear);
      const banyeraTransactions = filterByFiscalYear(extractCollection(banyeraRes?.data), ["transaction_date", "created_at"], activeFiscalYear);
      const payments = filterByFiscalYear(extractCollection(paymentsRes?.data, "payments"), ["payment_date", "created_at"], activeFiscalYear);

      return {
        bills,
        billsMeta: buildFiscalMeta(
          Array.isArray(billsPayload) ? null : billsPayload.meta,
          bills,
          {
              current_page: 1,
              last_page: 1,
              per_page: perPage,
          }
        ),
        stats: billsPayload.stats ?? {
          total_records: Array.isArray(billsPayload) ? bills.length : billsPayload.meta?.total ?? bills.length,
          total_payment_records: payments.length,
          today_records: 0,
          today_payments: 0,
        },
        boats: extractCollection(boatsRes?.data),
        dockings,
        banyeraTransactions,
        payments,
      };
    } catch (error) {
      console.error("Error fetching billing data:", error);
      // Return empty data structure on error to prevent white screen
      return {
        bills: [],
        billsMeta: {
          current_page: 1,
          last_page: 1,
          per_page: perPage,
          total: 0,
          from: 0,
          to: 0,
        },
        stats: {
          total_records: 0,
          total_payment_records: 0,
          today_records: 0,
          today_payments: 0,
        },
        boats: [],
        dockings: [],
        banyeraTransactions: [],
        payments: [],
      };
    }
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

const QUERY_OPTION_KEYS = new Set(["enabled", "staleTime", "refetchOnReconnect", "refetchOnWindowFocus", "placeholderData", "select", "retry"]);

const looksLikeQueryOptions = (value) =>
  value &&
  typeof value === "object" &&
  Object.keys(value).some((key) => QUERY_OPTION_KEYS.has(key)) &&
  !["page", "perPage", "search", "status", "period", "boat", "sort", "highlightBillId", "paginated", "includeBoats", "includeFormData", "includePayments", "compact", "skipFiscalYear"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );

export const useBillingDataQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getBillingDataQueryOptions({ ...resolvedFilters, fiscalYear: resolvedFilters.skipFiscalYear ? undefined : fiscalYear }),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};

export const getBillingBoatsQueryOptions = () => ({
  queryKey: ["billing-boats"],
  queryFn: async ({ signal }) => {
    try {
      const response = await api.get("/boats", { params: { all: 1 }, signal });
      return extractCollection(response.data);
    } catch (error) {
      console.error("Error fetching boats:", error);
      return [];
    }
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useBillingBoatsQuery = (queryOptions = {}) =>
  useQuery({
    ...getBillingBoatsQueryOptions(),
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });

export const getBillingFormLookupsQueryOptions = ({
  boatId = "",
  fiscalYear,
  skipFiscalYear = false,
} = {}) => ({
  queryKey: [
    "billing-form-lookups",
    {
      boatId,
      fiscalYear: skipFiscalYear ? undefined : fiscalYear,
      skipFiscalYear,
    },
  ],
  queryFn: async ({ signal }) => {
    try {
      const params = {
        all: 1,
        compact: 1,
        boat_id: boatId || undefined,
        fiscal_year: skipFiscalYear ? undefined : fiscalYear,
        status: "active",
      };
      const [dockingsRes, banyeraRes] = await Promise.all([
        api.get("/dockings", { params, signal }).catch(err => {
          console.error("Error fetching dockings:", err);
          return { data: [] };
        }),
        api.get("/banyera-transactions", { params, signal }).catch(err => {
          console.error("Error fetching banyera transactions:", err);
          return { data: [] };
        }),
      ]);
      const activeFiscalYear = skipFiscalYear ? undefined : fiscalYear;

      return {
        dockings: filterByFiscalYear(
          extractCollection(dockingsRes.data),
          ["docking_date", "created_at"],
          activeFiscalYear,
        ),
        banyeraTransactions: filterByFiscalYear(
          extractCollection(banyeraRes.data),
          ["transaction_date", "created_at"],
          activeFiscalYear,
        ),
      };
    } catch (error) {
      console.error("Error in billing form lookups:", error);
      return {
        dockings: [],
        banyeraTransactions: [],
      };
    }
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useBillingFormLookupsQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getBillingFormLookupsQueryOptions({
      ...resolvedFilters,
      fiscalYear: resolvedFilters.skipFiscalYear ? undefined : fiscalYear,
    }),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};

export const getBillingPaymentsQueryOptions = ({
  billId = "",
  page = 1,
  perPage = 10,
  search = "",
  status = "all",
  period = "all",
  paginated = false,
  highlightPaymentId = "",
} = {}) => ({
  queryKey: ["billing-payments", { billId, page, perPage, search, status, period, paginated, highlightPaymentId }],
  queryFn: async ({ signal }) => {
    if (!billId) return [];

    try {
      const response = await api.get("/payments", {
        params: {
          bill_id: billId || undefined,
          page,
          per_page: perPage,
          search: search || undefined,
          status: status !== "all" ? status : undefined,
          period: period !== "all" ? period : undefined,
          all: paginated ? undefined : 1,
          highlight_payment_id: highlightPaymentId || undefined,
        },
        signal,
      });

      return extractCollection(response.data, "payments");
    } catch (error) {
      console.error("Error fetching payments:", error);
      return [];
    }
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const useBillingPaymentsQuery = (filters = {}, queryOptions = {}) => {
  const resolvedFilters = looksLikeQueryOptions(filters) ? {} : filters;
  const resolvedQueryOptions = looksLikeQueryOptions(filters) ? filters : queryOptions;

  return useQuery({
    ...getBillingPaymentsQueryOptions(resolvedFilters),
    placeholderData: (previousData) => previousData,
    ...resolvedQueryOptions,
  });
};
