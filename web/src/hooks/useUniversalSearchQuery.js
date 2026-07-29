import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { useFiscalYearStore } from "../store/fiscalYearStore";

const UNIVERSAL_SEARCH_MIN_LENGTH = 1;

export const useUniversalSearchQuery = ({ search = "", limit = 30, fiscalYear } = {}, queryOptions = {}) => {
  const storedFiscalYear = useFiscalYearStore((state) => state.fiscalYear);
  const resolvedFiscalYear = fiscalYear ?? storedFiscalYear;

  return useQuery({
    queryKey: ["universal-search", { search, limit, fiscalYear: resolvedFiscalYear }],
    queryFn: async ({ signal }) => {
      const response = await api.get("/universal-search", {
        params: { q: search, limit, fiscal_year: resolvedFiscalYear || undefined },
        signal,
      });

      return {
        results: response.data?.results ?? [],
      };
    },
    enabled: search.trim().length >= UNIVERSAL_SEARCH_MIN_LENGTH,
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    ...queryOptions,
  });
};
