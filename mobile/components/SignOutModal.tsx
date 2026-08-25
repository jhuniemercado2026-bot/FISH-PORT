import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal as NativeModal,
  Pressable,
  SafeAreaView,
  Text,
  View,
} from "react-native";
import { buildApiHeaders, getApiBaseUrl } from "../api/axios";
import { getAuthToken, setAuthSession } from "../api/auth";
import { clearOfflineResources } from "../utils/offlineMasterData";

type SignOutModalProps = {
  visible: boolean;
  onClose: () => void;
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export default function SignOutModal({ visible, onClose }: SignOutModalProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleConfirmSignOut = async () => {
    setIsSigningOut(true);

    const token = getAuthToken();

    void clearOfflineResources();

    if (token) {
      void fetch(`${getApiBaseUrl()}/logout`, {
        method: "POST",
        headers: buildApiHeaders(token),
      }).catch(() => null);
    }

    await wait(450);

    setAuthSession(null);
    setIsSigningOut(false);
    onClose();
    router.replace("/(login)/login");
  };

  return (
    <NativeModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView className="flex-1 bg-black/30">
        <Pressable
          className="flex-1 items-center justify-center px-4"
          onPress={onClose}
        >
          <Pressable
            className="w-full max-w-[280px] overflow-hidden rounded-[10px] border border-[#E8E1E6] bg-white p-5"
            onPress={(event) => event.stopPropagation()}
            style={{
              boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.06)",
              elevation: 3,
            }}
          >
            <Text
              className="text-center text-[18px] text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              Sign Out
            </Text>
            <Text
              className="mt-2 text-center text-[14px] text-[#6F6F82]"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              Are you sure you want to sign out of your account?
            </Text>

            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={onClose}
                className="flex-1 rounded-[10px] border border-[#E8E1E6] bg-[#F5F5F5] py-3"
              >
                <Text
                  className="text-center text-[14px] text-[#6F6F82]"
                  style={{ fontFamily: "Montserrat_600SemiBold" }}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmSignOut}
                disabled={isSigningOut}
                className="flex-1 rounded-[10px] bg-[#1A1F36] py-3"
              >
                {isSigningOut ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text
                    className="text-center text-[14px] text-white"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    Sign Out
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </SafeAreaView>
    </NativeModal>
  );
}
