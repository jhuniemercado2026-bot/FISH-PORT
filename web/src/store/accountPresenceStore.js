import { create } from "zustand";

const normalizePresenceId = (user) => String(user?.user_id ?? user?.id ?? "").trim();

export const useAccountPresenceStore = create((set) => ({
  onlineUserIds: new Set(),

  setOnlineUsers: (users = []) =>
    set({
      onlineUserIds: new Set(users.map(normalizePresenceId).filter(Boolean)),
    }),

  setUserOnline: (user) => {
    const userId = normalizePresenceId(user);
    if (!userId) return;

    set((state) => {
      const next = new Set(state.onlineUserIds);
      next.add(userId);
      return { onlineUserIds: next };
    });
  },

  setUserOffline: (user) => {
    const userId = normalizePresenceId(user);
    if (!userId) return;

    set((state) => {
      const next = new Set(state.onlineUserIds);
      next.delete(userId);
      return { onlineUserIds: next };
    });
  },

  clearOnlineUsers: () => set({ onlineUserIds: new Set() }),
}));

export const accountPresenceActions = {
  setOnlineUsers: (users) => useAccountPresenceStore.getState().setOnlineUsers(users),
  setUserOnline: (user) => useAccountPresenceStore.getState().setUserOnline(user),
  setUserOffline: (user) => useAccountPresenceStore.getState().setUserOffline(user),
  clearOnlineUsers: () => useAccountPresenceStore.getState().clearOnlineUsers(),
};
