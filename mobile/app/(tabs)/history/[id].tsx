import { Ionicons } from "@expo/vector-icons";
import type { BluetoothPrinter } from "@netinove/thermal-printer";
import NetInfo from "@react-native-community/netinfo";
import { ActivityIndicator, ScrollView, StatusBar, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getAuthSession, getAuthToken } from "../../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../../api/axios";
import { useToastStore } from "../../../store/toastStore";
import { useHistoryStore } from "../../../store/historyStore";
import EditModal from "../../../components/EditModal";
import PrintPreviewModal, {
  PrintPreviewLine,
} from "../../../components/PrintPreviewModal";
import { VoidTransactionModal, getVoidReasonOptions } from "../../../components/VoidModal";
import {
  getOfflineTransactionDrafts,
  OfflineTransactionDraft,
} from "../../../utils/offlineTransactionQueue";
import { printThermalReceiptWithSignature } from "../../../utils/thermalReceiptPrinter";

type TransactionType = "docking" | "banyera" | "tickets" | "remittance";
type VoidableTransactionType = Exclude<TransactionType, "remittance">;

type Params = {
  id: string;
  type?: string;
  draft?: string;
};

type TransactionRecord = Record<string, any>;

type TransactionLockState = {
  is_locked?: boolean | null;
  message?: string | null;
  date?: string | null;
  applies_to?: string | null;
  unlock_at?: string | null;
  remittance_reference_no?: string | null;
};

const parseMoneyValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const endpointForType = (type: TransactionType) => {
  switch (type) {
    case "docking":
      return "/dockings";
    case "banyera":
      return "/banyera-transactions";
    case "tickets":
      return "/vehicle-tickets";
    case "remittance":
      return "/remittances";
  }
};

const idFieldForType = (type: TransactionType) => {
  switch (type) {
    case "docking":
      return "docking_id";
    case "banyera":
      return "banyera_id";
    case "tickets":
      return "ticket_id";
    case "remittance":
      return "remittance_id";
  }
};

const parseIsoDateTime = (value?: string | null) => {
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

function formatPrinterPeso(amount: number) {
  return `PHP ${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function centerPrinterText(text: string, width = 32) {
  const trimmed = text.trim();
  const padding = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return `${" ".repeat(padding)}${trimmed}`;
}

function splitPrinterText(text: string, width = 32) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;

    if (nextLine.length <= width) {
      line = nextLine;
      return;
    }

    if (line) {
      lines.push(line);
    }

    line = word.length <= width ? word : word.slice(0, width);
  });

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : [""];
}

function padPrinterColumns(left: string, right: string, width = 32) {
  const rightText = right.trim();
  const maxLeftWidth = Math.max(1, width - rightText.length - 1);
  const leftText = left.length > maxLeftWidth ? left.slice(0, maxLeftWidth) : left;
  const gap = Math.max(1, width - leftText.length - rightText.length);

  return `${leftText}${" ".repeat(gap)}${rightText}`;
}

function findPreferredThermalPrinter(printers: BluetoothPrinter[]) {
  const bondedPrinters = printers.filter((printer) => printer.bonded);
  const pt210Printer = bondedPrinters.find((printer) => {
    const name = printer.name.trim().toLowerCase();
    return name.includes("pt-210") || name.includes("pt210");
  });

  if (pt210Printer) {
    return pt210Printer;
  }

  return (
    bondedPrinters.find((printer) => {
      const name = printer.name.trim().toLowerCase();
      return name.includes("printer") || name.includes("thermal");
    }) ??
    bondedPrinters[0] ??
    null
  );
}

async function printThermalText(text: string) {
  const {
    connect: connectThermalPrinter,
    getBondedPrinters,
    getConnectionState,
    requestBluetoothPermissions,
    writeText: writeThermalText,
  } = await import("@netinove/thermal-printer");

  const granted = await requestBluetoothPermissions();

  if (!granted) {
    throw new Error("Bluetooth permission was not granted.");
  }

  const printers = await getBondedPrinters();
  const printer = findPreferredThermalPrinter(printers);

  if (!printer) {
    throw new Error("No paired Bluetooth thermal printer found.");
  }

  const connection = getConnectionState();

  if (!connection.connected || connection.address !== printer.address) {
    await connectThermalPrinter(printer.address);
  }

  await writeThermalText(text, { trailingLines: 3 });
}

const getPhilippineToday = () => {
  const parts = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");

  return { year, month, day };
};

const isSamePhilippineDate = (value?: string | null) => {
  const parsed = parseIsoDateTime(value);
  if (!parsed) return false;
  const today = getPhilippineToday();
  return parsed.year === today.year && parsed.month === today.month && parsed.day === today.day;
};

const getPhilippineDateKey = (value?: string | null) => {
  const parsed = parseIsoDateTime(value);
  if (!parsed) return "";

  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
};

const getTransactionDateForStatus = (record: TransactionRecord | null | undefined, type?: TransactionType | null) => {
  if (!record) return null;

  if (type === "docking") return record.docking_date;
  if (type === "banyera") return record.transaction_date || record.created_at || record.docking_date;
  if (type === "tickets") return record.ticket_date || record.transaction_date || record.created_at;

  return record.transaction_date || record.ticket_date || record.created_at || record.docking_date;
};

const isRecordBilled = (record: TransactionRecord | null | undefined) =>
  Boolean(record?.is_billed || record?.billed_at || record?.billing_id || record?.bill_id);

function buildBanyeraReceiptTextFromDetail(record: TransactionRecord) {
  const boatName = record.boat?.boat_name || record.boat_name || "-";
  const ownerName =
    record.boat?.owner?.full_name ||
    record.boat?.owner_name ||
    record.boat?.boat_owner ||
    record.owner_name ||
    "Unknown Owner";
  const transactionDate = record.transaction_date || record.created_at;
  const receiptLines = [
    centerPrinterText("OPOL FISH PORT"),
    centerPrinterText("BANYERA TRANSACTION"),
    "-".repeat(32),
    `Date: ${formatPhilippineDate(transactionDate)}`,
    `Time: ${formatPhilippineTime(transactionDate)}`,
    ...splitPrinterText(`Boat: ${boatName}`),
    "-".repeat(32),
  ];

  const items = Array.isArray(record.items) ? record.items : [];

  items.forEach((item, index) => {
    const name =
      item.classification_name ||
      item.classification?.classification_name ||
      item.classification?.name ||
      "Fish";
    const quantity = Number(item.quantity || 0);
    const subtotal = parseMoneyValue(item.subtotal);
    const fee = quantity > 0 ? subtotal / quantity : subtotal;
    const daug = item.daug !== undefined && item.daug !== null ? parseMoneyValue(item.daug) : 0;

    receiptLines.push(`${index + 1}. ${name}`);
    receiptLines.push(
      padPrinterColumns(
        `${quantity} x ${formatPrinterPeso(fee)}`,
        formatPrinterPeso(subtotal)
      )
    );

    if (daug > 0) {
      receiptLines.push(padPrinterColumns("Daug", formatPrinterPeso(daug)));
    }
  });

  receiptLines.push(
    "-".repeat(32),
    padPrinterColumns("TOTAL", formatPrinterPeso(parseMoneyValue(record.total_fee))),
    ""
  );

  return receiptLines.join("\n");
}

function getBanyeraSignatureDataUrl(record: TransactionRecord) {
  return (
    record.owner_signature_data_url ||
    record.ownerSignatureDataUrl ||
    record.boat?.owner?.owner_signature_data_url ||
    record.boat?.ownerSignatureDataUrl ||
    ""
  );
}

const createDraftDetail = (draft: OfflineTransactionDraft): TransactionRecord => {
  const payload = draft.payload ?? {};
  const metadata = draft.metadata ?? {};

  if (draft.type === "docking") {
    return {
      __isDraft: true,
      local_id: draft.local_id,
      created_at: draft.created_at,
      boat: {
        boat_name: metadata.boat_name || `Boat #${payload.boat_id ?? "-"}`,
        boat_type_name: metadata.boat_type_name,
        boat_type: {
          type_name: metadata.boat_type_name,
        },
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
        boat_type_name: metadata.boat_type_name,
        boat_type: {
          type_name: metadata.boat_type_name,
        },
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
    daily_fee: payload.daily_fee,
    banyera_fee: payload.banyera_fee,
  };
};

function DetailSkeletonBlock({
  className = "",
}: {
  className?: string;
}) {
  return <View className={className} style={{ backgroundColor: "#EEF2F7" }} />;
}

function DetailFieldSkeleton({
  half = false,
}: {
  half?: boolean;
}) {
  return (
    <View className={half ? "mb-4 flex-1" : "mb-4"}>
      <DetailSkeletonBlock className="h-3 w-24 rounded-full" />
      <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
        <DetailSkeletonBlock className="h-4 w-3/5 rounded-full" />
      </View>
    </View>
  );
}

function DetailSectionSkeleton({
  afterRows = 0,
  backgroundClassName = "bg-white",
  rows = 4,
  splitRowCount = 1,
  showSplitRow = true,
}: {
  afterRows?: number;
  backgroundClassName?: string;
  rows?: number;
  splitRowCount?: number;
  showSplitRow?: boolean;
}) {
  return (
    <View className={`mb-4 -mx-5 rounded-[10px] border border-[#E8E1E6] px-5 py-5 shadow-sm shadow-black/5 ${backgroundClassName}`}>
      <View className="flex-row items-center">
        <DetailSkeletonBlock className="h-11 w-11 rounded-[10px]" />
        <View className="ml-3 flex-1">
          <DetailSkeletonBlock className="h-5 w-3/5 rounded-full" />
          <DetailSkeletonBlock className="mt-2 h-3 w-4/5 rounded-full" />
        </View>
      </View>

      <View className="-mx-5 mb-5 mt-4 h-px bg-[#E8E1E6]" />

      {Array.from({ length: rows }).map((_, index) => (
        <DetailFieldSkeleton key={`detail-field-skeleton-${index}`} />
      ))}

      {showSplitRow
        ? Array.from({ length: splitRowCount }).map((_, index) => (
            <View
              key={`detail-split-row-skeleton-${index}`}
              className="mb-4 flex-row gap-3"
            >
              <DetailFieldSkeleton half />
              <DetailFieldSkeleton half />
            </View>
          ))
        : null}

      {Array.from({ length: afterRows }).map((_, index) => (
        <DetailFieldSkeleton key={`detail-after-field-skeleton-${index}`} />
      ))}
    </View>
  );
}

function FishItemsSkeleton() {
  return (
    <View className="mb-4 -mx-5 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-5 py-5 shadow-sm shadow-black/5">
      <View className="flex-row items-center">
        <DetailSkeletonBlock className="h-11 w-11 rounded-[10px]" />
        <View className="ml-3 flex-1">
          <DetailSkeletonBlock className="h-5 w-2/5 rounded-full" />
          <DetailSkeletonBlock className="mt-2 h-3 w-4/5 rounded-full" />
        </View>
      </View>

      <View className="-mx-5 mb-5 mt-4 h-px bg-[#E8E1E6]" />

      {Array.from({ length: 2 }).map((_, index) => (
        <View
          key={`detail-item-skeleton-${index}`}
          className="mb-4 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-4 shadow-sm shadow-black/5"
        >
          <View className="mb-4 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4 py-3">
            <DetailSkeletonBlock className="h-4 w-1/2 rounded-full" />
          </View>
          <DetailFieldSkeleton />
          <View className="flex-row gap-3">
            <DetailFieldSkeleton half />
            <DetailFieldSkeleton half />
          </View>
          <DetailFieldSkeleton />
        </View>
      ))}
    </View>
  );
}

function DetailActionsSkeleton() {
  return (
    <>
      <DetailSkeletonBlock className="mb-4 -mx-5 h-12 rounded-[10px]" />
      <View className="flex-row gap-3">
        <DetailSkeletonBlock className="h-12 flex-1 rounded-[10px]" />
        <DetailSkeletonBlock className="h-12 flex-1 rounded-[10px]" />
      </View>
    </>
  );
}

function TransactionDetailSkeleton({ type }: { type?: TransactionType }) {
  return (
    <View className="px-5 pb-10">
      <View className="rounded-[10px] bg-white p-5 shadow-sm shadow-black/10">
        {type === "banyera" ? (
          <>
            <DetailSectionSkeleton rows={6} splitRowCount={1} />
            <FishItemsSkeleton />
          </>
        ) : type === "tickets" ? (
          <>
            <DetailSectionSkeleton rows={5} showSplitRow={false} />
            <DetailSectionSkeleton rows={3} showSplitRow={false} />
          </>
        ) : type === "docking" ? (
          <DetailSectionSkeleton rows={7} showSplitRow={false} />
        ) : (
          <DetailSectionSkeleton rows={4} afterRows={1} />
        )}

        <DetailActionsSkeleton />
      </View>
    </View>
  );
}

const isOfflineNetworkState = (state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
} | null) => {
  if (!state) return false;
  return state.isConnected === false || state.isInternetReachable === false;
};

const detailCacheKey = (type: TransactionType, id: string | number) => `${type}:${id}`;

export default function HistoryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const authToken = getAuthToken();
  const showToast = useToastStore((state) => state.showToast);
  const triggerHistoryRefresh = useHistoryStore((state) => state.triggerRefresh);
  const syncedTransactions = useHistoryStore((state) => state.syncedTransactions);
  const cacheTransactionDetail = useHistoryStore((state) => state.cacheTransactionDetail);
  const realtimeTransactionLock = useHistoryStore((state) => state.transactionLock);
  const setRealtimeTransactionLock = useHistoryStore((state) => state.setTransactionLock);
  const [detail, setDetail] = useState<TransactionRecord | null>(null);
  const [type, setType] = useState<TransactionType | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [voidReasonOption, setVoidReasonOption] = useState("");
  const [voidReasonCustom, setVoidReasonCustom] = useState("");
  const [voidReasonError, setVoidReasonError] = useState("");
  const [isSavingVoidAction, setIsSavingVoidAction] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isPrintingBanyera, setIsPrintingBanyera] = useState(false);
  const [isBanyeraPrintPreviewOpen, setIsBanyeraPrintPreviewOpen] = useState(false);
  const [transactionLock, setTransactionLock] = useState<TransactionLockState | null>(null);
  const [isOfflineDetailUnavailable, setIsOfflineDetailUnavailable] = useState(false);
  const isDraftDetail = Boolean(detail?.__isDraft) || params.draft === "true";

  useEffect(() => {
    setTransactionLock(realtimeTransactionLock ?? null);
  }, [realtimeTransactionLock]);

  useEffect(() => {
    const id = params.id;
    const queryType = params.type;
    const isDraftRoute = params.draft === "true";
    const parsedType =
      queryType === "docking" || queryType === "banyera" || queryType === "tickets" || queryType === "remittance"
        ? (queryType as TransactionType)
        : undefined;

    setType(parsedType);

    async function loadTransactionLockState() {
      if (isDraftRoute) {
        setTransactionLock(null);
        return;
      }

      if (!authToken) {
        setTransactionLock(null);
        return;
      }

      try {
        const lockResourceQuery = parsedType === "tickets" ? "?resource=vehicle-tickets" : "";
        const response = await fetch(`${getApiBaseUrl()}/transaction-lock${lockResourceQuery}`, {
          headers: buildApiHeaders(authToken),
        });
        const json = await response.json().catch(() => null);
        const lock = json?.transaction_lock;

        if (lock && (lock.is_locked || lock.message)) {
          setTransactionLock(lock);
          setRealtimeTransactionLock(lock);
        } else {
          setTransactionLock(null);
          setRealtimeTransactionLock(null);
        }
      } catch {
        setTransactionLock(null);
      }
    }

    async function loadDetail() {
      setIsOfflineDetailUnavailable(false);

      if (isDraftRoute) {
        const drafts = await getOfflineTransactionDrafts();
        const draft = drafts.find((item) => item.local_id === id);

        if (!draft) {
          showToast("info", "Draft details not found.");
          setDetail(null);
          setIsLoading(false);
          return;
        }

        setType(draft.type);
        setDetail(createDraftDetail(draft));
        setIsLoading(false);
        return;
      }

      if (parsedType && id) {
        const cachedDetail = useHistoryStore.getState().transactionDetailCache[detailCacheKey(parsedType, id)];
        if (cachedDetail) {
          setDetail(cachedDetail);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
      } else {
        setIsLoading(true);
      }

      const networkState = await NetInfo.fetch().catch(() => null);
      if (isOfflineNetworkState(networkState)) {
        const cachedDetail =
          parsedType && id
            ? useHistoryStore.getState().transactionDetailCache[detailCacheKey(parsedType, id)]
            : null;

        if (cachedDetail) {
          setDetail(cachedDetail);
        } else {
          setDetail(null);
          setIsOfflineDetailUnavailable(true);
        }
        setIsLoading(false);
        return;
      }

      const authSession = getAuthSession();
      const currentUserId = authSession?.user?.user_id;

      if (!authToken || !currentUserId) {
        showToast("error", "Please sign in again.");
        setIsLoading(false);
        return;
      }

      const idNumber = Number(id);
      if (!id || Number.isNaN(idNumber)) {
        showToast("error", "Invalid transaction id.");
        setIsLoading(false);
        return;
      }

      try {
        const typesToCheck: TransactionType[] = parsedType
          ? [parsedType]
          : ["docking", "banyera", "tickets", "remittance"];

        let found: TransactionRecord | null = null;

        const isOwnedByCurrentUser = (record: TransactionRecord) => {
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

          return ownerCandidates.some(
            (value) => value !== undefined && value !== null && String(value) === currentUserIdString
          );
        };

        for (const typeToCheck of typesToCheck) {
          const response = await fetch(`${getApiBaseUrl()}${endpointForType(typeToCheck)}/${idNumber}`, {
            headers: buildApiHeaders(authToken),
          });

          if (!response.ok) {
            continue;
          }

          const json = await response.json().catch(() => null);
          const record = resolveDetailFromResponse(json, null);

          if (record && isOwnedByCurrentUser(record)) {
            found = record;
            setType(typeToCheck);
            cacheTransactionDetail(typeToCheck, idNumber, record);
            break;
          }
        }

        if (!found) {
          showToast("info", "Transaction details not found.");
        }

        setDetail(found);
      } catch {
        const latestNetworkState = await NetInfo.fetch().catch(() => null);
        if (isOfflineNetworkState(latestNetworkState)) {
          setIsOfflineDetailUnavailable(true);
        } else {
          showToast("error", "Failed to load transaction details.");
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadDetail();
    loadTransactionLockState();
  }, [authToken, cacheTransactionDetail, params.draft, params.id, params.type, setRealtimeTransactionLock, showToast]);

  useEffect(() => {
    const id = params.id;
    const queryType = params.type;
    const parsedType =
      queryType === "docking" || queryType === "banyera" || queryType === "tickets" || queryType === "remittance"
        ? (queryType as TransactionType)
        : undefined;

    if (!id || !parsedType || params.draft === "true") return;

    const latestSynced = [...syncedTransactions].reverse().find((transaction) => {
      if (transaction.type !== parsedType) return false;
      const transactionId = transaction.data?.[idFieldForType(parsedType)] ?? transaction.data?.id;
      return transactionId !== undefined && transactionId !== null && String(transactionId) === String(id);
    });

    if (!latestSynced) return;

    setType(parsedType);
    setDetail(latestSynced.data);
    cacheTransactionDetail(parsedType, id, latestSynced.data);
  }, [cacheTransactionDetail, params.draft, params.id, params.type, syncedTransactions]);

  const isDetailTransactionLocked = () => {
    if (!detail || !type || type === "remittance" || !transactionLock?.is_locked) return false;

    const lockDate = String(transactionLock.date || "").slice(0, 10);
    if (!lockDate) return false;

    if (transactionLock.applies_to === "transactions") {
      return getPhilippineDateKey(getTransactionDateForStatus(detail, type)) === lockDate;
    }

    if (transactionLock.applies_to !== "vehicle-tickets" || type !== "tickets") {
      return false;
    }

    return getPhilippineDateKey(getTransactionDateForStatus(detail, type)) === lockDate;
  };

  const openVoidModal = () => {
    if (isDetailTransactionLocked() || isRecordBilled(detail)) return;
    setVoidReasonOption("");
    setVoidReasonCustom("");
    setVoidReasonError("");
    setVoidModalVisible(true);
  };

  const closeVoidModal = () => {
    if (isSavingVoidAction) return;
    setVoidModalVisible(false);
    setVoidReasonOption("");
    setVoidReasonCustom("");
    setVoidReasonError("");
  };

  const closeEditModal = () => {
    if (isSavingEdit) return;
    setEditModalVisible(false);
  };

  const handleSaveBanyeraEdit = async (updatedItems: Record<string, any>[]) => {
    if (!detail || isDetailTransactionLocked()) return;
    const transactionId = detail.banyera_id ?? detail.banyeraId ?? detail.id;
    if (!transactionId) return;

    setIsSavingEdit(true);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}${endpointForType("banyera")}/${transactionId}`,
        {
          method: "PUT",
          headers: {
            ...buildApiHeaders(authToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            daug_only: true,
            items: updatedItems.map((item) => ({
              ...item,
              daug: item.daug !== "" ? parseMoneyValue(item.daug) : null,
            })),
          }),
        }
      );
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        showToast("error", json?.message || "Unable to save changes.");
        return;
      }

      showToast("success", "Banyera changes saved.");
      setDetail(json?.data ?? json?.transaction ?? json ?? detail);
      triggerHistoryRefresh();
      setEditModalVisible(false);
    } catch {
      showToast("error", "Unable to reach the server.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handlePrintBanyera = async () => {
    if (!detail || type !== "banyera" || isPrintingBanyera) return;

    const transactionId = detail.banyera_id ?? detail.banyeraId ?? detail.id;
    if (!transactionId) return;

    setIsPrintingBanyera(true);

    try {
      await printThermalReceiptWithSignature(
        buildBanyeraReceiptTextFromDetail(detail),
        getBanyeraSignatureDataUrl(detail)
      );

      const response = await fetch(
        `${getApiBaseUrl()}${endpointForType("banyera")}/${transactionId}/print`,
        {
          method: "PATCH",
          headers: buildApiHeaders(authToken),
        }
      );
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        showToast("error", json?.message || "Printed, but the print count was not updated.");
        return;
      }

      const updatedDetail = json?.transaction ?? json?.data ?? json ?? {
        ...detail,
        print_count: Number(detail.print_count || 0) + 1,
      };

      setDetail(updatedDetail);
      cacheTransactionDetail("banyera", transactionId, updatedDetail);
      triggerHistoryRefresh();
      setIsBanyeraPrintPreviewOpen(false);
      showToast("success", "Banyera receipt printed.");
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to print Banyera receipt."
      );
    } finally {
      setIsPrintingBanyera(false);
    }
  };

  const resolveDetailFromResponse = (payload: TransactionRecord | null | undefined, fallback: TransactionRecord | null) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return fallback;
    }

    const wrappedCandidates = [payload.data, payload.transaction, payload.ticket, payload.docking, payload.banyera, payload.remittance, payload.record];
    for (const candidate of wrappedCandidates) {
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        return { ...(fallback ?? {}), ...(candidate as TransactionRecord) };
      }
    }

    if (payload.id || payload.ticket_id || payload.banyera_id || payload.docking_id || payload.remittance_id || payload.plate_number || payload.boat_name || payload.total_fee != null || payload.ticket_fee != null) {
      return { ...(fallback ?? {}), ...(payload as TransactionRecord) };
    }

    return fallback;
  };

  const handleVoidConfirm = async () => {
    if (!detail || !type || type === "remittance" || isDetailTransactionLocked()) return;
    const voidableType: VoidableTransactionType = type;
    const transactionId = detail[idFieldForType(voidableType)];
    if (!transactionId) return;
    if (!voidReasonOption) {
      setVoidReasonError("Void reason is required.");
      return;
    }

    const resolvedReason =
      voidReasonOption === "others"
        ? voidReasonCustom.trim()
        : getVoidReasonOptions(voidableType).find((option) => option.value === voidReasonOption)?.label ?? "";

    if (!resolvedReason) {
      setVoidReasonError(
        voidReasonOption === "others"
          ? "Please enter the specific void reason."
          : "Void reason is required."
      );
      return;
    }

    setIsSavingVoidAction(true);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/void-requests`,
        {
          method: "POST",
          headers: {
            ...buildApiHeaders(authToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transaction_type: type,
            transaction_id: transactionId,
            void_reason: resolvedReason,
          }),
        }
      );
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        showToast("error", json?.message || "Unable to request voiding for this transaction.");
        return;
      }

      showToast("success", json?.message || "Void request sent to coordinators.");
      closeVoidModal();
    } catch {
      showToast("error", "Unable to reach the server.");
    } finally {
      setIsSavingVoidAction(false);
    }
  };

  const handleEditBanyera = () => {
    if (!detail || isDetailTransactionLocked() || isRecordBilled(detail)) return;
    setEditModalVisible(true);
  };

  const banyeraDetailPrintCount =
    type === "banyera" ? Math.max(0, Number(detail?.print_count || 0)) : 0;
  const banyeraDetailPrintLabel =
    banyeraDetailPrintCount > 0 ? `Reprint (${banyeraDetailPrintCount})` : "Print";
  const banyeraDetailPreviewDate = detail?.transaction_date || detail?.created_at || null;
  const banyeraDetailPreviewDetails =
    type === "banyera" && detail
      ? [
          {
            label: "Date",
            value: formatPhilippineDate(banyeraDetailPreviewDate),
          },
          {
            label: "Time",
            value: formatPhilippineTime(banyeraDetailPreviewDate),
          },
          { label: "Boat", value: detail.boat?.boat_name || detail.boat_name || "-" },
        ]
      : [];
  const banyeraDetailPreviewLines: PrintPreviewLine[] =
    type === "banyera" && detail && Array.isArray(detail.items)
      ? detail.items.map((item) => {
          const quantity = Number(item.quantity || 0);
          const subtotal = parseMoneyValue(item.subtotal);
          const fee = quantity > 0 ? subtotal / quantity : subtotal;
          const daug = item.daug !== undefined && item.daug !== null ? parseMoneyValue(item.daug) : 0;

          return {
            name:
              item.classification_name ||
              item.classification?.classification_name ||
              item.classification?.name ||
              "Fish",
            quantity,
            feeText: `₱${fee.toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`,
            subtotalText: `₱${subtotal.toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`,
            daugText:
              daug > 0
                ? `₱${daug.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : null,
          };
        })
      : [];
  const banyeraDetailTotalText = `₱${parseMoneyValue(detail?.total_fee).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const renderContent = () => {
    if (isLoading) {
      return <TransactionDetailSkeleton type={type} />;
    }

    if (!detail) {
      return (
        <View className="flex-1 items-center justify-center px-8 py-8">
          <Ionicons
            name={isOfflineDetailUnavailable ? "wifi-outline" : "document-text-outline"}
            size={34}
            color="#6F6F82"
          />
          <Text
            className="mt-4 text-center text-[14px] leading-[21px] text-[#6F6F82]"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            {isOfflineDetailUnavailable
              ? "Connect to the internet to see the details."
              : "Transaction details are not available."}
          </Text>
        </View>
      );
    }

    const isDraft = Boolean(detail.__isDraft);
    const isVoided = !isDraft && Boolean(detail.is_voided || detail.voided_at);
    const transactionDateForTodayCheck = getTransactionDateForStatus(detail, type);
    const isTodayRecord = isSamePhilippineDate(transactionDateForTodayCheck);
    const statusButtonLabel = "Request to Void";
    const statusButtonClass = "bg-white border border-[#F59E0B]";
    const statusButtonTextClass = "text-[#F59E0B]";
    const statusButtonIconColor = "#F59E0B";
    const isTransactionLocked = isDetailTransactionLocked();
    const isBilled = isRecordBilled(detail);
    const transactionLockMessage = transactionLock?.message || "Transactions are view-only at the moment.";
    const isStatusActionDisabled = isDraft || isSavingVoidAction || !isTodayRecord || isTransactionLocked || isBilled;
    const statusLabel = isDraft ? "Draft" : isVoided ? "Voided" : "Active";
    const statusIcon = isDraft ? "time-outline" : isVoided ? "close-circle" : "checkmark-circle";
    const statusBg = isDraft || isVoided ? "bg-[#FEF3C7]" : "bg-[#DCFCE7]";
    const statusColor = isDraft ? "#D97706" : isVoided ? "#F59E0B" : "#22C55E";
    const banyeraPrintCount = Math.max(0, Number(detail.print_count || 0));
    const banyeraPrintButtonLabel =
      banyeraPrintCount > 0 ? `Reprint (${banyeraPrintCount})` : "Print";
    const totalBanyeraQuantity = Array.isArray(detail.items)
      ? detail.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
      : 0;
    const ticketDisplayFee =
      parseMoneyValue(detail.total_fee) > 0 ? parseMoneyValue(detail.total_fee) : parseMoneyValue(detail.ticket_fee);

    const voidedDetailsBlock = isVoided ? (
      <View className="mb-4 -mx-5 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-5 py-5 shadow-sm shadow-black/5">
        <View className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-[10px]" style={{ backgroundColor: "rgba(37,99,235,0.08)" }}>
            <Ionicons name="alert-circle-outline" size={20} color="#2563EB" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-[16px] leading-[22px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              Void Details
            </Text>
            <Text className="mt-1 text-[11px] leading-[14px] text-[#8A94A3]" style={{ fontFamily: "Montserrat_400Regular" }}>
              Reason and history for this voided entry
            </Text>
          </View>
        </View>

        <View className="-mx-5 mt-4 mb-5 h-px bg-[#E8E1E6]" />

        <View className="rounded-[10px] border border-[#E8E1E6] bg-white p-4">
          <Text className="text-[10px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            Void Reason
          </Text>
          <Text className="mt-2 text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
            {detail.void_reason ?? "No reason provided."}
          </Text>
        </View>
      </View>
    ) : null;

    return (
      <View className="px-5 pb-10">
        <View className="rounded-[10px] bg-white p-5 shadow-sm shadow-black/10">
          {isDraft ? (
            <View className="mb-4 -mx-5 rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
              <View className="flex-row items-center">
                <Ionicons name="cloud-offline-outline" size={16} color="#D97706" />
                <View className="ml-2 flex-1">
                  <Text className="text-[12px] leading-4 text-[#92400E]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    This draft is saved on this device and will open as a normal transaction after it syncs.
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {type === "docking" && (
            <>
              <View className="mb-4 -mx-5 rounded-[10px] border border-[#E8E1E6] bg-white px-5 py-5 shadow-sm shadow-black/5">
                <View className="flex-row items-center">
                  <View className="h-11 w-11 items-center justify-center rounded-[10px]" style={{ backgroundColor: "rgba(37,99,235,0.08)" }}>
                    <Ionicons name="calendar-outline" size={20} color="#2563EB" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-[16px] leading-[22px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Docking Information
                    </Text>
                    <Text className="mt-1 text-[11px] leading-[14px] text-[#8A94A3]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      Recorded details for this docking entry
                    </Text>
                  </View>
                </View>

                <View className="-mx-5 mt-4 mb-5 h-px bg-[#E8E1E6]" />

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Boat Name
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {detail.boat?.boat_name ?? "Unknown Boat"}
                    </Text>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Status
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <View className={`w-full flex-row justify-center items-center gap-2 rounded-full px-2 py-1 ${statusBg}`}>
                      <Ionicons
                        name={statusIcon}
                        size={12}
                        color={statusColor}
                      />
                      <Text
                        className="text-[14px]"
                        style={{ fontFamily: "Montserrat_400Regular", color: statusColor }}
                      >
                        {statusLabel}
                      </Text>
                    </View>
                  </View>
                </View>
                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Boat Type
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {detail.boat?.boat_type?.type_name || detail.boat?.boat_type_name || "Unknown Type"}
                    </Text>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Boat Owner
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {detail.boat?.owner?.full_name || detail.boat?.owner_name || detail.boat?.boat_owner || "Unknown Owner"}
                    </Text>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Docking Date
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {formatPhilippineDate(detail.docking_date)}
                    </Text>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Docking Time
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {formatPhilippineTime(detail.docking_date)}
                    </Text>
                  </View>
                </View>

                <View>
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Docking Fee
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      ₱{parseMoneyValue(detail.docking_fee).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </View>
              </View>

              {isVoided ? voidedDetailsBlock : null}
            </>
          )}

          {type === "banyera" && (
            <View className="mb-4 -mx-5 rounded-[10px] border border-[#E8E1E6] bg-white px-5 py-5 shadow-sm shadow-black/5">
              <View className="flex-row items-center">
                <View className="h-11 w-11 items-center justify-center rounded-[10px]" style={{ backgroundColor: "rgba(37,99,235,0.08)" }}>
                  <Ionicons name="document-text-outline" size={20} color="#2563EB" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-[16px] leading-[22px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Banyera Information
                  </Text>
                  <Text className="mt-1 text-[11px] leading-[14px] text-[#8A94A3]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    Recorded details for this banyera entry
                  </Text>
                </View>
              </View>

              <View className="-mx-5 mt-4 mb-5 h-px bg-[#E8E1E6]" />

              <View className="mb-4">
                <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Boat Name
                </Text>
                <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                  <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {detail.boat?.boat_name ?? "Unknown Boat"}
                  </Text>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Status
                </Text>
                <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                  <View className={`flex-row w-full justify-center items-center gap-2 rounded-full px-2 py-1 ${statusBg}`}>
                    <Ionicons
                      name={statusIcon}
                      size={12}
                      color={statusColor}
                    />
                    <Text
                      className="text-[14px]"
                      style={{ fontFamily: "Montserrat_400Regular", color: statusColor }}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Boat Type
                </Text>
                <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                  <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {detail.boat?.boat_type?.type_name || detail.boat?.boat_type_name || "Unknown Type"}
                  </Text>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Boat Owner
                </Text>
                <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                  <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {detail.boat?.owner?.full_name || detail.boat?.owner_name || detail.boat?.boat_owner || "Unknown Owner"}
                  </Text>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Banyera Date
                </Text>
                <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                  <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {formatPhilippineDate(detail.transaction_date)}
                  </Text>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Banyera Time
                </Text>
                <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                  <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {formatPhilippineTime(detail.transaction_date)}
                  </Text>
                </View>
              </View>

              <View className="mb-4 flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Total Quantity
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {totalBanyeraQuantity}
                    </Text>
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Total Fee
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      ₱{parseMoneyValue(detail.total_fee).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {type === "banyera" && (
            <>
              <View className="mb-4 -mx-5 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-5 py-5 shadow-sm shadow-black/5">
                <View className="flex-row items-center">
                  <View className="h-11 w-11 items-center justify-center rounded-[10px]" style={{ backgroundColor: "rgba(37,99,235,0.08)" }}>
                    <Ionicons name="fish-outline" size={20} color="#2563EB" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-[16px] leading-[22px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Fish Items
                    </Text>
                    <Text className="mt-1 text-[11px] leading-[14px] text-[#8A94A3]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      Classifications included in this transaction
                    </Text>
                  </View>
                </View>

                <View className="-mx-5 mt-4 mb-5 h-px bg-[#E8E1E6]" />

                {Array.isArray(detail.items) && detail.items.length > 0 ? (
                  detail.items.map((item, index) => {
                    const classification =
                      item.classification_name ||
                      item.classification?.classification_name ||
                      item.classification?.name ||
                      "Unknown Classification";
                    const qty = Number(item.quantity || 0);
                    const subtotal = parseMoneyValue(item.subtotal);
                    const daugValue = item.daug !== undefined && item.daug !== null ? parseMoneyValue(item.daug) : 0;
                    const daug = `₱${daugValue.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`;

                    return (
                      <View key={`item-${index}`} className="mb-4 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-4 shadow-sm shadow-black/5">
                        <View className="mb-4 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4 py-3">
                          <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                            Item {index + 1}
                          </Text>
                        </View>

                        <View className="mb-4">
                          <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                            Classification
                          </Text>
                          <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                            <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                              {classification}
                            </Text>
                          </View>
                        </View>

                        <View className="mb-4 flex-row gap-3">
                          <View className="flex-1">
                            <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                              Qty
                            </Text>
                            <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                              <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                                {qty}
                              </Text>
                            </View>
                          </View>
                          <View className="flex-1">
                            <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                              Subtotal
                            </Text>
                            <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                              <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                                ₱{subtotal.toLocaleString("en-PH", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View>
                          <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                            Daug
                          </Text>
                          <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                            <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                              {daug}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View className="rounded-[10px] bg-white p-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      No fish item details available.
                    </Text>
                  </View>
                )}
              </View>

              {isVoided ? voidedDetailsBlock : null}
            </>
          )}

          {type === "remittance" && (
            <View className="mb-4 -mx-5 rounded-[10px] border border-[#E8E1E6] bg-white px-5 py-5 shadow-sm shadow-black/5">
              <View className="flex-row items-center">
                <View className="h-11 w-11 items-center justify-center rounded-[10px]" style={{ backgroundColor: "rgba(37,99,235,0.08)" }}>
                  <Ionicons name="cash-outline" size={20} color="#2563EB" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-[16px] leading-[22px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Remittance Information
                  </Text>
                  <Text className="mt-1 text-[11px] leading-[14px] text-[#8A94A3]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    Recorded details for this remittance entry
                  </Text>
                </View>
              </View>

              <View className="-mx-5 mt-4 mb-5 h-px bg-[#E8E1E6]" />

              <View className="mb-4">
                <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Remittance Ref. No.
                </Text>
                <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                  <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {detail.remittance_reference_no || "-"}
                  </Text>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Status
                </Text>
                <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                  <View className={`w-full flex-row justify-center items-center gap-2 rounded-full px-2 py-1 ${String(detail.status || "").toLowerCase() === "remitted" ? "bg-[#DCFCE7]" : "bg-[#FEF3C7]"}`}>
                    <Ionicons
                      name={String(detail.status || "").toLowerCase() === "remitted" ? "checkmark-circle" : "time-outline"}
                      size={12}
                      color={String(detail.status || "").toLowerCase() === "remitted" ? "#22C55E" : "#D97706"}
                    />
                    <Text
                      className="text-[14px]"
                      style={{
                        fontFamily: "Montserrat_400Regular",
                        color: String(detail.status || "").toLowerCase() === "remitted" ? "#22C55E" : "#D97706",
                      }}
                    >
                      {String(detail.status || "").toLowerCase() === "remitted" ? "Checked" : "Unchecked"}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mb-4 gap-3">
                <View className="w-full">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Date
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {formatPhilippineDate(detail.date || detail.created_at)}
                    </Text>
                  </View>
                </View>
                <View className="w-full">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Amount
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      ₱{parseMoneyValue(detail.amount).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mb-4 flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Surplus
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      ₱{parseMoneyValue(detail.surplus).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Deficit
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      ₱{parseMoneyValue(detail.deficit).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </View>
              </View>

              <View>
                <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Remarks
                </Text>
                <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                  <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {detail.remarks || "-"}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {type === "tickets" && (
            <>
              <View className="mb-4 -mx-5 rounded-[10px] border border-[#E8E1E6] bg-white px-5 py-5 shadow-sm shadow-black/5">
                <View className="flex-row items-center">
                  <View className="h-11 w-11 items-center justify-center rounded-[10px]" style={{ backgroundColor: "rgba(37,99,235,0.08)" }}>
                    <Ionicons name="ticket-outline" size={20} color="#2563EB" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-[16px] leading-[22px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Ticket Information
                    </Text>
                    <Text className="mt-1 text-[11px] leading-[14px] text-[#8A94A3]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      Recorded details for this ticket entry
                    </Text>
                  </View>
                </View>

                <View className="-mx-5 mt-4 mb-5 h-px bg-[#E8E1E6]" />

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Plate Number
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {detail.plate_number || ""}
                    </Text>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Status
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <View className={`w-full flex-row justify-center items-center gap-2 rounded-full px-2 py-1 ${statusBg}`}>
                      <Ionicons
                        name={statusIcon}
                        size={12}
                        color={statusColor}
                      />
                      <Text
                        className="text-[14px]"
                        style={{ fontFamily: "Montserrat_400Regular", color: statusColor }}
                      >
                        {statusLabel}
                      </Text>
                    </View>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Vehicle Type
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {detail.vehicle_type?.type_name ?? detail.vehicleType?.type_name ?? detail.vehicle_type_name ?? detail.vehicleType?.vehicle_type_name ?? "Unknown"}
                    </Text>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Ticket Date
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {formatPhilippineDate(detail.transaction_date || detail.ticket_date || detail.created_at || detail.docking_date)}
                    </Text>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Ticket Time
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {formatPhilippineTime(detail.ticket_date || detail.transaction_date || detail.created_at || detail.docking_date)}
                    </Text>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Ticket Fee
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      ₱{ticketDisplayFee.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mb-4 -mx-5 rounded-[10px] border border-[#E8E1E6] bg-white px-5 py-5 shadow-sm shadow-black/5">
                <View className="flex-row items-center">
                  <View className="h-11 w-11 items-center justify-center rounded-[10px]" style={{ backgroundColor: "rgba(37,99,235,0.08)" }}>
                    <Ionicons name="cash-outline" size={20} color="#2563EB" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-[16px] leading-[22px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Fee Breakdown
                    </Text>
                    <Text className="mt-1 text-[11px] leading-[14px] text-[#8A94A3]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      Applied fees for this daily ticket
                    </Text>
                  </View>
                </View>

                <View className="-mx-5 mt-4 mb-5 h-px bg-[#E8E1E6]" />

                <View>
                  <View className="mb-4">
                    <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Daily Ticket
                    </Text>
                    <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                      <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                        ₱{ticketDisplayFee.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </View>
                  </View>

                  <View className="mb-4">
                    <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Banyera
                    </Text>
                    <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                      <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                        ₱0.00
                      </Text>
                    </View>
                  </View>

                  <View>
                    <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Total Fee
                    </Text>
                    <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                      <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                        ₱{ticketDisplayFee.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {isVoided ? (
                <View className="mb-4 -mx-5 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-5 py-5 shadow-sm shadow-black/5">
                  <View className="flex-row items-center">
                    <View className="h-11 w-11 items-center justify-center rounded-[10px]" style={{ backgroundColor: "rgba(37,99,235,0.08)" }}>
                      <Ionicons name="alert-circle-outline" size={20} color="#2563EB" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-[16px] leading-[22px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                        Void Details
                      </Text>
                      <Text className="mt-1 text-[11px] leading-[14px] text-[#8A94A3]" style={{ fontFamily: "Montserrat_400Regular" }}>
                        Reason and history for this voided ticket
                      </Text>
                    </View>
                  </View>

                  <View className="-mx-5 mt-4 mb-5 h-px bg-[#E8E1E6]" />

                  <View className="rounded-[10px] border border-[#E8E1E6] bg-white p-4">
                    <Text className="text-[10px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Void Reason
                    </Text>
                    <Text className="mt-2 text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {detail.void_reason ?? "No reason provided."}
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          )}

          {!isDraft && isBilled ? (
            <View className="mb-4 -mx-5 rounded-[10px] border border-[#FDE68A] bg-[#FEFCE8] px-4 py-3">
              <View className="flex-row items-center">
                <Ionicons name="cash-outline" size={16} color="#B45309" />
                <View className="ml-2 flex-1">
                  <Text className="text-[12px] leading-4 text-[#92400E]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    This transaction has been billed and can no longer be edited or requested for voiding.
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {!isDraft && isTransactionLocked ? (
            <View className="mb-4 -mx-5 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
              <View className="flex-row items-center">
                <Ionicons name="lock-closed-outline" size={16} color="#DC2626" />
                <View className="ml-2 flex-1">
                  <Text className="text-[12px] leading-4 text-[#991B1B]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {transactionLockMessage}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {!isDraft && !isVoided && (type === "docking" || type === "tickets") ? (
            <Pressable
              onPress={openVoidModal}
              disabled={isStatusActionDisabled}
              className={`mt-0 mb-4 -mx-5 rounded-[10px] px-5 py-3 ${statusButtonClass} ${isStatusActionDisabled ? "opacity-40" : ""}`}
            >
              <View className="flex-row items-center justify-center gap-1.5">
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={statusButtonIconColor}
                />
                <Text
                  className={`text-[14px] font-semibold leading-[18px] ${statusButtonTextClass}`}
                  style={{ fontFamily: "Montserrat_600SemiBold" }}
                >
                  {statusButtonLabel}
                </Text>
              </View>
            </Pressable>
          ) : !isDraft && !isVoided && type === "banyera" ? (
            <View className="mt-0 mb-4 -mx-5">
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={handleEditBanyera}
                  disabled={isTransactionLocked || isBilled}
                  className={`flex-1 flex-row items-center justify-center rounded-[10px] border border-[#E8E1E6] px-5 py-3 ${isTransactionLocked || isBilled ? "bg-[#F8F8FA] opacity-60" : "bg-white"}`}
                >
                  <Ionicons name="create-outline" size={16} color="#1A1F36" />
                  <Text
                    className="ml-2 text-[13px] font-semibold text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    Edit
                  </Text>
                </Pressable>

                <Pressable
                  onPress={openVoidModal}
                  disabled={isStatusActionDisabled}
                  className={`flex-1 flex-row items-center justify-center rounded-[10px] px-4 py-3 ${statusButtonClass} ${isStatusActionDisabled ? "opacity-40" : ""}`}
                >
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={statusButtonIconColor}
                  />
                  <Text
                    className={`ml-2 text-[13px] font-semibold leading-[18px] ${statusButtonTextClass}`}
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    {statusButtonLabel}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => setIsBanyeraPrintPreviewOpen(true)}
                disabled={isPrintingBanyera}
                className={`mt-3 h-12 flex-row items-center justify-center rounded-[10px] ${isPrintingBanyera ? "bg-[#46506E]" : "bg-[#1A1F36]"}`}
              >
                {isPrintingBanyera ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="print-outline" size={17} color="#FFFFFF" />
                    <Text
                      className="ml-2 text-[14px] font-semibold text-white"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      {banyeraPrintButtonLabel}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

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
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text
            className="text-[18px] text-white"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            {isDraftDetail
              ? "Draft Details"
              : type === "banyera"
              ? "Banyera Details"
              : type === "docking"
              ? "Docking Details"
              : type === "tickets"
              ? "Ticket Details"
              : type === "remittance"
              ? "Remittance Details"
              : "Transaction Details"}
          </Text>
          <View className="w-6" />
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 28, paddingTop: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>

      <PrintPreviewModal
        visible={isBanyeraPrintPreviewOpen}
        title="OPOL FISH PORT"
        subtitle="BANYERA TRANSACTION"
        details={banyeraDetailPreviewDetails}
        lines={banyeraDetailPreviewLines}
        totalText={banyeraDetailTotalText}
        printLabel={banyeraDetailPrintLabel}
        printing={isPrintingBanyera}
        onClose={() => {
          if (!isPrintingBanyera) {
            setIsBanyeraPrintPreviewOpen(false);
          }
        }}
        onPrint={handlePrintBanyera}
      />

      <EditModal
        visible={editModalVisible}
        transaction={type === "banyera" ? detail : null}
        saving={isSavingEdit}
        onClose={closeEditModal}
        onSave={handleSaveBanyeraEdit}
      />
      <VoidTransactionModal
        visible={voidModalVisible}
        transactionType={type === "remittance" ? "docking" : type ?? "docking"}
        transaction={detail}
        selectedReason={voidReasonOption}
        customReason={voidReasonCustom}
        reasonError={voidReasonError}
        saving={isSavingVoidAction}
        onReasonChange={(value) => {
          setVoidReasonOption(value);
          if (voidReasonError) setVoidReasonError("");
        }}
        onCustomReasonChange={(value) => {
          setVoidReasonCustom(value);
          if (voidReasonError) setVoidReasonError("");
        }}
        onClose={closeVoidModal}
        onConfirm={handleVoidConfirm}
      />
    </View>
  );
}
