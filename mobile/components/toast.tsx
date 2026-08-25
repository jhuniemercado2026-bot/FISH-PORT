import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Toast as AntToast } from "@ant-design/react-native";
import { Text, View } from "react-native";
import { useToastStore } from "../store/toastStore";

const TOAST_THEME = {
  success: {
    icon: "checkmark-circle" as const,
    iconColor: "#FFFFFF",
    backgroundColor: "#0F766E",
    borderColor: "#115E59",
    textColor: "#FFFFFF",
  },
  error: {
    icon: "close-circle" as const,
    iconColor: "#FFFFFF",
    backgroundColor: "#B91C1C",
    borderColor: "#991B1B",
    textColor: "#FFFFFF",
  },
  info: {
    icon: "information-circle" as const,
    iconColor: "#FFFFFF",
    backgroundColor: "#2563EB",
    borderColor: "#1D4ED8",
    textColor: "#FFFFFF",
  },
  loading: {
    icon: "sync" as const,
    iconColor: "#FFFFFF",
    backgroundColor: "#1A1F36",
    borderColor: "#111827",
    textColor: "#FFFFFF",
  },
};

export function GlobalToast() {
  const toast = useToastStore((state) => state.toast);
  const clearToast = useToastStore((state) => state.clearToast);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const theme = TOAST_THEME[toast.type];

    AntToast.show({
      duration: toast.type === "loading" ? 0 : 2,
      mask: false,
      position: "center",
      type: "info",
      icon: null,
      styles: {
        container: {
          backgroundColor: "transparent",
          padding: 0,
        },
        innerContainer: {
          backgroundColor: "transparent",
          padding: 0,
        },
        innerWrap: {
          width: 330,
          minWidth: 330,
          maxWidth: 330,
          borderRadius: 16,
          backgroundColor: theme.backgroundColor,
          borderWidth: 1,
          borderColor: theme.borderColor,
          paddingHorizontal: 0,
          paddingVertical: 0,
          overflow: "hidden",
          boxShadow: "0px 10px 16px rgba(0, 0, 0, 0.08)",
        },
        textToast: {
          width: 330,
          minWidth: 330,
          maxWidth: 330,
          borderRadius: 16,
          backgroundColor: theme.backgroundColor,
          borderWidth: 1,
          borderColor: theme.borderColor,
          paddingVertical: 0,
          paddingHorizontal: 0,
          overflow: "hidden",
        },
        centering: {
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        },
      },
      content: (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            width: 330,
            paddingHorizontal: 18,
            paddingVertical: 20,
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.16)",
              marginRight: 14,
            }}
          >
            <Ionicons name={theme.icon} size={24} color="#FFFFFF" />
          </View>
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 14,
              lineHeight: 20,
              fontFamily: "Montserrat_600SemiBold",
              flex: 1,
            }}
            numberOfLines={4}
          >
            {toast.message}
          </Text>
        </View>
      ),
    });

    clearToast();
  }, [clearToast, toast?.id]);

  return null;
}
