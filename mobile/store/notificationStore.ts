import { create } from "zustand";
import { buildApiHeaders, getApiBaseUrl } from "../api/axios";
import { getAuthToken } from "../api/auth";

type NotificationStore = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  setUnreadCount: (count: number) => void;
};

const normalizeCount = (value: unknown) => {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
};

export const useNotificationStore = create<NotificationStore>((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: normalizeCount(count) }),
  refreshUnreadCount: async () => {
    const token = getAuthToken();
    if (!token) {
      set({ unreadCount: 0 });
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/notifications/summary`, {
        headers: buildApiHeaders(token),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        return;
      }

      set({ unreadCount: normalizeCount(payload?.unread_count) });
    } catch {
      // Keep the current badge count if the refresh fails.
    }
  },
}));
