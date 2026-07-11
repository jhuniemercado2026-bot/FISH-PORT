import { QueryClient } from "@tanstack/react-query";

// Shared React Query client for all server-state hooks.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
