import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  Modal as NativeModal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getAuthToken } from "../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../api/axios";
import NotificationModal from "../../components/NotificationModal";
import { useNotificationStore } from "../../store/notificationStore";
import { useToastStore } from "../../store/toastStore";
import {
  getOfflineResourceArray,
  saveOfflineResource,
} from "../../utils/offlineMasterData";

type NotificationItem = {
  notification_id: number | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string | null;
};

type NotificationStatusFilter = "all" | "unread" | "read";

const formatNotificationMessage = (message?: string | null) =>
  String(message || "").replace(/\bPHP\s+/g, "₱");

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

function isOfflineNetworkState(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
} | null) {
  return Boolean(
    state &&
      (state.isConnected === false || state.isInternetReachable === false)
  );
}

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
        boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.06)",
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
            {notification.message ? formatNotificationMessage(notification.message) : "No message provided."}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function NotificationSkeletonCard() {
  return (
    <View className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-white p-4">
      <View className="flex-row items-start">
        <View className="h-11 w-11 rounded-[14px] bg-[#E8EDF5]" />

        <View className="ml-3 flex-1">
          <View className="flex-row items-start justify-between">
            <View className="h-4 w-[58%] rounded-full bg-[#E8EDF5]" />
            <View className="h-6 w-14 rounded-full bg-[#F1F5F9]" />
          </View>

          <View className="mt-3 h-3 w-full rounded-full bg-[#EEF2F7]" />
          <View className="mt-2 h-3 w-[82%] rounded-full bg-[#EEF2F7]" />
        </View>
      </View>
    </View>
  );
}

const notificationFilterOptions: { value: NotificationStatusFilter; label: string }[] = [
  { value: "all", label: "All notifications" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

function NotificationFilterModal({
  visible,
  selectedValue,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selectedValue: NotificationStatusFilter;
  onClose: () => void;
  onSelect: (value: NotificationStatusFilter) => void;
}) {
  return (
    <NativeModal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView className="flex-1 bg-black/30">
        <Pressable className="flex-1 items-center justify-center px-4" onPress={onClose}>
          <Pressable className="w-full max-w-[280px] overflow-hidden rounded-[14px] border border-[#E8E1E6] bg-white shadow-sm shadow-black/10">
            <View className="border-b border-[#F2ECEF] px-4 py-3">
              <Text className="text-[14px] font-semibold text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                Filter
              </Text>
            </View>

            {notificationFilterOptions.map((option) => {
              const isSelected = selectedValue === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  className={`flex-row items-center justify-between px-4 py-3 ${isSelected ? "bg-[#EFF6FF]" : "bg-white"}`}
                >
                  <Text className={`text-[14px] ${isSelected ? "text-[#1D4ED8]" : "text-[#1A1F36]"}`} style={{ fontFamily: "Montserrat_400Regular" }}>
                    {option.label}
                  </Text>
                  {isSelected ? <Ionicons name="checkmark" size={18} color="#1D4ED8" /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </SafeAreaView>
    </NativeModal>
  );
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export default function NotificationsScreen() {
  const authToken = getAuthToken();
  const showToast = useToastStore((state) => state.showToast);
  const setUnreadCount = useNotificationStore((state) => state.setUnreadCount);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedNotifications, setHasLoadedNotifications] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<NotificationStatusFilter>("all");
  const [selectedNotification, setSelectedNotification] =
    useState<NotificationItem | null>(null);

  const loadNotifications = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      const cachedNotifications =
        await getOfflineResourceArray<NotificationItem>("notifications");
      const hasCachedNotifications = cachedNotifications.length > 0;

      if (hasCachedNotifications) {
        setNotifications(cachedNotifications);
      }

      if (options.showLoading) {
        setIsLoading(!hasCachedNotifications);
        if (!hasCachedNotifications) {
          await wait(800);
        }
        setIsLoading(false);
      }

      const networkState = await NetInfo.fetch().catch(() => null);
      if (isOfflineNetworkState(networkState)) {
        setNotifications(cachedNotifications);
        setHasLoadedNotifications(true);
        setIsLoading(false);
        return;
      }

      if (!authToken) {
        setNotifications(cachedNotifications);
        setHasLoadedNotifications(true);
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

        const nextNotifications = normalizeNotificationsPayload(payload);
        setNotifications(nextNotifications);
        await saveOfflineResource("notifications", nextNotifications);
      } catch {
        setNotifications(cachedNotifications);
        if (cachedNotifications.length === 0) {
          showToast("error", "Unable to load notifications.");
        }
      } finally {
        setHasLoadedNotifications(true);
        setIsLoading(false);
      }
    },
    [authToken, setUnreadCount, showToast]
  );

  useEffect(() => {
    setUnreadCount(notifications.filter((item) => !item.is_read).length);
  }, [notifications, setUnreadCount]);

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
      loadNotifications({ showLoading: true });
    }, [loadNotifications])
  );

  const handleNotificationPress = async (notification: NotificationItem) => {
    setSelectedNotification(notification);

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
      setSelectedNotification((current) =>
        current?.notification_id === notification.notification_id
          ? { ...current, is_read: true }
          : current
      );
    } catch {
      showToast("error", "Unable to update notification.");
    }
  };

  const shouldShowSkeleton = (isLoading || !hasLoadedNotifications) && notifications.length === 0;
  const displayedNotifications = notifications.filter((notification) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "unread") return !notification.is_read;
    return notification.is_read;
  });
  const emptyMessage =
    statusFilter === "unread"
      ? "No unread notifications."
      : statusFilter === "read"
        ? "No read notifications."
        : "No notifications yet";

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
            boxShadow: "0px 6px 12px rgba(0, 0, 0, 0.18)",
            elevation: 18,
          }}
        >
          <Text
            className="text-[18px] text-white"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            Notifications
          </Text>
          <Pressable hitSlop={10} onPress={() => setFilterModalVisible(true)}>
            <Ionicons name="options-outline" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </SafeAreaView>

      <NotificationFilterModal
        visible={filterModalVisible}
        selectedValue={statusFilter}
        onClose={() => setFilterModalVisible(false)}
        onSelect={(value) => setStatusFilter(value)}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 28, paddingTop: 105 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5">
          {shouldShowSkeleton ? (
            <>
              {Array.from({ length: 5 }).map((_, index) => (
                <NotificationSkeletonCard key={`notification-skeleton-${index}`} />
              ))}
            </>
          ) : displayedNotifications.length > 0 ? (
            displayedNotifications.map((notification, index) => (
              <NotificationCard
                key={`${notification.notification_id ?? "notification"}-${index}`}
                notification={notification}
                onPress={() => handleNotificationPress(notification)}
              />
            ))
          ) : (
            <View className="items-center justify-center px-6" style={{ minHeight: 520 }}>
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
                {emptyMessage}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <NotificationModal
        notification={selectedNotification}
        onClose={() => setSelectedNotification(null)}
      />
    </View>
  );
}
