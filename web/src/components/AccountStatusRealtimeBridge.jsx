import { useEffect } from "react";
import { clearStoredAuth, getStoredUser } from "../pages/login/auth";
import { disconnectEcho, getEcho, REALTIME_AUTH_CHANGED_EVENT } from "../lib/realtime";
import { accountPresenceActions } from "../store/accountPresenceStore";

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
    let cleanupSubscriptions = null;

    const subscribe = () => {
      cleanupSubscriptions?.();
      cleanupSubscriptions = null;

      const echo = getEcho();
      if (!echo) {
        accountPresenceActions.clearOnlineUsers();
        return;
      }

      const channel = echo.channel("master-data");
      const presenceChannel = echo.join("accounts.online");
      const statusChannel = echo.channel("accounts.status");

      presenceChannel.here((users = []) => {
        accountPresenceActions.setOnlineUsers(users);
      });

      presenceChannel.joining((user) => {
        accountPresenceActions.setUserOnline(user);
      });

      presenceChannel.leaving((user) => {
        accountPresenceActions.setUserOffline(user);
      });

      statusChannel.listen(".updated", (payload) => {
        const account = payload?.account ?? payload?.record ?? payload;
        const presenceStatus = String(account?.presence_status ?? "").toLowerCase();

        if (presenceStatus === "online") {
          accountPresenceActions.setUserOnline(account);
        } else if (presenceStatus === "offline" || account?.status === "deactivated") {
          accountPresenceActions.setUserOffline(account);
        }
      });

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
        accountPresenceActions.clearOnlineUsers();
        window.location.replace("/login");
      });

      cleanupSubscriptions = () => {
        echo.leave("master-data");
        echo.leave("accounts.online");
        echo.leave("accounts.status");
        accountPresenceActions.clearOnlineUsers();
      };
    };

    subscribe();

    const handleStorage = (event) => {
      if (event.key === "token") subscribe();
    };

    window.addEventListener(REALTIME_AUTH_CHANGED_EVENT, subscribe);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", subscribe);

    return () => {
      window.removeEventListener(REALTIME_AUTH_CHANGED_EVENT, subscribe);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", subscribe);
      cleanupSubscriptions?.();
    };
  }, []);

  return null;
}
