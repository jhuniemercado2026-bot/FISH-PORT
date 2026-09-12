// Prefer an Expo public env override so the mobile app can point to the
// currently deployed Laravel API.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  "https://teal-viper-542499.hostingersite.com/api";

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
