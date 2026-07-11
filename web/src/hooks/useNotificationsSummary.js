import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../api/axios";
import { useFiscalYearStore } from "../store/fiscalYearStore";

export const getNotificationsSummaryOptions = ({ fiscalYear, staleTime = 30 * 1000 } = {}) => ({
  queryKey: ["notifications-summary", fiscalYear],
  queryFn: async ({ signal }) => {
    const res = await api.get("/notifications/summary", {
      params: { fiscal_year: fiscalYear },
      signal,
    });
    return res.data ?? { unread_count: 0, latest: null };
  },
  staleTime,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
});

export const useNotificationsSummary = (options = {}) => {
  const qc = useQueryClient();
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  return useQuery({
    ...getNotificationsSummaryOptions({ fiscalYear }),
    ...options,
    onSuccess: (data) => {
      // keep an abbreviated cache for other notification UI
      qc.setQueryData(["notifications-unread-count"], data.unread_count ?? 0);
      if (options.onSuccess) options.onSuccess(data);
    },
  });
};

export default useNotificationsSummary;
