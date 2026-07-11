import api from "../../api/axios";
import { clearStoredAuth } from "./auth";

export async function logoutUser() {
  try {
    await api.post("/logout");
  } catch {
    // We still clear local auth state even if the backend call fails.
  } finally {
    clearStoredAuth();
  }
}
