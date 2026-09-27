import api from "../../api/axios";
import { disconnectEcho } from "../../lib/realtime";
import { accountPresenceActions } from "../../store/accountPresenceStore";
import { clearStoredAuth, getStoredToken } from "./auth";

export async function logoutUser() {
  const token = getStoredToken();

  try {
    await api.post("/logout", undefined, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    // The browser session should still end even if the server logout request fails.
  } finally {
    accountPresenceActions.clearOnlineUsers();
    disconnectEcho();
    clearStoredAuth();
  }
}
