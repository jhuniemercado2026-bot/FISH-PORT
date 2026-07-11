import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

export const SETTINGS_QUERY_KEY = ["settings-data"];

const normalizeProfileImageUrl = (user) => {
  if (!user) return user;

  const base = api.defaults.baseURL.replace("/api", "");
  const rawUrl = user.profile_image_url;

  if (rawUrl) {
    if (/^(https?:|data:|blob:)/i.test(rawUrl)) {
      return { ...user, profile_image_url: rawUrl };
    }

    if (rawUrl.startsWith("/storage/")) {
      return { ...user, profile_image_url: `${base}${rawUrl}` };
    }

    if (rawUrl.startsWith("storage/")) {
      return { ...user, profile_image_url: `${base}/${rawUrl}` };
    }
  }

  if (user.profile_image) {
    return {
      ...user,
      profile_image_url: `${base}/storage/${String(user.profile_image).replace(/^\/+/, "")}`,
    };
  }

  return user;
};

// Shared settings query keeps profile data cached across the settings screen.
export const getSettingsQueryOptions = () => ({
  queryKey: SETTINGS_QUERY_KEY,
  queryFn: async () => {
    const res = await api.get("/me");
    const user = normalizeProfileImageUrl(res.data.user);

    return { user };
  },
  staleTime: 5 * 60 * 1000,
});

export const useSettingsQuery = (queryOptions = {}) =>
  useQuery({
    ...getSettingsQueryOptions(),
    ...queryOptions,
  });
