import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { getAuthSession, getAuthToken } from "../../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../../api/axios";
import {
  Image,
  ImageBackground,
  Modal as NativeModal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHistoryStore } from "../../../store/historyStore";
import { useHomeStore } from "../../../store/homeStore";
import { useToastStore } from "../../../store/toastStore";
import {
  getOfflineResource,
  getOfflineReadinessStatus,
  saveOfflineBoats,
  saveOfflineResource,
} from "../../../utils/offlineMasterData";
import {
  getOfflineTransactionDrafts,
  OfflineTransactionDraft,
} from "../../../utils/offlineTransactionQueue";

type HomeOfflineData = {
  overviewCounts: {
    banyera: number;
    docking: number;
    tickets: number;
    remittance: number;
  };
  banyeraRecords: any[];
  dockingRecords: any[];
  ticketRecords: any[];
  remittanceRecords: any[];
  isLoading?: boolean;
};

const parseMoneyValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeHistoryPayload = (payload: any, keys: string[] = []) => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  return [];
};

const normalizeListPayload = (payload: any, keys: string[] = []) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  return [];
};

const isOfflineNetworkState = (state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
} | null) => {
  if (!state) return false;
  return state.isConnected === false || state.isInternetReachable === false;
};

const parseDateTimeValue = (value?: string | null) => {
  if (!value) return null;

  const raw = String(value).trim();

  const hasTimezone = /(Z|[+-]\d{2}:\d{2})$/i.test(raw);

  if (hasTimezone) {
    const normalizedValue = raw.replace(/\.(\d{3})\d+/, ".$1");
    const parsedDate = new Date(normalizedValue);

    if (Number.isNaN(parsedDate.getTime())) return null;

    const parts = new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(parsedDate);

    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? "0");

    return {
      year: getPart("year"),
      month: getPart("month"),
      day: getPart("day"),
      hour: getPart("hour"),
      minute: getPart("minute"),
      second: getPart("second"),
    };
  }

  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/
  );

  if (!match) {
    const fallbackDate = new Date(raw);
    if (Number.isNaN(fallbackDate.getTime())) return null;

    return {
      year: fallbackDate.getFullYear(),
      month: fallbackDate.getMonth() + 1,
      day: fallbackDate.getDate(),
      hour: fallbackDate.getHours(),
      minute: fallbackDate.getMinutes(),
      second: fallbackDate.getSeconds(),
    };
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "0"),
    minute: Number(match[5] ?? "0"),
    second: Number(match[6] ?? "0"),
  };
};

const getRecordDateValue = (record: any) => {
  return record?.transaction_date || record?.ticket_date || record?.docking_date || record?.date || record?.created_at || record?.updated_at;
};

const getDateKeyInManila = (value?: string | null) => {
  const parsed = parseDateTimeValue(value);
  if (parsed) {
    return `${String(parsed.year)}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
  }

  const parsedDate = new Date(value ?? "");
  if (Number.isNaN(parsedDate.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(parsedDate);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return null;

  return `${year}-${month}-${day}`;
};

const getTodayDateKeyInManila = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return null;

  return `${year}-${month}-${day}`;
};

const isRecordActive = (record: any) => {
  return !Boolean(record?.is_voided || record?.voided_at);
};

const isTodayRecord = (record: any) => {
  const dateValue = getRecordDateValue(record);
  const recordDateKey = getDateKeyInManila(dateValue);
  if (!recordDateKey) return false;

  const todayDateKey = getTodayDateKeyInManila();
  return recordDateKey === todayDateKey;
};

const isOwnedByCurrentUser = (record: any, currentUserId?: number | string | null) => {
  if (!currentUserId) return false;

  const currentUserIdString = String(currentUserId);
  const ownerCandidates = [
    record?.created_by,
    record?.created_by?.user_id,
    record?.created_by?.id,
    record?.created_by_id,
    record?.createdBy?.user_id,
    record?.createdBy?.id,
    record?.createdBy,
    record?.user_id,
    record?.user?.user_id,
    record?.user?.id,
    record?.owner_id,
    record?.submitted_by,
    record?.submittedBy?.user_id,
    record?.submittedBy?.id,
  ];

  return ownerCandidates.some((value) => {
    return value !== undefined && value !== null && String(value) === currentUserIdString;
  });
};

const filterRecordsByCurrentUser = (records: any[], currentUserId?: number | string | null) =>
  records.filter((record: any) => isOwnedByCurrentUser(record, currentUserId));

const unwrapSyncedTransactionData = (data: Record<string, any>) => {
  if (data?.data && !Array.isArray(data.data)) return data.data;
  if (data?.transaction && !Array.isArray(data.transaction)) return data.transaction;
  if (data?.ticket && !Array.isArray(data.ticket)) return data.ticket;
  if (data?.docking && !Array.isArray(data.docking)) return data.docking;
  if (data?.banyera && !Array.isArray(data.banyera)) return data.banyera;

  return data;
};

const transactionIdForType = (type: "docking" | "banyera" | "tickets" | "remittance", data: any) => {
  if (type === "docking") return data?.docking_id ?? data?.id;
  if (type === "banyera") return data?.banyera_id ?? data?.id;
  if (type === "remittance") return data?.remittance_id ?? data?.id;
  return data?.ticket_id ?? data?.id;
};

const upsertTransaction = (items: any[], type: "docking" | "banyera" | "tickets" | "remittance", nextItem: any) => {
  const nextId = transactionIdForType(type, nextItem);

  if (!nextId) {
    return [nextItem, ...items];
  }

  const existingIndex = items.findIndex(
    (item) => String(transactionIdForType(type, item) ?? "") === String(nextId)
  );

  if (existingIndex === -1) {
    return [nextItem, ...items];
  }

  const nextItems = [...items];
  nextItems[existingIndex] = nextItem;
  return nextItems;
};

const createDraftHomeRecord = (draft: OfflineTransactionDraft) => {
  const payload = draft.payload ?? {};
  const metadata = draft.metadata ?? {};

  if (draft.type === "docking") {
    return {
      __isDraft: true,
      local_id: draft.local_id,
      created_at: draft.created_at,
      boat: {
        boat_name: metadata.boat_name || `Boat #${payload.boat_id ?? "-"}`,
      },
      docking_date: payload.docking_date ?? draft.created_at,
      docking_fee: payload.docking_fee ?? 0,
    };
  }

  if (draft.type === "banyera") {
    const items = Array.isArray(payload.items) ? payload.items : [];
    const totalFee = items.reduce((sum, item) => sum + parseMoneyValue(item?.subtotal), 0);

    return {
      __isDraft: true,
      local_id: draft.local_id,
      created_at: draft.created_at,
      boat: {
        boat_name: metadata.boat_name || `Boat #${payload.boat_id ?? "-"}`,
      },
      transaction_date: payload.transaction_date ?? draft.created_at,
      items,
      total_fee: totalFee,
    };
  }

  if (draft.type === "remittance") {
    return {
      __isDraft: true,
      local_id: draft.local_id,
      created_at: draft.created_at,
      date: payload.date ?? metadata.date ?? draft.created_at,
      amount: payload.amount ?? 0,
      surplus: payload.surplus ?? 0,
      deficit: payload.deficit ?? 0,
      remarks: payload.remarks ?? null,
      status: "pending",
    };
  }

  return {
    __isDraft: true,
    local_id: draft.local_id,
    created_at: draft.created_at,
    plate_number: metadata.plate_number || payload.plate_number || null,
    vehicle_type_name: metadata.vehicle_type_name || (payload.vehicle_type_id ? `Vehicle Type #${payload.vehicle_type_id}` : "Vehicle"),
    ticket_date: payload.ticket_date ?? draft.created_at,
    ticket_fee: payload.ticket_fee ?? payload.total_fee ?? 0,
  };
};

const buildTodayHomeData = ({
  docking,
  banyera,
  tickets,
  remittance = [],
}: {
  docking: any[];
  banyera: any[];
  tickets: any[];
  remittance?: any[];
}) => {
  const dockingRecords = docking.filter((record: any) => {
    return isRecordActive(record) && isTodayRecord(record);
  });
  const banyeraRecords = banyera.filter((record: any) => {
    return isRecordActive(record) && isTodayRecord(record);
  });
  const ticketRecords = tickets.filter((record: any) => {
    return isRecordActive(record) && isTodayRecord(record);
  });
  const remittanceRecords = remittance.filter((record: any) => {
    return isTodayRecord(record);
  });

  return {
    overviewCounts: {
      banyera: banyeraRecords.length,
      docking: dockingRecords.length,
      tickets: ticketRecords.length,
      remittance: remittanceRecords.length,
    },
    banyeraRecords,
    dockingRecords,
    ticketRecords,
    remittanceRecords,
    isLoading: false,
  };
};

const formatBanyeraDate = (value?: string | null) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return "No date";

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(parsed.year, parsed.month - 1, parsed.day)
  );

  return `${monthName} ${parsed.day}, ${parsed.year}`;
};

const formatBanyeraTime = (value?: string | null) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return "No time";

  let hours = parsed.hour;
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${hours}:${String(parsed.minute).padStart(2, "0")} ${meridiem}`;
};

const formatOfflineUpdatedAt = (value?: string | null) => {
  if (!value) return "Not yet updated";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet updated";

  const dateText = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

  const timeText = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return `${dateText} | ${timeText}`;
};

function SkeletonBlock({
  className = "",
  style,
}: {
  className?: string;
  style?: Record<string, any>;
}) {
  return (
    <View
      className={className}
      style={{ backgroundColor: "#EEF2F7", ...style }}
    />
  );
}

function OverviewMetricSkeleton() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <SkeletonBlock className="h-10 w-10 rounded-full" />
      <SkeletonBlock className="mt-3 h-3 w-14 rounded-full" />
      <SkeletonBlock className="mt-3 h-6 w-8 rounded-full" />
    </View>
  );
}

function HomeSectionSkeletonCard() {
  return (
    <View
      className="mr-3 w-[250px] rounded-[10px] border border-[#E8E1E6] bg-white p-4"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <SkeletonBlock className="h-4 w-3/5 rounded-full" />
          <SkeletonBlock className="mt-2 h-3 w-4/5 rounded-full" />
        </View>
        <SkeletonBlock className="h-11 w-11 rounded-[14px]" />
      </View>
      <SkeletonBlock className="mt-5 h-7 w-24 rounded-full" />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const authSession = getAuthSession();
  const refreshKey = useHistoryStore((state) => state.refreshKey);
  const syncedTransactions = useHistoryStore((state) => state.syncedTransactions);
  const queuedDrafts = useHistoryStore((state) => state.queuedDrafts);
  const cacheTransactionDetail = useHistoryStore((state) => state.cacheTransactionDetail);
  const showToast = useToastStore((state) => state.showToast);
  const overviewCounts = useHomeStore((state) => state.overviewCounts);
  const banyeraRecords = useHomeStore((state) => state.banyeraRecords);
  const dockingRecords = useHomeStore((state) => state.dockingRecords);
  const ticketRecords = useHomeStore((state) => state.ticketRecords);
  const remittanceRecords = useHomeStore((state) => state.remittanceRecords);
  const isLoading = useHomeStore((state) => state.isLoading);
  const hasLoadedOverview = useHomeStore((state) => state.hasLoadedOverview);
  const setHomeData = useHomeStore((state) => state.setHomeData);
  const userFullName = useHomeStore((state) => state.userFullName);
  const userEmail = useHomeStore((state) => state.userEmail);
  const userId = useHomeStore((state) => state.userId);
  const [offlineReadyPercent, setOfflineReadyPercent] = useState(0);
  const [isPreparingOfflineData, setIsPreparingOfflineData] = useState(false);
  const [offlineStatusVisible, setOfflineStatusVisible] = useState(false);
  const [offlineLastUpdated, setOfflineLastUpdated] = useState("");
  const [offlineEntries, setOfflineEntries] = useState<
    {
      key: string;
      label: string;
      isReady: boolean;
      saved_at: string;
    }[]
  >([]);
  const manilaHour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Manila",
    }).format(new Date())
  );
  const greeting =
    manilaHour < 12
      ? "Good Morning"
      : manilaHour < 17
        ? "Good Afternoon"
        : "Good Evening";
  const sessionName = typeof userFullName === "string" ? userFullName : "";
  const sessionEmail = typeof userEmail === "string" ? userEmail : "";
  const inspectorId = typeof userId === "number" ? String(userId) : String(userId ?? "1");
  const identity = sessionName || sessionEmail || `Inspector #${inspectorId}`;
  const shouldShowHomeSkeleton = isLoading && !hasLoadedOverview;

  useEffect(() => {
    let isMounted = true;

    async function refreshOfflineReadiness() {
      const status = await getOfflineReadinessStatus();
      if (isMounted) {
        setOfflineReadyPercent(status.percent);
        setOfflineEntries(status.entries);
        setOfflineLastUpdated(status.lastUpdated);
      }
      return status.percent;
    }

    async function prepareOfflineResources() {
      const token = getAuthToken();
      if (!token) {
        await refreshOfflineReadiness();
        return;
      }

      await refreshOfflineReadiness();
      if (isMounted) {
        setIsPreparingOfflineData(true);
      }

      const fetchJson = async (path: string) => {
        const response = await fetch(`${getApiBaseUrl()}${path}`, {
          headers: buildApiHeaders(token),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error("Unable to download offline resource.");
        }

        return payload;
      };

      const saveStep = async (task: () => Promise<void>) => {
        try {
          await task();
        } catch {
          // Keep any previously cached copy and continue the remaining groups.
        } finally {
          await refreshOfflineReadiness();
        }
      };

      await saveStep(async () => {
        const payload = await fetchJson("/boats");
        const boats = normalizeListPayload(payload, ["boats"]);
        await saveOfflineBoats(boats);
      });

      await saveStep(async () => {
        const payload = await fetchJson("/fish-classifications");
        await saveOfflineResource(
          "fish_classifications",
          normalizeListPayload(payload, ["classifications"])
        );
      });

      await saveStep(async () => {
        const payload = await fetchJson("/fees");
        await saveOfflineResource("fees", normalizeListPayload(payload, ["fees"]));
      });

      await saveStep(async () => {
        const payload = await fetchJson("/vehicle-types");
        await saveOfflineResource("vehicle_types", normalizeListPayload(payload));
      });

      await saveStep(async () => {
        const payload = await fetchJson("/annual-vehicle-tickets");
        await saveOfflineResource(
          "annual_vehicle_tickets",
          normalizeListPayload(payload, ["tickets"])
        );
      });

      await saveStep(async () => {
        const [dockingPayload, banyeraPayload, ticketsPayload, remittancePayload] = await Promise.all([
          fetchJson("/dockings?all=true"),
          fetchJson("/banyera-transactions?all=true&include_voided=true"),
          fetchJson("/vehicle-tickets?all=true"),
          fetchJson("/remittances?all=true"),
        ]);
        const currentUserId = authSession?.user?.user_id;
        const historySnapshot = {
          docking: normalizeHistoryPayload(dockingPayload, ["dockings"]).filter((record: any) =>
            isOwnedByCurrentUser(record, currentUserId)
          ),
          banyera: normalizeHistoryPayload(banyeraPayload, ["transactions", "banyeraTransactions"]).filter((record: any) =>
            isOwnedByCurrentUser(record, currentUserId)
          ),
          tickets: normalizeHistoryPayload(ticketsPayload, ["tickets", "vehicleTickets"]).filter((record: any) =>
            isOwnedByCurrentUser(record, currentUserId)
          ),
          remittance: normalizeHistoryPayload(remittancePayload, ["remittances"]).filter((record: any) =>
            isOwnedByCurrentUser(record, currentUserId)
          ),
        };

        await saveOfflineResource("history", historySnapshot);
        await saveOfflineResource("home", buildTodayHomeData(historySnapshot));
      });

      await saveStep(async () => {
        const payload = await fetchJson("/notifications?all=1");
        await saveOfflineResource(
          "notifications",
          normalizeListPayload(payload, ["notifications"])
        );
      });

      await saveStep(async () => {
        await saveOfflineResource("user_session", authSession?.user ?? {});
      });

      if (isMounted) {
        setIsPreparingOfflineData(false);
      }
    }

    prepareOfflineResources();

    return () => {
      isMounted = false;
    };
  }, [authSession?.user?.user_id]);

  useEffect(() => {
    let isMounted = true;

    async function loadBoatsForOfflineUse() {
      const token = getAuthToken();
      if (!token) return;

      try {
        const response = await fetch(`${getApiBaseUrl()}/boats`, {
          headers: buildApiHeaders(token),
        });
        const payload = await response.json().catch(() => []);

        if (!response.ok || !isMounted) return;

        const boats = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.boats)
            ? payload.boats
            : Array.isArray(payload?.data)
              ? payload.data
              : [];

        await saveOfflineBoats(boats);
      } catch {
        // Offline boat cache is best-effort from Home.
      }
    }

    loadBoatsForOfflineUse();

    return () => {
      isMounted = false;
    };
  }, [authSession?.user?.user_id]);

  useEffect(() => {
    let isMounted = true;

    async function loadOverviewCounts() {
      if (isMounted) {
        setHomeData({ isLoading: true });
      }

      const token = getAuthToken();
      const currentUserId = authSession?.user?.user_id;
      const cachedHomeResource = await getOfflineResource<HomeOfflineData>("home");
      const cachedHomeData = cachedHomeResource?.data;

      if (cachedHomeData && isMounted) {
        const cachedHomeSnapshot = buildTodayHomeData({
          docking: Array.isArray(cachedHomeData.dockingRecords)
            ? filterRecordsByCurrentUser(cachedHomeData.dockingRecords, currentUserId)
            : [],
          banyera: Array.isArray(cachedHomeData.banyeraRecords)
            ? filterRecordsByCurrentUser(cachedHomeData.banyeraRecords, currentUserId)
            : [],
          tickets: Array.isArray(cachedHomeData.ticketRecords)
            ? filterRecordsByCurrentUser(cachedHomeData.ticketRecords, currentUserId)
            : [],
          remittance: Array.isArray(cachedHomeData.remittanceRecords)
            ? filterRecordsByCurrentUser(cachedHomeData.remittanceRecords, currentUserId)
            : [],
        });
        setHomeData({
          ...cachedHomeSnapshot,
          isLoading: true,
        });
      }

      const cachedHistoryResource = await getOfflineResource<{
        docking?: any[];
        banyera?: any[];
        tickets?: any[];
        remittance?: any[];
      }>("history");
      const cachedHistory = cachedHistoryResource?.data ?? {};
      const hasCachedHistory =
        (Array.isArray(cachedHistory.docking) && cachedHistory.docking.length > 0) ||
        (Array.isArray(cachedHistory.banyera) && cachedHistory.banyera.length > 0) ||
        (Array.isArray(cachedHistory.tickets) && cachedHistory.tickets.length > 0) ||
        (Array.isArray(cachedHistory.remittance) && cachedHistory.remittance.length > 0);

      if (hasCachedHistory && isMounted) {
        const historyHomeData = buildTodayHomeData({
          docking: Array.isArray(cachedHistory.docking)
            ? filterRecordsByCurrentUser(cachedHistory.docking, currentUserId)
            : [],
          banyera: Array.isArray(cachedHistory.banyera)
            ? filterRecordsByCurrentUser(cachedHistory.banyera, currentUserId)
            : [],
          tickets: Array.isArray(cachedHistory.tickets)
            ? filterRecordsByCurrentUser(cachedHistory.tickets, currentUserId)
            : [],
          remittance: Array.isArray(cachedHistory.remittance)
            ? filterRecordsByCurrentUser(cachedHistory.remittance, currentUserId)
            : [],
        });
        setHomeData({
          ...historyHomeData,
          isLoading: true,
        });
        await saveOfflineResource("home", historyHomeData);
      }

      if (!token || !currentUserId) {
        if (isMounted) {
          setHomeData({
            overviewCounts: { banyera: 0, docking: 0, tickets: 0, remittance: 0 },
            banyeraRecords: [],
            dockingRecords: [],
            ticketRecords: [],
            remittanceRecords: [],
            isLoading: false,
            hasLoadedOverview: true,
          });
        }
        return;
      }

      const loadLocalOverview = async () => {
        let localDocking = Array.isArray(cachedHistory.docking)
          ? filterRecordsByCurrentUser(cachedHistory.docking, currentUserId)
          : [];
        let localBanyera = Array.isArray(cachedHistory.banyera)
          ? filterRecordsByCurrentUser(cachedHistory.banyera, currentUserId)
          : [];
        let localTickets = Array.isArray(cachedHistory.tickets)
          ? filterRecordsByCurrentUser(cachedHistory.tickets, currentUserId)
          : [];
        let localRemittance = Array.isArray(cachedHistory.remittance)
          ? filterRecordsByCurrentUser(cachedHistory.remittance, currentUserId)
          : [];
        const storedDrafts = await getOfflineTransactionDrafts();
        const syncedLocalIds = new Set(syncedTransactions.map((transaction) => transaction.local_id));
        const draftIds = new Set(storedDrafts.map((draft) => draft.local_id));
        const liveDrafts = queuedDrafts.filter((draft) => !draftIds.has(draft.local_id));
        const allDrafts = [...liveDrafts, ...storedDrafts];

        syncedTransactions.forEach((transaction) => {
          const data = unwrapSyncedTransactionData(transaction.data);

          if (transaction.type === "docking" && isOwnedByCurrentUser(data, currentUserId)) {
            localDocking = upsertTransaction(localDocking, "docking", data);
          }

          if (transaction.type === "banyera" && isOwnedByCurrentUser(data, currentUserId)) {
            localBanyera = upsertTransaction(localBanyera, "banyera", data);
          }

          if (transaction.type === "tickets" && isOwnedByCurrentUser(data, currentUserId)) {
            localTickets = upsertTransaction(localTickets, "tickets", data);
          }

          if (transaction.type === "remittance" && isOwnedByCurrentUser(data, currentUserId)) {
            localRemittance = upsertTransaction(localRemittance, "remittance", data);
          }
        });

        allDrafts.filter((draft) => !syncedLocalIds.has(draft.local_id)).forEach((draft) => {
          const draftRecord = createDraftHomeRecord(draft);

          if (draft.type === "docking") {
            localDocking = upsertTransaction(localDocking, "docking", draftRecord);
          }

          if (draft.type === "banyera") {
            localBanyera = upsertTransaction(localBanyera, "banyera", draftRecord);
          }

          if (draft.type === "tickets") {
            localTickets = upsertTransaction(localTickets, "tickets", draftRecord);
          }

          if (draft.type === "remittance") {
            localRemittance = upsertTransaction(localRemittance, "remittance", draftRecord);
          }
        });

        return buildTodayHomeData({
          docking: localDocking,
          banyera: localBanyera,
          tickets: localTickets,
          remittance: localRemittance,
        });
      };

      const localHomeData = await loadLocalOverview();
      if (!isMounted) {
        return;
      }
      setHomeData({
        ...localHomeData,
        isLoading: true,
      });
      await saveOfflineResource("home", localHomeData);

      const networkState = await NetInfo.fetch().catch(() => null);
      if (isOfflineNetworkState(networkState)) {
        if (isMounted) {
          setHomeData({ isLoading: false, hasLoadedOverview: true });
        }
        return;
      }

      const fetchTransactionList = async (
        path: string,
        keys: string[] = [],
        fallback: any[] = []
      ) => {
        try {
          const response = await fetch(`${getApiBaseUrl()}${path}`, {
            headers: buildApiHeaders(token),
          });

          if (response.status === 401) {
            throw new Error("Unauthenticated.");
          }

          if (response.status === 204 || response.status === 404 || response.status === 403) {
            return fallback;
          }

          if (!response.ok) {
            return fallback;
          }

          const payload = await response.json().catch(() => []);
          return normalizeHistoryPayload(payload, keys);
        } catch (error) {
          if (String((error as Error)?.message || "") === "Unauthenticated.") {
            throw error;
          }

          return fallback;
        }
      };

      try {
        const [dockingPayload, banyeraPayload, ticketsPayload, remittancePayload] = await Promise.all([
          fetchTransactionList("/dockings", ["dockings"], localHomeData.dockingRecords),
          fetchTransactionList(
            "/banyera-transactions?include_voided=true",
            ["transactions", "banyeraTransactions"],
            localHomeData.banyeraRecords
          ),
          fetchTransactionList("/vehicle-tickets", ["tickets", "vehicleTickets"], localHomeData.ticketRecords),
          fetchTransactionList("/remittances?all=true", ["remittances"], localHomeData.remittanceRecords),
        ]);

        if (!isMounted) {
          return;
        }

        const dockingRecords = filterRecordsByCurrentUser(dockingPayload, currentUserId);
        const filteredBanyeraRecords = filterRecordsByCurrentUser(banyeraPayload, currentUserId);
        const ticketRecords = filterRecordsByCurrentUser(ticketsPayload, currentUserId);
        const remittanceRecords = filterRecordsByCurrentUser(remittancePayload, currentUserId);
        const nextHomeData = buildTodayHomeData({
          docking: dockingRecords,
          banyera: filteredBanyeraRecords,
          tickets: ticketRecords,
          remittance: remittanceRecords,
        });

        setHomeData({
          ...nextHomeData,
          isLoading: false,
          hasLoadedOverview: true,
        });
        await saveOfflineResource("home", nextHomeData);
      } catch {
        if (isMounted) {
          const latestNetworkState = await NetInfo.fetch().catch(() => null);
          if (!isOfflineNetworkState(latestNetworkState)) {
            showToast("error", "Unable to refresh today's overview.");
          }
          setHomeData({
            ...localHomeData,
            isLoading: false,
            hasLoadedOverview: true,
          });
        }
      }
    }

    loadOverviewCounts();

    return () => {
      isMounted = false;
    };
  }, [authSession?.user?.user_id, queuedDrafts, refreshKey, showToast, setHomeData, syncedTransactions]);

  const banyeraCards = banyeraRecords.map((record) => {
    const itemCount = Array.isArray(record?.items) ? record.items.length : 0;
    const itemLabel = itemCount > 0 ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : "No items";
    const boatName = record?.boat?.boat_name || record?.boat_name || "Unknown Boat";
    const transactionDate = record?.transaction_date || record?.created_at || record?.docking_date || null;
    const subtitle = `${itemLabel} • ${formatBanyeraDate(transactionDate)} • ${formatBanyeraTime(transactionDate)}`;
    const totalFee = parseMoneyValue(record?.total_fee);

    return {
      id: `banyera-${record?.banyera_id || record?.id || record?.transaction_id || Math.random()}`,
      detailId: record?.banyera_id || record?.id || record?.transaction_id,
      type: "banyera" as const,
      title: boatName,
      subtitle,
      value: `₱${totalFee.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      tint: "rgba(37,99,235,0.08)",
      color: "#2563EB",
      icon: "clipboard-outline" as const,
      data: record,
    };
  });

  const dockingCards = dockingRecords.map((record) => {
    const boatName = record?.boat?.boat_name || record?.boat_name || "Unknown Boat";
    const transactionDate = record?.docking_date || record?.created_at || null;
    const subtitle = `${formatBanyeraDate(transactionDate)} • ${formatBanyeraTime(transactionDate)}`;
    const totalFee = parseMoneyValue(record?.docking_fee);

    return {
      id: `docking-${record?.docking_id || record?.id || record?.transaction_id || Math.random()}`,
      detailId: record?.docking_id || record?.id || record?.transaction_id,
      type: "docking" as const,
      title: boatName,
      subtitle,
      value: `₱${totalFee.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      tint: "rgba(37,99,235,0.08)",
      color: "#2563EB",
      icon: "boat-outline" as const,
      data: record,
    };
  });

  const ticketCards = ticketRecords.map((record) => {
    const title = record?.plate_number || record?.vehicle_type?.type_name || record?.vehicleType?.type_name || "Ticket";
    const transactionDate = record?.transaction_date || record?.ticket_date || record?.created_at || null;
    const subtitle = `${formatBanyeraDate(transactionDate)} • ${formatBanyeraTime(transactionDate)}`;
    const totalFee = parseMoneyValue(record?.total_fee || record?.ticket_fee);

    return {
      id: `ticket-${record?.ticket_id || record?.id || record?.transaction_id || Math.random()}`,
      detailId: record?.ticket_id || record?.id || record?.transaction_id,
      type: "tickets" as const,
      title,
      subtitle,
      value: `₱${totalFee.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      tint: "rgba(37,99,235,0.08)",
      color: "#2563EB",
      icon: "ticket-outline" as const,
      data: record,
    };
  });

  const remittanceCards = remittanceRecords.map((record) => {
    const title = record?.remittance_reference_no || "-";
    const transactionDate = record?.date || record?.created_at || null;
    const subtitle = formatBanyeraDate(transactionDate);
    const amount = parseMoneyValue(record?.amount);

    return {
      id: `remittance-${record?.remittance_id || record?.id || record?.local_id || Math.random()}`,
      detailId: record?.remittance_id || record?.id || record?.local_id,
      type: "remittance" as const,
      title,
      subtitle,
      value: `₱${amount.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      tint: "rgba(37,99,235,0.08)",
      color: "#2563EB",
      icon: "cash-outline" as const,
      data: record,
    };
  });

  return (
    <View className="flex-1 bg-[#FFFDFB]">
      <StatusBar barStyle="light-content" backgroundColor="#1A1F36" />

      <SafeAreaView
        className="overflow-hidden rounded-b-[20px] bg-[#1A1F36]"
        edges={["top"]}
        style={{ zIndex: 10, elevation: 10 }}
      >
        <View
          className="flex-row items-center justify-between overflow-hidden bg-[#1A1F36] px-5 py-3"
        >
          <View className="flex-1 flex-row items-center pr-4">
            <Image
              source={require("../../../assets/images/opol_fish_port.png")}
              style={{ width: 42, height: 42 }}
              resizeMode="contain"
            />
            <Text
              className="ml-1.5 text-[18px] text-white"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              Opol Fish <Text style={{ color: "#2563EB" }}>Port</Text>
            </Text>
          </View>
          <View className="flex-row items-center">
            <Pressable
              hitSlop={10}
              onPress={() => setOfflineStatusVisible(true)}
              className={`flex-row items-center rounded-full px-3 py-2 ${
                offlineReadyPercent >= 100 ? "bg-[#DBEAFE]" : "bg-white/10"
              }`}
            >
              <Ionicons
                name={
                  offlineReadyPercent >= 100
                    ? "checkmark-circle"
                    : isPreparingOfflineData
                      ? "cloud-download-outline"
                      : "alert-circle-outline"
                }
                size={15}
                color={offlineReadyPercent >= 100 ? "#2563EB" : "#FFFFFF"}
              />
              <Text
                className={`ml-1.5 text-[11px] ${
                  offlineReadyPercent >= 100 ? "text-[#2563EB]" : "text-white"
                }`}
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Offline {offlineReadyPercent}%
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <NativeModal
        visible={offlineStatusVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOfflineStatusVisible(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/35 px-5">
          <View className="w-full max-w-[340px] rounded-[14px] border border-[#E8E1E6] bg-white">
            <View className="flex-row items-center justify-between border-b border-[#F2ECEF] px-4 py-3">
              <View className="flex-1 pr-3">
                <Text
                  className="text-[15px] text-[#1A1F36]"
                  style={{ fontFamily: "Montserrat_600SemiBold" }}
                >
                  Offline {offlineReadyPercent}%
                </Text>
                <Text
                  className="text-[11px] text-[#6F6F82]"
                  style={{ fontFamily: "Montserrat_400Regular" }}
                >
                  Updated in {formatOfflineUpdatedAt(offlineLastUpdated)}
                </Text>
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => setOfflineStatusVisible(false)}
              >
                <Ionicons name="close" size={20} color="#6F6F82" />
              </Pressable>
            </View>

            <View className="px-4 py-2">
              {offlineEntries.map((entry) => (
                <View
                  key={entry.key}
                  className="flex-row items-center justify-between border-b border-[#F8F1F4] py-3 last:border-b-0"
                >
                  <Text
                    className="text-[13px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  >
                    {entry.label}
                  </Text>
                  <View
                    className={`flex-row items-center rounded-full px-2 py-1 ${
                      entry.isReady ? "bg-[#DCFCE7]" : "bg-[#FEF3C7]"
                    }`}
                  >
                    <Ionicons
                      name={entry.isReady ? "checkmark-circle" : "time-outline"}
                      size={12}
                      color={entry.isReady ? "#16A34A" : "#D97706"}
                    />
                    <Text
                      className={`ml-1 text-[10px] ${
                        entry.isReady ? "text-[#16A34A]" : "text-[#D97706]"
                      }`}
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      {entry.isReady ? "Ready" : "Missing"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </NativeModal>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        style={{ marginTop: -18 }}
      >
        <View className="bg-[#1A1F36]">
          <ImageBackground
            source={require("../../../assets/images/port1.png")}
            resizeMode="cover"
            className="h-[210px] overflow-hidden"
          >
            <View
              className="absolute inset-0"
              style={{ backgroundColor: "rgba(26, 31, 54, 0.72)" }}
            />
            <View className="px-5 pt-12">
              <Text
                className="text-[13px] text-white/75"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                {greeting}
              </Text>
              <Text
                className="mt-0.7 text-[18px] text-white"
                numberOfLines={1}
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                {identity}
              </Text>
            </View>
          </ImageBackground>
        </View>

        <View className="-mt-8 flex-1 rounded-t-[20px] bg-[#FFFDFB]">
          <View
            style={{ paddingHorizontal: 20, paddingTop: 0, paddingBottom: 28 }}
          >
            <View
              className="-mt-[69px] self-stretch overflow-hidden rounded-[18px] border border-[#E8E1E6] bg-white"
              style={{ elevation: 8, zIndex: 20 }}
            >
              <View className="flex-row items-center justify-between px-5 pt-5 pb-4">
                <Text
                  className="text-[13px] uppercase tracking-[1.4px] text-[#6B7280]"
                  style={{ fontFamily: "Montserrat_600SemiBold" }}
                >
                  {"Today's Overview"}
                </Text>
                <Pressable onPress={() => router.push("/history")} hitSlop={10}>
                  <Ionicons name="arrow-forward" size={16} color="#8A94A3" />
                </Pressable>
              </View>

              <View style={{ height: 1, backgroundColor: "#E8E1E6" }} />

              <View style={{ flexDirection: "row", height: 130 }}>
                {shouldShowHomeSkeleton ? (
                  <OverviewMetricSkeleton />
                ) : (
                  <View
                    style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: "rgba(37,99,235,0.08)",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Ionicons name="boat-outline" size={18} color="#2563EB" />
                    </View>
                    <Text
                      style={{
                        fontFamily: "Montserrat_400Regular",
                        fontSize: 12,
                        color: "#8A94A3",
                      }}
                    >
                      Docking
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Montserrat_600SemiBold",
                        fontSize: 22,
                        color: "#1A1F36",
                        marginTop: 4,
                      }}
                    >
                      {overviewCounts.docking}
                    </Text>
                  </View>
                )}

                <View style={{ width: 1, backgroundColor: "#E8E1E6" }} />

                {shouldShowHomeSkeleton ? (
                  <OverviewMetricSkeleton />
                ) : (
                  <View
                    style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: "rgba(37,99,235,0.08)",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Ionicons name="clipboard-outline" size={18} color="#2563EB" />
                    </View>
                    <Text
                      style={{
                        fontFamily: "Montserrat_400Regular",
                        fontSize: 12,
                        color: "#8A94A3",
                      }}
                    >
                      Banyera
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Montserrat_600SemiBold",
                        fontSize: 22,
                        color: "#1A1F36",
                        marginTop: 4,
                      }}
                    >
                      {overviewCounts.banyera}
                    </Text>
                  </View>
                )}

                <View style={{ width: 1, backgroundColor: "#E8E1E6" }} />

                {shouldShowHomeSkeleton ? (
                  <OverviewMetricSkeleton />
                ) : (
                  <View
                    style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: "rgba(37,99,235,0.08)",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Ionicons name="ticket-outline" size={18} color="#2563EB" />
                    </View>
                    <Text
                      style={{
                        fontFamily: "Montserrat_400Regular",
                        fontSize: 12,
                        color: "#8A94A3",
                      }}
                    >
                      Tickets
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Montserrat_600SemiBold",
                        fontSize: 22,
                        color: "#1A1F36",
                        marginTop: 4,
                      }}
                    >
                      {overviewCounts.tickets}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {[
              { title: "Docking", cards: dockingCards, tab: "docking" },
              { title: "Banyera", cards: banyeraCards, tab: "banyera" },
              { title: "Tickets", cards: ticketCards, tab: "tickets" },
              { title: "Remittance", cards: remittanceCards, tab: "remittance" },
            ].map((section, sectionIndex) => (
              <View
                key={section.title}
                className={sectionIndex ? "mt-6" : "mt-6"}
              >
                <View className="mb-3 flex-row items-center justify-between">
                  <Text
                    className="text-[16px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    {section.title}
                  </Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      router.push(`/history?tab=${section.tab}`);
                    }}
                  >
                    <Ionicons name="arrow-forward" size={16} color="#8A94A3" />
                  </Pressable>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="-ml-2 -mt-2"
                  contentContainerStyle={{
                    paddingBottom: 10,
                    paddingLeft: 8,
                    paddingRight: 4,
                    paddingTop: 8,
                  }}
                >
                  {shouldShowHomeSkeleton ? (
                    <HomeSectionSkeletonCard />
                  ) : Array.isArray(section.cards) && section.cards.length > 0 ? (
                    section.cards.map((card, index) => (
                      <Pressable
                        key={card.id}
                        onPress={() => {
                          cacheTransactionDetail(card.type, card.detailId, card.data);
                          router.push({
                            pathname: "/(tabs)/home/[id]",
                            params: { id: String(card.detailId), type: card.type },
                          });
                        }}
                        className={`mr-3 w-[250px] rounded-[18px] border border-[#E8E1E6] bg-white px-4 py-4 ${
                          index === section.cards.length - 1 ? "mr-0" : ""
                        }`}
                        style={{
                          backgroundColor: "#FFFFFF",
                          boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.06)",
                          elevation: 3,
                        }}
                      >
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 pr-3">
                            <Text
                              className="text-[14px] text-[#1A1F36]"
                              style={{ fontFamily: "Montserrat_600SemiBold" }}
                            >
                              {card.title}
                            </Text>
                            <Text
                              className="mt-1 text-[12px] text-[#8A94A3]"
                              style={{ fontFamily: "Montserrat_400Regular" }}
                            >
                              {card.subtitle}
                            </Text>
                          </View>
                          <View
                            className="h-11 w-11 items-center justify-center rounded-[14px]"
                            style={{ backgroundColor: card.tint }}
                          >
                            <Ionicons
                              name={card.icon}
                              size={20}
                              color={card.color}
                            />
                          </View>
                        </View>
                        <Text
                          className="mt-4 text-[24px]"
                          style={{
                            fontFamily: "Montserrat_700Bold",
                            color: card.color,
                          }}
                        >
                          {card.value}
                        </Text>
                      </Pressable>
                    ))
                  ) : (
                    <View
                      key={`empty-${section.tab}`}
                      className="mr-3 w-[250px] rounded-[18px] border border-[#E8E1E6] bg-white px-4 py-4 items-start justify-center"
                      style={{
                        backgroundColor: "#FFFFFF",
                        boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.06)",
                        elevation: 3,
                      }}
                    >
                      <View className="flex-row items-start justify-between w-full">
                        <View className="flex-1 pr-3">
                          <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                            {section.tab === "docking"
                              ? "No Docking Yet"
                              : section.tab === "banyera"
                                ? "No Banyera Yet"
                                : section.tab === "tickets"
                                  ? "No Tickets Issued Yet"
                                  : "No Remittance Yet"}
                          </Text>
                          <Text className="mt-1 text-[12px] text-[#8A94A3]" style={{ fontFamily: "Montserrat_400Regular" }}>
                            {section.tab === "docking"
                              ? "Looks like no boats have docked today."
                              : section.tab === "banyera"
                                ? "No banyera have been recorded today."
                                : section.tab === "tickets"
                                  ? "No tickets have been issued today."
                                  : "No remittance has been submitted today."}
                          </Text>
                        </View>
                        <View className="h-11 w-11 items-center justify-center rounded-[14px]" style={{ backgroundColor: "rgba(37,99,235,0.08)" }}>
                          <Ionicons name={section.tab === "banyera" ? "clipboard-outline" : section.tab === "docking" ? "boat-outline" : section.tab === "tickets" ? "ticket-outline" : "cash-outline"} size={20} color="#2563EB" />
                        </View>
                      </View>
                      <Text className="mt-4 text-[24px] self-start" style={{ fontFamily: "Montserrat_700Bold", color: "#2563EB" }}>
                        ₱0.00
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
