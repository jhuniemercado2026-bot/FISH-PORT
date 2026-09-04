import { create } from "zustand";

const getInitialCollapsedState = () => {
  try {
    return localStorage.getItem("sidebarCollapsed") === "true";
  } catch {
    return false;
  }
};

const getInitialOpenState = () => {
  if (typeof window === "undefined") {
    return true;
  }

  return window.innerWidth >= 900;
};

// Sidebar UI state lives in Zustand because it is shared client-side state.
export const useSidebarStore = create((set) => ({
  sidebarCollapsed: getInitialCollapsedState(),
  sidebarOpen: getInitialOpenState(),

  setSidebarCollapsed: (value) => {
    set({ sidebarCollapsed: value });

    try {
      localStorage.setItem("sidebarCollapsed", String(value));
    } catch {}
  },

  setSidebarOpen: (value) => set({ sidebarOpen: value }),

  toggleSidebar: () =>
    set((state) => {
      if (typeof window !== "undefined" && window.innerWidth >= 900) {
        const nextCollapsed = !state.sidebarCollapsed;

        try {
          localStorage.setItem("sidebarCollapsed", String(nextCollapsed));
        } catch {}

        return { sidebarCollapsed: nextCollapsed };
      }

      return { sidebarOpen: !state.sidebarOpen };
    }),

  syncSidebarViewport: () => {
    if (typeof window === "undefined") {
      return;
    }

    set({ sidebarOpen: window.innerWidth >= 900 });
  },
}));

// Thin wrapper hook keeps consuming components readable.
export const useSidebar = () => useSidebarStore();
