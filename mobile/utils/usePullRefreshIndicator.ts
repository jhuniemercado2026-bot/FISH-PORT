import { useCallback, useEffect, useRef, useState } from "react";

const MAX_REFRESH_INDICATOR_MS = 3000;

export function usePullRefreshIndicator() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const indicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginRefresh = useCallback(() => {
    if (refreshInFlightRef.current) return false;

    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    indicatorTimeoutRef.current = setTimeout(() => {
      setIsRefreshing(false);
      indicatorTimeoutRef.current = null;
    }, MAX_REFRESH_INDICATOR_MS);

    return true;
  }, []);

  const finishRefresh = useCallback(() => {
    refreshInFlightRef.current = false;
    if (indicatorTimeoutRef.current) {
      clearTimeout(indicatorTimeoutRef.current);
      indicatorTimeoutRef.current = null;
    }
    setIsRefreshing(false);
  }, []);

  useEffect(
    () => () => {
      if (indicatorTimeoutRef.current) {
        clearTimeout(indicatorTimeoutRef.current);
      }
    },
    []
  );

  return { isRefreshing, beginRefresh, finishRefresh };
}
