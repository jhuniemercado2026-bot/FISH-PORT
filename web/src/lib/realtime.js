import Echo from "laravel-echo";
import Pusher from "pusher-js";

const env = import.meta.env;

const realtimeEnabled = String(env.VITE_REALTIME_ENABLED || "false").toLowerCase() === "true";
const reverbKey = env.VITE_REVERB_APP_KEY;
const reverbHost = env.VITE_REVERB_HOST || window.location.hostname || "localhost";
const reverbPort = Number(env.VITE_REVERB_PORT || 8080);
const reverbScheme = env.VITE_REVERB_SCHEME || "http";
const apiBaseUrl = env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

let echo = null;

export const getEcho = () => {
  if (!realtimeEnabled) return null;
  if (!reverbKey) return null;
  if (echo) return echo;

  window.Pusher = Pusher;

  echo = new Echo({
    broadcaster: "reverb",
    key: reverbKey,
    wsHost: reverbHost,
    wsPort: reverbPort,
    wssPort: reverbPort,
    forceTLS: reverbScheme === "https",
    encrypted: reverbScheme === "https",
    disableStats: true,
    enabledTransports: [reverbScheme === "https" ? "wss" : "ws"],
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
