import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useProfileStore } from "../../../store/profileStore";
import SignOutModal from "../../../components/SignOutModal";
import { Pressable, StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const profileActions = [
  {
    key: "edit-profile",
    label: "Edit Personal Info",
    icon: "create-outline" as const,
    tint: "bg-[#EEF4FF]",
    iconColor: "#2563EB",
    textColor: "#1A1F36",
  },
  {
    key: "change-password",
    label: "Change Password",
    icon: "lock-closed-outline" as const,
    tint: "bg-[#EEF4FF]",
    iconColor: "#2563EB",
    textColor: "#1A1F36",
  },
  {
    key: "sign-out",
    label: "Sign Out",
    icon: "log-out-outline" as const,
    tint: "bg-[#EEF4FF]",
    iconColor: "#2563EB",
    textColor: "#1A1F36",
  },
];

export default function ProfileScreen() {
  const router = useRouter();
  const [signOutModalVisible, setSignOutModalVisible] = useState(false);
  const profile = useProfileStore((state) => state);

  const fullName = typeof profile.full_name === "string" ? profile.full_name.trim() : "";
  const firstName = typeof profile.first_name === "string" ? profile.first_name.trim() : "";
  const lastName = typeof profile.last_name === "string" ? profile.last_name.trim() : "";

  const hasDisplayName = Boolean(fullName || [firstName, lastName].filter(Boolean).join(" "));

  const displayName = hasDisplayName ? fullName || [firstName, lastName].filter(Boolean).join(" ") : "-";

  const profileInitials = (() => {
    const source = displayName.trim();
    if (!source || source === "-" || source === "N/A") return "";

    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  })();

  const displayEmail =
    typeof profile.email === "string" && profile.email.trim()
      ? profile.email.trim()
      : "N/A";

  return (
    <View className="flex-1 bg-[#1A1F36]">
      <StatusBar barStyle="light-content" backgroundColor="#1A1F36" />

      <SafeAreaView className="flex-1 bg-[#1A1F36]" edges={["top"]}>
        <View className="h-[28%] bg-[#1A1F36] px-5 pt-3">
          <View className="flex-row items-center justify-between">
            <Text
              className="text-[20px] text-white"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              Profile
            </Text>
            <Pressable
              className="h-11 w-11 items-center justify-center"
              hitSlop={10}
              onPress={() => router.push("/(tabs)/profile/[id]?id=1")}
            >
              <Ionicons name="create-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <View
          className="-mt-20 items-center"
          style={{ zIndex: 20, elevation: 20 }}
        >
          <View className="items-center">
            <View className="h-[155px] w-[155px] items-center justify-center overflow-hidden rounded-full border-8 border-white bg-[#1A1F36]">
              {profileInitials ? (
                <Text
                  className="text-[54px] text-white"
                  style={{ fontFamily: "Montserrat_600SemiBold" }}
                >
                  {profileInitials}
                </Text>
              ) : (
                <Ionicons name="person-outline" size={70} color="#FFFFFF" />
              )}
            </View>
          </View>
        </View>

        <View className="-mt-24 flex-1 rounded-t-[20px] bg-[#FFFDFB] px-5 pt-8">
          <View className="items-center">
            <Text
              className="mt-20 text-center text-[24px] text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {displayName}
            </Text>
            <Text
              className="mt-0.5 mb-9 text-center text-[14px] text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {displayEmail}
            </Text>
          </View>

          {profileActions.map((action) => (
            <View
              key={action.key}
              className="mb-4 rounded-[18px] border border-[#ECE8EC] bg-white px-5"
              style={{
                boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.06)",
                elevation: 3,
              }}
            >
              <Pressable
                className="flex-row items-center justify-between py-5"
                onPress={() => {
                  if (action.key === "edit-profile") {
                    router.push("/(tabs)/profile/[id]?id=1");
                  }

                  if (action.key === "change-password") {
                    router.push("/(tabs)/profile/[id]?id=1&mode=change-password");
                  }

                  if (action.key === "sign-out") {
                    setSignOutModalVisible(true);
                  }
                }}
              >
                <View className="flex-row items-center">
                  <View
                    className={`h-11 w-11 items-center justify-center rounded-full ${action.tint}`}
                  >
                    <Ionicons
                      name={action.icon}
                      size={20}
                      color={action.iconColor}
                    />
                  </View>

                  <Text
                    className="ml-4 text-[15px]"
                    style={{
                      fontFamily: "Montserrat_400Regular",
                      color: action.textColor,
                    }}
                  >
                    {action.label}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </Pressable>
            </View>
          ))}
        </View>
      </SafeAreaView>

      <SignOutModal
        visible={signOutModalVisible}
        onClose={() => setSignOutModalVisible(false)}
      />
    </View>
  );
}
