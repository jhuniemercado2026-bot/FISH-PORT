import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

const UNIVERSAL_SEARCH_MIN_LENGTH = 1;

export const useUniversalSearchQuery = ({ search = "", limit = 30 } = {}, queryOptions = {}) =>
  useQuery({
    queryKey: ["universal-search", { search, limit }],
    queryFn: async ({ signal }) => {
      const response = await api.get("/universal-search", {
        params: { q: search, limit },
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
