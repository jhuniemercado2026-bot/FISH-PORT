import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { Pressable, ScrollView, StatusBar, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import { getAuthSession, getAuthToken } from "../../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../../api/axios";
import { useToastStore } from "../../../store/toastStore";
import { useHistoryStore } from "../../../store/historyStore";
import type { SyncedHistoryTransaction } from "../../../store/historyStore";
import OptionModal, { HistoryStatusFilter } from "../../../components/OptionModal";
import { getOfflineResource, saveOfflineResource } from "../../../utils/offlineMasterData";
import {
  getOfflineTransactionDrafts,
} from "../../../utils/offlineTransactionQueue";
import type { OfflineTransactionDraft } from "../../../utils/offlineTransactionQueue";

type TransactionType = "all" | "docking" | "banyera" | "tickets" | "remittance";
type TransactionCardType = Exclude<TransactionType, "all">;
type HistoryCacheData = {
  docking: any[];
  banyera: any[];
  tickets: any[];
  remittance: any[];
};

const parseMoneyValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const tabs: {
  key: TransactionType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "all", label: "All", icon: "apps-outline" },
  { key: "docking", label: "Docking", icon: "boat-outline" },
  { key: "banyera", label: "Banyera", icon: "clipboard-outline" },
  { key: "tickets", label: "Tickets", icon: "ticket-outline" },
  { key: "remittance", label: "Remittance", icon: "cash-outline" },
];

const parseIsoDateTime = (value?: string | null) => {
  if (!value) return null;

  const trimmedValue = String(value).trim();
  const hasTimezone = /(Z|[+-]\d{2}:\d{2})$/i.test(trimmedValue);

  if (hasTimezone) {
    const normalizedValue = trimmedValue.replace(/\.(\d{3})\d+/, ".$1");
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

  const match = trimmedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/
  );

  if (!match) {
    const fallbackDate = Date.parse(trimmedValue);
    if (Number.isNaN(fallbackDate)) return null;

    const parsedDate = new Date(fallbackDate);
    return {
      year: parsedDate.getFullYear(),
      month: parsedDate.getMonth() + 1,
      day: parsedDate.getDate(),
      hour: parsedDate.getHours(),
      minute: parsedDate.getMinutes(),
      second: parsedDate.getSeconds(),
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

const formatPhilippineDate = (value?: string | null) => {
  const parsed = parseIsoDateTime(value);
  if (!parsed) return "N/A";
  const monthName = new Intl.DateTimeFormat("en-PH", { month: "long" }).format(
    new Date(parsed.year, parsed.month - 1, 1)
  );
  return `${monthName} ${parsed.day}, ${parsed.year}`;
};

const formatPhilippineTime = (value?: string | null) => {
  const parsed = parseIsoDateTime(value);
  if (!parsed) return "N/A";
  const hour = parsed.hour % 12 === 0 ? 12 : parsed.hour % 12;
  const minute = String(parsed.minute).padStart(2, "0");
  const meridiem = parsed.hour >= 12 ? "PM" : "AM";
  return `${hour}:${minute} ${meridiem}`;
};

const getTransactionSortValue = (value?: string | null) => {
  const parsed = parseIsoDateTime(value);
  if (!parsed) {
    const fallbackDate = Date.parse(String(value ?? ""));
    return Number.isNaN(fallbackDate) ? 0 : fallbackDate;
  }

  return (
    parsed.year * 1e10 +
    parsed.month * 1e8 +
    parsed.day * 1e6 +
    parsed.hour * 1e4 +
    parsed.minute * 1e2 +
    parsed.second
  );
};

const getTransactionDateValue = (record: any, type: TransactionCardType) => {
  if (record?.__isDraft) {
    return record?.created_at;
  }

  switch (type) {
    case "docking":
      return record?.created_at || record?.updated_at || record?.docking_date || record?.transaction_date || record?.ticket_date;
    case "banyera":
      return record?.created_at || record?.updated_at || record?.transaction_date || record?.docking_date || record?.ticket_date;
    case "tickets":
      return record?.created_at || record?.updated_at || record?.transaction_date || record?.ticket_date || record?.docking_date;
    case "remittance":
      return record?.created_at || record?.updated_at || record?.date;
  }
};

function isOfflineNetworkState(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
} | null) {
  return Boolean(
    state &&
      (state.isConnected === false || state.isInternetReachable === false)
  );
}

const cardShadowStyle = {
  boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.06)",
  elevation: 3,
};

const unwrapSyncedTransactionData = (data: Record<string, any>) => {
  if (data?.data && !Array.isArray(data.data)) return data.data;
  if (data?.transaction && !Array.isArray(data.transaction)) return data.transaction;
  if (data?.ticket && !Array.isArray(data.ticket)) return data.ticket;
  if (data?.docking && !Array.isArray(data.docking)) return data.docking;
  if (data?.banyera && !Array.isArray(data.banyera)) return data.banyera;
  if (data?.remittance && !Array.isArray(data.remittance)) return data.remittance;

  return data;
};

const transactionIdForType = (type: TransactionCardType, data: any) => {
  if (type === "docking") return data?.docking_id ?? data?.id;
  if (type === "banyera") return data?.banyera_id ?? data?.id;
  if (type === "remittance") return data?.remittance_id ?? data?.id;
  return data?.ticket_id ?? data?.id;
};

const upsertTransaction = (items: any[], type: TransactionCardType, nextItem: any) => {
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

  return ownerCandidates.some((value) => value !== undefined && value !== null && String(value) === currentUserIdString);
};

const filterRecordsByCurrentUser = (records: any[], currentUserId?: number | string | null) =>
  records.filter((record: any) => isOwnedByCurrentUser(record, currentUserId));

const normalizeTransactionListPayload = (payload: any, keys: string[] = []) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  return [];
};

const mergeSyncedTransactionsIntoHistory = (
  history: HistoryCacheData,
  syncedTransactions: SyncedHistoryTransaction[],
  currentUserId?: number | string | null
) =>
  syncedTransactions.reduce<HistoryCacheData>((nextHistory, transaction) => {
    const data = unwrapSyncedTransactionData(transaction.data);

    if (transaction.type === "docking" && isOwnedByCurrentUser(data, currentUserId)) {
      return {
        ...nextHistory,
        docking: upsertTransaction(nextHistory.docking, "docking", data),
      };
    }

    if (transaction.type === "banyera" && isOwnedByCurrentUser(data, currentUserId)) {
      return {
        ...nextHistory,
        banyera: upsertTransaction(nextHistory.banyera, "banyera", data),
      };
    }

    if (transaction.type === "tickets" && isOwnedByCurrentUser(data, currentUserId)) {
      return {
        ...nextHistory,
        tickets: upsertTransaction(nextHistory.tickets, "tickets", data),
      };
    }

    if (transaction.type === "remittance" && isOwnedByCurrentUser(data, currentUserId)) {
      return {
        ...nextHistory,
        remittance: upsertTransaction(nextHistory.remittance, "remittance", data),
      };
    }

    return nextHistory;
  }, history);

const createDraftCardData = (draft: OfflineTransactionDraft) => {
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
    const totalFee = items.reduce(
      (sum, item) => sum + parseMoneyValue(item?.subtotal),
      0
    );

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
      date: payload.date ?? draft.created_at,
      amount: payload.amount ?? 0,
      surplus: payload.surplus ?? 0,
      deficit: payload.deficit ?? 0,
      remarks: payload.remarks ?? null,
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

const getTransactionStatus = (data: any) => {
  if (data?.__isDraft) {
    return {
      label: "Draft",
      icon: "time-outline" as keyof typeof Ionicons.glyphMap,
      backgroundColor: "#FEF3C7",
      textColor: "#D97706",
      iconColor: "#D97706",
    };
  }

  if (data?.is_voided || data?.voided_at || String(data?.status ?? "").toLowerCase() === "voided") {
    return {
      label: "Voided",
      icon: "close-circle" as keyof typeof Ionicons.glyphMap,
      backgroundColor: "#FEF3C7",
      textColor: "#F59E0B",
      iconColor: "#F59E0B",
    };
  }

  if (String(data?.status ?? "").toLowerCase() === "pending") {
    return {
      label: "Unchecked",
      icon: "time-outline" as keyof typeof Ionicons.glyphMap,
      backgroundColor: "#FEF3C7",
      textColor: "#D97706",
      iconColor: "#D97706",
    };
  }

  if (String(data?.status ?? "").toLowerCase() === "remitted") {
    return {
      label: "Checked",
      icon: "checkmark-circle" as keyof typeof Ionicons.glyphMap,
      backgroundColor: "#DCFCE7",
      textColor: "#22C55E",
      iconColor: "#22C55E",
    };
  }

  return {
    label: "Active",
    icon: "checkmark-circle" as keyof typeof Ionicons.glyphMap,
    backgroundColor: "#DCFCE7",
    textColor: "#22C55E",
    iconColor: "#22C55E",
  };
};

function StatusPill({ data }: { data: any }) {
  const status = getTransactionStatus(data);

  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-1"
      style={{ backgroundColor: status.backgroundColor }}
    >
      <Ionicons name={status.icon} size={12} color={status.iconColor} />
      <Text
        className="text-[10px]"
        style={{
          color: status.textColor,
          fontFamily: "Montserrat_400Regular",
        }}
      >
        {status.label}
      </Text>
    </View>
  );
}

function HistorySkeletonCard() {
  return (
    <View
      className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-white p-4"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="h-4 w-3/5 rounded-full bg-[#ECEFF3]" />
          <View className="mt-2 h-3 w-2/5 rounded-full bg-[#F2F4F7]" />
        </View>
        <View className="items-end">
          <View className="h-4 w-16 rounded-full bg-[#ECEFF3]" />
        </View>
      </View>
      <View className="mt-3 flex-row items-center justify-between gap-3">
        <View className="h-3 flex-1 rounded-full bg-[#F2F4F7]" />
        <View className="h-6 w-20 rounded-full bg-[#EAF7EF]" />
      </View>
    </View>
  );
}

function HistorySkeletonCards() {
  return (
    <View>
      {Array.from({ length: 5 }).map((_, index) => (
        <HistorySkeletonCard key={`history-skeleton-${index}`} />
      ))}
    </View>
  );
}

function TransactionCard({
  type,
  data,
  onPress,
}: {
  type: TransactionCardType;
  data: any;
  onPress?: () => void;
}) {
  if (type === "docking") {
    const boatName = data.boat?.boat_name || "Unknown Boat";
    const date = formatPhilippineDate(data.docking_date);
    const time = formatPhilippineTime(data.docking_date);
    const dockingFee = parseMoneyValue(data.docking_fee);
    const fee = dockingFee > 0
      ? `₱${dockingFee.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "₱0.00";
    return (
      <Pressable
        onPress={onPress}
        className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-white p-4"
        style={cardShadowStyle}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text
              className="text-[14px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {boatName}
            </Text>
          </View>
          <View className="items-end">
            <Text
              className="text-[14px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {fee}
            </Text>
          </View>
        </View>
        <View className="mt-2 flex-row items-center justify-between gap-3">
          <Text
            className="flex-1 text-[12px] text-[#6F6F82]"
            style={{ fontFamily: "Montserrat_400Regular" }}
            numberOfLines={1}
          >
            {date} • {time}
          </Text>
          <StatusPill data={data} />
        </View>
      </Pressable>
    );
  }

  if (type === "banyera") {
    const boatName = data.boat?.boat_name || "Unknown Boat";
    const date = formatPhilippineDate(data.transaction_date);
    const time = formatPhilippineTime(data.transaction_date);
    const itemCount = data.items?.length || 0;
    const banyeraFee = parseMoneyValue(data.total_fee);
    const fee = banyeraFee > 0
      ? `₱${banyeraFee.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "₱0.00";
    return (
      <Pressable
        onPress={onPress}
        className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-white p-4"
        style={cardShadowStyle}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text
              className="text-[14px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {boatName}
            </Text>
          </View>
          <View className="items-end">
            <Text
              className="text-[14px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {fee}
            </Text>
          </View>
        </View>
        <View className="mt-2 flex-row items-center justify-between gap-3">
          <Text
            className="flex-1 text-[12px] text-[#6F6F82]"
            style={{ fontFamily: "Montserrat_400Regular" }}
            numberOfLines={1}
          >
            {itemCount} item{itemCount !== 1 ? "s" : ""} • {date} • {time}
          </Text>
          <StatusPill data={data} />
        </View>
      </Pressable>
    );
  }

  if (type === "tickets") {
    const plateNumber = String(data.plate_number || "").trim();
    const vehicleType =
      data.vehicle_type?.type_name ||
      data.vehicleType?.type_name ||
      data.vehicle_type_name ||
      data.vehicleType?.vehicle_type_name ||
      "Vehicle";
    const ticketType = String(data.ticket_type || "").toLowerCase();
    const isAnnualTicket = ticketType === "annual";
    const ticketTitle = isAnnualTicket && plateNumber ? plateNumber : vehicleType;
    const transactionDate = data.transaction_date || data.ticket_date || data.created_at || data.docking_date;
    const date = formatPhilippineDate(transactionDate);
    const time = formatPhilippineTime(transactionDate);
    const ticketSubtitle = isAnnualTicket
      ? `${vehicleType} • ${date} • ${time}`
      : `${date} • ${time}`;
    const ticketFee = parseMoneyValue(data.total_fee) > 0
      ? parseMoneyValue(data.total_fee)
      : parseMoneyValue(data.ticket_fee);
    const fee = ticketFee > 0
      ? `₱${ticketFee.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "₱0.00";
    return (
      <Pressable
        onPress={onPress}
        className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-white p-4"
        style={cardShadowStyle}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text
              className="text-[14px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {ticketTitle}
            </Text>
          </View>
          <View className="items-end">
            <Text
              className="text-[14px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {fee}
            </Text>
          </View>
        </View>
        <View className="mt-2 flex-row items-center justify-between gap-3">
          <Text
            className="flex-1 text-[12px] text-[#6F6F82]"
            style={{ fontFamily: "Montserrat_400Regular" }}
            numberOfLines={1}
          >
            {ticketSubtitle}
          </Text>
          <StatusPill data={data} />
        </View>
      </Pressable>
    );
  }

  if (type === "remittance") {
    const referenceNo = data.remittance_reference_no || "-";
    const date = formatPhilippineDate(data.date || data.created_at);
    const amount = parseMoneyValue(data.amount);

    return (
      <Pressable
        onPress={onPress}
        className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-white p-4"
        style={cardShadowStyle}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text
              className="text-[14px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {referenceNo}
            </Text>
          </View>
          <View className="items-end">
            <Text
              className="text-[14px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {`₱${amount.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
            </Text>
          </View>
        </View>
        <View className="mt-2 flex-row items-center justify-between gap-3">
          <Text
            className="flex-1 text-[12px] text-[#6F6F82]"
            style={{ fontFamily: "Montserrat_400Regular" }}
            numberOfLines={1}
          >
            {date}
          </Text>
          <StatusPill data={data} />
        </View>
      </Pressable>
    );
  }

  return null;
}

export default function HistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const authToken = getAuthToken();
  const showToast = useToastStore((state) => state.showToast);
  const refreshKey = useHistoryStore((state) => state.refreshKey);
  const syncedTransactions = useHistoryStore((state) => state.syncedTransactions);
  const queuedDrafts = useHistoryStore((state) => state.queuedDrafts);
  const cacheTransactionDetail = useHistoryStore((state) => state.cacheTransactionDetail);
  const handledSyncedIdsRef = useRef<Set<string>>(new Set());
  const handledQueuedDraftIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedTransactionsRef = useRef(false);
  const [selectedTab, setSelectedTab] = useState<TransactionType>(
    (params.tab === "docking" || params.tab === "banyera" || params.tab === "tickets" || params.tab === "remittance" ? params.tab : "all") as TransactionType
  );
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [optionModalVisible, setOptionModalVisible] = useState(false);
  const [dockingTransactions, setDockingTransactions] = useState<any[]>([]);
  const [banyeraTransactions, setBanyeraTransactions] = useState<any[]>([]);
  const [ticketTransactions, setTicketTransactions] = useState<any[]>([]);
  const [remittanceTransactions, setRemittanceTransactions] = useState<any[]>([]);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineTransactionDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedTransactions, setHasLoadedTransactions] = useState(false);
  const authSession = getAuthSession();
  const currentUserId = authSession?.user?.user_id;

  const navigateToDetails = (transaction: {
    type: TransactionCardType;
    id: number | string;
    data: any;
  }) => {
    const transactionId = transactionIdForType(transaction.type, transaction.data) ?? transaction.id;

    if (!transactionId) {
      showToast("error", "Transaction details are not available.");
      return;
    }

    cacheTransactionDetail(transaction.type, transactionId, transaction.data);

    router.push({
      pathname: "/(tabs)/history/[id]",
      params: {
        id: String(transactionId),
        type: transaction.type,
        draft: transaction.data?.__isDraft ? "true" : "false",
      },
    });
  };

  const loadOfflineDrafts = useCallback(async () => {
    const drafts = await getOfflineTransactionDrafts();
    setOfflineDrafts(drafts);
  }, []);

  const loadOfflineHistoryCache = useCallback(async () => {
    const resource = await getOfflineResource<{
      docking?: any[];
      banyera?: any[];
      tickets?: any[];
      remittance?: any[];
    }>("history");
    const cachedHistory = resource?.data ?? {};

    const cachedDocking = Array.isArray(cachedHistory.docking)
      ? filterRecordsByCurrentUser(cachedHistory.docking, currentUserId)
      : [];
    const cachedBanyera = Array.isArray(cachedHistory.banyera)
      ? filterRecordsByCurrentUser(cachedHistory.banyera, currentUserId)
      : [];
    const cachedTickets = Array.isArray(cachedHistory.tickets)
      ? filterRecordsByCurrentUser(cachedHistory.tickets, currentUserId)
      : [];
    const cachedRemittance = Array.isArray(cachedHistory.remittance)
      ? filterRecordsByCurrentUser(cachedHistory.remittance, currentUserId)
      : [];
    const nextHistory = mergeSyncedTransactionsIntoHistory(
      {
        docking: cachedDocking,
        banyera: cachedBanyera,
        tickets: cachedTickets,
        remittance: cachedRemittance,
      },
      syncedTransactions,
      currentUserId
    );

    setDockingTransactions(nextHistory.docking);
    setBanyeraTransactions(nextHistory.banyera);
    setTicketTransactions(nextHistory.tickets);
    setRemittanceTransactions(nextHistory.remittance);

    return nextHistory;
  }, [currentUserId, syncedTransactions]);

  useEffect(() => {
    const nextQueuedDrafts = queuedDrafts.filter((draft) => {
      return !handledQueuedDraftIdsRef.current.has(draft.local_id);
    });

    if (nextQueuedDrafts.length === 0) {
      return;
    }

    nextQueuedDrafts.forEach((draft) => {
      handledQueuedDraftIdsRef.current.add(draft.local_id);
    });

    setOfflineDrafts((current) => {
      const currentIds = new Set(current.map((draft) => draft.local_id));
      const draftsToAdd = nextQueuedDrafts.filter((draft) => !currentIds.has(draft.local_id));
      return [...draftsToAdd, ...current];
    });
  }, [queuedDrafts]);

  useEffect(() => {
    const nextSyncedTransactions = syncedTransactions.filter((transaction) => {
      const key = `${transaction.type}-${transaction.local_id}`;
      return !handledSyncedIdsRef.current.has(key);
    });

    if (nextSyncedTransactions.length === 0) {
      return;
    }

    nextSyncedTransactions.forEach((transaction) => {
      handledSyncedIdsRef.current.add(`${transaction.type}-${transaction.local_id}`);
    });

    setOfflineDrafts((current) =>
      current.filter(
        (draft) =>
          !nextSyncedTransactions.some(
            (transaction) => transaction.local_id === draft.local_id
          )
      )
    );

    nextSyncedTransactions.forEach((transaction) => {
      const data = unwrapSyncedTransactionData(transaction.data);

      if (transaction.type === "docking" && isOwnedByCurrentUser(data, currentUserId)) {
        setDockingTransactions((current) => upsertTransaction(current, "docking", data));
      }

      if (transaction.type === "banyera" && isOwnedByCurrentUser(data, currentUserId)) {
        setBanyeraTransactions((current) => upsertTransaction(current, "banyera", data));
      }

      if (transaction.type === "tickets" && isOwnedByCurrentUser(data, currentUserId)) {
        setTicketTransactions((current) => upsertTransaction(current, "tickets", data));
      }

      if (transaction.type === "remittance" && isOwnedByCurrentUser(data, currentUserId)) {
        setRemittanceTransactions((current) => upsertTransaction(current, "remittance", data));
      }
    });
  }, [currentUserId, syncedTransactions]);

  useEffect(() => {
    const nextTab =
      params.tab === "docking" || params.tab === "banyera" || params.tab === "tickets" || params.tab === "remittance"
        ? params.tab
        : "all";
    setSelectedTab(nextTab as TransactionType);
  }, [params.tab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText]);

  useFocusEffect(
    useCallback(() => {
      void loadOfflineDrafts();
    }, [loadOfflineDrafts])
  );

  const loadTransactions = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      await loadOfflineDrafts();
      const cachedHistory = await loadOfflineHistoryCache();
      const hasCachedHistory =
        cachedHistory.docking.length > 0 ||
        cachedHistory.banyera.length > 0 ||
        cachedHistory.tickets.length > 0 ||
        cachedHistory.remittance.length > 0;

      if (options.showLoading) {
        setIsLoading(!hasLoadedTransactionsRef.current && !hasCachedHistory);
      }

      const networkState = await NetInfo.fetch().catch(() => null);
      if (isOfflineNetworkState(networkState)) {
        setDockingTransactions(cachedHistory.docking);
        setBanyeraTransactions(cachedHistory.banyera);
        setTicketTransactions(cachedHistory.tickets);
        setRemittanceTransactions(cachedHistory.remittance);
        hasLoadedTransactionsRef.current = true;
        setHasLoadedTransactions(true);
        setIsLoading(false);
        return;
      }

      if (!authToken || !currentUserId) {
        setDockingTransactions(cachedHistory.docking);
        setBanyeraTransactions(cachedHistory.banyera);
        setTicketTransactions(cachedHistory.tickets);
        setRemittanceTransactions(cachedHistory.remittance);
        hasLoadedTransactionsRef.current = true;
        setHasLoadedTransactions(true);
        setIsLoading(false);
        return;
      }

      const fetchTransactionList = async (
        path: string,
        keys: string[] = [],
        fallback: any[] = []
      ) => {
        try {
          const response = await fetch(`${getApiBaseUrl()}${path}`, {
            headers: buildApiHeaders(authToken),
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
          return normalizeTransactionListPayload(payload, keys);
        } catch (error) {
          if (String((error as Error)?.message || "") === "Unauthenticated.") {
            throw error;
          }

          return fallback;
        }
      };

      try {
        const [dockingArray, banyeraArray, ticketArray, remittanceArray] = await Promise.all([
          fetchTransactionList("/dockings?all=true", ["dockings"], cachedHistory.docking),
          fetchTransactionList(
            "/banyera-transactions?all=true&include_voided=true",
            ["transactions", "banyeraTransactions"],
            cachedHistory.banyera
          ),
          fetchTransactionList("/vehicle-tickets?all=true", ["tickets", "vehicleTickets"], cachedHistory.tickets),
          fetchTransactionList("/remittances?all=true", ["remittances"], cachedHistory.remittance),
        ]);
        const ownedByCurrentUser = (record: any) => isOwnedByCurrentUser(record, currentUserId);

        const nextHistory = mergeSyncedTransactionsIntoHistory(
          {
            docking: dockingArray.filter(ownedByCurrentUser),
            banyera: banyeraArray.filter(ownedByCurrentUser),
            tickets: ticketArray.filter(ownedByCurrentUser),
            remittance: remittanceArray.filter(ownedByCurrentUser),
          },
          syncedTransactions,
          currentUserId
        );

        setDockingTransactions(nextHistory.docking);
        setBanyeraTransactions(nextHistory.banyera);
        setTicketTransactions(nextHistory.tickets);
        setRemittanceTransactions(nextHistory.remittance);
        await saveOfflineResource("history", {
          docking: nextHistory.docking,
          banyera: nextHistory.banyera,
          tickets: nextHistory.tickets,
          remittance: nextHistory.remittance,
        });
        hasLoadedTransactionsRef.current = true;
        setHasLoadedTransactions(true);
        setIsLoading(false);
      } catch {
        setDockingTransactions(cachedHistory.docking);
        setBanyeraTransactions(cachedHistory.banyera);
        setTicketTransactions(cachedHistory.tickets);
        setRemittanceTransactions(cachedHistory.remittance);
        const latestNetworkState = await NetInfo.fetch().catch(() => null);
        if (!hasCachedHistory && !isOfflineNetworkState(latestNetworkState)) {
          showToast("error", "Failed to load transactions");
        }
        hasLoadedTransactionsRef.current = true;
        setHasLoadedTransactions(true);
        setIsLoading(false);
      }
    },
    [authToken, currentUserId, loadOfflineDrafts, loadOfflineHistoryCache, showToast, syncedTransactions]
  );

  useEffect(() => {
    let isMounted = true;

    loadTransactions({ showLoading: true }).finally(() => {
      if (!isMounted) {
        return;
      }
    });

    return () => {
      isMounted = false;
    };
  }, [loadTransactions, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      loadTransactions({ showLoading: true });
    }, [loadTransactions])
  );

  const getDisplayedTransactions = () => {
    let transactions: { type: TransactionCardType; id: number | string; data: any }[] = [];

    if (selectedTab === "all" || selectedTab === "docking") {
      transactions.push(
        ...dockingTransactions.map((t) => ({
          type: "docking" as const,
          id: t.docking_id || Math.random(),
          data: t,
        }))
      );
    }

    if (selectedTab === "all" || selectedTab === "banyera") {
      transactions.push(
        ...banyeraTransactions.map((t) => ({
          type: "banyera" as const,
          id: t.banyera_id || Math.random(),
          data: t,
        }))
      );
    }

    if (selectedTab === "all" || selectedTab === "tickets") {
      transactions.push(
        ...ticketTransactions.map((t) => ({
          type: "tickets" as const,
          id: t.ticket_id || Math.random(),
          data: t,
        }))
      );
    }

    if (selectedTab === "all" || selectedTab === "remittance") {
      transactions.push(
        ...remittanceTransactions.map((t) => ({
          type: "remittance" as const,
          id: t.remittance_id || Math.random(),
          data: t,
        }))
      );
    }

    {
      transactions.push(
        ...offlineDrafts
          .filter((draft) => selectedTab === "all" || draft.type === selectedTab)
          .map((draft) => ({
            type: draft.type,
            id: draft.local_id,
            data: createDraftCardData(draft),
          }))
      );
    }

    transactions.sort((a, b) => {
      const aTimestamp = getTransactionSortValue(getTransactionDateValue(a.data, a.type));
      const bTimestamp = getTransactionSortValue(getTransactionDateValue(b.data, b.type));
      return bTimestamp - aTimestamp;
    });

    if (debouncedSearchText.trim()) {
      transactions = transactions.filter((t) => {
        const searchLower = debouncedSearchText.toLowerCase();
        const values: string[] = [];

        if (t.type === "docking") {
          values.push(String(t.data?.boat?.boat_name || ""));
          values.push(String(t.data?.docking_fee || ""));
        }

        if (t.type === "banyera") {
          values.push(String(t.data?.boat?.boat_name || ""));
          values.push(String(t.data?.total_fee || ""));
        }

        if (t.type === "tickets") {
          values.push(String(t.data?.plate_number || ""));
          values.push(String(t.data?.vehicle_type?.type_name || t.data?.vehicleType?.type_name || t.data?.vehicle_type_name || t.data?.vehicleType?.vehicle_type_name || ""));
          values.push(String(t.data?.ticket_fee || t.data?.total_fee || ""));
        }

        if (t.type === "remittance") {
          values.push(String(t.data?.remittance_reference_no || ""));
          values.push(String(t.data?.amount || ""));
          values.push(String(t.data?.date || ""));
          values.push(String(t.data?.remarks || ""));
        }

        return values.some((value) => value.toLowerCase().includes(searchLower));
      });
    }

    if (statusFilter !== "all") {
      transactions = transactions.filter((t) => {
        const status = getTransactionStatus(t.data).label.toLowerCase();
        return statusFilter === status;
      });
    }

    return transactions;
  };

  const displayedTransactions = getDisplayedTransactions();
  const hasAnyTransactionData =
    dockingTransactions.length > 0 ||
    banyeraTransactions.length > 0 ||
    ticketTransactions.length > 0 ||
    remittanceTransactions.length > 0 ||
    offlineDrafts.length > 0;
  const hasActiveFilter = Boolean(debouncedSearchText.trim()) || statusFilter !== "all";
  const selectedTabLabel = tabs.find((tab) => tab.key === selectedTab)?.label ?? "Transactions";
  const emptyMessage =
    selectedTab === "remittance"
      ? "No remittance found."
      : !hasAnyTransactionData
        ? "No transactions found."
        : hasActiveFilter
          ? "No matching transactions found."
          : `No ${selectedTabLabel.toLowerCase()} transactions found.`;
  const shouldShowSkeleton = isLoading && !hasAnyTransactionData;

  return (
    <View className="flex-1 bg-[#FFFDFB]">
      <StatusBar barStyle="light-content" backgroundColor="#1A1F36" />

      <SafeAreaView
        className="overflow-hidden rounded-b-[20px] bg-[#1A1F36]"
        edges={["top"]}
      >
        <View
          className="h-[66px] flex-row items-center justify-between overflow-hidden bg-[#1A1F36] px-5"
        >
          <Text
            className="text-[18px] text-white"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            History
          </Text>
          <Pressable hitSlop={10} onPress={() => setOptionModalVisible(true)}>
            <Ionicons name="options-outline" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </SafeAreaView>

      <OptionModal
        visible={optionModalVisible}
        selectedValue={statusFilter}
        onClose={() => setOptionModalVisible(false)}
        onSelect={(value) => setStatusFilter(value)}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 28, paddingTop: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-0">
          {/* Search Bar */}
          <View className="mb-4 flex-row items-center gap-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4">
            <Ionicons name="search-outline" size={18} color="#9AA3AF" />
            <TextInput
              className="flex-1 py-3 text-[14px] text-[#1A1F36]"
              placeholder="Search for transactions"
              placeholderTextColor="#9AA3AF"
              value={searchText}
              onChangeText={setSearchText}
              style={{ fontFamily: "Montserrat_400Regular" }}
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color="#9AA3AF" />
              </Pressable>
            ) : null}
          </View>

          {/* Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-5 mb-4"
            contentContainerStyle={{ paddingHorizontal: 20 }}
          >
            <View className="flex-row gap-2">
              {tabs.map((tab) => {
                const isActive = selectedTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setSelectedTab(tab.key)}
                    className={`flex-row items-center rounded-[8px] px-4 py-2 ${
                      isActive
                        ? "bg-[#1A1F36]"
                        : "border border-[#E8E1E6] bg-white"
                    }`}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={14}
                      color={isActive ? "#FFFFFF" : "#6F6F82"}
                    />
                    <Text
                      className={`ml-1.5 text-[12px] font-semibold ${
                        isActive ? "text-white" : "text-[#6F6F82]"
                      }`}
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Transaction Cards */}
          <View className="flex-1">
            {shouldShowSkeleton ? (
              <HistorySkeletonCards />
            ) : displayedTransactions.length > 0 ? (
              displayedTransactions.map((transaction, index) => (
                <TransactionCard
                  key={`${transaction.type}-${transaction.id}-${index}`}
                  type={transaction.type}
                  data={transaction.data}
                  onPress={() => navigateToDetails(transaction)}
                />
              ))
            ) : (
              <View className="items-center justify-center" style={{ minHeight: 420 }}>
                <Text
                  className="text-center text-[14px] text-[#6F6F82]"
                  style={{ fontFamily: "Montserrat_400Regular" }}
                >
                  {emptyMessage}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

