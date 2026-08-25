import { useEffect } from "react";
import { clearStoredAuth, getStoredUser } from "../pages/login/auth";
import { disconnectEcho, getEcho } from "../lib/realtime";

const FORCED_LOGOUT_MESSAGE = "System error, your account will be logged out.";
const FORCED_LOGOUT_MESSAGE_KEY = "forcedLogoutMessage";

const currentUserMatchesRecord = (record) => {
  const currentUser = getStoredUser();
  const currentUserId = String(currentUser?.user_id ?? currentUser?.id ?? "");
  const recordUserId = String(record?.user_id ?? record?.id ?? "");

  return currentUserId !== "" && currentUserId === recordUserId;
};

export default function AccountStatusRealtimeBridge() {
  useEffect(() => {
    const echo = getEcho();
    if (!echo) return undefined;

    const channel = echo.channel("master-data");

    channel.listen(".updated", (payload) => {
      const resource = String(payload?.resource || "");
      const record = payload?.record;
      const status = String(record?.status || "").toLowerCase();

      if (resource !== "users" || status !== "deactivated" || !currentUserMatchesRecord(record)) {
        return;
      }

      sessionStorage.setItem(FORCED_LOGOUT_MESSAGE_KEY, FORCED_LOGOUT_MESSAGE);
      clearStoredAuth();
      disconnectEcho();
      window.location.replace("/login");
    });

    return () => {
      echo.leave("master-data");
    };
  }, []);

  return null;
}
