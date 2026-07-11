import { useEffect } from "react";
import { Toast } from "@ant-design/react-native";
import { useToastStore } from "../store/toastStore";

export function AppToast() {
  const toast = useToastStore((state) => state.toast);
  const clearToast = useToastStore((state) => state.clearToast);

  useEffect(() => {
    if (!toast) {
      return;
    }

    switch (toast.type) {
      case "success":
        Toast.success(toast.message, 1.8);
        break;
      case "error":
        Toast.fail(toast.message, 1.8);
        break;
      case "loading":
        Toast.loading(toast.message, 1.8);
        break;
      default:
        Toast.info(toast.message, 1.8);
    }

    clearToast();
  }, [clearToast, toast?.id]);

  return null;
}
