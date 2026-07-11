// Prefer an Expo public env override so the mobile app can point to the
// machine currently hosting the Laravel API. Fallback stays on the current
// workstation LAN IP for local development.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  "http://192.168.1.58:8000/api";

export function getApiBaseUrl() {
  return API_BASE_URL.replace(/\/+$/, "");
}

export function buildApiHeaders(token?: string | null) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
