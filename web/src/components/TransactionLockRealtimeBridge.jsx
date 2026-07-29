import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getEcho } from "../lib/realtime";

const TRANSACTION_LOCK_QUERY_KEY = ["transaction-lock"];

export default function TransactionLockRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const echo = getEcho();
    if (!echo) return undefined;

    const channel = echo.channel("transaction-lock");

    channel.listen(".updated", (payload) => {
      queryClient.setQueryData(TRANSACTION_LOCK_QUERY_KEY, {
        transaction_lock: payload?.transaction_lock ?? null,
      });
      queryClient.invalidateQueries({ queryKey: TRANSACTION_LOCK_QUERY_KEY });
    });

    return () => {
      echo.leave("transaction-lock");
    };
  }, [queryClient]);

  return null;
}
