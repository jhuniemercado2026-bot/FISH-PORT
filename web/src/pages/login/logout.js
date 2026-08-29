import api from "../../api/axios";
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
    clearStoredAuth();
  }
}
