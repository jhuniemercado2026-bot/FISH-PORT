import { Ionicons } from "@expo/vector-icons";
import { Modal as NativeModal, Pressable, ScrollView, Text, View } from "react-native";

export type NotificationModalItem = {
  notification_id: number | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string | null;
};

const formatNotificationDate = (value?: string | null) => {
  if (!value) return "No date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleDateString("en-US", {
    month: "long",
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

const formatNotificationMessage = (message?: string | null) =>
  String(message || "").replace(/\bPHP\s+/g, "₱");

export default function NotificationModal({
  notification,
  onClose,
}: {
  notification: NotificationModalItem | null;
  onClose: () => void;
}) {
  return (
    <NativeModal
      visible={Boolean(notification)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 items-center justify-center bg-black/30 px-5">
        <View className="w-full max-w-[420px] rounded-[10px] bg-white p-5 shadow-lg shadow-black/20">
          <View className="mb-4 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text
                className="text-[18px] text-[#1A1F36]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                {notification?.title || "Notification"}
              </Text>
            </View>

            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#1A1F36" />
            </Pressable>
          </View>

          <ScrollView className="max-h-[260px]" nestedScrollEnabled>
            <Text
              className="text-[13px] leading-6 text-[#4B5563]"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {notification?.message ? formatNotificationMessage(notification.message) : "No message provided."}
            </Text>
          </ScrollView>

          <View className="mt-5 rounded-[10px] bg-[#F8F8FA] p-3">
            <View className="flex-row items-center">
              <Ionicons name="calendar-outline" size={15} color="#8A94A3" />
              <Text
                className="ml-2 text-[12px] text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                {formatNotificationDate(notification?.created_at)}
              </Text>
            </View>
            <View className="mt-2 flex-row items-center">
              <Ionicons name="time-outline" size={15} color="#8A94A3" />
              <Text
                className="ml-2 text-[12px] text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                {formatNotificationTime(notification?.created_at)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </NativeModal>
  );
}
