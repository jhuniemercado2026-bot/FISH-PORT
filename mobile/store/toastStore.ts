import { create } from "zustand";

type ToastType = "success" | "error" | "info" | "loading";

type ToastPayload = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastStore = {
  toast: ToastPayload | null;
  showToast: (type: ToastType, message: string) => void;
  clearToast: () => void;
};

const normalizeToastMessage = (message: string) => {
  if (message === "Loaded saved boats for offline use.") {
    return "Transaction is offline now. You can add data as draft.";
  }

  return message;
};

export const useToastStore = create<ToastStore>((set) => ({
  toast: null,
  showToast: (type, message) =>
    set({
      toast: {
        id: Date.now(),
        type,
        message: normalizeToastMessage(message),
      },
    }),
  clearToast: () => set({ toast: null }),
}));
