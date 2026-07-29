import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getEcho } from "../lib/realtime";

const getStoredUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user?.user_id ?? user?.id ?? null;
  } catch {
    return null;
  }
};

export default function NotificationsRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const userId = getStoredUserId();
    const echo = getEcho();
    if (!userId || !echo) return undefined;

    const channelName = `notifications.${userId}`;
    const channel = echo.channel(channelName);

    channel.listen(".updated", () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-data"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-summary"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    });

    return () => {
      echo.leave(channelName);
    };
  }, [queryClient]);

  return null;
}
