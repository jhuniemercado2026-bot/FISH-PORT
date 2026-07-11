import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, ScrollView, StatusBar, Text, TextInput, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getAuthSession, getAuthToken } from "../../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../../api/axios";
import { useToastStore } from "../../../store/toastStore";
import { useHistoryStore } from "../../../store/historyStore";
import EditModal from "../../../components/EditModal";
import Modal, { VoidTransactionModal, getVoidReasonOptions } from "../../../components/VoidModal";

type TransactionType = "docking" | "banyera" | "tickets";

type Params = {
  id: string;
  type?: string;
};

type TransactionRecord = Record<string, any>;

const endpointForType = (type: TransactionType) => {
  switch (type) {
    case "docking":
      return "/dockings";
    case "banyera":
      return "/banyera-transactions";
    case "tickets":
      return "/vehicle-tickets";
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
  }
};

const parseIsoDateTime = (value?: string | null) => {
  if (!value) return null;

  const raw = String(value).trim();
  const withoutZone = raw.replace(/([+-]\d{2}:\d{2})$/, "").replace(/Z$/, "");
  const match = withoutZone.match(
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

export default function HistoryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const authToken = getAuthToken();
  const showToast = useToastStore((state) => state.showToast);
  const triggerHistoryRefresh = useHistoryStore((state) => state.triggerRefresh);
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

  useEffect(() => {
    const id = params.id;
    const queryType = params.type;
    const parsedType =
      queryType === "docking" || queryType === "banyera" || queryType === "tickets"
        ? (queryType as TransactionType)
        : undefined;

    setType(parsedType);

    async function loadDetail() {
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
          : ["docking", "banyera", "tickets"];

        let found: TransactionRecord | null = null;

        const authSession = getAuthSession();
        const currentUserId = authSession?.user?.user_id;

        const isOwnedByCurrentUser = (record: TransactionRecord) => {
          if (!currentUserId) return false;
          if (record?.created_by === currentUserId) return true;
          if (record?.created_by?.user_id === currentUserId) return true;
          if (record?.createdBy?.user_id === currentUserId) return true;
          return false;
        };

        for (const typeToCheck of typesToCheck) {
          const url = `${getApiBaseUrl()}${endpointForType(typeToCheck)}${
            typeToCheck === "banyera" ? "?include_voided=true" : ""
          }`;
          const response = await fetch(url, {
            headers: buildApiHeaders(authToken),
          });
          const json = await response.json().catch(() => []);
          const list = Array.isArray(json)
            ? json
            : Array.isArray(json.data)
            ? json.data
            : [];

          const record = list.find(
            (item: TransactionRecord) =>
              item[idFieldForType(typeToCheck)] === idNumber && isOwnedByCurrentUser(item)
          );

          if (record) {
            found = record;
            setType(typeToCheck);
            break;
          }
        }

        if (!found) {
          showToast("info", "Transaction details not found.");
        }

        setDetail(found);
      } catch (error) {
        showToast("error", "Failed to load transaction details.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDetail();
  }, [authToken, params.id, params.type, showToast]);

  const openVoidModal = () => {
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
    if (!detail) return;
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
              daug: item.daug !== "" ? Number(item.daug) : null,
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

  const resolveDetailFromResponse = (payload: TransactionRecord | null | undefined, fallback: TransactionRecord | null) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return fallback;
    }

    const wrappedCandidates = [payload.data, payload.transaction, payload.ticket, payload.docking, payload.banyera, payload.record];
    for (const candidate of wrappedCandidates) {
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        return { ...(fallback ?? {}), ...(candidate as TransactionRecord) };
      }
    }

    if (payload.id || payload.ticket_id || payload.banyera_id || payload.docking_id || payload.plate_number || payload.boat_name || payload.total_fee != null || payload.ticket_fee != null) {
      return { ...(fallback ?? {}), ...(payload as TransactionRecord) };
    }

    return fallback;
  };

  const handleVoidConfirm = async () => {
    if (!detail || !type) return;
    const transactionId = detail[idFieldForType(type)];
    if (!transactionId) return;
    if (!voidReasonOption) {
      setVoidReasonError("Void reason is required.");
      return;
    }

    const resolvedReason =
      voidReasonOption === "others"
        ? voidReasonCustom.trim()
        : getVoidReasonOptions(type).find((option) => option.value === voidReasonOption)?.label ?? "";

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
        `${getApiBaseUrl()}${endpointForType(type)}/${transactionId}${type === "tickets" ? "/void" : "/void"}`,
        {
          method: "PATCH",
          headers: {
            ...buildApiHeaders(authToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ void_reason: resolvedReason }),
        }
      );
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        showToast("error", json?.message || "Unable to void this transaction.");
        return;
      }

      showToast("success", "Transaction voided successfully.");
      setDetail(resolveDetailFromResponse(json, detail));
      triggerHistoryRefresh();
      closeVoidModal();
    } catch {
      showToast("error", "Unable to reach the server.");
    } finally {
      setIsSavingVoidAction(false);
    }
  };

  const handleRestore = async () => {
    if (!detail || !type) return;
    const transactionId = detail[idFieldForType(type)];
    if (!transactionId) return;
    setIsSavingVoidAction(true);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}${endpointForType(type)}/${transactionId}${type === "tickets" ? "/unvoid" : "/restore"}`,
        {
          method: "PATCH",
          headers: buildApiHeaders(authToken),
        }
      );
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        showToast("error", json?.message || "Unable to restore this transaction.");
        return;
      }

      showToast("success", "Transaction restored successfully.");
      setDetail(resolveDetailFromResponse(json, detail));
      triggerHistoryRefresh();
    } catch {
      showToast("error", "Unable to reach the server.");
    } finally {
      setIsSavingVoidAction(false);
    }
  };

  const handleEditBanyera = () => {
    if (!detail) return;
    setEditModalVisible(true);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1A1F36" />
        </View>
      );
    }

    if (!detail) {
      return (
        <View className="px-5 py-8">
          <Text className="text-[14px] text-[#6F6F82]" style={{ fontFamily: "Montserrat_400Regular" }}>
            Transaction details are not available.
          </Text>
        </View>
      );
    }

    const isVoided = Boolean(detail.is_voided || detail.voided_at);
    const transactionDateForTodayCheck =
      type === "docking"
        ? detail.docking_date
        : type === "banyera"
        ? detail.transaction_date || detail.created_at || detail.docking_date
        : detail.transaction_date || detail.ticket_date || detail.created_at || detail.docking_date;
    const isTodayRecord = isSamePhilippineDate(transactionDateForTodayCheck);
    const statusButtonLabel = isVoided ? "Restore" : "Void";
    const statusButtonClass = `bg-white border ${isVoided ? "border-[#22C55E]" : "border-[#F59E0B]"}`;
    const statusButtonTextClass = isVoided ? "text-[#22C55E]" : "text-[#F59E0B]";
    const statusButtonIconColor = isVoided ? "#22C55E" : "#F59E0B";
    const isStatusActionDisabled = isSavingVoidAction || !isTodayRecord;
    const totalBanyeraQuantity = Array.isArray(detail.items)
      ? detail.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
      : 0;
    const firstBanyeraItem = Array.isArray(detail.items) && detail.items.length > 0 ? detail.items[0] : null;
    const firstItemClassification =
      firstBanyeraItem?.classification_name ||
      firstBanyeraItem?.classification?.classification_name ||
      firstBanyeraItem?.classification?.name ||
      "Unknown Classification";
    const firstItemQty = firstBanyeraItem ? Number(firstBanyeraItem.quantity || 0) : 0;
    const firstItemSubtotal = firstBanyeraItem ? Number(firstBanyeraItem.subtotal || 0) : 0;
    const firstItemDaug =
      firstBanyeraItem?.daug !== undefined && firstBanyeraItem?.daug !== null
        ? String(firstBanyeraItem.daug)
        : "N/A";
    const ticketDisplayFee =
      Number(detail.total_fee && Number(detail.total_fee) > 0 ? detail.total_fee : detail.ticket_fee || 0);

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
                    <View className={`w-full flex-row justify-center items-center gap-2 rounded-full px-2 py-1 ${
                      isVoided ? "bg-[#FEF3C7]" : "bg-[#DCFCE7]"
                    }`}>
                      <Ionicons
                        name={isVoided ? "close-circle" : "checkmark-circle"}
                        size={12}
                        color={isVoided ? "#F59E0B" : "#22C55E"}
                      />
                      <Text
                        className={`text-[14px] ${
                          isVoided ? "text-[#F59E0B]" : "text-[#22C55E]"
                        }`}
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        {isVoided ? "Voided" : "Active"}
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

                <View className="mb-4 flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Docking Date
                    </Text>
                    <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                      <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                        {formatPhilippineDate(detail.docking_date)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Docking Time
                    </Text>
                    <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                      <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                        {formatPhilippineTime(detail.docking_date)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View>
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Docking Fee
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      ₱{Number(detail.docking_fee || 0).toLocaleString("en-PH", {
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
                  <View className={`flex-row w-full justify-center items-center gap-2 rounded-full px-2 py-1 ${
                    isVoided ? "bg-[#FEF3C7]" : "bg-[#DCFCE7]"
                  }`}>
                    <Ionicons
                      name={isVoided ? "close-circle" : "checkmark-circle"}
                      size={12}
                      color={isVoided ? "#F59E0B" : "#22C55E"}
                    />
                    <Text
                      className={`text-[14px] ${
                        isVoided ? "text-[#F59E0B]" : "text-[#22C55E]"
                      }`}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {isVoided ? "Voided" : "Active"}
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

              <View className="mb-4 flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Banyera Date
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {formatPhilippineDate(detail.transaction_date)}
                    </Text>
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Banyera Time
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                      {formatPhilippineTime(detail.transaction_date)}
                    </Text>
                  </View>
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
                      ₱{Number(detail.total_fee || 0).toLocaleString("en-PH", {
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
                    const subtotal = Number(item.subtotal || 0);
                    const daugValue = item.daug !== undefined && item.daug !== null ? Number(item.daug) : 0;
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
                      {detail.plate_number || "N/A"}
                    </Text>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                    Status
                  </Text>
                  <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                    <View className={`w-full flex-row justify-center items-center gap-2 rounded-full px-2 py-1 ${
                      isVoided ? "bg-[#FEF3C7]" : "bg-[#DCFCE7]"
                    }`}>
                      <Ionicons
                        name={isVoided ? "close-circle" : "checkmark-circle"}
                        size={12}
                        color={isVoided ? "#F59E0B" : "#22C55E"}
                      />
                      <Text
                        className={`text-[14px] ${
                          isVoided ? "text-[#F59E0B]" : "text-[#22C55E]"
                        }`}
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        {isVoided ? "Voided" : "Active"}
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

                <View className="mb-4 flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                      Ticket Date
                    </Text>
                    <View className="mt-2 rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3">
                      <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                        {formatPhilippineDate(detail.transaction_date || detail.ticket_date || detail.created_at || detail.docking_date)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-1">
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

          {type === "docking" || type === "tickets" ? (
            <Pressable
              onPress={isVoided ? handleRestore : openVoidModal}
              disabled={isStatusActionDisabled}
              className={`mt-0 mb-4 -mx-5 rounded-[10px] px-5 py-3 ${statusButtonClass} ${isStatusActionDisabled ? "opacity-40" : ""}`}
            >
              <View className="flex-row items-center justify-center gap-1.5">
                <Ionicons
                  name={isVoided ? "refresh-circle" : "close-circle"}
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
          ) : type === "banyera" ? (
            <View className="mt-0 mb-4 -mx-5 flex-row items-center gap-3">
              <Pressable
                onPress={handleEditBanyera}
                className="flex-1 flex-row items-center justify-center rounded-[10px] border border-[#E8E1E6] bg-white px-5 py-3"
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
                onPress={isVoided ? handleRestore : openVoidModal}
                disabled={isStatusActionDisabled}
                className={`flex-1 flex-row items-center justify-center rounded-[10px] px-4 py-3 ${statusButtonClass} ${isStatusActionDisabled ? "opacity-40" : ""}`}
              >
                <Ionicons
                  name={isVoided ? "refresh-circle" : "close-circle"}
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
          ) : null}
        </View>
      </View>
    );
  };

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
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text
            className="text-[18px] text-white"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            {type === "banyera"
              ? "Banyera Details"
              : type === "docking"
              ? "Docking Details"
              : type === "tickets"
              ? "Ticket Details"
              : "Transaction Details"}
          </Text>
          <View className="w-6" />
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 28, paddingTop: 105 }}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>

      <EditModal
        visible={editModalVisible}
        transaction={type === "banyera" ? detail : null}
        saving={isSavingEdit}
        onClose={closeEditModal}
        onSave={handleSaveBanyeraEdit}
      />
      <VoidTransactionModal
        visible={voidModalVisible}
        transactionType={type ?? "docking"}
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
