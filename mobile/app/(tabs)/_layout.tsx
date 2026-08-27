import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { AppState, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotificationStore } from "../../store/notificationStore";
import { startNotificationsRealtime } from "../../utils/realtimeNotifications";

function NotificationTabIcon({
  color,
  focused,
  hasUnread,
  size,
}: {
  color: string;
  focused: boolean;
  hasUnread: boolean;
  size: number;
}) {
  return (
    <View className="relative">
      <Ionicons
        name={focused ? "notifications" : "notifications-outline"}
        size={size}
        color={color}
      />
      {hasUnread ? (
        <View className="absolute -right-1 top-0 h-2 w-2 rounded-full border border-white bg-[#F97316]" />
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const refreshUnreadCount = useNotificationStore((state) => state.refreshUnreadCount);
  const hasUnreadNotifications = unreadCount > 0;

  useEffect(() => {
    refreshUnreadCount();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshUnreadCount();
      }
    });

    return () => appStateSubscription.remove();
  }, [refreshUnreadCount]);

  useEffect(() => {
    return startNotificationsRealtime({
      onUpdate: refreshUnreadCount,
    });
  }, [refreshUnreadCount]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1A1F36",
        tabBarInactiveTintColor: "#98A1AE",
        tabBarStyle: {
          height: 62 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: {
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "time" : "time-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="add-transaction"
        options={{
          title: "",
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View className="-mt-1.5 h-20 w-20 items-center justify-center rounded-full bg-[#1A1F36]">
              <Ionicons name="add" size={35} color="#FFFFFF" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color, size, focused }) => (
            <NotificationTabIcon
              color={color}
              focused={focused}
              hasUnread={hasUnreadNotifications}
              size={size}
            />
          ),
        }}
      />
       <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
