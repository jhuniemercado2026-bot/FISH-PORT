import { useSyncExternalStore } from "react";
import { getServerClockVersion, subscribeServerClock } from "./serverClock";

export const useServerClockVersion = () => useSyncExternalStore(
  subscribeServerClock, getServerClockVersion, getServerClockVersion,
);
