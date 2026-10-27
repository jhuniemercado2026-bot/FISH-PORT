import { Provider } from "@ant-design/react-native";
import { AntDesign } from "@expo/vector-icons";
import { Montserrat_400Regular } from "@expo-google-fonts/montserrat/400Regular";
import { Montserrat_600SemiBold } from "@expo-google-fonts/montserrat/600SemiBold";
import { Montserrat_800ExtraBold } from "@expo-google-fonts/montserrat/800ExtraBold";
import { Stack, router } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { hasServerTime, syncServerClock } from "../utils/serverClock";
import { useServerClockVersion } from "../utils/useServerClockVersion";
import { GlobalToast } from "../components/toast";
import OfflineSyncModal from "../components/OfflineSyncModal";
import FirstLoginCompletionModal from "../components/FirstLoginCompletionModal";
import {
  startOfflineTransactionSync,
} from "../utils/offlineTransactionQueue";
import { getAuthSession, setAuthSession } from "../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../api/axios";
import { useHistoryStore } from "../store/historyStore";
import { useMasterDataStore } from "../store/masterDataStore";
import { useToastStore } from "../store/toastStore";
import { startMasterDataRealtime } from "../utils/realtimeMasterData";
import { startTransactionLockRealtime } from "../utils/realtimeTransactionLock";
import { startTransactionsRealtime } from "../utils/realtimeTransactions";
import "@/global.css";

const FORCED_LOGOUT_MESSAGE = "System error, your account will be logged out.";

const currentUserMatchesRecord = (record: Record<string, unknown> | null | undefined) => {
  const currentUserId = String(getAuthSession()?.user?.user_id ?? "");
  const recordUserId = String(record?.user_id ?? record?.id ?? "");

  return currentUserId !== "" && currentUserId === recordUserId;
};

const currentUserHasAffectedRole = (record: Record<string, unknown> | null | undefined) => {
  const userId = getAuthSession()?.user?.user_id;
  if (userId == null) return false;
  if (record?.excluded_user_id != null) {
    return String(userId) !== String(record.excluded_user_id);
  }
  const currentRole = String(getAuthSession()?.user?.role ?? "").trim().toLowerCase();
  const rawAffectedRoles = Array.isArray(record?.affected_roles)
    ? record.affected_roles
    : typeof record?.affected_roles === "string"
      ? [record.affected_roles]
      : [];
  const affectedRoles = rawAffectedRoles
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return currentRole !== "" && affectedRoles.includes(currentRole);
};

export default function RootLayout() {
  const serverClockVersion = useServerClockVersion();
  const [clockSyncFailed, setClockSyncFailed] = useState(false);
  const showToast = useToastStore((state) => state.showToast);
  const triggerHistoryRefresh = useHistoryStore((state) => state.triggerRefresh);
  const addSyncedTransactions = useHistoryStore((state) => state.addSyncedTransactions);
  const removeQueuedDrafts = useHistoryStore((state) => state.removeQueuedDrafts);
  const syncProgress = useHistoryStore((state) => state.offlineSyncProgress);
  const syncModalVisible = useHistoryStore((state) => state.offlineSyncModalVisible);
  const setSyncProgress = useHistoryStore((state) => state.setOfflineSyncProgress);
  const setSyncModalVisible = useHistoryStore((state) => state.setOfflineSyncModalVisible);
  const setTransactionLock = useHistoryStore((state) => state.setTransactionLock);
  const triggerMasterDataRefresh = useMasterDataStore((state) => state.triggerRefresh);
  const dismissedSyncIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({
    addSyncedTransactions,
    removeQueuedDrafts,
    setTransactionLock,
    showToast,
    triggerHistoryRefresh,
    triggerMasterDataRefresh,
  });
  const [fontsLoaded] = useFonts({
    ...AntDesign.font,
    Montserrat_400Regular,
    Montserrat_600SemiBold,
    Montserrat_800ExtraBold,
  });

  callbacksRef.current = {
    addSyncedTransactions,
    removeQueuedDrafts,
    setTransactionLock,
    showToast,
    triggerHistoryRefresh,
    triggerMasterDataRefresh,
  };

  useEffect(() => {
    let disposed = false;
    const refreshClock = async () => {
      const synced = await syncServerClock(true);
      if (!disposed) setClockSyncFailed(!synced);
    };
    void refreshClock();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refreshClock();
    }, 60000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshClock();
    });
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void refreshClock();
    });
    return () => {
      disposed = true;
      clearInterval(timer);
      appState.remove();
      unsubscribeNetwork();
    };
  }, []);

  useEffect(() => {
    if (serverClockVersion > 0) {
      const store = useHistoryStore.getState();
      store.setTransactionLock(store.transactionLock);
    }
  }, [serverClockVersion]);

  useEffect(() => {
    let checking = false;
    let disposed = false;
    const checkSession = async () => {
      const token = getAuthSession()?.token;
      if (!token || checking || AppState.currentState !== "active") return;
      checking = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`${getApiBaseUrl()}/me?session_check=${Date.now()}`, {
          headers: buildApiHeaders(token),
          signal: controller.signal,
        });
        if (!disposed && response.status === 401 && getAuthSession()?.token === token) {
          setAuthSession(null);
          callbacksRef.current.showToast("error", "Your session has ended. Please sign in again to refresh your data.");
          router.replace("/(login)/login");
        }
      } catch {
        // Temporary network failures must not end a valid session.
      } finally {
        clearTimeout(timeout);
        checking = false;
      }
    };
    const timer = setInterval(checkSession, 15000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkSession();
    });
    void checkSession();
    return () => {
      disposed = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    return startOfflineTransactionSync({
      onProgress: (progress) => {
        if (progress.total <= 0) {
          setSyncModalVisible(false);
          return;
        }

        setSyncProgress(progress);

        if (
          progress.status === "started" &&
          dismissedSyncIdRef.current !== progress.syncId
        ) {
          setSyncModalVisible(true);
        }

        if (progress.status === "finished") {
          setTimeout(() => {
            setSyncModalVisible(false);
          }, 350);
        }
      },
      onSyncedDraft: (transaction) => {
        const {
          addSyncedTransactions,
          removeQueuedDrafts,
        } = callbacksRef.current;

        addSyncedTransactions([transaction]);
        removeQueuedDrafts([transaction.local_id]);
      },
      onSynced: (count, transactions) => {
        const {
          showToast,
          triggerHistoryRefresh,
        } = callbacksRef.current;

        if (transactions.length === 0) {
          triggerHistoryRefresh();
        }

        setTimeout(() => {
          showToast(
            "success",
            `${count} offline draft${count === 1 ? "" : "s"} synced.`
          );
        }, 500);
      },
      onLockedDraftsDiscarded: (count, draftIds) => {
        const {
          removeQueuedDrafts,
          showToast,
          triggerHistoryRefresh,
        } = callbacksRef.current;

        removeQueuedDrafts(draftIds);
        triggerHistoryRefresh();

        setTimeout(() => {
          showToast(
            "error",
            `You can't sync ${count === 1 ? "this draft" : "these drafts"} because the transaction is closed. ${count === 1 ? "It was" : "They were"} deleted.`
          );
        }, 500);
      },
      onDuplicateDraftsDiscarded: (count, draftIds) => {
        const {
          removeQueuedDrafts,
          showToast,
          triggerHistoryRefresh,
        } = callbacksRef.current;

        removeQueuedDrafts(draftIds);
        triggerHistoryRefresh();

        setTimeout(() => {
          showToast(
            "error",
            `${count === 1 ? "This draft is" : "These drafts are"} already recorded on the server. ${count === 1 ? "It was" : "They were"} deleted.`
          );
        }, 500);
      },
    });
  }, []);

  useEffect(() => {
    return startMasterDataRealtime({
      onUpdate: (payload) => {
        const resource = String(payload?.resource ?? "");
        const record = payload?.record as Record<string, unknown> | null | undefined;
        const status = String(record?.status ?? "").toLowerCase();

        if (
          resource === "database"
          && String(payload?.action ?? "").toLowerCase() === "restored"
          && currentUserHasAffectedRole(record)
        ) {
          callbacksRef.current.showToast("error", String(record?.message || "The database was restored. Please sign in again to refresh your data."));
          setAuthSession(null);
          router.replace("/(login)/login");
          return;
        }

        if (
          resource === "users" &&
          (status === "deactivated" || record?.force_logout === true) &&
          currentUserMatchesRecord(record)
        ) {
          callbacksRef.current.showToast("error", FORCED_LOGOUT_MESSAGE);
          setAuthSession(null);
          router.replace("/(login)/login");
          return;
        }

        callbacksRef.current.triggerMasterDataRefresh(payload);
      },
    });
  }, []);

  useEffect(() => {
    return startTransactionLockRealtime({
      onUpdate: (transactionLock) => {
        const currentUser = getAuthSession()?.user;
        const currentUserId = currentUser?.user_id;
        const currentRole = String(currentUser?.role ?? "").trim().toLowerCase();
        const lockScope = String(transactionLock?.lock_scope ?? "").trim().toLowerCase();
        const lockedUserId = transactionLock?.submitted_by;

        if (transactionLock && lockScope === "user" && String(lockedUserId ?? "") !== String(currentUserId ?? "")) {
          return;
        }

        if (transactionLock && lockScope === "global" && !["coordinator", "inspector"].includes(currentRole)) {
          return;
        }

        callbacksRef.current.setTransactionLock(transactionLock);
      },
    });
  }, []);

  useEffect(() => {
    return startTransactionsRealtime({
      onTransactionUpdate: (record, payload) => {
        const type = payload.type;

        if (type !== "docking" && type !== "banyera" && type !== "tickets") {
          return;
        }

        const recordId =
          record.docking_id ??
          record.banyera_id ??
          record.ticket_id ??
          record.id ??
          Date.now();

        callbacksRef.current.addSyncedTransactions([
          {
            local_id: `${type}-realtime-${recordId}-${record.updated_at ?? record.voided_at ?? Date.now()}`,
            type,
            data: record,
          },
        ]);
      },
      onRemittanceUpdate: (record) => {
        const currentUserId = getAuthSession()?.user?.user_id;
        const submittedBy = record.submitted_by ?? record.submittedBy?.user_id ?? record.submittedBy?.id;

        if (!currentUserId || !submittedBy || String(submittedBy) !== String(currentUserId)) {
          return;
        }

        const remittanceId = record.remittance_id ?? record.id ?? Date.now();
        callbacksRef.current.addSyncedTransactions([
          {
            local_id: `remittance-realtime-${remittanceId}-${record.updated_at ?? Date.now()}`,
            type: "remittance",
            data: record,
          },
        ]);
      },
    });
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  if (!hasServerTime()) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "white" }}>
        {!clockSyncFailed && <ActivityIndicator size="large" color="#2563EB" />}
        <Text style={{ marginTop: 16, textAlign: "center", color: "#334155" }}>
          {clockSyncFailed ? "Unable to connect to the server. Please check your connection and try again." : "Connecting to the server..."}
        </Text>
        {clockSyncFailed && (
          <Pressable style={{ marginTop: 20, padding: 12 }} onPress={() => {
            setClockSyncFailed(false);
            void syncServerClock(true).then((synced) => setClockSyncFailed(!synced));
          }}>
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Try again</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <Provider>
      <Stack screenOptions={{ headerShown: false }} />
      <OfflineSyncModal
        visible={syncModalVisible && Boolean(syncProgress)}
        percentage={syncProgress?.percentage ?? 0}
        processed={syncProgress?.processed ?? 0}
        total={syncProgress?.total ?? 0}
        status={syncProgress?.status}
        onSkip={() => {
          dismissedSyncIdRef.current = syncProgress?.syncId ?? null;
          setSyncModalVisible(false);
        }}
      />
      <FirstLoginCompletionModal />
      <GlobalToast />
    </Provider>
  );
}
