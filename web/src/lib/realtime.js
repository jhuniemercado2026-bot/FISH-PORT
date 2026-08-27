import Echo from "laravel-echo";
import Pusher from "pusher-js";

const env = import.meta.env;

const realtimeEnabled = String(env.VITE_REALTIME_ENABLED || "false").toLowerCase() === "true";
const pusherKey = env.VITE_PUSHER_APP_KEY;
const pusherCluster = env.VITE_PUSHER_APP_CLUSTER || "mt1";
const pusherScheme = env.VITE_PUSHER_SCHEME || "https";
const apiBaseUrl = env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

let echo = null;

export const getEcho = () => {
  if (!realtimeEnabled) return null;
  if (!pusherKey) return null;
  if (echo) return echo;

  window.Pusher = Pusher;

  echo = new Echo({
    broadcaster: "pusher",
    key: pusherKey,
    cluster: pusherCluster,
    forceTLS: pusherScheme === "https",
    encrypted: pusherScheme === "https",
    disableStats: true,
    enabledTransports: ["ws", "wss"],
    authEndpoint: `${apiBaseUrl}/broadcasting/auth`,
    auth: {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        Accept: "application/json",
      },
    },
  });

  return echo;
};

export const disconnectEcho = () => {
  echo?.disconnect();
  echo = null;
};
