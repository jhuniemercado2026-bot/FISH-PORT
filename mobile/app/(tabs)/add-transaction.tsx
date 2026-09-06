import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as ImagePicker from "expo-image-picker";
import { usePreventScreenCapture } from "expo-screen-capture";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BluetoothPrinter } from "@netinove/thermal-printer";
import { getAuthSession, getAuthToken } from "../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../api/axios";
import ConsentModal, {
  SignatureConsentOptions,
} from "../../components/ConsentModal";
import DatePicker from "../../components/DatePicker";
import IncreaseDecreaseInput from "../../components/IncreaseDecreaseInput";
import PlateNumberPicker from "../../components/PlateNumberPicker";
import PrintPreviewModal, {
  PrintPreviewLine,
} from "../../components/PrintPreviewModal";
import SearchFilter from "../../components/SearchFilter";
import SignatureModal from "../../components/SignatureModal";
import TimePicker from "../../components/TimePicker";
import VehiclePicker from "../../components/VehiclePicker";
import { useToastStore } from "../../store/toastStore";
import { useHistoryStore } from "../../store/historyStore";
import { useMasterDataStore } from "../../store/masterDataStore";
import {
  getOfflineBoats,
  getOfflineResourceArray,
  saveOfflineBoats,
  saveOfflineResource,
} from "../../utils/offlineMasterData";
import { startTransactionsRealtime } from "../../utils/realtimeTransactions";
import { submitOrQueueOfflineTransaction } from "../../utils/offlineTransactionQueue";


type TransactionType = "banyera" | "docking" | "tickets" | "remittance";

const REMITTANCE_COLLECTION_CACHE_PREFIX = "opol:remittance_today_collection";

type RemittanceCollectionCache = {
  amount: string;
  date: string;
  hasSubmittedRemittance: boolean;
};

const transactionOptions: Array<{
  key: TransactionType;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  color: string;
}> = [
  {
    key: "docking",
    title: "Docking",
    subtitle: "Boat arrival details",
    icon: "boat-outline",
    tint: "rgba(37,99,235,0.08)",
    color: "#2563EB",
  },
  {
    key: "banyera",
    title: "Banyera",
    subtitle: "Inspection details",
    icon: "clipboard-outline",
    tint: "rgba(37,99,235,0.08)",
    color: "#2563EB",
  },
  {
    key: "tickets",
    title: "Tickets",
    subtitle: "Vehicle ticket details",
    icon: "ticket-outline",
    tint: "rgba(37,99,235,0.08)",
    color: "#2563EB",
  },
  {
    key: "remittance",
    title: "Remittance",
    subtitle: "Daily ticket remittance",
    icon: "cash-outline",
    tint: "rgba(37,99,235,0.08)",
    color: "#2563EB",
  },
];

function FormSectionLabel({
  label,
  required = false,
  className = "",
}: {
  label: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <Text
      className={`mb-2 text-[11px] uppercase text-[#6F6F82] ${className}`.trim()}
      style={{ fontFamily: "Montserrat_600SemiBold" }}
    >
      {label}
      {required ? <Text style={{ color: "#DC2626" }}> *</Text> : null}
    </Text>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  multiline = false,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <View className="mt-4">
      <FormSectionLabel label={label} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#9AA3AF"
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        className={`rounded-[10px] border border-[#E8E1E6] bg-white px-4 text-[14px] text-[#1A1F36] ${
          multiline ? "min-h-[110px] py-4" : "h-14"
        }`}
        style={{ fontFamily: "Montserrat_400Regular" }}
      />
    </View>
  );
}

function InlineErrorCard({ message }: { message: string }) {
  if (!message) return null;

  return (
    <View className="mt-2 flex-row items-center gap-2 rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2">
      <Ionicons name="alert-circle-outline" size={14} color="#F87171" />
      <Text
        className="flex-1 text-[12px] text-[#DC2626]"
        style={{ fontFamily: "Montserrat_400Regular" }}
      >
        {message}
      </Text>
    </View>
  );
}

function getManilaDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date());

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return {
    month: map.month ?? "",
    day: map.day ?? "",
    year: map.year ?? "",
    hour: map.hour ?? "",
    minute: map.minute ?? "",
    meridiem: map.dayPeriod?.toUpperCase() ?? "AM",
  };
}

type FishClassification = {
  classification_id: number;
  classification_name: string;
};

type BoatOption = {
  boat_id: number;
  boat_name: string;
  owner_id?: number | null;
  owner?: {
    owner_id?: number | null;
    owner_firstname?: string | null;
    owner_lastname?: string | null;
    full_name?: string | null;
    owner_signature_data_url?: string | null;
    owner_signature_signed_at?: string | null;
  } | null;
  owner_name?: string | null;
  status?: string | null;
  boat_type_id?: number | null;
  registration_id?: string | null;
  boat_type?: {
    boat_type_id?: number | null;
    boat_type_name?: string | null;
    type_name?: string | null;
  } | null;
  boatType?: {
    boat_type_id?: number | null;
    boat_type_name?: string | null;
    type_name?: string | null;
  } | null;
};

type FeeOption = {
  fee_id: number;
  amount: string | number;
  fee_name?: string | null;
  fee_type_name?: string | null;
  boat_type_id?: number | null;
  vehicle_type_id?: number | null;
  status?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  fee_type?: {
    fee_name?: string | null;
  } | null;
  feeType?: {
    fee_name?: string | null;
  } | null;
  vehicle_type?: {
    vehicle_type_id?: number | null;
    type_name?: string | null;
    deleted_at?: string | null;
  } | null;
  vehicleType?: {
    vehicle_type_id?: number | null;
    type_name?: string | null;
    deleted_at?: string | null;
  } | null;
};

type BanyeraItem = {
  classification_id: string;
  quantity: string;
  daug?: string;
};

type VehicleTypeOption = {
  vehicle_type_id: number;
  type_name: string;
  deleted_at?: string | null;
};

type AnnualVehicleTicketOption = {
  ticket_id?: number;
  vehicle_type_id?: number | string | null;
  control_number?: string | null;
  official_receipt_no?: string | null;
  plate_number?: string | null;
  driver_name?: string | null;
  ticket_type?: string | null;
  ticket_date?: string | null;
  end_date?: string | null;
  is_voided?: boolean | number | null;
  voided_at?: string | null;
};

type TicketFeeItem = {
  fee_id: string;
  quantity: string;
  row_type: "daily" | "banyera";
};

type TransactionLockState = {
  is_locked?: boolean | null;
  message?: string | null;
  applies_to?: string | null;
  lock_scope?: string | null;
  unlock_at?: string | null;
  remittance_reference_no?: string | null;
};

type BanyeraPreviewLine = {
  name: string;
  quantity: number;
  fee: number;
  subtotal: number;
  daug: number | null;
};

type SaveOptions = {
  skipBanyeraPreview?: boolean;
  printed?: boolean;
};

function getFeeName(fee?: FeeOption | null) {
  return String(
    fee?.feeType?.fee_name ??
      fee?.fee_type?.fee_name ??
      fee?.fee_type_name ??
      fee?.fee_name ??
      ""
  ).trim().toLowerCase();
}

function isBanyeraFee(fee?: FeeOption | null) {
  return getFeeName(fee) === "banyera";
}

function getManilaDateString() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
}

function isFeeActive(fee?: FeeOption | null) {
  const today = getManilaDateString();
  const effectiveFrom = String(fee?.effective_from ?? "").slice(0, 10);
  const effectiveTo = String(fee?.effective_to ?? "").slice(0, 10);

  if (effectiveFrom && effectiveFrom > today) {
    return false;
  }

  if (effectiveTo && effectiveTo <= today) {
    return false;
  }

  return true;
}

function getFeeAmount(fee?: FeeOption | null) {
  return Number(fee?.amount ?? 0);
}

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPrinterPeso(amount: number) {
  return `PHP ${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPreviewDateTime(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/
  );

  if (!match) {
    return value || "-";
  }

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );

  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  const dateText = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeText = date
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s/g, "");

  return `${dateText} - ${timeText}`;
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

function buildBanyeraReceiptText({
  boatName,
  boatType,
  ownerName,
  transactionDateTime,
  lines,
  totalFee,
}: {
  boatName: string;
  boatType: string;
  ownerName: string;
  transactionDateTime: string;
  lines: BanyeraPreviewLine[];
  totalFee: number;
}) {
  const receiptLines = [
    centerPrinterText("OPOL FISH PORT"),
    centerPrinterText("BANYERA TRANSACTION"),
    "-".repeat(32),
    `Date: ${transactionDateTime || "-"}`,
    ...splitPrinterText(`Boat: ${boatName || "-"}`),
    ...splitPrinterText(`Type: ${boatType || "-"}`),
    ...splitPrinterText(`Owner: ${ownerName || "-"}`),
    "-".repeat(32),
  ];

  lines.forEach((line, index) => {
    receiptLines.push(`${index + 1}. ${line.name || "Fish"}`);
    receiptLines.push(
      padPrinterColumns(
        `${line.quantity} x ${formatPrinterPeso(line.fee)}`,
        formatPrinterPeso(line.subtotal)
      )
    );

    if (line.daug !== null && line.daug > 0) {
      receiptLines.push(padPrinterColumns("Daug", formatPrinterPeso(line.daug)));
    }
  });

  receiptLines.push(
    "-".repeat(32),
    padPrinterColumns("TOTAL", formatPrinterPeso(totalFee)),
    "",
    "Signature: ________________",
    "",
    "",
    ""
  );

  return receiptLines.join("\n");
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

function hasArchivedAt(value?: string | null) {
  return String(value ?? "").trim() !== "";
}

function isActiveVehicleType(vehicleType?: VehicleTypeOption | null) {
  return Boolean(vehicleType?.vehicle_type_id) && !hasArchivedAt(vehicleType?.deleted_at);
}

function feeHasArchivedVehicleType(fee?: FeeOption | null) {
  const rawVehicleType = fee?.vehicleType ?? fee?.vehicle_type ?? null;

  return hasArchivedAt(rawVehicleType?.deleted_at);
}

function hasReachableInternet(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
} | null) {
  if (!state) return false;
  return state.isConnected === true && state.isInternetReachable !== false;
}

function getBoatTypeId(boat?: BoatOption | null) {
  return String(
    boat?.boat_type_id ??
      boat?.boat_type?.boat_type_id ??
      boat?.boatType?.boat_type_id ??
      ""
  );
}

function matchesId(left?: string | number | null, right?: string | number | null) {
  return String(left ?? "") === String(right ?? "");
}

function isBoatActive(boat?: BoatOption | null) {
  return String(boat?.status ?? "").trim().toLowerCase() === "active";
}

function buildTransactionDateTime(
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
  meridiem: "AM" | "PM"
) {
  let hour24 = Number(hour);

  if (Number.isNaN(hour24) || hour24 < 1 || hour24 > 12) {
    return "";
  }

  if (meridiem === "AM") {
    hour24 = hour24 === 12 ? 0 : hour24;
  } else {
    hour24 = hour24 === 12 ? 12 : hour24 + 12;
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${String(hour24).padStart(2, "0")}:${minute.padStart(2, "0")}:00`;
}

function buildDateFromParts(year: string, month: string, day: string) {
  if (!year.trim() || !month.trim() || !day.trim()) {
    return "";
  }

  return `${year.trim()}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function buildDateObjectFromParts(year: string, month: string, day: string) {
  const normalizedYear = year.trim();
  const normalizedMonth = month.trim();
  const normalizedDay = day.trim();

  if (!normalizedYear || !normalizedMonth || !normalizedDay) {
    return null;
  }

  const nextDate = new Date(
    Number(normalizedYear),
    Number(normalizedMonth) - 1,
    Number(normalizedDay)
  );

  if (Number.isNaN(nextDate.getTime())) {
    return null;
  }

  return nextDate;
}

function buildRemittanceCollectionCacheKey(userId: string | number | null | undefined, date: string) {
  return `${REMITTANCE_COLLECTION_CACHE_PREFIX}:${String(userId ?? "guest")}:${date}`;
}

function getRealtimeRecordDate(record?: Record<string, any> | null) {
  return String(
    record?.date ??
      record?.ticket_date ??
      record?.transaction_date ??
      record?.created_at ??
      ""
  ).slice(0, 10);
}

async function readRemittanceCollectionCache(
  userId: string | number | null | undefined,
  date: string
): Promise<RemittanceCollectionCache | null> {
  try {
    const raw = await AsyncStorage.getItem(buildRemittanceCollectionCacheKey(userId, date));
    if (!raw) return null;

    const cached = JSON.parse(raw) as Partial<RemittanceCollectionCache>;
    if (cached.date !== date) return null;

    return {
      amount: String(cached.amount ?? "0"),
      date,
      hasSubmittedRemittance: Boolean(cached.hasSubmittedRemittance),
    };
  } catch {
    return null;
  }
}

async function saveRemittanceCollectionCache(
  userId: string | number | null | undefined,
  cache: RemittanceCollectionCache
) {
  try {
    await AsyncStorage.setItem(
      buildRemittanceCollectionCacheKey(userId, cache.date),
      JSON.stringify(cache)
    );
  } catch {
    // Cache writes are best-effort; the live API value remains the source of truth.
  }
}

function getVehicleSpecificFees(
  feeOptions: FeeOption[],
  vehicleTypeId: string
) {
  if (!vehicleTypeId) {
    return [];
  }

  return feeOptions.filter(
    (fee) =>
      String(fee.vehicle_type_id ?? "") === String(vehicleTypeId) &&
      isFeeActive(fee)
  );
}

function getDailyApplicableVehicleFees(
  feeOptions: FeeOption[],
  vehicleTypeId: string
) {
  return getVehicleSpecificFees(feeOptions, vehicleTypeId).filter((fee) => {
    const feeTypeName = getFeeName(fee);
    return feeTypeName === "vehicle ticket daily" || feeTypeName === "banyera";
  });
}

function getAutoFeeForTicketType(
  feeOptions: FeeOption[],
  ticketType: "daily" | "annual" | "banyera"
) {
  const targetFeeName = {
    annual: "vehicle ticket annual",
    banyera: "banyera",
    daily: "vehicle ticket daily",
  }[ticketType];

  return feeOptions.find((fee) => getFeeName(fee) === targetFeeName) ?? null;
}

function buildDailyTicketFeeItems(
  feeOptions: FeeOption[],
  vehicleTypeId: string,
  quantity = "0",
  options: { zeroDailyTicket?: boolean } = {}
): TicketFeeItem[] {
  const applicableFees = getDailyApplicableVehicleFees(feeOptions, vehicleTypeId);
  const dailyFee = getAutoFeeForTicketType(applicableFees, "daily");
  const banyeraFee = getAutoFeeForTicketType(applicableFees, "banyera");

  return [
    {
      fee_id: options.zeroDailyTicket ? "" : dailyFee ? String(dailyFee.fee_id) : "",
      quantity: quantity || "0",
      row_type: "daily",
    },
    {
      fee_id: banyeraFee ? String(banyeraFee.fee_id) : "",
      quantity: "0",
      row_type: "banyera",
    },
  ];
}

function buildVehicleTypesFromFees(feeOptions: FeeOption[]): VehicleTypeOption[] {
  const seen = new Map<string, VehicleTypeOption>();

  feeOptions.forEach((fee) => {
    const rawVehicleType = fee.vehicleType ?? fee.vehicle_type ?? null;

    if (feeHasArchivedVehicleType(fee)) {
      return;
    }

    const vehicleTypeId = String(
      fee.vehicle_type_id ?? rawVehicleType?.vehicle_type_id ?? ""
    ).trim();

    if (!vehicleTypeId) {
      return;
    }

    const typeName =
      rawVehicleType?.type_name ??
      "";

    if (!typeName || seen.has(vehicleTypeId)) {
      return;
    }

    seen.set(vehicleTypeId, {
      vehicle_type_id: Number(vehicleTypeId),
      type_name: typeName,
      deleted_at: null,
    });
  });

  return Array.from(seen.values()).sort((a, b) =>
    a.type_name.localeCompare(b.type_name)
  );
}

function isValidAnnualVehicleTicket(ticket?: AnnualVehicleTicketOption | null) {
  if (String(ticket?.ticket_type ?? "").toLowerCase() !== "annual") {
    return false;
  }

  if (ticket?.is_voided || ticket?.voided_at) {
    return false;
  }

  const today = getManilaDateString();
  const startDate = String(ticket?.ticket_date ?? "").slice(0, 10);
  const endDate = String(ticket?.end_date ?? ticket?.ticket_date ?? "").slice(0, 10);

  if (startDate && startDate > today) {
    return false;
  }

  if (endDate && endDate < today) {
    return false;
  }

  return true;
}

function unwrapSavedTransactionData(data: any) {
  if (data?.data && !Array.isArray(data.data)) return data.data;
  if (data?.transaction && !Array.isArray(data.transaction)) return data.transaction;
  if (data?.ticket && !Array.isArray(data.ticket)) return data.ticket;
  if (data?.docking && !Array.isArray(data.docking)) return data.docking;
  if (data?.banyera && !Array.isArray(data.banyera)) return data.banyera;
  if (data?.remittance && !Array.isArray(data.remittance)) return data.remittance;

  return data;
}

export default function AddTransactionScreen() {
  usePreventScreenCapture();

  const manilaNow = getManilaDateParts();
  const authToken = getAuthToken();
  const showToast = useToastStore((state) => state.showToast);
  const triggerHistoryRefresh = useHistoryStore((state) => state.triggerRefresh);
  const addSyncedTransactions = useHistoryStore((state) => state.addSyncedTransactions);
  const addQueuedDrafts = useHistoryStore((state) => state.addQueuedDrafts);
  const realtimeTransactionLock = useHistoryStore((state) => state.transactionLock);
  const setRealtimeTransactionLock = useHistoryStore((state) => state.setTransactionLock);
  const masterDataRefreshKey = useMasterDataStore((state) => state.refreshKey);
  const [selectedType, setSelectedType] =
    useState<TransactionType>("docking");
  const [boatId, setBoatId] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [documentationPath, setDocumentationPath] = useState("");
  const [quantity, setQuantity] = useState("");
  const [feeId, setFeeId] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [dockingBoatId, setDockingBoatId] = useState("");
  const [dockingFeeId, setDockingFeeId] = useState("");
  const [dockingFee, setDockingFee] = useState("");
  const [dockingMonth, setDockingMonth] = useState(manilaNow.month);
  const [dockingDay, setDockingDay] = useState(manilaNow.day);
  const [dockingYear, setDockingYear] = useState(manilaNow.year);
  const [dockingHour, setDockingHour] = useState(manilaNow.hour);
  const [dockingMinute, setDockingMinute] = useState(manilaNow.minute);
  const [dockingMeridiem, setDockingMeridiem] = useState<"AM" | "PM">(
    manilaNow.meridiem === "PM" ? "PM" : "AM"
  );
  const [isDockingDateAuto, setIsDockingDateAuto] = useState(true);
  const [isDockingTimeAuto, setIsDockingTimeAuto] = useState(true);
  const [classifications, setClassifications] = useState<FishClassification[]>([]);
  const [selectedClassificationId, setSelectedClassificationId] = useState<number | null>(null);
  const [isLoadingClassifications, setIsLoadingClassifications] = useState(false);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [banyeraBoatId, setBanyeraBoatId] = useState("");
  const [banyeraBoatSearch, setBanyeraBoatSearch] = useState("");
  const [isBanyeraBoatPickerOpen, setIsBanyeraBoatPickerOpen] = useState(false);
  const [banyeraFeeId, setBanyeraFeeId] = useState("");
  const [banyeraFeeSearch, setBanyeraFeeSearch] = useState("");
  const [isBanyeraFeePickerOpen, setIsBanyeraFeePickerOpen] = useState(false);
  const [banyeraMonth, setBanyeraMonth] = useState(manilaNow.month);
  const [banyeraDay, setBanyeraDay] = useState(manilaNow.day);
  const [banyeraYear, setBanyeraYear] = useState(manilaNow.year);
  const [banyeraHour, setBanyeraHour] = useState(manilaNow.hour);
  const [banyeraMinute, setBanyeraMinute] = useState(manilaNow.minute);
  const [banyeraMeridiem, setBanyeraMeridiem] = useState<"AM" | "PM">(
    manilaNow.meridiem === "PM" ? "PM" : "AM"
  );
  const [isBanyeraDateAuto, setIsBanyeraDateAuto] = useState(true);
  const [isBanyeraTimeAuto, setIsBanyeraTimeAuto] = useState(true);
  const [banyeraItems, setBanyeraItems] = useState<BanyeraItem[]>([
    { classification_id: "", quantity: "0", daug: "" },
  ]);
  const [banyeraOwnerSignature, setBanyeraOwnerSignature] = useState("");
  const [banyeraOwnerSignatureSaveForFuture, setBanyeraOwnerSignatureSaveForFuture] =
    useState(false);
  const [pendingBanyeraOwnerSignature, setPendingBanyeraOwnerSignature] =
    useState("");
  const [isBanyeraSignatureModalOpen, setIsBanyeraSignatureModalOpen] =
    useState(false);
  const [isBanyeraConsentModalOpen, setIsBanyeraConsentModalOpen] =
    useState(false);
  const [isSavingBanyeraSignature, setIsSavingBanyeraSignature] =
    useState(false);
  const [banyeraFieldErrors, setBanyeraFieldErrors] = useState<Record<string, string>>({});
  const [isPrintingBanyeraPreview, setIsPrintingBanyeraPreview] = useState(false);
  const [isBanyeraPrintPreviewOpen, setIsBanyeraPrintPreviewOpen] = useState(false);
  const [dockingFieldErrors, setDockingFieldErrors] = useState<Record<string, string>>({});
  const [boatSearch, setBoatSearch] = useState("");
  const [isBoatPickerOpen, setIsBoatPickerOpen] = useState(false);
  const [isLoadingBoats, setIsLoadingBoats] = useState(false);
  const [fees, setFees] = useState<FeeOption[]>([]);
  const [feeSearch, setFeeSearch] = useState("");
  const [isFeePickerOpen, setIsFeePickerOpen] = useState(false);
  const [isLoadingFees, setIsLoadingFees] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeOption[]>([]);
  const [isLoadingVehicleTypes, setIsLoadingVehicleTypes] = useState(false);
  const [annualVehicleTickets, setAnnualVehicleTickets] = useState<
    AnnualVehicleTicketOption[]
  >([]);
  const [isLoadingAnnualVehicleTickets, setIsLoadingAnnualVehicleTickets] =
    useState(false);
  const [ticketControlNumber, setTicketControlNumber] = useState("");
  const [ticketPlateSearch, setTicketPlateSearch] = useState("");
  const [ticketVehicleTypeId, setTicketVehicleTypeId] = useState("");
  const [ticketVehicleTypeSearch, setTicketVehicleTypeSearch] = useState("");
  const [ticketFeeItems, setTicketFeeItems] = useState<TicketFeeItem[]>(() =>
    buildDailyTicketFeeItems([], "", "0")
  );
  const [ticketMonth, setTicketMonth] = useState(manilaNow.month);
  const [ticketDay, setTicketDay] = useState(manilaNow.day);
  const [ticketYear, setTicketYear] = useState(manilaNow.year);
  const [isTicketDateAuto, setIsTicketDateAuto] = useState(true);
  const [ticketFieldErrors, setTicketFieldErrors] = useState<
    Record<string, string>
  >({});
  const [remittanceMonth, setRemittanceMonth] = useState(manilaNow.month);
  const [remittanceDay, setRemittanceDay] = useState(manilaNow.day);
  const [remittanceYear, setRemittanceYear] = useState(manilaNow.year);
  const [isRemittanceDateAuto, setIsRemittanceDateAuto] = useState(true);
  const [remittanceCollected, setRemittanceCollected] = useState("0");
  const [remittanceCash, setRemittanceCash] = useState("0");
  const [remittanceRemarks, setRemittanceRemarks] = useState("");
  const [isLoadingRemittanceCollection, setIsLoadingRemittanceCollection] =
    useState(false);
  const [hasSubmittedRemittance, setHasSubmittedRemittance] = useState(false);
  const [remittanceFieldErrors, setRemittanceFieldErrors] = useState<
    Record<string, string>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [transactionLock, setTransactionLock] = useState<TransactionLockState | null>(null);
  const [hasInternet, setHasInternet] = useState(true);
  const remittanceCollectionRequestRef = useRef(0);
  const ticketDateValue = buildDateObjectFromParts(
    ticketYear,
    ticketMonth,
    ticketDay
  );
  const banyeraDateValue = buildDateObjectFromParts(
    banyeraYear,
    banyeraMonth,
    banyeraDay
  );
  const selectedRemittanceDate = buildDateFromParts(
    remittanceYear,
    remittanceMonth,
    remittanceDay
  );
  const remittanceSystemCollection = Number(remittanceCollected || 0);
  const remittanceCashAmount = Number(remittanceCash || 0);
  const remittanceSurplus = Math.max(
    remittanceCashAmount - remittanceSystemCollection,
    0
  );
  const remittanceDeficit = Math.max(
    remittanceSystemCollection - remittanceCashAmount,
    0
  );
  const isGlobalTransactionLocked = Boolean(
    transactionLock?.is_locked && transactionLock?.applies_to === "transactions"
  );
  const isTicketTransactionLocked = Boolean(
    transactionLock?.is_locked &&
      transactionLock?.applies_to === "vehicle-tickets" &&
      selectedType === "tickets"
  );
  const isSelectedTransactionLocked = Boolean(
    selectedType !== "remittance" &&
      (isGlobalTransactionLocked || isTicketTransactionLocked)
  );
  const isRemittanceAlreadySubmitted = Boolean(
    selectedType === "remittance" &&
      (hasSubmittedRemittance ||
        (transactionLock?.is_locked && transactionLock?.applies_to === "vehicle-tickets"))
  );
  const isOfflineRemittance = selectedType === "remittance" && !hasInternet;
  const isSaveDisabled =
    isSubmitting ||
    isSelectedTransactionLocked ||
    isRemittanceAlreadySubmitted ||
    isOfflineRemittance;

  const refreshRemittanceCollection = useCallback(
    async (options: { hydrateCache?: boolean; showSpinner?: boolean } = {}) => {
      const requestId = remittanceCollectionRequestRef.current + 1;
      remittanceCollectionRequestRef.current = requestId;
      const userId = getAuthSession()?.user?.user_id ?? null;

      if (selectedType !== "remittance" || !selectedRemittanceDate) {
        setIsLoadingRemittanceCollection(false);
        return;
      }

      let hasCachedCollection = false;

      if (options.hydrateCache) {
        const cached = await readRemittanceCollectionCache(userId, selectedRemittanceDate);

        if (requestId !== remittanceCollectionRequestRef.current) {
          return;
        }

        if (cached) {
          hasCachedCollection = true;
          setHasSubmittedRemittance(cached.hasSubmittedRemittance);
          setRemittanceCollected(cached.amount);
          setRemittanceCash(cached.amount);
          setRemittanceFieldErrors((current) => ({ ...current, date: "" }));
        }
      }

      if (!authToken) {
        setIsLoadingRemittanceCollection(false);
        return;
      }

      if (options.showSpinner || !hasCachedCollection) {
        setIsLoadingRemittanceCollection(true);
      }

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/remittances/today-collection?date=${encodeURIComponent(
            selectedRemittanceDate
          )}`,
          { headers: buildApiHeaders(authToken) }
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.message || "Unable to load daily ticket collection.");
        }

        if (requestId !== remittanceCollectionRequestRef.current) {
          return;
        }

        const hasSubmittedForDate = Boolean(data?.has_submitted_remittance);
        const amount = hasSubmittedForDate ? 0 : Number(data?.amount ?? 0);
        const amountText = amount > 0 ? amount.toFixed(2) : "0";

        setHasSubmittedRemittance(hasSubmittedForDate);
        setRemittanceCollected(amountText);
        setRemittanceCash(amountText);
        setRemittanceFieldErrors((current) => ({ ...current, date: "" }));
        await saveRemittanceCollectionCache(userId, {
          amount: amountText,
          date: selectedRemittanceDate,
          hasSubmittedRemittance: hasSubmittedForDate,
        });
      } catch {
        if (requestId !== remittanceCollectionRequestRef.current || hasCachedCollection) {
          return;
        }

        setRemittanceCollected("0");
        setRemittanceFieldErrors((current) => ({
          ...current,
          date: "Unable to load daily vehicle ticket collection.",
        }));
      } finally {
        if (requestId === remittanceCollectionRequestRef.current) {
          setIsLoadingRemittanceCollection(false);
        }
      }
    },
    [authToken, selectedRemittanceDate, selectedType]
  );

  useEffect(() => {
    function refreshAutoClockFields() {
      const nextNow = getManilaDateParts();

      if (isDockingDateAuto) {
        setDockingMonth(nextNow.month);
        setDockingDay(nextNow.day);
        setDockingYear(nextNow.year);
      }

      if (isDockingTimeAuto) {
        setDockingHour(nextNow.hour);
        setDockingMinute(nextNow.minute);
        setDockingMeridiem(nextNow.meridiem === "PM" ? "PM" : "AM");
      }

      if (isBanyeraDateAuto) {
        setBanyeraMonth(nextNow.month);
        setBanyeraDay(nextNow.day);
        setBanyeraYear(nextNow.year);
      }

      if (isBanyeraTimeAuto) {
        setBanyeraHour(nextNow.hour);
        setBanyeraMinute(nextNow.minute);
        setBanyeraMeridiem(nextNow.meridiem === "PM" ? "PM" : "AM");
      }

      if (isTicketDateAuto) {
        setTicketMonth(nextNow.month);
        setTicketDay(nextNow.day);
        setTicketYear(nextNow.year);
      }

      if (isRemittanceDateAuto) {
        setRemittanceMonth(nextNow.month);
        setRemittanceDay(nextNow.day);
        setRemittanceYear(nextNow.year);
      }
    }

    refreshAutoClockFields();
    const interval = setInterval(refreshAutoClockFields, 15000);

    return () => clearInterval(interval);
  }, [
    isBanyeraDateAuto,
    isBanyeraTimeAuto,
    isDockingDateAuto,
    isDockingTimeAuto,
    isRemittanceDateAuto,
    isTicketDateAuto,
  ]);

  useEffect(() => {
    NetInfo.fetch().then((state) => {
      setHasInternet(hasReachableInternet(state));
    });

    return NetInfo.addEventListener((state) => {
      setHasInternet(hasReachableInternet(state));
    });
  }, []);

  useEffect(() => {
    setTransactionLock(realtimeTransactionLock ?? null);
  }, [realtimeTransactionLock]);

  useEffect(() => {
    let isMounted = true;

    async function loadTransactionLockState() {
      if (!authToken) {
        setTransactionLock(null);
        return;
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/transaction-lock?resource=vehicle-tickets`, {
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

    loadTransactionLockState();

    return () => {
      isMounted = false;
    };
  }, [authToken, setRealtimeTransactionLock]);

  useEffect(() => {
    refreshRemittanceCollection({ hydrateCache: true });

    return () => {
      remittanceCollectionRequestRef.current += 1;
    };
  }, [refreshRemittanceCollection]);

  useEffect(() => {
    if (selectedType !== "remittance" || !selectedRemittanceDate || !authToken) {
      return undefined;
    }

    return startTransactionsRealtime({
      onTransactionUpdate: (record, payload) => {
        if (payload.type !== "tickets") {
          return;
        }

        if (getRealtimeRecordDate(record) === selectedRemittanceDate) {
          void refreshRemittanceCollection({ showSpinner: true });
        }
      },
      onRemittanceUpdate: (record) => {
        if (getRealtimeRecordDate(record) === selectedRemittanceDate) {
          void refreshRemittanceCollection({ showSpinner: true });
        }
      },
    });
  }, [
    authToken,
    refreshRemittanceCollection,
    selectedRemittanceDate,
    selectedType,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function loadClassifications() {
      const cachedClassifications =
        await getOfflineResourceArray<FishClassification>("fish_classifications");

      if (isMounted && cachedClassifications.length > 0) {
        setClassifications(cachedClassifications);
      }

      if (!authToken) {
        if (isMounted) {
          setIsLoadingClassifications(false);
        }
        return;
      }

      if (cachedClassifications.length === 0 && isMounted) {
        setIsLoadingClassifications(true);
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/fish-classifications`, {
          headers: buildApiHeaders(authToken),
        });

        const data = await response.json().catch(() => []);

        if (!response.ok) {
          throw new Error("Unable to load fish classifications.");
        }

        if (isMounted) {
          const payload = data as unknown;
          const normalizedClassifications = Array.isArray(payload)
            ? payload
            : Array.isArray((payload as { data?: FishClassification[] }).data)
              ? ((payload as { data?: FishClassification[] }).data ?? [])
              : Array.isArray((payload as { classifications?: FishClassification[] }).classifications)
                ? ((payload as { classifications?: FishClassification[] }).classifications ?? [])
                : [];

          setClassifications(normalizedClassifications as FishClassification[]);
          await saveOfflineResource(
            "fish_classifications",
            normalizedClassifications
          );
        }
      } catch {
        if (isMounted) {
          if (cachedClassifications.length === 0) {
            setFormError("Unable to load fish classifications.");
            showToast("error", "Unable to load fish classifications.");
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingClassifications(false);
        }
      }
    }

    loadClassifications();

    return () => {
      isMounted = false;
    };
  }, [authToken, masterDataRefreshKey]);

  useEffect(() => {
    let isMounted = true;

    async function loadVehicleTypes() {
      const cachedVehicleTypes =
        await getOfflineResourceArray<VehicleTypeOption>("vehicle_types");
      const activeCachedVehicleTypes = cachedVehicleTypes.filter((item) =>
        isActiveVehicleType(item)
      );

      if (isMounted && activeCachedVehicleTypes.length > 0) {
        setVehicleTypes(activeCachedVehicleTypes);
      }

      if (!authToken) {
        if (isMounted) {
          setIsLoadingVehicleTypes(false);
        }
        return;
      }

      if (activeCachedVehicleTypes.length === 0 && isMounted) {
        setIsLoadingVehicleTypes(true);
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/vehicle-types`, {
          headers: buildApiHeaders(authToken),
        });

        const data = await response.json().catch(() => []);

        if (!response.ok) {
          throw new Error("Unable to load vehicle types.");
        }

        if (isMounted) {
          const rawVehicleTypes = Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
              ? data.data
              : [];
          const nextVehicleTypes = rawVehicleTypes.filter(
            (item: VehicleTypeOption) => isActiveVehicleType(item)
          );

          setVehicleTypes(
            nextVehicleTypes.length
              ? nextVehicleTypes
              : buildVehicleTypesFromFees(fees)
          );
          await saveOfflineResource("vehicle_types", nextVehicleTypes);
        }
      } catch {
        if (isMounted) {
          const fallbackVehicleTypes = buildVehicleTypesFromFees(fees);

          if (activeCachedVehicleTypes.length) {
            setVehicleTypes(activeCachedVehicleTypes);
          } else if (fallbackVehicleTypes.length) {
            setVehicleTypes(fallbackVehicleTypes);
          } else {
            setFormError("Unable to load vehicle types.");
            showToast("error", "Unable to load vehicle types.");
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingVehicleTypes(false);
        }
      }
    }

    loadVehicleTypes();

    return () => {
      isMounted = false;
    };
  }, [authToken, fees, masterDataRefreshKey]);

  useEffect(() => {
    let isMounted = true;

    async function loadAnnualVehicleTickets() {
      const cachedTickets =
        await getOfflineResourceArray<AnnualVehicleTicketOption>(
          "annual_vehicle_tickets"
        );
      const validCachedTickets = cachedTickets.filter(isValidAnnualVehicleTicket);

      if (isMounted && validCachedTickets.length > 0) {
        setAnnualVehicleTickets(validCachedTickets);
      }

      if (!authToken) {
        if (isMounted) {
          setIsLoadingAnnualVehicleTickets(false);
        }
        return;
      }

      if (validCachedTickets.length === 0 && isMounted) {
        setIsLoadingAnnualVehicleTickets(true);
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/annual-vehicle-tickets`, {
          headers: buildApiHeaders(authToken),
        });

        const data = await response.json().catch(() => []);

        if (!response.ok) {
          throw new Error("Unable to load annual vehicle tickets.");
        }

        const ticketsPayload = Array.isArray(data) ? data : data?.data ?? [];

        if (isMounted) {
          const validTickets = (Array.isArray(ticketsPayload) ? ticketsPayload : []).filter(
            isValidAnnualVehicleTicket
          );
          setAnnualVehicleTickets(validTickets);
          await saveOfflineResource("annual_vehicle_tickets", validTickets);
        }
      } catch {
        if (isMounted) {
          if (validCachedTickets.length === 0) {
            setFormError("Unable to load annual vehicle tickets.");
            showToast("error", "Unable to load annual vehicle tickets.");
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingAnnualVehicleTickets(false);
        }
      }
    }

    loadAnnualVehicleTickets();

    return () => {
      isMounted = false;
    };
  }, [authToken, masterDataRefreshKey]);

  useEffect(() => {
    let isMounted = true;

    async function loadFees() {
      const cachedFees = await getOfflineResourceArray<FeeOption>("fees");
      const activeCachedFees = cachedFees.filter(
        (fee) => !feeHasArchivedVehicleType(fee)
      );

      if (isMounted && activeCachedFees.length > 0) {
        setFees(activeCachedFees);
      }

      if (!authToken) {
        if (isMounted) {
          setIsLoadingFees(false);
        }
        return;
      }

      if (activeCachedFees.length === 0 && isMounted) {
        setIsLoadingFees(true);
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/fees`, {
          headers: buildApiHeaders(authToken),
        });

        const data = await response.json().catch(() => []);

        if (!response.ok) {
          throw new Error("Unable to load fees.");
        }

        if (isMounted) {
          const payload = data as unknown;
          const normalizedFees = Array.isArray(payload)
            ? payload
            : Array.isArray((payload as { data?: FeeOption[] }).data)
              ? ((payload as { data?: FeeOption[] }).data ?? [])
              : Array.isArray((payload as { fees?: FeeOption[] }).fees)
                ? ((payload as { fees?: FeeOption[] }).fees ?? [])
                : [];

          const activeFees = (normalizedFees as FeeOption[]).filter(
            (fee) => !feeHasArchivedVehicleType(fee)
          );

          setFees(activeFees);
          await saveOfflineResource("fees", activeFees);
        }
      } catch {
        if (isMounted) {
          if (activeCachedFees.length === 0) {
            setFormError("Unable to load active fees.");
            showToast("error", "Unable to load active fees.");
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingFees(false);
        }
      }
    }

    loadFees();

    return () => {
      isMounted = false;
    };
  }, [authToken, masterDataRefreshKey]);

  useEffect(() => {
    let isMounted = true;

    async function loadBoats() {
      const cachedBoats = await getOfflineBoats<BoatOption>();

      if (isMounted && cachedBoats.length > 0) {
        setBoats(cachedBoats);
      }

      if (!authToken) {
        if (isMounted) {
          setIsLoadingBoats(false);
        }
        return;
      }

      const networkState = await NetInfo.fetch().catch(() => null);
      if (!hasReachableInternet(networkState)) {
        if (isMounted) {
          if (cachedBoats.length > 0) {
            showToast("info", "Transaction is offline now. You can add data as draft.");
          } else {
            setFormError("Unable to load available boats.");
            showToast("error", "Unable to load available boats.");
          }
          setIsLoadingBoats(false);
        }
        return;
      }

      if (cachedBoats.length === 0 && isMounted) {
        setIsLoadingBoats(true);
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/boats`, {
          headers: buildApiHeaders(authToken),
        });

        const data = await response.json().catch(() => []);

        if (!response.ok) {
          throw new Error("Unable to load boats.");
        }

        if (isMounted) {
          const payload = data as unknown;
          const normalizedBoats = Array.isArray(payload)
            ? payload
            : Array.isArray((payload as { boats?: BoatOption[] }).boats)
              ? ((payload as { boats?: BoatOption[] }).boats ?? [])
              : Array.isArray((payload as { data?: BoatOption[] }).data)
                ? ((payload as { data?: BoatOption[] }).data ?? [])
                : [];

          setBoats(normalizedBoats as BoatOption[]);
          await saveOfflineBoats(normalizedBoats as BoatOption[]);
        }
      } catch {
        if (isMounted) {
          if (cachedBoats.length > 0) {
            showToast("info", "Transaction is offline now. You can add data as draft.");
          } else {
            setFormError("Unable to load available boats.");
            showToast("error", "Unable to load available boats.");
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingBoats(false);
        }
      }
    }

    loadBoats();

    return () => {
      isMounted = false;
    };
  }, [authToken, masterDataRefreshKey]);

  const filteredBoats = boats.filter((boat) => {
    const search = boatSearch.trim().toLowerCase();

    if (!search) {
      return true;
    }

    return (
      boat.boat_name.toLowerCase().includes(search) ||
      String(boat.boat_id).includes(search) ||
      (boat.registration_id ?? "").toLowerCase().includes(search)
    );
  });
  const filteredBanyeraBoats = filteredBoats.filter((boat) => isBoatActive(boat));
  const selectedBanyeraBoat =
    boats.find((boat) => matchesId(boat.boat_id, banyeraBoatId)) ?? null;
  const selectedBanyeraBoatType =
    selectedBanyeraBoat?.boatType?.boat_type_name ??
    selectedBanyeraBoat?.boatType?.type_name ??
    selectedBanyeraBoat?.boat_type?.boat_type_name ??
    selectedBanyeraBoat?.boat_type?.type_name ??
    "";
  const selectedBanyeraBoatOwner =
    selectedBanyeraBoat?.owner?.full_name ||
    [
      selectedBanyeraBoat?.owner?.owner_firstname,
      selectedBanyeraBoat?.owner?.owner_lastname,
    ].filter(Boolean).join(" ") ||
    selectedBanyeraBoat?.owner_name ||
    "";
  const selectedBanyeraBoatOwnerSignature =
    selectedBanyeraBoat?.owner?.owner_signature_data_url ?? "";
  const hasFreshBanyeraOwnerSignature =
    !!banyeraOwnerSignature &&
    banyeraOwnerSignature !== selectedBanyeraBoatOwnerSignature;
  const hasBanyeraOwnerSignature =
    !!banyeraOwnerSignature || !!selectedBanyeraBoatOwnerSignature;
  const banyeraOwnerSignatureImage =
    banyeraOwnerSignature || selectedBanyeraBoatOwnerSignature;
  const banyeraOwnerSignatureStatus = !selectedBanyeraBoat
    ? "Auto-filled after selecting a boat"
    : hasBanyeraOwnerSignature
      ? hasFreshBanyeraOwnerSignature
        ? "Signature captured"
        : "Signature registered"
      : "No signature registered";
  const banyeraApplicableFees = fees.filter((fee) => {
    if (!selectedBanyeraBoat?.boat_type_id) {
      return false;
    }

    return (
      isBanyeraFee(fee) &&
      isFeeActive(fee) &&
      String(fee.boat_type_id ?? "") === String(selectedBanyeraBoat.boat_type_id)
    );
  });
  const filteredBanyeraFees = banyeraApplicableFees.filter((fee) => {
    const search = banyeraFeeSearch.trim().toLowerCase();

    if (!search) {
      return true;
    }

    return (
      String(fee.fee_id).includes(search) ||
      String(fee.amount).includes(search) ||
      getFeeName(fee).includes(search)
    );
  });
  const selectedBanyeraFee =
    banyeraApplicableFees.find((fee) => matchesId(fee.fee_id, banyeraFeeId)) ??
    null;
  const banyeraBoatInputValue =
    banyeraBoatSearch || selectedBanyeraBoat?.boat_name || "";
  const banyeraFeeInputValue =
    banyeraFeeSearch ||
    (selectedBanyeraFee ? `PHP ${selectedBanyeraFee.amount}` : "");
  const banyeraTotalFee = banyeraItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    return sum + getFeeAmount(selectedBanyeraFee) * qty;
  }, 0);
  const banyeraPreviewDateTime = buildTransactionDateTime(
    banyeraYear,
    banyeraMonth,
    banyeraDay,
    banyeraHour,
    banyeraMinute,
    banyeraMeridiem
  );
  const banyeraPreviewLines: BanyeraPreviewLine[] = banyeraItems.map((item) => {
    const classification = classifications.find((entry) =>
      matchesId(entry.classification_id, item.classification_id)
    );
    const quantity = Number(item.quantity) || 0;
    const fee = getFeeAmount(selectedBanyeraFee);
    const daug = item.daug ? Number(item.daug) : null;

    return {
      name: classification?.classification_name ?? "Select fish classification",
      quantity,
      fee,
      subtotal: fee * quantity,
      daug: daug !== null && !Number.isNaN(daug) ? daug : null,
    };
  });
  const banyeraReceiptText = buildBanyeraReceiptText({
    boatName: selectedBanyeraBoat?.boat_name ?? "",
    boatType: selectedBanyeraBoatType,
    ownerName: selectedBanyeraBoatOwner,
    transactionDateTime: banyeraPreviewDateTime,
    lines: banyeraPreviewLines,
    totalFee: banyeraTotalFee,
  });
  const banyeraPrintPreviewDetails = [
    { label: "Date", value: formatPreviewDateTime(banyeraPreviewDateTime) },
    { label: "Boat", value: selectedBanyeraBoat?.boat_name || "-" },
    { label: "Type", value: selectedBanyeraBoatType || "-" },
    { label: "Owner", value: selectedBanyeraBoatOwner || "-" },
  ];
  const banyeraPrintPreviewLines: PrintPreviewLine[] = banyeraPreviewLines.map((line) => ({
    name: line.name,
    quantity: line.quantity,
    feeText: formatPeso(line.fee),
    subtotalText: formatPeso(line.subtotal),
    daugText: line.daug !== null && line.daug > 0 ? formatPeso(line.daug) : null,
  }));

  const selectedDockingBoat =
    boats.find((boat) => matchesId(boat.boat_id, dockingBoatId)) ?? null;
  const selectedDockingBoatType =
    selectedDockingBoat?.boatType?.boat_type_name ??
    selectedDockingBoat?.boatType?.type_name ??
    selectedDockingBoat?.boat_type?.boat_type_name ??
    selectedDockingBoat?.boat_type?.type_name ??
    "";
  const selectedDockingBoatOwner =
    (selectedDockingBoat as BoatOption & {
      owner?: { full_name?: string | null } | null;
      owner_name?: string | null;
    })?.owner?.full_name ??
    (selectedDockingBoat as BoatOption & { owner_name?: string | null })?.owner_name ??
    "";
  const availableFees = fees.filter((fee) => {
    const selectedBoatTypeId = getBoatTypeId(selectedDockingBoat);

    if (!selectedBoatTypeId) {
      return false;
    }

    return (
      getFeeName(fee) === "docking" &&
      isFeeActive(fee) &&
      matchesId(fee.boat_type_id, selectedBoatTypeId)
    );
  });
  const filteredFees = availableFees.filter((fee) => {
    const search = feeSearch.trim().toLowerCase();
    const feeName =
      fee.feeType?.fee_name ?? fee.fee_type?.fee_name ?? "Fee";

    if (!search) {
      return true;
    }

    return (
      feeName.toLowerCase().includes(search) ||
      String(fee.fee_id).includes(search) ||
      String(fee.amount).includes(search)
    );
  });
  const selectedDockingFee =
    fees.find((fee) => matchesId(fee.fee_id, dockingFeeId)) ?? null;
  const feeInputValue =
    feeSearch ||
    (selectedDockingFee
      ? `₱${Number(selectedDockingFee.amount ?? 0).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "");
  const boatInputValue = boatSearch || selectedDockingBoat?.boat_name || "";
  const selectedAnnualVehicleTicket =
    annualVehicleTickets.find(
      (ticket) =>
        String(ticket.control_number ?? "") === String(ticketControlNumber)
    ) ?? null;
  const selectedTicketVehicleType =
    vehicleTypes.find(
      (vehicleType) =>
        String(vehicleType.vehicle_type_id) === String(ticketVehicleTypeId)
    ) ?? null;
  const isAnnualRegisteredDailyEntry = Boolean(selectedAnnualVehicleTicket);
  const ticketDailyRow =
    ticketFeeItems.find((item) => item.row_type === "daily") ??
    ({
      fee_id: "",
      quantity: "0",
      row_type: "daily",
    } as TicketFeeItem);
  const ticketBanyeraRow =
    ticketFeeItems.find((item) => item.row_type === "banyera") ??
    ({
      fee_id: "",
      quantity: "",
      row_type: "banyera",
    } as TicketFeeItem);
  const ticketPrimaryFeeId =
    ticketFeeItems.find((item) => item.fee_id)?.fee_id ?? "";
  const ticketTotalFee = ticketFeeItems.reduce((sum, item) => {
    const selectedItemFee =
      fees.find((fee) => String(fee.fee_id) === String(item.fee_id)) ?? null;
    const quantity = Number.parseInt(item.quantity || "0", 10) || 0;
    return sum + getFeeAmount(selectedItemFee) * quantity;
  }, 0);

  useEffect(() => {
    if (!selectedBanyeraBoat || banyeraFeeId || banyeraApplicableFees.length === 0) {
      return;
    }

    const defaultFee = banyeraApplicableFees[0];

    setBanyeraFeeId(String(defaultFee.fee_id));
    setBanyeraFeeSearch("");
  }, [banyeraApplicableFees, banyeraFeeId, selectedBanyeraBoat]);

  useEffect(() => {
    if (!selectedDockingBoat || dockingFeeId || availableFees.length === 0) {
      return;
    }

    const defaultFee = availableFees[0];

    setDockingFeeId(String(defaultFee.fee_id));
    setDockingFee(String(defaultFee.amount));
    setFeeSearch("");
  }, [availableFees, dockingFeeId, selectedDockingBoat]);

  useEffect(() => {
    if (vehicleTypes.length > 0 || isLoadingVehicleTypes || fees.length === 0) {
      return;
    }

    const fallbackVehicleTypes = buildVehicleTypesFromFees(fees);

    if (fallbackVehicleTypes.length > 0) {
      setVehicleTypes(fallbackVehicleTypes);
    }
  }, [fees, isLoadingVehicleTypes, vehicleTypes.length]);

  useEffect(() => {
    if (selectedType !== "tickets") {
      return;
    }

    setTicketFeeItems((current) => {
      const dailyRow =
        current.find((item) => item.row_type === "daily") ??
        current[0] ?? {
          fee_id: "",
          quantity: "0",
          row_type: "daily" as const,
        };
      const banyeraRow =
        current.find((item) => item.row_type === "banyera") ??
        current[1] ?? {
          fee_id: "",
          quantity: "",
          row_type: "banyera" as const,
        };

      return [
        { ...dailyRow, row_type: "daily", quantity: dailyRow.quantity || "0" },
        {
          ...banyeraRow,
          row_type: "banyera",
          quantity: banyeraRow.quantity || "",
        },
      ];
    });
  }, [selectedType]);

  useEffect(() => {
    if (selectedType !== "tickets" || !ticketVehicleTypeId) {
      return;
    }

    setTicketFeeItems((current) => {
      const nextRows = buildDailyTicketFeeItems(
        fees,
        ticketVehicleTypeId,
        current[0]?.quantity ?? "0",
        { zeroDailyTicket: isAnnualRegisteredDailyEntry }
      );
      const currentDailyRow =
        current.find((item) => item.row_type === "daily") ?? null;
      const currentBanyeraRow =
        current.find((item) => item.row_type === "banyera") ?? null;

      return nextRows.map((row) => {
        const currentRow =
          row.row_type === "banyera" ? currentBanyeraRow : currentDailyRow;

        return {
          ...row,
          fee_id: row.fee_id,
          quantity: currentRow?.quantity ?? row.quantity ?? "0",
        };
      });
    });
  }, [fees, isAnnualRegisteredDailyEntry, selectedType, ticketVehicleTypeId]);

  function handleAnnualPlateChange(nextControlNumber: string) {
    const matchedTicket =
      annualVehicleTickets.find(
        (ticket) =>
          String(ticket.control_number ?? "") === String(nextControlNumber)
      ) ?? null;
    const nextVehicleTypeId = matchedTicket?.vehicle_type_id
      ? String(matchedTicket.vehicle_type_id)
      : "";

    setTicketControlNumber(nextControlNumber);
    setTicketPlateSearch("");
    setTicketVehicleTypeId(nextVehicleTypeId);
    setTicketVehicleTypeSearch("");
    setTicketFeeItems(
      buildDailyTicketFeeItems(fees, nextVehicleTypeId, "0", {
        zeroDailyTicket: Boolean(matchedTicket),
      })
    );
    setTicketFieldErrors((current) => ({
      ...current,
      control_number: "",
      vehicle_type_id: "",
      fee_id: "",
    }));
  }

  function resetBanyeraForm() {
    const resetNow = getManilaDateParts();
    setBanyeraBoatId("");
    setBanyeraBoatSearch("");
    setIsBanyeraBoatPickerOpen(false);
    setBanyeraFeeId("");
    setBanyeraFeeSearch("");
    setIsBanyeraFeePickerOpen(false);
    setBanyeraMonth(resetNow.month);
    setBanyeraDay(resetNow.day);
    setBanyeraYear(resetNow.year);
    setBanyeraHour(resetNow.hour);
    setBanyeraMinute(resetNow.minute);
    setBanyeraMeridiem(resetNow.meridiem === "PM" ? "PM" : "AM");
    setIsBanyeraDateAuto(true);
    setIsBanyeraTimeAuto(true);
    setBanyeraItems([{ classification_id: "", quantity: "0", daug: "" }]);
    setBanyeraOwnerSignature("");
    setBanyeraOwnerSignatureSaveForFuture(false);
    setPendingBanyeraOwnerSignature("");
    setIsBanyeraSignatureModalOpen(false);
    setIsBanyeraConsentModalOpen(false);
    setIsBanyeraPrintPreviewOpen(false);
    setBanyeraFieldErrors({});
  }

  async function saveBanyeraOwnerSignature(
    signature: string,
    options: SignatureConsentOptions
  ) {
    if (isSavingBanyeraSignature) {
      return;
    }

    const ownerId =
      selectedBanyeraBoat?.owner?.owner_id ?? selectedBanyeraBoat?.owner_id;

    if (!ownerId) {
      setBanyeraOwnerSignature(signature);
      setBanyeraOwnerSignatureSaveForFuture(false);
      setIsBanyeraSignatureModalOpen(false);
      setIsBanyeraConsentModalOpen(false);
      setPendingBanyeraOwnerSignature("");
      setBanyeraFieldErrors((current) => ({
        ...current,
        owner_signature: "",
      }));
      showToast("error", "Select a boat owner before saving signature.");
      return;
    }

    if (!options.saveForFuture) {
      setBanyeraOwnerSignature(signature);
      setBanyeraOwnerSignatureSaveForFuture(false);
      setIsBanyeraSignatureModalOpen(false);
      setIsBanyeraConsentModalOpen(false);
      setPendingBanyeraOwnerSignature("");
      setBanyeraFieldErrors((current) => ({
        ...current,
        owner_signature: "",
      }));
      showToast("success", "Successfully added the signature.");
      return;
    }

    const networkState = await NetInfo.fetch().catch(() => null);
    const isOffline =
      !networkState ||
      (networkState.isConnected === false ||
        networkState.isInternetReachable === false);

    if (isOffline) {
      setBanyeraOwnerSignature(signature);
      setBanyeraOwnerSignatureSaveForFuture(true);
      setIsBanyeraSignatureModalOpen(false);
      setIsBanyeraConsentModalOpen(false);
      setPendingBanyeraOwnerSignature("");
      setBanyeraFieldErrors((current) => ({
        ...current,
        owner_signature: "",
      }));
      showToast(
        "success",
        "Signature saved locally and will sync with the Banyera draft."
      );
      return;
    }

    if (!authToken) {
      showToast("error", "Please sign in again before saving signature.");
      return;
    }

    const signedAt = new Date().toISOString();

    setIsSavingBanyeraSignature(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/boat-owners/${ownerId}`, {
        method: "PUT",
        headers: buildApiHeaders(authToken),
        body: JSON.stringify({
          owner_signature_data_url: signature,
          owner_signature_signed_at: signedAt,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to save signature.");
      }

      const updatedBoats = boats.map((boat) => {
        const boatOwnerId = boat.owner?.owner_id ?? boat.owner_id;

        if (String(boatOwnerId ?? "") !== String(ownerId)) {
          return boat;
        }

        return {
          ...boat,
          owner: {
            ...(boat.owner ?? {}),
            owner_id: ownerId,
            owner_signature_data_url: signature,
            owner_signature_signed_at: signedAt,
          },
        };
      });

      setBoats(updatedBoats);
      await saveOfflineBoats(updatedBoats);
      setBanyeraOwnerSignature(signature);
      setBanyeraOwnerSignatureSaveForFuture(true);
      setIsBanyeraSignatureModalOpen(false);
      setIsBanyeraConsentModalOpen(false);
      setPendingBanyeraOwnerSignature("");
      setBanyeraFieldErrors((current) => ({
        ...current,
        owner_signature: "",
      }));
      showToast("success", "Successfully added the signature.");
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Unable to save signature."
      );
    } finally {
      setIsSavingBanyeraSignature(false);
    }
  }

  function resetTicketForm() {
    const resetNow = getManilaDateParts();
    setTicketControlNumber("");
    setTicketPlateSearch("");
    setTicketVehicleTypeId("");
    setTicketVehicleTypeSearch("");
    setTicketFeeItems(buildDailyTicketFeeItems(fees, "", "0"));
    setTicketMonth(resetNow.month);
    setTicketDay(resetNow.day);
    setTicketYear(resetNow.year);
    setIsTicketDateAuto(true);
    setTicketFieldErrors({});
  }

  function resetRemittanceForm() {
    const resetNow = getManilaDateParts();
    setRemittanceMonth(resetNow.month);
    setRemittanceDay(resetNow.day);
    setRemittanceYear(resetNow.year);
    setIsRemittanceDateAuto(true);
    setRemittanceCollected("0");
    setRemittanceCash("0");
    setRemittanceRemarks("");
    setRemittanceFieldErrors({});
  }

  async function handlePrintBanyeraPreview() {
    if (isPrintingBanyeraPreview) {
      return;
    }

    setIsPrintingBanyeraPreview(true);

    try {
      await printThermalText(banyeraReceiptText);
      showToast("success", "Banyera preview sent to PT-210 printer.");
      await handleSave({ skipBanyeraPreview: true, printed: true });
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to print Banyera preview."
      );
    } finally {
      setIsPrintingBanyeraPreview(false);
    }
  }

  async function handleSaveBanyeraPreview() {
    if (isSubmitting || isPrintingBanyeraPreview) {
      return;
    }

    await handleSave({ skipBanyeraPreview: true });
  }

  async function handleSave(options: SaveOptions = {}) {
    if (isSelectedTransactionLocked) {
      const lockMessage = transactionLock?.message || "Transactions are view-only at the moment.";
      setFormError(lockMessage);
      showToast("error", lockMessage);
      return;
    }

    if (isRemittanceAlreadySubmitted) {
      const message = "Today's remittance has already been submitted.";
      setFormError(message);
      showToast("error", message);
      return;
    }

    setFormError("");

    if (!authToken) {
      setFormError("Please sign in again before saving.");
      showToast("error", "Please sign in again before saving.");
      return;
    }

    const signedInToken = authToken ?? "";

    setIsSubmitting(true);

    try {
      if (selectedType === "remittance") {
        const builtRemittanceDate = buildDateFromParts(
          remittanceYear,
          remittanceMonth,
          remittanceDay
        );
        const trimmedRemarks = remittanceRemarks.trim();
        const nextErrors: Record<string, string> = {};

        if (!builtRemittanceDate) {
          nextErrors.date = "Remittance date is required.";
        }

        if (remittanceSystemCollection <= 0) {
          nextErrors.date = "No cash collections were found for today.";
        }

        if (!String(remittanceCash || "").trim()) {
          nextErrors.amount = "Amount to remit is required.";
        }

        if ((remittanceSurplus > 0 || remittanceDeficit > 0) && !trimmedRemarks) {
          nextErrors.remarks = "Remarks is required when there is a surplus or deficit.";
        }

        setRemittanceFieldErrors(nextErrors);

        if (Object.keys(nextErrors).length) {
          setFormError("Please complete the remittance form.");
          return;
        }

        const remittancePayload = {
          date: builtRemittanceDate,
          amount: remittanceCashAmount,
          surplus: remittanceSurplus,
          deficit: remittanceDeficit,
          remarks: trimmedRemarks || null,
        };

        const { queued, response, draft } = await submitOrQueueOfflineTransaction({
          type: "remittance",
          endpoint: "/remittances",
          payload: remittancePayload,
          label: "Remittance",
          token: signedInToken,
          metadata: {
            date: builtRemittanceDate,
            source: "daily_vehicle_tickets",
          },
        });

        if (queued) {
          if (draft) {
            addQueuedDrafts([draft]);
          }
          setHasSubmittedRemittance(true);
          showToast("success", "Remittance saved as offline draft.");
          resetRemittanceForm();
          return;
        }

        const data = await response?.json().catch(() => null);

        if (!response?.ok) {
          const backendErrors = data?.errors ?? {};
          setRemittanceFieldErrors({
            date: backendErrors.date?.[0] ?? "",
            amount: backendErrors.amount?.[0] ?? "",
            remarks: backendErrors.remarks?.[0] ?? "",
          });
          setFormError(data?.message ?? "Unable to submit remittance.");
          showToast("error", data?.message ?? "Unable to submit remittance.");
          return;
        }

        showToast("success", data?.message ?? "Remittance submitted successfully.");
        setHasSubmittedRemittance(true);
        if (data?.transaction_lock) {
          setTransactionLock(data.transaction_lock);
          setRealtimeTransactionLock(data.transaction_lock);
        }
        if (data) {
          addSyncedTransactions([
            {
              local_id: `remittance-online-${Date.now()}`,
              type: "remittance",
              data: unwrapSavedTransactionData(data),
            },
          ]);
        } else {
          triggerHistoryRefresh();
        }
        resetRemittanceForm();
        return;
      }

      if (selectedType === "banyera") {
        const nextErrors: Record<string, string> = {};
        const builtDate = `${banyeraYear}-${banyeraMonth.padStart(2, "0")}-${banyeraDay.padStart(2, "0")}`;

        if (!banyeraBoatId.trim()) {
          nextErrors.boat_id = "Please select a boat.";
        } else if (!isBoatActive(selectedBanyeraBoat)) {
          nextErrors.boat_id =
            "Only active boats can be used for Banyera transactions.";
        }

        if (!banyeraFeeId.trim()) {
          nextErrors.fee_id = "Fee is required.";
        }

        if (!banyeraMonth.trim() || !banyeraDay.trim() || !banyeraYear.trim()) {
          nextErrors.banyera_date = "Banyera date is required.";
        } else if (builtDate > `${manilaNow.year}-${manilaNow.month}-${manilaNow.day}`) {
          nextErrors.banyera_date = "Banyera date cannot be in the future.";
        }

        if (!banyeraHour.trim() || !banyeraMinute.trim() || !banyeraMeridiem) {
          nextErrors.banyera_time = "Banyera time is required.";
        }

        if (
          banyeraItems.some(
            (item) =>
              !item.classification_id ||
              !item.quantity ||
              Number(item.quantity) < 1
          )
        ) {
          nextErrors.fish_items = "Please select a fish and put 1 or more quantity.";
        }

        if (!banyeraOwnerSignature && !selectedBanyeraBoatOwnerSignature) {
          nextErrors.owner_signature = "Boat owner signature is required.";
        }

        if (Object.keys(nextErrors).length) {
          setBanyeraFieldErrors(nextErrors);
          setFormError("Please complete the banyera form.");
          return;
        }

        const transactionDateTime = buildTransactionDateTime(
          banyeraYear,
          banyeraMonth,
          banyeraDay,
          banyeraHour,
          banyeraMinute,
          banyeraMeridiem
        );

        if (!transactionDateTime) {
          setBanyeraFieldErrors((current) => ({
            ...current,
            banyera_time: "Enter a valid banyera time.",
          }));
          setFormError("Enter a valid banyera time.");
          showToast("error", "Enter a valid banyera time.");
          return;
        }

        const banyeraPayload = {
          boat_id: Number(banyeraBoatId),
          transaction_date: transactionDateTime,
          owner_signature_data_url: banyeraOwnerSignature || selectedBanyeraBoatOwnerSignature,
          owner_signature_signed_at: new Date().toISOString(),
          owner_signature_save_for_future: banyeraOwnerSignatureSaveForFuture,
          print_count: options.printed ? 1 : 0,
          items: banyeraItems.map((item) => ({
            classification_id: Number(item.classification_id),
            quantity: Number(item.quantity),
            fee_id: Number(banyeraFeeId),
            subtotal: getFeeAmount(selectedBanyeraFee) * Number(item.quantity),
            daug: item.daug ? Number(item.daug) : null,
          })),
        };

        if (!options.skipBanyeraPreview) {
          setIsBanyeraPrintPreviewOpen(true);
          return;
        }

        setIsBanyeraPrintPreviewOpen(false);

        const { queued, response, draft } = await submitOrQueueOfflineTransaction({
          type: "banyera",
          endpoint: "/banyera-transactions",
          payload: banyeraPayload,
          label: "Banyera",
          token: signedInToken,
          metadata: {
            boat_name: selectedBanyeraBoat?.boat_name,
            boat_type_name: selectedBanyeraBoatType,
          },
        });

        if (queued) {
          if (draft) {
            addQueuedDrafts([draft]);
          }
          showToast("success", "Banyera saved as offline draft.");
          resetBanyeraForm();
          return;
        }

        const data = await response?.json().catch(() => null);

        if (!response?.ok) {
          setFormError(data?.message ?? "Unable to save Banyera transaction.");
          showToast("error", data?.message ?? "Unable to save Banyera transaction.");
          return;
        }

        showToast("success", "Banyera was successfully added.");
        if (data) {
          addSyncedTransactions([
            {
              local_id: `banyera-online-${Date.now()}`,
              type: "banyera",
              data: unwrapSavedTransactionData(data),
            },
          ]);
        } else {
          triggerHistoryRefresh();
        }
        resetBanyeraForm();
        return;
      }

      if (selectedType === "docking") {
        const nextDockingErrors: Record<string, string> = {};

        if (!dockingBoatId.trim()) {
          nextDockingErrors.boat_id = "Boat name is required.";
        }

        if (!dockingFeeId.trim()) {
          nextDockingErrors.fee_id = "Fee is required.";
        }

        if (Object.keys(nextDockingErrors).length) {
          setDockingFieldErrors(nextDockingErrors);
          setFormError("Please complete the daily docking form.");
          return;
        }

        if (
          !dockingMonth.trim() ||
          !dockingDay.trim() ||
          !dockingYear.trim() ||
          !dockingHour.trim() ||
          !dockingMinute.trim() ||
          !dockingFee.trim()
        ) {
          setFormError("Please complete the daily docking form.");
          return;
        }

        const dockingDate = buildDateFromParts(
          dockingYear,
          dockingMonth,
          dockingDay
        );
        const dockingDateTime = buildTransactionDateTime(
          dockingYear,
          dockingMonth,
          dockingDay,
          dockingHour,
          dockingMinute,
          dockingMeridiem
        );

        if (!dockingDate || !dockingDateTime) {
          setFormError("Enter a valid docking date.");
          showToast("error", "Enter a valid docking date.");
          return;
        }

        const dockingPayload = {
          boat_id: Number(dockingBoatId),
          fee_id: Number(dockingFeeId),
          docking_date: dockingDateTime,
          docking_fee: Number(dockingFee),
        };

        const { queued, response, draft } = await submitOrQueueOfflineTransaction({
          type: "docking",
          endpoint: "/dockings",
          payload: dockingPayload,
          label: "Docking",
          token: signedInToken,
          metadata: {
            boat_name: selectedDockingBoat?.boat_name,
            boat_type_name: selectedDockingBoatType,
          },
        });

        if (queued) {
          if (draft) {
            addQueuedDrafts([draft]);
          }
          showToast("success", "Docking saved as offline draft.");
          setDockingBoatId("");
          setDockingFeeId("");
          setDockingFee("");
          const resetNow = getManilaDateParts();
          setDockingMonth(resetNow.month);
          setDockingDay(resetNow.day);
          setDockingYear(resetNow.year);
          setDockingHour(resetNow.hour);
          setDockingMinute(resetNow.minute);
          setDockingMeridiem(resetNow.meridiem === "PM" ? "PM" : "AM");
          setIsDockingDateAuto(true);
          setIsDockingTimeAuto(true);
          setBoatSearch("");
          setIsBoatPickerOpen(false);
          return;
        }

        const data = await response?.json().catch(() => null);

        if (!response?.ok) {
          setFormError(data?.message ?? "Unable to save Docking record.");
          showToast("error", data?.message ?? "Unable to save Docking record.");
          return;
        }

        showToast("success", "Docking was successfully added.");
        if (data) {
          addSyncedTransactions([
            {
              local_id: `docking-online-${Date.now()}`,
              type: "docking",
              data: unwrapSavedTransactionData(data),
            },
          ]);
        } else {
          triggerHistoryRefresh();
        }
        setDockingBoatId("");
        setDockingFeeId("");
        setDockingFee("");
        const resetNow = getManilaDateParts();
        setDockingMonth(resetNow.month);
        setDockingDay(resetNow.day);
        setDockingYear(resetNow.year);
        setDockingHour(resetNow.hour);
        setDockingMinute(resetNow.minute);
        setDockingMeridiem(resetNow.meridiem === "PM" ? "PM" : "AM");
        setIsDockingDateAuto(true);
        setIsDockingTimeAuto(true);
        setBoatSearch("");
        setIsBoatPickerOpen(false);
        return;
      }

      if (selectedType === "tickets") {
        const nextErrors: Record<string, string> = {};
        const builtTicketDate = buildDateFromParts(
          ticketYear,
          ticketMonth,
          ticketDay
        );
        const visibleTicketRows = [ticketDailyRow, ticketBanyeraRow];
        const hasFeeSelection = visibleTicketRows.some(
          (item) => item.fee_id
        );

        if (!ticketVehicleTypeId.trim()) {
          nextErrors.vehicle_type_id = "Vehicle type is required.";
        }

        if (!hasFeeSelection) {
          nextErrors.fee_id = "Fee is required.";
        }

        if (!builtTicketDate) {
          nextErrors.ticket_date = "Ticket date is required.";
        } else if (builtTicketDate > getManilaDateString()) {
          nextErrors.ticket_date = "Ticket date cannot be in the future.";
        }

        visibleTicketRows.forEach((item, index) => {
          const isZeroedDailyRow =
            isAnnualRegisteredDailyEntry && item.row_type === "daily";

          if (isZeroedDailyRow || !item.fee_id) {
            return;
          }

          if (Number.parseInt(item.quantity || "0", 10) < 0) {
            nextErrors[`fee_qty_${index}`] = "Quantity cannot be negative.";
          }
        });

        if (ticketTotalFee <= 0) {
          nextErrors.fee_id = "Fee is required.";
        }

        if (Object.keys(nextErrors).length) {
          setTicketFieldErrors(nextErrors);
          setFormError("Please complete the daily ticket form.");
          return;
        }

        const ticketFeeParts = visibleTicketRows.reduce(
          (parts, item) => {
            const selectedItemFee =
              fees.find((fee) => String(fee.fee_id) === String(item.fee_id)) ??
              null;
            const quantity = Number.parseInt(item.quantity || "0", 10) || 0;
            const subtotal =
              item.fee_id && quantity > 0
                ? getFeeAmount(selectedItemFee) * quantity
                : 0;

            if (item.row_type === "banyera") {
              return { ...parts, banyeraFee: parts.banyeraFee + subtotal };
            }

            return { ...parts, dailyFee: parts.dailyFee + subtotal };
          },
          { dailyFee: 0, banyeraFee: 0 }
        );

        const ticketPayload = {
          control_number: ticketControlNumber.trim() || null,
          official_receipt_no: null,
          vehicle_type_id: Number(ticketVehicleTypeId),
          plate_number:
            selectedAnnualVehicleTicket?.plate_number?.trim() ?? "",
          driver_name:
            selectedAnnualVehicleTicket?.driver_name?.trim() || null,
          ticket_type: "daily",
          fee_id: Number(ticketPrimaryFeeId),
          daily_fee: ticketFeeParts.dailyFee,
          banyera_fee: ticketFeeParts.banyeraFee,
          ticket_fee: Number(ticketTotalFee),
          ticket_date: builtTicketDate,
          end_date: null,
        };

        const { queued, response, draft } = await submitOrQueueOfflineTransaction({
          type: "tickets",
          endpoint: "/vehicle-tickets",
          payload: ticketPayload,
          label: "Vehicle ticket",
          token: signedInToken,
          metadata: {
            vehicle_type_name: selectedTicketVehicleType?.type_name,
            plate_number: selectedAnnualVehicleTicket?.plate_number,
          },
        });

        if (queued) {
          if (draft) {
            addQueuedDrafts([draft]);
          }
          showToast("success", "Vehicle ticket saved as offline draft.");
          resetTicketForm();
          return;
        }

        const data = await response?.json().catch(() => null);

        if (!response?.ok) {
          const backendErrors = data?.errors ?? {};
          setTicketFieldErrors({
            vehicle_type_id: backendErrors.vehicle_type_id?.[0] ?? "",
            fee_id:
              backendErrors.fee_id?.[0] ??
              backendErrors.ticket_fee?.[0] ??
              "",
            ticket_date: backendErrors.ticket_date?.[0] ?? "",
          });
          setFormError(data?.message ?? "Unable to save vehicle ticket.");
          showToast("error", data?.message ?? "Unable to save vehicle ticket.");
          return;
        }

        showToast("success", "Vehicle ticket was successfully added.");
        if (data) {
          addSyncedTransactions([
            {
              local_id: `tickets-online-${Date.now()}`,
              type: "tickets",
              data: unwrapSavedTransactionData(data),
            },
          ]);
        } else {
          triggerHistoryRefresh();
        }
        resetTicketForm();
        return;
      }
    } catch {
      setFormError("Unable to reach the server.");
      showToast("error", "Unable to reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-[#FFFDFB]">
      <StatusBar barStyle="light-content" backgroundColor="#1A1F36" />

      <SafeAreaView
        className="absolute left-0 right-0 top-0 z-50 bg-transparent"
        edges={["top"]}
      >
        <View
          className="h-[66px] flex-row items-center justify-between overflow-hidden rounded-b-[20px] bg-[#1A1F36] px-5"
          style={{
            boxShadow: "0px 6px 12px rgba(0, 0, 0, 0.18)",
            elevation: 18,
          }}
        >
          <Text
            className="text-[18px] text-white"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            Transactions
          </Text>
          <View
            className={`h-9 flex-row items-center justify-center rounded-full px-3 ${
              hasInternet ? "bg-[#DCFCE7]" : "bg-[#FEE2E2]"
            }`}
          >
            <Ionicons
              name={hasInternet ? "wifi-outline" : "cloud-offline-outline"}
              size={16}
              color={hasInternet ? "#16A34A" : "#DC2626"}
            />
            <Text
              className={`ml-1.5 text-[11px] ${
                hasInternet ? "text-[#16A34A]" : "text-[#DC2626]"
              }`}
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {hasInternet ? "Connected" : "Offline"}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 28, paddingTop: 105 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-0">
          <View className="mt-2 flex-row flex-wrap justify-between">
            {transactionOptions.map((option) => {
              const isActive = selectedType === option.key;

              return (
                <Pressable
                  key={option.key}
                  className={`mb-3 w-[48%] rounded-[10px] border px-3 py-4 ${
                    isActive
                      ? "border-[#1A1F36] bg-[#F8F8FA]"
                      : "border-[#E8E1E6] bg-white"
                  }`}
                  onPress={() => setSelectedType(option.key)}
                  style={{
                    boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.06)",
                    elevation: 3,
                  }}
                >
                  <View
                    className="h-10 w-10 items-center justify-center self-center rounded-[10px]"
                    style={{ backgroundColor: option.tint }}
                  >
                    <Ionicons
                      name={option.icon}
                      size={18}
                      color={option.color}
                    />
                  </View>
                  <Text
                    className="mt-3 text-center text-[13px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    {option.title}
                  </Text>
                  <Text
                    className="mt-1 text-center text-[10px] leading-4 text-[#8A94A3]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  >
                    {option.subtitle}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View
            className="mt-3 rounded-[10px] border border-[#E8E1E6] bg-white px-5 py-5"
            style={{
              boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.06)",
              elevation: 3,
            }}
          >
            <View className="flex-row items-center">
              <View
                className="h-11 w-11 items-center justify-center rounded-[10px]"
                style={{
                  backgroundColor:
                    transactionOptions.find((item) => item.key === selectedType)
                      ?.tint,
                }}
              >
                <Ionicons
                  name={
                    transactionOptions.find((item) => item.key === selectedType)
                      ?.icon ?? "add"
                  }
                  size={20}
                  color={
                    transactionOptions.find((item) => item.key === selectedType)
                      ?.color ?? "#1A1F36"
                  }
                />
              </View>
              <View className="ml-3 flex-1">
                <View>
                  <Text
                    className="text-[16px] leading-[22px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    {transactionOptions.find((item) => item.key === selectedType)
                      ?.title ?? "Transaction"}
                  </Text>
                  <Text
                    className="text-[11px] leading-[14px] text-[#8A94A3]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  >
                    Complete the required fields below.
                  </Text>
                </View>
              </View>
            </View>

            <View className="-mx-5 mt-4 h-px bg-[#E8E1E6]" />

            {selectedType === "docking" ? (
              <>
                <SearchFilter
                  containerStyle={{ marginTop: 16 }}
                  label="Boat Name"
                  required
                  error={dockingFieldErrors.boat_id}
                  errorVariant="card"
                  placeholder="Select boat name"
                  value={dockingBoatId}
                  loading={isLoadingBoats}
                  searchText={boatSearch}
                  onSearchTextChange={(value) => setBoatSearch(value)}
                  options={boats.map((boat) => ({
                    value: String(boat.boat_id),
                    label: boat.boat_name,
                    subtitle:
                      selectedDockingBoatType || "Boat",
                  }))}
                  emptyText="No matching boats found."
                  sheetTitle="Select Boat"
                  onChangeValue={(value) => {
                    setDockingBoatId(value);
                    setDockingFeeId("");
                    setDockingFee("");
                    setBoatSearch("");
                    setFeeSearch("");
                    setDockingFieldErrors((current) => ({
                      ...current,
                      boat_id: "",
                      fee_id: "",
                    }));
                  }}
                />

                <View className="mt-4">
                  <FormSectionLabel label="Boat Type" />
                  <View className="h-14 justify-center rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4">
                    <Text
                      className={`text-[14px] ${
                        selectedDockingBoatType
                          ? "text-[#1A1F36]"
                          : "text-[#9AA3AF]"
                      }`}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {selectedDockingBoatType || "Auto-filled after selecting a boat"}
                    </Text>
                  </View>
                </View>

                <View className="mt-4">
                  <FormSectionLabel label="Boat Owner" />
                  <View className="h-14 justify-center rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4">
                    <Text
                      className={`text-[14px] ${
                        selectedDockingBoatOwner ? "text-[#1A1F36]" : "text-[#9AA3AF]"
                      }`}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {selectedDockingBoatOwner || "Auto-filled after selecting a boat"}
                    </Text>
                  </View>
                </View>

                <View className="mt-4">
                  <FormSectionLabel label="Applicable Fee" />
                  <TextInput
                    editable={false}
                    value={
                      dockingFee
                        ? `₱${Number(dockingFee).toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : ""
                    }
                    placeholder="₱0.00"
                    placeholderTextColor="#9AA3AF"
                    className={`h-14 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4 text-[14px] ${
                      dockingFee ? "text-[#1A1F36]" : "text-[#9AA3AF]"
                    }`}
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  />
                  {dockingFieldErrors.fee_id ? (
                    <InlineErrorCard message={dockingFieldErrors.fee_id} />
                  ) : null}
                </View>

                <View className="mt-4">
                  <FormSectionLabel label="Docking Date" />
                  <DatePicker
                    value={
                      dockingYear && dockingMonth && dockingDay
                        ? new Date(
                            Number(dockingYear),
                            Number(dockingMonth) - 1,
                            Number(dockingDay)
                          )
                        : null
                    }
                    onChange={(nextDate) => {
                      if (!nextDate) {
                        return;
                      }

                      setIsDockingDateAuto(false);
                      setDockingYear(String(nextDate.getFullYear()));
                      setDockingMonth(String(nextDate.getMonth() + 1));
                      setDockingDay(String(nextDate.getDate()));
                    }}
                    placeholder="Select docking date"
                    maxDate={new Date()}
                    containerStyle={{ marginTop: 0 }}
                  />
                </View>

                <TimePicker
                  containerStyle={{ marginTop: 16 }}
                  label="Docking Time"
                  placeholder="Select time"
                  value={{
                    hour: dockingHour || "12",
                    minute: dockingMinute || "00",
                    meridiem: dockingMeridiem,
                  }}
                  onChange={(nextValue) => {
                    setIsDockingTimeAuto(false);
                    setDockingHour(nextValue.hour);
                    setDockingMinute(nextValue.minute);
                    setDockingMeridiem(nextValue.meridiem);
                  }}
                />

                <View className="mt-4">
                  <FormSectionLabel label="Docking Fee" />
                  <TextInput
                    editable={false}
                    value={
                      dockingFee
                        ? `₱${Number(dockingFee).toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : ""
                    }
                    placeholder="₱0.00"
                    placeholderTextColor="#9AA3AF"
                    className={`h-14 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4 text-[14px] ${
                      dockingFee ? "text-[#1A1F36]" : "text-[#9AA3AF]"
                    }`}
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  />
                </View>
              </>
            ) : null}

            {selectedType === "banyera" ? (
              <>
                <View className="mt-4">
                  <SearchFilter
                    containerStyle={{ marginTop: 0 }}
                    label="Boat Name"
                    required
                    error={banyeraFieldErrors.boat_id}
                    errorVariant="card"
                    placeholder="Select boat name"
                    value={banyeraBoatId}
                    loading={isLoadingBoats}
                    searchText={banyeraBoatSearch}
                    onSearchTextChange={(value) => setBanyeraBoatSearch(value)}
                    options={filteredBanyeraBoats.map((boat) => ({
                      value: String(boat.boat_id),
                      label: boat.boat_name,
                      subtitle: selectedBanyeraBoatType || "Boat",
                    }))}
                    emptyText="No matching boats found."
                    sheetTitle="Select Boat"
                    onChangeValue={(value) => {
                      const nextBoat = boats.find((boat) => matchesId(boat.boat_id, value)) ?? null;
                      setBanyeraBoatId(value);
                      setBanyeraFeeId("");
                      setBanyeraFeeSearch("");
                      setBanyeraOwnerSignature(nextBoat?.owner?.owner_signature_data_url ?? "");
                      setBanyeraOwnerSignatureSaveForFuture(false);
                      setPendingBanyeraOwnerSignature("");
                      setIsBanyeraSignatureModalOpen(false);
                      setIsBanyeraConsentModalOpen(false);
                      setBanyeraFieldErrors((current) => ({
                        ...current,
                        boat_id: "",
                        fee_id: "",
                        owner_signature: "",
                      }));
                    }}
                  />
                </View>

                <View className="mt-4">
                  <FormSectionLabel label="Boat Type" />
                  <View className="h-14 justify-center rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4">
                    <Text
                      className={`text-[14px] ${
                        selectedBanyeraBoatType
                          ? "text-[#1A1F36]"
                          : "text-[#9AA3AF]"
                      }`}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {selectedBanyeraBoatType || "Auto-filled after selecting a boat"}
                    </Text>
                  </View>
                </View>

                <View className="mt-4">
                  <FormSectionLabel label="Boat Owner" />
                  <View className="h-14 justify-center rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4">
                    <Text
                      className={`text-[14px] ${
                        selectedBanyeraBoatOwner
                          ? "text-[#1A1F36]"
                          : "text-[#9AA3AF]"
                      }`}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {selectedBanyeraBoatOwner || "Auto-filled after selecting a boat"}
                    </Text>
                  </View>
                </View>

                <View className="mt-4">
                  <FormSectionLabel label="Applicable Fee" />
                  <TextInput
                    editable={false}
                    value={
                      selectedBanyeraFee
                        ? `₱${Number(selectedBanyeraFee.amount ?? 0).toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : ""
                    }
                    placeholder={
                      selectedBanyeraBoat ? "₱0.00" : "₱0.00"
                    }
                    placeholderTextColor="#9AA3AF"
                    className={`h-14 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4 text-[14px] ${
                      selectedBanyeraFee ? "text-[#1A1F36]" : "text-[#9AA3AF]"
                    }`}
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  />
                  {banyeraFieldErrors.fee_id ? (
                    <InlineErrorCard message={banyeraFieldErrors.fee_id} />
                  ) : null}
                </View>

                <View className="mt-4">
                  <DatePicker
                    label="Banyera Date"
                    required
                    error={banyeraFieldErrors.banyera_date}
                    errorVariant="card"
                    placeholder="Select banyera date"
                    precision="day"
                    maxDate={new Date()}
                    value={banyeraDateValue}
                    onChange={(nextDate) => {
                      setIsBanyeraDateAuto(false);
                      setBanyeraMonth(String(nextDate.getMonth() + 1).padStart(2, "0"));
                      setBanyeraDay(String(nextDate.getDate()).padStart(2, "0"));
                      setBanyeraYear(String(nextDate.getFullYear()));
                      setBanyeraFieldErrors((current) => ({
                        ...current,
                        banyera_date: "",
                      }));
                    }}
                  />
                </View>

                <TimePicker
                  containerStyle={{ marginTop: 16 }}
                  label="Banyera Time"
                  required
                  error={banyeraFieldErrors.banyera_time}
                  errorVariant="card"
                  placeholder="Select time"
                  value={{
                    hour: banyeraHour || "12",
                    minute: banyeraMinute || "00",
                    meridiem: banyeraMeridiem,
                  }}
                  onChange={(nextValue) => {
                    setIsBanyeraTimeAuto(false);
                    setBanyeraHour(nextValue.hour);
                    setBanyeraMinute(nextValue.minute);
                    setBanyeraMeridiem(nextValue.meridiem);
                    setBanyeraFieldErrors((current) => ({
                      ...current,
                      banyera_time: "",
                    }));
                  }}
                />

                <View className="mt-4 rounded-[10px] border border-[#E8E1E6] bg-white p-3">
                  <View className="mb-3 flex-row items-center justify-between gap-3">
                    <View className="flex-1 flex-row items-center">
                      <FormSectionLabel label="Fish Items" required className="mb-0 mt-1" />
                    </View>
                    <Pressable
                      onPress={() =>
                        setBanyeraItems((current) => [
                          ...current,
                          { classification_id: "", quantity: "0", daug: "" },
                        ])
                      }
                      className="flex-row items-center self-center"
                    >
                      <Ionicons name="add-outline" size={16} color="#2563EB" />
                      <Text
                        className="ml-1 text-[12px] text-[#2563EB]"
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        Add Item
                      </Text>
                    </Pressable>
                  </View>

                  {banyeraItems.map((item, index) => {
                    const quantity = Number(item.quantity) || 0;
                    const subtotal = selectedBanyeraFee
                      ? getFeeAmount(selectedBanyeraFee) * quantity
                      : 0;

                    return (
                      <View
                        key={`${item.classification_id || "new"}-${index}`}
                        className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-[#FCFBFD] p-3"
                      >
                        <View className="mb-2 flex-row items-center justify-between">
                          <Text
                            className="text-[11px] uppercase text-[#6F6F82]"
                            style={{ fontFamily: "Montserrat_600SemiBold" }}
                          >
                            Item {index + 1}
                          </Text>
                          {banyeraItems.length > 1 ? (
                            <Pressable
                              className="flex-row items-center"
                              onPress={() =>
                                setBanyeraItems((current) =>
                                  current.filter((_, currentIndex) => currentIndex !== index)
                                )
                              }
                            >
                              <Ionicons name="trash-outline" size={14} color="#DC2626" />
                              <Text
                                className="ml-1 text-[12px] text-[#DC2626]"
                                style={{ fontFamily: "Montserrat_600SemiBold" }}
                              >
                                Remove
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>

                        <SearchFilter
                          containerStyle={{ marginTop: 0 }}
                          placeholder="Select fish classification"
                          value={item.classification_id}
                          searchText=""
                          options={classifications
                            .filter((classification) => {
                              const isAlreadySelected = banyeraItems.some(
                                (otherItem, otherIndex) =>
                                  otherIndex !== index &&
                                  String(otherItem.classification_id) === String(classification.classification_id)
                              );
                              return !isAlreadySelected;
                            })
                            .map((classification) => ({
                              value: String(classification.classification_id),
                              label: classification.classification_name,
                            }))}
                          emptyText="No matching fish classifications found."
                          sheetTitle="Select Fish Classification"
                          onChangeValue={(value) => {
                            setBanyeraItems((current) =>
                              current.map((entry, currentIndex) =>
                                currentIndex === index
                                  ? { ...entry, classification_id: value }
                                  : entry
                              )
                            );
                            setBanyeraFieldErrors((current) => ({
                              ...current,
                              fish_items: "",
                            }));
                          }}
                        />

                        <View className="mt-3 flex-row items-start gap-2">
                          <View className="flex-1">
                            <FormSectionLabel label="Qty" />
                            <IncreaseDecreaseInput
                              accessibilityLabel="Banyera quantity"
                              min={0}
                              value={item.quantity}
                              onChange={(value) => {
                                setBanyeraItems((current) =>
                                  current.map((entry, currentIndex) =>
                                    currentIndex === index
                                      ? { ...entry, quantity: value }
                                      : entry
                                  )
                                );
                                setBanyeraFieldErrors((current) => ({
                                  ...current,
                                  fish_items: "",
                                }));
                              }}
                            />
                          </View>
                          <View className="w-[112px]">
                            <FormSectionLabel label="Subtotal" />
                            <View className="h-14 justify-center rounded-[10px] border border-[#E8E1E6] bg-white px-3">
                              <Text
                                className="text-[12px] text-[#1A1F36]"
                                style={{ fontFamily: "Montserrat_400Regular" }}
                              >
                                {subtotal > 0
                                  ? `₱${subtotal.toLocaleString("en-PH", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}`
                                  : "₱0.00"}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View className="mt-2">
                          <FormSectionLabel label="Daug" />
                          <TextInput
                            className="h-14 rounded-[10px] border border-[#E8E1E6] bg-white px-3 text-[14px] text-[#1A1F36]"
                            keyboardType="decimal-pad"
                            placeholder="₱0.00"
                            value={item.daug ?? ""}
                            onChangeText={(value) => {
                              const normalized = value.replace(/[^0-9.]/g, "");
                              setBanyeraItems((current) =>
                                current.map((entry, currentIndex) =>
                                  currentIndex === index
                                    ? { ...entry, daug: normalized }
                                    : entry
                                )
                              );
                              setBanyeraFieldErrors((current) => ({
                                ...current,
                                fish_items: "",
                              }));
                            }}
                            style={{ fontFamily: "Montserrat_400Regular" }}
                          />
                        </View>
                      </View>
                    );
                  })}

                  {banyeraFieldErrors.fish_items ? (
                    <InlineErrorCard message={banyeraFieldErrors.fish_items} />
                  ) : null}
                </View>

                <View className="mt-3">
                  <FormSectionLabel label="Total Fee" />
                  <View className="h-14 justify-center rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4">
                    <Text
                      className="text-[14px] text-[#1A1F36]"
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {banyeraTotalFee > 0
                        ? `₱${banyeraTotalFee.toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "₱0.00"}
                    </Text>
                  </View>
                </View>

                <View className="mt-4">
                  <View className="mb-2 flex-row items-center justify-between">
                    <View className="h-6 mt-2 justify-center">
                      <FormSectionLabel label="Signature" required className="mb-0" />
                    </View>
                    <Pressable
                      className="h-6 flex-row items-center justify-center"
                      disabled={!selectedBanyeraBoat}
                      onPress={() => {
                        setIsBanyeraSignatureModalOpen(true);
                        setBanyeraFieldErrors((current) => ({
                          ...current,
                          owner_signature: "",
                        }));
                      }}
                    >
                      <Ionicons
                        name={hasBanyeraOwnerSignature ? "create-outline" : "add-outline"}
                        size={16}
                        color={selectedBanyeraBoat ? "#2563EB" : "#9AA3AF"}
                      />
                      <Text
                        className={`ml-1 text-[12px] ${
                          selectedBanyeraBoat ? "text-[#2563EB]" : "text-[#9AA3AF]"
                        }`}
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        {hasBanyeraOwnerSignature ? "Update Signature" : "Add Signature"}
                      </Text>
                    </Pressable>
                  </View>
                  <View className="relative h-24 justify-center overflow-hidden border border-[#E8E1E6] bg-white px-4">
                    {banyeraOwnerSignatureImage ? (
                      <>
                        <Image
                          source={{ uri: banyeraOwnerSignatureImage }}
                          className="h-20 w-full opacity-70"
                          resizeMode="contain"
                          blurRadius={12}
                        />
                        <View className="absolute inset-0 items-center justify-center bg-white/40">
                          <View className="flex-row items-center bg-[#1A1F36]/90 px-3 py-1.5">
                            <Ionicons
                              name="eye-off-outline"
                              size={14}
                              color="#FFFFFF"
                            />
                            <Text
                              className="ml-1.5 text-[11px] text-white"
                              style={{ fontFamily: "Montserrat_600SemiBold" }}
                            >
                              Signature hidden
                            </Text>
                          </View>
                        </View>
                      </>
                    ) : (
                      <Text
                        className="text-center text-[14px] text-[#9AA3AF]"
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        {banyeraOwnerSignatureStatus}
                      </Text>
                    )}
                  </View>
                  {banyeraFieldErrors.owner_signature ? (
                    <InlineErrorCard message={banyeraFieldErrors.owner_signature} />
                  ) : null}
                </View>

              </>
            ) : null}

            {selectedType === "tickets" ? (
              <>
                <PlateNumberPicker
                  containerStyle={{ marginTop: 16 }}
                  label="Plate Number"
                  error={ticketFieldErrors.plate_number}
                  errorVariant="card"
                  placeholder="Select annual vehicle plate no."
                  value={ticketControlNumber}
                  loading={isLoadingAnnualVehicleTickets}
                  searchText={ticketPlateSearch}
                  onSearchTextChange={(value) => {
                    setTicketPlateSearch(value);

                    if (ticketControlNumber && value.trim()) {
                      handleAnnualPlateChange("");
                    }
                  }}
                  options={[
                    {
                      value: "",
                      label: "None",
                      icon: "close-circle-outline",
                    },
                    ...annualVehicleTickets.map((ticket) => ({
                      value: String(ticket.control_number ?? ""),
                      label: String(ticket.plate_number || "-"),
                      icon: "pricetag-outline" as const,
                    })),
                  ]}
                  emptyText="No active annual vehicle plates found."
                  sheetTitle="Select Plate Number"
                  onChangeValue={handleAnnualPlateChange}
                />

                <VehiclePicker
                  containerStyle={{ marginTop: 16 }}
                  label="Vehicle Type"
                  required
                  error={ticketFieldErrors.vehicle_type_id}
                  errorVariant="card"
                  placeholder={
                    isAnnualRegisteredDailyEntry
                      ? "Auto-filled from plate number"
                      : "Select vehicle type"
                  }
                  value={ticketVehicleTypeId}
                  loading={isLoadingVehicleTypes}
                  disabled={isAnnualRegisteredDailyEntry}
                  searchText={ticketVehicleTypeSearch}
                  onSearchTextChange={(value) => {
                    setTicketVehicleTypeSearch(value);
                    setTicketVehicleTypeId("");
                    setTicketControlNumber("");
                    setTicketPlateSearch("");
                    setTicketFeeItems(buildDailyTicketFeeItems(fees, "", "0"));
                    setTicketFieldErrors((current) => ({
                      ...current,
                      vehicle_type_id: "",
                      fee_id: "",
                    }));
                  }}
                  options={vehicleTypes.map((vehicleType) => ({
                    value: String(vehicleType.vehicle_type_id),
                    label: vehicleType.type_name,
                    icon: "car-outline",
                  }))}
                  emptyText="No matching vehicle types found."
                  onChangeValue={(nextValue) => {
                    setTicketVehicleTypeId(nextValue);
                    setTicketVehicleTypeSearch("");
                    setTicketControlNumber("");
                    setTicketPlateSearch("");
                    setTicketFeeItems(
                      buildDailyTicketFeeItems(
                        fees,
                        nextValue,
                        ticketDailyRow.quantity ?? "0"
                      )
                    );
                    setTicketFieldErrors((current) => ({
                      ...current,
                      vehicle_type_id: "",
                      fee_id: "",
                    }));
                  }}
                />

                <FormSectionLabel label="Applicable Fee" required className="mt-4" />

                <View className="rounded-[10px] border border-[#E8E1E6] bg-white p-3">
                  <View className="mb-2 flex-row items-center">
                    <Text
                      className="mr-2 flex-1 text-[11px] uppercase text-[#6F6F82]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      DAILY TICKET
                    </Text>
                    <Text
                      className="mr-2 w-[86px] text-center text-[11px] uppercase text-[#6F6F82]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      QTY
                    </Text>
                    <Text
                      className="flex-1 text-right text-[11px] uppercase text-[#6F6F82]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      SUBTOTAL
                    </Text>
                  </View>

                  {[ticketDailyRow, ticketBanyeraRow].map((item, index) => {
                    const rowType = item.row_type;
                    const selectedItemFee =
                      fees.find(
                        (fee) => String(fee.fee_id) === String(item.fee_id)
                      ) ?? null;
                    const quantity = Number.parseInt(item.quantity || "0", 10) || 0;
                    const subtotal = getFeeAmount(selectedItemFee) * quantity;
                    const isZeroedDailyRow =
                      isAnnualRegisteredDailyEntry && rowType === "daily";

                    return (
                      <View key={`${rowType}-${index}`} className={index ? "mt-3" : ""}>
                        {rowType === "banyera" ? (
                          <Text
                            className="mb-1 text-[11px] uppercase text-[#6F6F82]"
                            style={{ fontFamily: "Montserrat_600SemiBold" }}
                          >
                            BANYERA TICKET
                          </Text>
                        ) : null}
                        <View className="flex-row items-start">
                          <View className="mr-2 flex-1">
                            <View className="h-[46px] justify-center rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-3">
                              <Text
                                className="text-[12px] text-[#1A1F36]"
                                numberOfLines={1}
                                style={{ fontFamily: "Montserrat_400Regular" }}
                              >
                                {isZeroedDailyRow
                                  ? "₱0.00"
                                  : item.fee_id
                                  ? `₱${Number(
                                      selectedItemFee?.amount ?? 0
                                    ).toLocaleString("en-PH", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}`
                                  : "₱0.00"}
                              </Text>
                            </View>
                          </View>

                          <View className="mr-2 w-[86px] items-center">
                            <IncreaseDecreaseInput
                              accessibilityLabel={`${rowType} ticket quantity`}
                              buttonClassName="w-6"
                              buttonTextClassName="text-[14px]"
                              className="h-[46px]"
                              emptyWhenMin={false}
                              inputClassName="text-[12px]"
                              min={0}
                              value={item.quantity}
                              onChange={(value) => {
                                setTicketFeeItems((current) =>
                                  current.map((entry) =>
                                    entry.row_type === rowType
                                      ? { ...entry, quantity: value }
                                      : entry
                                  )
                                );
                                setTicketFieldErrors((current) => ({
                                  ...current,
                                  fee_id: "",
                                  [`fee_qty_${index}`]: "",
                                }));
                              }}
                            />
                          </View>

                          <View className="flex-1">
                            <View className="h-[46px] items-end justify-center rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-2">
                              <Text
                                className="text-[12px] text-[#1A1F36]"
                                numberOfLines={1}
                                style={{ fontFamily: "Montserrat_400Regular" }}
                              >
                                {isZeroedDailyRow
                                  ? "₱0.00"
                                  : `₱${subtotal.toLocaleString("en-PH", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}`}
                              </Text>
                            </View>
                          </View>
                        </View>
                        {ticketFieldErrors[`fee_qty_${index}`] ? (
                          <View className="mt-2 px-2 items-center">
                            <Text
                              className="w-full text-center text-[12px] text-[#DC2626]"
                              style={{ fontFamily: "Montserrat_400Regular" }}
                            >
                              {ticketFieldErrors[`fee_qty_${index}`]}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
                <InlineErrorCard message={ticketFieldErrors.fee_id || ""} />

                <View className="mt-4">
                  <DatePicker
                    label="Ticket Date"
                    required
                    error={ticketFieldErrors.ticket_date}
                    errorVariant="card"
                    placeholder="Select ticket date"
                    precision="day"
                    maxDate={new Date()}
                    value={ticketDateValue}
                    onChange={(nextDate) => {
                      setIsTicketDateAuto(false);
                      setTicketMonth(
                        String(nextDate.getMonth() + 1).padStart(2, "0")
                      );
                      setTicketDay(
                        String(nextDate.getDate()).padStart(2, "0")
                      );
                      setTicketYear(String(nextDate.getFullYear()));
                      setTicketFieldErrors((current) => ({
                        ...current,
                        ticket_date: "",
                      }));
                    }}
                  />
                </View>

                <View className="mt-4">
                  <Text
                    className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    Ticket Fee
                  </Text>
                  <TextInput
                    editable={false}
                    value={`₱${ticketTotalFee.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
                    placeholder="₱0.00"
                    placeholderTextColor="#9AA3AF"
                    className="h-14 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4 text-[14px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  />
                </View>
              </>
            ) : null}

            {selectedType === "remittance" ? (
              <>
                <View className="mt-4">
                  <FormSectionLabel label="Today's Collection" required />
                  <View className="h-14 flex-row items-center justify-center rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4">
                    {isLoadingRemittanceCollection ? (
                      <ActivityIndicator color="#1A1F36" size="small" />
                    ) : (
                      <Text
                        className="w-full text-[14px] text-[#1A1F36]"
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        {`₱${remittanceSystemCollection.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`}
                      </Text>
                    )}
                  </View>
                  <InlineErrorCard message={remittanceFieldErrors.date || ""} />
                </View>

                <Field
                  label="Amount to Remit"
                  placeholder="0.00"
                  value={remittanceCash}
                  onChangeText={(value) => {
                    setRemittanceCash(value.replace(/[^0-9.]/g, ""));
                    setRemittanceFieldErrors((current) => ({
                      ...current,
                      amount: "",
                    }));
                  }}
                />
                <InlineErrorCard message={remittanceFieldErrors.amount || ""} />

                <View className="mt-4 flex-row gap-3">
                  <View className="flex-1">
                    <FormSectionLabel label="Surplus" />
                    <TextInput
                      editable={false}
                      value={`₱${remittanceSurplus.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                      className="h-14 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4 text-[14px] text-[#1A1F36]"
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    />
                  </View>
                  <View className="flex-1">
                    <FormSectionLabel label="Deficit" />
                    <TextInput
                      editable={false}
                      value={`₱${remittanceDeficit.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                      className="h-14 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4 text-[14px] text-[#1A1F36]"
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    />
                  </View>
                </View>

                <Field
                  label="Remarks"
                  placeholder="Add remittance remarks"
                  value={remittanceRemarks}
                  onChangeText={(value) => {
                    setRemittanceRemarks(value);
                    setRemittanceFieldErrors((current) => ({
                      ...current,
                      remarks: "",
                    }));
                  }}
                  multiline
                />
                <InlineErrorCard message={remittanceFieldErrors.remarks || ""} />
              </>
            ) : null}

            {(isSelectedTransactionLocked || isRemittanceAlreadySubmitted) ? (
              <View className="mt-4 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
                <View className="flex-row items-center">
                  <Ionicons name="lock-closed-outline" size={16} color="#DC2626" />
                  <Text className="ml-2 flex-1 text-[12px] leading-4 text-[#991B1B]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {isRemittanceAlreadySubmitted
                      ? "Today's remittance has already been submitted."
                      : transactionLock?.message || "Transactions are view-only at the moment."}
                  </Text>
                </View>
              </View>
            ) : null}

            {isOfflineRemittance ? (
              <View className="mt-4 rounded-[10px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3">
                <View className="flex-row items-center">
                  <Ionicons name="cloud-offline-outline" size={16} color="#2563EB" />
                  <Text
                    className="ml-2 flex-1 text-[12px] leading-4 text-[#1E3A8A]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  >
                    An internet connection is required to submit a remittance.
                  </Text>
                </View>
              </View>
            ) : null}

            <Pressable
              className={`mt-6 h-14 flex-row items-center justify-center rounded-[10px] ${
                isSaveDisabled ? "bg-[#46506E]" : "bg-[#1A1F36]"
              }`}
              disabled={isSaveDisabled}
              onPress={() => void handleSave()}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                  <Text
                    className="ml-2 text-[15px] text-white"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    Save
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <PrintPreviewModal
        visible={isBanyeraPrintPreviewOpen}
        title="OPOL FISH PORT"
        subtitle="BANYERA TRANSACTION"
        details={banyeraPrintPreviewDetails}
        lines={banyeraPrintPreviewLines}
        totalText={formatPeso(banyeraTotalFee)}
        printing={isPrintingBanyeraPreview}
        saving={isSubmitting}
        onClose={() => {
          if (!isSubmitting && !isPrintingBanyeraPreview) {
            setIsBanyeraPrintPreviewOpen(false);
          }
        }}
        onPrint={handlePrintBanyeraPreview}
        onSave={handleSaveBanyeraPreview}
      />
      <SignatureModal
        ownerName={selectedBanyeraBoatOwner}
        visible={isBanyeraSignatureModalOpen}
        onClose={() => setIsBanyeraSignatureModalOpen(false)}
        onBegin={() =>
          setBanyeraFieldErrors((current) => ({
            ...current,
            owner_signature: "",
          }))
        }
        onEmpty={() => {
          setBanyeraOwnerSignature("");
          setBanyeraFieldErrors((current) => ({
            ...current,
            owner_signature: "Boat owner signature is required.",
          }));
        }}
        onOK={(signature) => {
          setPendingBanyeraOwnerSignature(signature);
          setIsBanyeraSignatureModalOpen(false);
          setIsBanyeraConsentModalOpen(true);
        }}
      />
      <ConsentModal
        isSaving={isSavingBanyeraSignature}
        visible={isBanyeraConsentModalOpen}
        onClose={() => {
          if (!isSavingBanyeraSignature) {
            setIsBanyeraConsentModalOpen(false);
          }
        }}
        onSkip={() => {
          if (pendingBanyeraOwnerSignature) {
            void saveBanyeraOwnerSignature(pendingBanyeraOwnerSignature, {
              consentedToDataPrivacy: false,
              declaredTermsAccepted: false,
              saveForFuture: false,
            });
          }
        }}
        onConfirm={(options) => {
          if (pendingBanyeraOwnerSignature) {
            void saveBanyeraOwnerSignature(pendingBanyeraOwnerSignature, options);
          }
        }}
      />
    </View>
  );
}
