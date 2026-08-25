import { Provider } from "@ant-design/react-native";
import { AntDesign } from "@expo/vector-icons";
import { Montserrat_400Regular } from "@expo-google-fonts/montserrat/400Regular";
import { Montserrat_600SemiBold } from "@expo-google-fonts/montserrat/600SemiBold";
import { Montserrat_800ExtraBold } from "@expo-google-fonts/montserrat/800ExtraBold";
import { Stack, router } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect, useRef, useState } from "react";
import { GlobalToast } from "../components/toast";
import OfflineSyncModal from "../components/OfflineSyncModal";
import {
  startOfflineTransactionSync,
} from "../utils/offlineTransactionQueue";
import type { OfflineSyncProgress } from "../utils/offlineTransactionQueue";
import { getAuthSession, setAuthSession } from "../api/auth";
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

export default function RootLayout() {
  const showToast = useToastStore((state) => state.showToast);
  const triggerHistoryRefresh = useHistoryStore((state) => state.triggerRefresh);
  const addSyncedTransactions = useHistoryStore((state) => state.addSyncedTransactions);
  const removeQueuedDrafts = useHistoryStore((state) => state.removeQueuedDrafts);
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
  const [syncProgress, setSyncProgress] = useState<OfflineSyncProgress | null>(null);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
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
      onSynced: (count, transactions) => {
        const {
          addSyncedTransactions,
          showToast,
          triggerHistoryRefresh,
        } = callbacksRef.current;

        if (transactions.length > 0) {
          addSyncedTransactions(transactions);
        } else {
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
          resource === "users" &&
          status === "deactivated" &&
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

  return (
    <Provider>
      <Stack screenOptions={{ headerShown: false }} />
      <OfflineSyncModal
        visible={syncModalVisible && Boolean(syncProgress)}
        percentage={syncProgress?.percentage ?? 0}
        processed={syncProgress?.processed ?? 0}
        total={syncProgress?.total ?? 0}
        onSkip={() => {
          dismissedSyncIdRef.current = syncProgress?.syncId ?? null;
          setSyncModalVisible(false);
        }}
      />
      <GlobalToast />
    </Provider>
  );
}
