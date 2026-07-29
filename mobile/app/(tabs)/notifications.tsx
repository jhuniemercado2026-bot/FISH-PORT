import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getAuthToken } from "../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../api/axios";
import { useToastStore } from "../../store/toastStore";

type NotificationItem = {
  notification_id: number | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string | null;
};

const normalizeNotificationsPayload = (payload: any): NotificationItem[] => {
  const rows = Array.isArray(payload?.notifications)
    ? payload.notifications
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

  return rows.map((row: any) => ({
    notification_id: row?.notification_id ?? row?.id ?? null,
    title: String(row?.title ?? "Notification"),
    message: String(row?.message ?? ""),
    is_read: Boolean(row?.is_read),
    created_at: row?.created_at ?? null,
  }));
};

const formatNotificationDate = (value?: string | null) => {
  if (!value) return "No date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatNotificationTime = (value?: string | null) => {
  if (!value) return "No time";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No time";

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
};

function NotificationCard({
  notification,
  onPress,
}: {
  notification: NotificationItem;
  onPress: () => void;
}) {
  const isUnread = !notification.is_read;

  return (
    <Pressable
      onPress={onPress}
      className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-white p-4"
      style={{
        shadowColor: "#000000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      }}
    >
      <View className="flex-row items-start">
        <View
          className="h-11 w-11 items-center justify-center rounded-[14px]"
          style={{
            backgroundColor: isUnread
              ? "rgba(245,158,11,0.12)"
              : "rgba(37,99,235,0.08)",
          }}
        >
          <Ionicons
            name={isUnread ? "notifications-outline" : "checkmark-circle-outline"}
            size={20}
            color={isUnread ? "#F59E0B" : "#2563EB"}
          />
        </View>

        <View className="ml-3 flex-1">
          <View className="flex-row items-start justify-between">
            <Text
              className="flex-1 pr-3 text-[14px] text-[#1A1F36]"
              numberOfLines={2}
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {notification.title || "Notification"}
            </Text>

            <View
              className={`rounded-full px-2 py-1 ${
                isUnread ? "bg-[#FEF3C7]" : "bg-[#DCFCE7]"
              }`}
            >
              <Text
                className={`text-[10px] ${
                  isUnread ? "text-[#F59E0B]" : "text-[#22C55E]"
                }`}
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                {isUnread ? "Unread" : "Read"}
              </Text>
            </View>
          </View>

          <Text
            className="mt-1 text-[12px] leading-5 text-[#6F6F82]"
            numberOfLines={3}
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            {notification.message || "No message provided."}
          </Text>

          <View className="mt-3 flex-row items-center">
            <Ionicons name="calendar-outline" size={13} color="#8A94A3" />
            <Text
              className="ml-1 text-[11px] text-[#8A94A3]"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {formatNotificationDate(notification.created_at)}
            </Text>
            <View className="mx-2 h-1 w-1 rounded-full bg-[#CBD5E1]" />
            <Ionicons name="time-outline" size={13} color="#8A94A3" />
            <Text
              className="ml-1 text-[11px] text-[#8A94A3]"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {formatNotificationTime(notification.created_at)}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const authToken = getAuthToken();
  const showToast = useToastStore((state) => state.showToast);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotifications = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      if (options.showLoading) {
        setIsLoading(true);
      }

      if (!authToken) {
        setNotifications([]);
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/notifications?all=1`, {
          headers: buildApiHeaders(authToken),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error("Unable to load notifications.");
        }

        setNotifications(normalizeNotificationsPayload(payload));
      } catch {
        setNotifications([]);
        showToast("error", "Unable to load notifications.");
      } finally {
        setIsLoading(false);
      }
    },
    [authToken, showToast]
  );

  useEffect(() => {
    let isMounted = true;

    loadNotifications({ showLoading: true }).finally(() => {
      if (!isMounted) {
        return;
      }
    });

    return () => {
      isMounted = false;
    };
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  const handleNotificationPress = async (notification: NotificationItem) => {
    if (notification.is_read || !notification.notification_id || !authToken) {
      return;
    }

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/notifications/${notification.notification_id}/read`,
        {
          method: "PATCH",
          headers: buildApiHeaders(authToken),
        }
      );

      if (!response.ok) {
        throw new Error("Unable to mark notification as read.");
      }

      setNotifications((current) =>
        current.map((item) =>
          item.notification_id === notification.notification_id
            ? { ...item, is_read: true }
            : item
        )
      );
    } catch {
      showToast("error", "Unable to update notification.");
    }
  };

  return (
    <View className="flex-1 bg-[#FFFDFB]">
      <StatusBar barStyle="light-content" backgroundColor="#1A1F36" />

      <SafeAreaView
        className="absolute left-0 right-0 top-0 z-50 bg-transparent"
        edges={["top"]}
      >
        <View
          className="h-[66px] flex-row items-center justify-between overflow-hidden rounded-b-[20px] bg-[#1A1F36] px-5"
          style={{
            shadowColor: "#000000",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 18,
          }}
        >
          <Text
            className="text-[18px] text-white"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            Notifications
          </Text>
          <Pressable hitSlop={10}>
            <Ionicons name="options-outline" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 28, paddingTop: 105 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5">
          {isLoading ? (
            <View
              className="items-center justify-center rounded-[10px] border border-[#E8E1E6] bg-white py-10"
              style={{ minHeight: 180 }}
            >
              <ActivityIndicator size="large" color="#1A1F36" />
              <Text
                className="mt-3 text-[13px] text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                Loading notifications
              </Text>
            </View>
          ) : notifications.length > 0 ? (
            notifications.map((notification, index) => (
              <NotificationCard
                key={`${notification.notification_id ?? "notification"}-${index}`}
                notification={notification}
                onPress={() => handleNotificationPress(notification)}
              />
            ))
          ) : (
            <View className="items-center justify-center rounded-[10px] border border-[#E8E1E6] bg-white px-6 py-10">
              <View
                className="h-12 w-12 items-center justify-center rounded-[16px]"
                style={{ backgroundColor: "rgba(37,99,235,0.08)" }}
              >
                <Ionicons name="notifications-off-outline" size={22} color="#2563EB" />
              </View>
              <Text
                className="mt-3 text-center text-[14px] text-[#1A1F36]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                No Notifications Yet
              </Text>
              <Text
                className="mt-1 text-center text-[12px] leading-5 text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                New updates and alerts will appear here.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
