import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
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
import { getAuthToken } from "../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../api/axios";
import DatePicker from "../../components/DatePicker";
import PlateNumberPicker from "../../components/PlateNumberPicker";
import SearchFilter from "../../components/SearchFilter";
import TimePicker from "../../components/TimePicker";
import VehiclePicker from "../../components/VehiclePicker";
import { useToastStore } from "../../store/toastStore";
import { useHistoryStore } from "../../store/historyStore";


type TransactionType = "banyera" | "docking" | "tickets";

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
  quantity = "1",
  options: { zeroDailyTicket?: boolean } = {}
): TicketFeeItem[] {
  const applicableFees = getDailyApplicableVehicleFees(feeOptions, vehicleTypeId);
  const dailyFee = getAutoFeeForTicketType(applicableFees, "daily");
  const banyeraFee = getAutoFeeForTicketType(applicableFees, "banyera");

  return [
    {
      fee_id: options.zeroDailyTicket ? "" : dailyFee ? String(dailyFee.fee_id) : "",
      quantity: quantity || "1",
      row_type: "daily",
    },
    {
      fee_id: banyeraFee ? String(banyeraFee.fee_id) : "",
      quantity: "1",
      row_type: "banyera",
    },
  ];
}

function buildVehicleTypesFromFees(feeOptions: FeeOption[]): VehicleTypeOption[] {
  const seen = new Map<string, VehicleTypeOption>();

  feeOptions.forEach((fee) => {
    const vehicleTypeId = String(fee.vehicle_type_id ?? "").trim();

    if (!vehicleTypeId) {
      return;
    }

    const rawVehicleType = fee as FeeOption & {
      vehicleType?: { type_name?: string | null } | null;
      vehicle_type?: { type_name?: string | null } | null;
    };
    const typeName =
      rawVehicleType.vehicleType?.type_name ??
      rawVehicleType.vehicle_type?.type_name ??
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

export default function AddTransactionScreen() {
  const manilaNow = getManilaDateParts();
  const authToken = getAuthToken();
  const showToast = useToastStore((state) => state.showToast);
  const triggerHistoryRefresh = useHistoryStore((state) => state.triggerRefresh);
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
  const [classifications, setClassifications] = useState<FishClassification[]>([]);
  const [selectedClassificationId, setSelectedClassificationId] = useState<number | null>(null);
  const [isLoadingClassifications, setIsLoadingClassifications] = useState(true);
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
  const [banyeraItems, setBanyeraItems] = useState<BanyeraItem[]>([
    { classification_id: "", quantity: "0", daug: "" },
  ]);
  const [banyeraFieldErrors, setBanyeraFieldErrors] = useState<Record<string, string>>({});
  const [dockingFieldErrors, setDockingFieldErrors] = useState<Record<string, string>>({});
  const [boatSearch, setBoatSearch] = useState("");
  const [isBoatPickerOpen, setIsBoatPickerOpen] = useState(false);
  const [isLoadingBoats, setIsLoadingBoats] = useState(true);
  const [fees, setFees] = useState<FeeOption[]>([]);
  const [feeSearch, setFeeSearch] = useState("");
  const [isFeePickerOpen, setIsFeePickerOpen] = useState(false);
  const [isLoadingFees, setIsLoadingFees] = useState(true);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeOption[]>([]);
  const [isLoadingVehicleTypes, setIsLoadingVehicleTypes] = useState(true);
  const [annualVehicleTickets, setAnnualVehicleTickets] = useState<
    AnnualVehicleTicketOption[]
  >([]);
  const [isLoadingAnnualVehicleTickets, setIsLoadingAnnualVehicleTickets] =
    useState(true);
  const [ticketControlNumber, setTicketControlNumber] = useState("");
  const [ticketPlateSearch, setTicketPlateSearch] = useState("");
  const [ticketVehicleTypeId, setTicketVehicleTypeId] = useState("");
  const [ticketVehicleTypeSearch, setTicketVehicleTypeSearch] = useState("");
  const [ticketFeeItems, setTicketFeeItems] = useState<TicketFeeItem[]>(() =>
    buildDailyTicketFeeItems([], "", "1")
  );
  const [ticketMonth, setTicketMonth] = useState(manilaNow.month);
  const [ticketDay, setTicketDay] = useState(manilaNow.day);
  const [ticketYear, setTicketYear] = useState(manilaNow.year);
  const [ticketFieldErrors, setTicketFieldErrors] = useState<
    Record<string, string>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
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

  useEffect(() => {
    let isMounted = true;

    async function loadClassifications() {
      if (!authToken) {
        if (isMounted) {
          setFormError("Please sign in again to load protected transaction data.");
          showToast("error", "Please sign in again to load protected transaction data.");
          setIsLoadingClassifications(false);
        }
        return;
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
        }
      } catch {
        if (isMounted) {
          setFormError("Unable to load fish classifications.");
          showToast("error", "Unable to load fish classifications.");
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
  }, [authToken]);

  useEffect(() => {
    let isMounted = true;

    async function loadVehicleTypes() {
      if (!authToken) {
        if (isMounted) {
          setIsLoadingVehicleTypes(false);
        }
        return;
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
          const nextVehicleTypes = (
            Array.isArray(data) ? data : []
          ).filter((item) => !item?.deleted_at);

          setVehicleTypes(
            nextVehicleTypes.length
              ? nextVehicleTypes
              : buildVehicleTypesFromFees(fees)
          );
        }
      } catch {
        if (isMounted) {
          const fallbackVehicleTypes = buildVehicleTypesFromFees(fees);

          if (fallbackVehicleTypes.length) {
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
  }, [authToken, fees]);

  useEffect(() => {
    let isMounted = true;

    async function loadAnnualVehicleTickets() {
      if (!authToken) {
        if (isMounted) {
          setIsLoadingAnnualVehicleTickets(false);
        }
        return;
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
          setAnnualVehicleTickets(
            (Array.isArray(ticketsPayload) ? ticketsPayload : []).filter(
              isValidAnnualVehicleTicket
            )
          );
        }
      } catch {
        if (isMounted) {
          setFormError("Unable to load annual vehicle tickets.");
          showToast("error", "Unable to load annual vehicle tickets.");
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
  }, [authToken]);

  useEffect(() => {
    let isMounted = true;

    async function loadFees() {
      if (!authToken) {
        if (isMounted) {
          setIsLoadingFees(false);
        }
        return;
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

          setFees(normalizedFees as FeeOption[]);
        }
      } catch {
        if (isMounted) {
          setFormError("Unable to load active fees.");
          showToast("error", "Unable to load active fees.");
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
  }, [authToken]);

  useEffect(() => {
    let isMounted = true;

    async function loadBoats() {
      if (!authToken) {
        if (isMounted) {
          setIsLoadingBoats(false);
        }
        return;
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
        }
      } catch {
        if (isMounted) {
          setFormError("Unable to load available boats.");
          showToast("error", "Unable to load available boats.");
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
  }, [authToken]);

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
    (selectedBanyeraBoat as BoatOption & {
      owner?: { full_name?: string | null } | null;
      owner_name?: string | null;
    })?.owner?.full_name ??
    (selectedBanyeraBoat as BoatOption & { owner_name?: string | null })
      ?.owner_name ??
    "";
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
  const isAnnualRegisteredDailyEntry = Boolean(selectedAnnualVehicleTicket);
  const ticketDailyRow =
    ticketFeeItems.find((item) => item.row_type === "daily") ??
    ({
      fee_id: "",
      quantity: "1",
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
          quantity: "1",
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
        { ...dailyRow, row_type: "daily", quantity: dailyRow.quantity || "1" },
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
        current[0]?.quantity || "1",
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
          quantity: currentRow?.quantity || row.quantity || "1",
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
      buildDailyTicketFeeItems(fees, nextVehicleTypeId, "1", {
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
    setBanyeraItems([{ classification_id: "", quantity: "0" }]);
    setBanyeraFieldErrors({});
  }

  function resetTicketForm() {
    const resetNow = getManilaDateParts();
    setTicketControlNumber("");
    setTicketPlateSearch("");
    setTicketVehicleTypeId("");
    setTicketVehicleTypeSearch("");
    setTicketFeeItems(buildDailyTicketFeeItems(fees, "", "1"));
    setTicketMonth(resetNow.month);
    setTicketDay(resetNow.day);
    setTicketYear(resetNow.year);
    setTicketFieldErrors({});
  }

  async function handleSave() {
    setFormError("");

    setIsSubmitting(true);

    try {
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

        if (Object.keys(nextErrors).length) {
          setBanyeraFieldErrors(nextErrors);
          setFormError("Please complete the banyera form.");
          showToast("error", "Please complete the banyera form.");
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

        const response = await fetch(`${getApiBaseUrl()}/banyera-transactions`, {
          method: "POST",
          headers: buildApiHeaders(authToken),
          body: JSON.stringify({
            boat_id: Number(banyeraBoatId),
            transaction_date: transactionDateTime,
            items: banyeraItems.map((item) => ({
              classification_id: Number(item.classification_id),
              quantity: Number(item.quantity),
              fee_id: Number(banyeraFeeId),
              subtotal: getFeeAmount(selectedBanyeraFee) * Number(item.quantity),
              daug: item.daug ? Number(item.daug) : null,
            })),
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          setFormError(data?.message ?? "Unable to save Banyera transaction.");
          showToast("error", data?.message ?? "Unable to save Banyera transaction.");
          return;
        }

        showToast("success", "Banyera was successfully added.");
        triggerHistoryRefresh();
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
          showToast("error", "Please complete the daily docking form.");
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
          showToast("error", "Please complete the daily docking form.");
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

        const response = await fetch(`${getApiBaseUrl()}/dockings`, {
          method: "POST",
          headers: buildApiHeaders(authToken),
          body: JSON.stringify({
            boat_id: Number(dockingBoatId),
            fee_id: Number(dockingFeeId),
            docking_date: dockingDateTime,
            docking_fee: Number(dockingFee),
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          setFormError(data?.message ?? "Unable to save Docking record.");
          showToast("error", data?.message ?? "Unable to save Docking record.");
          return;
        }

        showToast("success", "Docking was successfully added.");
        triggerHistoryRefresh();
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

          if (!item.quantity || Number.parseInt(item.quantity, 10) < 1) {
            nextErrors[`fee_qty_${index}`] = "Please enter 1 or more quantity.";
          }
        });

        if (ticketTotalFee <= 0 && !hasFeeSelection) {
          nextErrors.fee_id = "Fee is required.";
        }

        if (Object.keys(nextErrors).length) {
          setTicketFieldErrors(nextErrors);
          setFormError("Please complete the daily ticket form.");
          showToast("error", "Please complete the daily ticket form.");
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

        const response = await fetch(`${getApiBaseUrl()}/vehicle-tickets`, {
          method: "POST",
          headers: buildApiHeaders(authToken),
          body: JSON.stringify({
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
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
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
        triggerHistoryRefresh();
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
            shadowColor: "#000000",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 18,
          }}
        >
          <Text
            className="text-[18px] text-white"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            Transactions
          </Text>
          <Pressable hitSlop={10}>
            <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 28, paddingTop: 105 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-0">
          <View className="mt-2 flex-row justify-between">
            {transactionOptions.map((option) => {
              const isActive = selectedType === option.key;

              return (
                <Pressable
                  key={option.key}
                  className={`w-[31%] rounded-[10px] border px-3 py-4 ${
                    isActive
                      ? "border-[#1A1F36] bg-[#F8F8FA]"
                      : "border-[#E8E1E6] bg-white"
                  }`}
                  onPress={() => setSelectedType(option.key)}
                  style={
                    isActive
                      ? {
                          shadowColor: "#1A1F36",
                          shadowOpacity: 0.08,
                          shadowRadius: 10,
                          shadowOffset: { width: 0, height: 4 },
                          elevation: 4,
                        }
                      : undefined
                  }
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

          <View className="mt-6 rounded-[10px] border border-[#E8E1E6] bg-white px-5 py-5">
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
                      setBanyeraBoatId(value);
                      setBanyeraFeeId("");
                      setBanyeraFeeSearch("");
                      setBanyeraFieldErrors((current) => ({
                        ...current,
                        boat_id: "",
                        fee_id: "",
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
                              onPress={() =>
                                setBanyeraItems((current) =>
                                  current.filter((_, currentIndex) => currentIndex !== index)
                                )
                              }
                            >
                              <Text
                                className="text-[12px] text-[#DC2626]"
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
                            <TextInput
                              className="h-14 rounded-[10px] border border-[#E8E1E6] bg-white px-3 text-[14px] text-[#1A1F36]"
                              keyboardType="number-pad"
                              placeholder="0"
                              value={item.quantity}
                              onChangeText={(value) => {
                                setBanyeraItems((current) =>
                                  current.map((entry, currentIndex) =>
                                    currentIndex === index
                                      ? { ...entry, quantity: value.replace(/\D/g, "") }
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
                    setTicketFeeItems(buildDailyTicketFeeItems(fees, "", "1"));
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
                        ticketDailyRow.quantity || "1"
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
                      className="mr-2 w-[54px] text-center text-[11px] uppercase text-[#6F6F82]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      QTY
                    </Text>
                    <Text
                      className="w-[88px] text-right text-[11px] uppercase text-[#6F6F82]"
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
                            <View className="h-12 justify-center rounded-[10px] border border-[#E8E1E6] bg-white px-3">
                              <Text
                                className="text-[12px] text-[#1A1F36]"
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

                          <View className="mr-2 w-[54px] items-center">
                            <TextInput
                              className="h-12 w-full rounded-[10px] border border-[#E8E1E6] bg-white text-center text-[12px] text-[#1A1F36]"
                              keyboardType="number-pad"
                              value={item.quantity}
                              onChangeText={(value) => {
                                setTicketFeeItems((current) =>
                                  current.map((entry) =>
                                    entry.row_type === rowType
                                      ? { ...entry, quantity: value.replace(/\D/g, "") }
                                      : entry
                                  )
                                );
                                setTicketFieldErrors((current) => ({
                                  ...current,
                                  [`fee_qty_${index}`]: "",
                                }));
                              }}
                              textAlign="center"
                              style={{
                                fontFamily: "Montserrat_400Regular",
                                paddingLeft: 0,
                                paddingRight: 0,
                              }}
                            />
                          </View>

                          <View className="w-[88px]">
                            <View className="h-12 items-end justify-center rounded-[10px] border border-[#E8E1E6] bg-white px-3">
                              <Text
                                className="text-[12px] text-[#1A1F36]"
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

            <Pressable
              className={`mt-6 h-14 items-center justify-center rounded-[10px] ${
                isSubmitting ? "bg-[#46506E]" : "bg-[#1A1F36]"
              }`}
              disabled={isSubmitting}
              onPress={handleSave}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text
                  className="text-[15px] text-white"
                  style={{ fontFamily: "Montserrat_600SemiBold" }}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
