import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, ScrollView, StatusBar, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getAuthSession, getAuthToken } from "../../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../../api/axios";
import { useToastStore } from "../../../store/toastStore";
import { useHistoryStore } from "../../../store/historyStore";
import OptionModal, { HistoryStatusFilter } from "../../../components/OptionModal";

type TransactionType = "all" | "docking" | "banyera" | "tickets";
type TransactionCardType = Exclude<TransactionType, "all">;

const tabs: Array<{ key: TransactionType; label: string }> = [
  { key: "all", label: "All" },
  { key: "docking", label: "Docking" },
  { key: "banyera", label: "Banyera" },
  { key: "tickets", label: "Tickets" },
];

const parseIsoDateTime = (value?: string | null) => {
  if (!value) return null;

  const trimmedValue = String(value).trim();

  // strip timezone offset like +08:00 or trailing Z so we can parse the raw YYYY-MM-DD[ T]HH:MM:SS
  const withoutZone = trimmedValue.replace(/([+-]\d{2}:\d{2})$/, "").replace(/Z$/, "");

  const match = withoutZone.match(
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
  switch (type) {
    case "docking":
      return record?.created_at || record?.updated_at || record?.docking_date || record?.transaction_date || record?.ticket_date;
    case "banyera":
      return record?.created_at || record?.updated_at || record?.transaction_date || record?.docking_date || record?.ticket_date;
    case "tickets":
      return record?.created_at || record?.updated_at || record?.transaction_date || record?.ticket_date || record?.docking_date;
  }
};

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
    const boatType = data.boat?.boat_type?.type_name || "Boat";
    const date = formatPhilippineDate(data.docking_date);
    const time = formatPhilippineTime(data.docking_date);
    const fee = data.docking_fee
      ? `₱${Number(data.docking_fee).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "₱0.00";
    const isVoided = Boolean(data.is_voided || data.voided_at);

    return (
      <Pressable
        onPress={onPress}
        className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-white p-4"
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
        <View className="mt-2 flex-row items-center justify-between">
          <Text
            className="text-[12px] text-[#6F6F82]"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            {date} • {time}
          </Text>
          <View
            className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${
              isVoided ? "bg-[#FEF3C7]" : "bg-[#DCFCE7]"
            }`}
          >
            <Ionicons
              name={isVoided ? "close-circle" : "checkmark-circle"}
              size={12}
              color={isVoided ? "#F59E0B" : "#22C55E"}
            />
            <Text
              className={`text-[10px] ${
                isVoided ? "text-[#F59E0B]" : "text-[#22C55E]"
              }`}
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {isVoided ? "Voided" : "Active"}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  if (type === "banyera") {
    const boatName = data.boat?.boat_name || "Unknown Boat";
    const date = formatPhilippineDate(data.transaction_date);
    const time = formatPhilippineTime(data.transaction_date);
    const itemCount = data.items?.length || 0;
    const fee = data.total_fee
      ? `₱${Number(data.total_fee).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "₱0.00";
    const isVoided = Boolean(data.is_voided || data.voided_at);

    return (
      <Pressable
        onPress={onPress}
        className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-white p-4"
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
        <View className="mt-2 flex-row items-center justify-between">
          <Text
            className="text-[12px] text-[#6F6F82]"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            {itemCount} item{itemCount !== 1 ? "s" : ""} • {date} • {time}
          </Text>
          <View
            className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${
              isVoided ? "bg-[#FEF3C7]" : "bg-[#DCFCE7]"
            }`}
          >
            <Ionicons
              name={isVoided ? "close-circle" : "checkmark-circle"}
              size={12}
              color={isVoided ? "#F59E0B" : "#22C55E"}
            />
            <Text
              className={`text-[10px] ${
                isVoided ? "text-[#F59E0B]" : "text-[#22C55E]"
              }`}
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {isVoided ? "Voided" : "Active"}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  if (type === "tickets") {
    const plateNumber = data.plate_number || "N/A";
    const vehicleType =
      data.vehicle_type?.type_name ||
      data.vehicleType?.type_name ||
      data.vehicle_type_name ||
      data.vehicleType?.vehicle_type_name ||
      "Vehicle";
    const transactionDate = data.transaction_date || data.ticket_date || data.created_at || data.docking_date;
    const date = formatPhilippineDate(transactionDate);
    const fee = Number(data.total_fee && Number(data.total_fee) > 0 ? data.total_fee : data.ticket_fee || 0) > 0
      ? `₱${Number(data.total_fee && Number(data.total_fee) > 0 ? data.total_fee : data.ticket_fee || 0).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "₱0.00";
    const isVoided = Boolean(data.is_voided || data.voided_at);

    return (
      <Pressable
        onPress={onPress}
        className="mb-3 rounded-[10px] border border-[#E8E1E6] bg-white p-4"
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text
              className="text-[14px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {plateNumber}
            </Text>
            <Text
              className="mt-1 text-[12px] text-[#6F6F82]"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {vehicleType} • {date}
            </Text>
          </View>
          <View className="items-end">
            <Text
              className="text-[14px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              {fee}
            </Text>
            <View
              className={`mt-1 flex-row items-center gap-1 rounded-full px-2 py-1 ${
                isVoided ? "bg-[#FEF3C7]" : "bg-[#DCFCE7]"
              }`}
            >
              <Ionicons
                name={isVoided ? "close-circle" : "checkmark-circle"}
                size={12}
                color={isVoided ? "#F59E0B" : "#22C55E"}
              />
              <Text
                className={`text-[10px] ${isVoided ? "text-[#F59E0B]" : "text-[#22C55E]"}`}
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                {isVoided ? "Voided" : "Active"}
              </Text>
            </View>
          </View>
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
  const [selectedTab, setSelectedTab] = useState<TransactionType>(
    (params.tab === "docking" || params.tab === "banyera" || params.tab === "tickets" ? params.tab : "all") as TransactionType
  );
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [optionModalVisible, setOptionModalVisible] = useState(false);
  const [dockingTransactions, setDockingTransactions] = useState<any[]>([]);
  const [banyeraTransactions, setBanyeraTransactions] = useState<any[]>([]);
  const [ticketTransactions, setTicketTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const authSession = getAuthSession();
  const currentUserId = authSession?.user?.user_id;

  const navigateToDetails = (transaction: {
    type: TransactionCardType;
    id: number;
    data: any;
  }) => {
    router.push(`/history/${transaction.id}?type=${transaction.type}`);
  };

  useEffect(() => {
    const nextTab =
      params.tab === "docking" || params.tab === "banyera" || params.tab === "tickets"
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

  useEffect(() => {
    let isMounted = true;

    async function loadTransactions() {
      if (!authToken || !currentUserId) {
        if (isMounted) {
          showToast("error", "Please sign in again.");
          setIsLoading(false);
        }
        return;
      }

      try {
        const [dockingRes, banyeraRes, ticketsRes] = await Promise.all([
          fetch(`${getApiBaseUrl()}/dockings`, {
            headers: buildApiHeaders(authToken),
          }),
          fetch(`${getApiBaseUrl()}/banyera-transactions?include_voided=true`, {
            headers: buildApiHeaders(authToken),
          }),
          fetch(`${getApiBaseUrl()}/vehicle-tickets`, {
            headers: buildApiHeaders(authToken),
          }),
        ]);

        const dockingData = await dockingRes.json().catch(() => []);
        const banyeraData = await banyeraRes.json().catch(() => []);
        const ticketsData = await ticketsRes.json().catch(() => []);

        if (isMounted) {
          const dockingArray = Array.isArray(dockingData)
            ? dockingData
            : Array.isArray(dockingData.data)
              ? dockingData.data
              : [];
          const banyeraArray = Array.isArray(banyeraData)
            ? banyeraData
            : Array.isArray(banyeraData.data)
              ? banyeraData.data
              : [];
          const ticketArray = Array.isArray(ticketsData)
            ? ticketsData
            : Array.isArray(ticketsData.data)
              ? ticketsData.data
              : [];

          const ownedByCurrentUser = (record: any) => {
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
            ];

            return ownerCandidates.some((value) => value !== undefined && value !== null && String(value) === currentUserIdString);
          };

          setDockingTransactions(dockingArray.filter(ownedByCurrentUser));
          setBanyeraTransactions(banyeraArray.filter(ownedByCurrentUser));
          setTicketTransactions(ticketArray.filter(ownedByCurrentUser));
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          showToast("error", "Failed to load transactions");
          setIsLoading(false);
        }
      }
    }

    loadTransactions();

    return () => {
      isMounted = false;
    };
  }, [authToken, showToast, refreshKey]);

  const getDisplayedTransactions = () => {
    let transactions: Array<{ type: TransactionCardType; id: number; data: any }> = [];

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

    if (selectedTab === "all") {
      transactions.sort((a, b) => {
        const aTimestamp = getTransactionSortValue(getTransactionDateValue(a.data, a.type));
        const bTimestamp = getTransactionSortValue(getTransactionDateValue(b.data, b.type));
        return bTimestamp - aTimestamp;
      });
    }

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

        return values.some((value) => value.toLowerCase().includes(searchLower));
      });
    }

    if (statusFilter !== "all") {
      transactions = transactions.filter((t) => {
        const isVoided = Boolean(t.data?.is_voided || t.data?.voided_at);
        return statusFilter === "voided" ? isVoided : !isVoided;
      });
    }

    return transactions;
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
        contentContainerStyle={{ paddingBottom: 28, paddingTop: 105 }}
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
          <View className="mb-4 items-center">
            <View className="flex-row gap-2">
              {tabs.map((tab) => {
                const isActive = selectedTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setSelectedTab(tab.key)}
                    className={`rounded-[8px] px-4 py-2 ${
                      isActive
                        ? "bg-[#1A1F36]"
                        : "border border-[#E8E1E6] bg-white"
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-semibold ${
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
          </View>

          {/* Transaction Cards */}
          <View>
            {isLoading ? (
              <View className="flex items-center justify-center py-8" style={{ minHeight: 240 }}>
                <ActivityIndicator size="large" color="#1A1F36" />
              </View>
            ) : getDisplayedTransactions().length > 0 ? (
              getDisplayedTransactions().map((transaction, index) => (
                <TransactionCard
                  key={`${transaction.type}-${transaction.id}-${index}`}
                  type={transaction.type}
                  data={transaction.data}
                  onPress={() => navigateToDetails(transaction)}
                />
              ))
            ) : (
              <View className="items-center justify-center py-8">
                <Text
                  className="text-[14px] text-[#6F6F82]"
                  style={{ fontFamily: "Montserrat_400Regular" }}
                >
                  No transactions found.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
