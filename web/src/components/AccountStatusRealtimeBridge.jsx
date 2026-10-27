import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearStoredAuth, getStoredToken, getStoredUser, normalizeRole } from "../pages/login/auth";
import api, { isDatabaseRecoveryInProgress } from "../api/axios";
import { disconnectEcho, getEcho, REALTIME_AUTH_CHANGED_EVENT } from "../lib/realtime";
import { syncUsersQueryCache } from "../hooks/useUsersQuery";
import { syncReportUsersQueryCache } from "../hooks/useReportUsersQuery";
import { accountPresenceActions } from "../store/accountPresenceStore";

const FORCED_LOGOUT_MESSAGE = "System error, your account will be logged out.";
const FORCED_LOGOUT_MESSAGE_KEY = "forcedLogoutMessage";

const currentUserMatchesRecord = (record) => {
  const currentUser = getStoredUser();
  const currentUserId = String(currentUser?.user_id ?? currentUser?.id ?? "");
  const recordUserId = String(record?.user_id ?? record?.id ?? "");

  return currentUserId !== "" && currentUserId === recordUserId;
};

const currentUserHasAffectedRole = (record) => {
  const userId = getStoredUser()?.user_id ?? getStoredUser()?.id;
  if (userId == null) return false;
  if (record?.excluded_user_id != null) {
    return String(userId) !== String(record.excluded_user_id);
  }
  const currentRole = normalizeRole(getStoredUser()?.role);
  const rawAffectedRoles = Array.isArray(record?.affected_roles)
    ? record.affected_roles
    : typeof record?.affected_roles === "string"
      ? [record.affected_roles]
      : [];
  const affectedRoles = rawAffectedRoles.map(normalizeRole).filter(Boolean);

  return currentRole !== "" && affectedRoles.includes(currentRole);
};

const forceLogout = (message = FORCED_LOGOUT_MESSAGE) => {
  sessionStorage.setItem(FORCED_LOGOUT_MESSAGE_KEY, message || FORCED_LOGOUT_MESSAGE);
  clearStoredAuth();
  disconnectEcho();
  accountPresenceActions.clearOnlineUsers();
  window.location.replace("/login");
};

export default function AccountStatusRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let checking = false;
    let disposed = false;
    const checkSession = async () => {
      const token = getStoredToken();
      if (!token || checking || isDatabaseRecoveryInProgress()) return;
      checking = true;
      try {
        await api.get("/me", { timeout: 10000, params: { session_check: Date.now() } });
      } catch (error) {
        if (!disposed && getStoredToken() === token && !isDatabaseRecoveryInProgress()
          && error.response?.status === 401) {
          queryClient.clear();
          forceLogout("Your session has ended. Please sign in again to refresh your data.");
        }
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(checkSession, 15000);
    window.addEventListener("focus", checkSession);
    checkSession();
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkSession);
    };
  }, [queryClient]);

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

      channel.listen(".restored", (payload) => {
        if (payload?.resource === "database" && currentUserHasAffectedRole(payload?.record)) {
          queryClient.clear();
          forceLogout(payload?.record?.message);
        }
      });

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
        const action = String(payload?.action || "");
        const record = payload?.record;
        const status = String(record?.status || "").toLowerCase();

        if (
          resource === "database"
          && action === "restored"
          && currentUserHasAffectedRole(record)
        ) {
          forceLogout(record?.message);
          return;
        }

        if (resource === "users" && record) {
          const normalizedAction = action || "updated";
          if (["created", "updated"].includes(normalizedAction)) {
            syncUsersQueryCache(queryClient, record);
            syncReportUsersQueryCache(queryClient);
          }
        }

        if (
          resource !== "users"
          || (status !== "deactivated" && record?.force_logout !== true)
          || !currentUserMatchesRecord(record)
        ) {
          return;
        }

        forceLogout();
      });

      channel.listen(".created", (payload) => {
        const resource = String(payload?.resource || "");
        const record = payload?.record;

        if (resource === "users" && record) {
          syncUsersQueryCache(queryClient, record);
          syncReportUsersQueryCache(queryClient);
        }
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
