import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getEcho, REALTIME_AUTH_CHANGED_EVENT } from "../lib/realtime";
import { getStoredUser } from "../pages/login/auth";

const getStoredUserId = () => {
  try {
    const user = getStoredUser();
    return user?.user_id ?? user?.id ?? null;
  } catch {
    return null;
  }
};

const normalizeNotification = (row) => ({
  ...row,
  notification_id: row?.notification_id ?? null,
  recipient_user_id: row?.recipient_user_id ?? null,
  sender_user_id: row?.sender_user_id ?? null,
  related_type: row?.related_type ?? "",
  related_id: row?.related_id ?? null,
  title: row?.title ?? "",
  message: row?.message ?? "",
  is_read: Boolean(row?.is_read),
  read_at: row?.read_at ?? null,
  created_at: row?.created_at ?? null,
});

const upsertNotificationInCache = (queryClient, notification) => {
  const nextNotification = normalizeNotification(notification);
  const notificationId = String(nextNotification.notification_id ?? "");
  if (!notificationId) return;

  queryClient.setQueriesData({ queryKey: ["notifications-data"] }, (previous) => {
    if (!previous) return previous;

    const currentNotifications = Array.isArray(previous.notifications)
      ? previous.notifications
      : [];
    const existing = currentNotifications.find((row) =>
      String(row?.notification_id ?? "") === notificationId
    );
    const nextNotifications = existing
      ? currentNotifications.map((row) =>
          String(row?.notification_id ?? "") === notificationId ? nextNotification : row
        )
      : [nextNotification, ...currentNotifications];

    const readCount = nextNotifications.filter((row) => row.is_read).length;
    const unreadCount = nextNotifications.filter((row) => !row.is_read).length;

    return {
      ...previous,
      notifications: nextNotifications,
      totalCount: existing ? previous.totalCount : Number(previous.totalCount ?? currentNotifications.length) + 1,
      readCount,
      unreadCount,
      notificationsMeta: previous.notificationsMeta
        ? {
            ...previous.notificationsMeta,
            total: existing
              ? previous.notificationsMeta.total
              : Number(previous.notificationsMeta.total ?? currentNotifications.length) + 1,
            from: nextNotifications.length ? 1 : 0,
            to: nextNotifications.length,
          }
        : previous.notificationsMeta,
    };
  });
};

export default function NotificationsRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cleanupSubscription = null;

    const subscribe = () => {
      cleanupSubscription?.();
      cleanupSubscription = null;

      const userId = getStoredUserId();
      const echo = getEcho();
      if (!userId || !echo) return;

      const channelName = `notifications.${userId}`;
      const channel = echo.channel(channelName);

      channel.listen(".updated", (payload) => {
        const notification = payload?.notification;
        if (notification) {
          upsertNotificationInCache(queryClient, notification);
        }

        queryClient.invalidateQueries({ queryKey: ["notifications-data"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["notifications-summary"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"], refetchType: "active" });
      });

      cleanupSubscription = () => {
        channel.stopListening(".updated");
        echo.leave(channelName);
      };
    };

    subscribe();

    const handleStorage = (event) => {
      if (event.key === "token" || event.key === "user") subscribe();
    };

    window.addEventListener(REALTIME_AUTH_CHANGED_EVENT, subscribe);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", subscribe);

    return () => {
      window.removeEventListener(REALTIME_AUTH_CHANGED_EVENT, subscribe);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", subscribe);
      cleanupSubscription?.();
    };
  }, [queryClient]);

  return null;
}
