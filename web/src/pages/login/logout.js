import api from "../../api/axios";
import { clearStoredAuth, getStoredToken } from "./auth";

export async function logoutUser() {
  const token = getStoredToken();

  clearStoredAuth();

  void api.post("/logout", undefined, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => {
    // Local auth is already cleared, so logout should stay instant even if this fails.
  });
}
