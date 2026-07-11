import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { getAuthSession, getAuthToken } from "../../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../../api/axios";
import {
  Image,
  ImageBackground,
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

const normalizeHistoryPayload = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
};

const parseDateTimeValue = (value?: string | null) => {
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

const getRecordDateValue = (record: any) => {
  return record?.transaction_date || record?.ticket_date || record?.docking_date || record?.created_at || record?.updated_at;
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
  ];

  return ownerCandidates.some((value) => {
    return value !== undefined && value !== null && String(value) === currentUserIdString;
  });
};

const formatBanyeraDate = (value?: string | null) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return "No date";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed.year, parsed.month - 1, parsed.day));
};

const formatBanyeraTime = (value?: string | null) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return "No time";

  let hours = parsed.hour;
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${hours}:${String(parsed.minute).padStart(2, "0")} ${meridiem}`;
};

export default function HomeScreen() {
  const router = useRouter();
  const authSession = getAuthSession();
  const refreshKey = useHistoryStore((state) => state.refreshKey);
  const showToast = useToastStore((state) => state.showToast);
  const overviewCounts = useHomeStore((state) => state.overviewCounts);
  const banyeraRecords = useHomeStore((state) => state.banyeraRecords);
  const dockingRecords = useHomeStore((state) => state.dockingRecords);
  const ticketRecords = useHomeStore((state) => state.ticketRecords);
  const isLoading = useHomeStore((state) => state.isLoading);
  const setHomeData = useHomeStore((state) => state.setHomeData);
  const userFullName = useHomeStore((state) => state.userFullName);
  const userEmail = useHomeStore((state) => state.userEmail);
  const userId = useHomeStore((state) => state.userId);
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

  useEffect(() => {
    let isMounted = true;

    async function loadOverviewCounts() {
      const token = getAuthToken();
      const currentUserId = authSession?.user?.user_id;

      if (!token || !currentUserId) {
        if (isMounted) {
          setHomeData({
            overviewCounts: { banyera: 0, docking: 0, tickets: 0 },
            banyeraRecords: [],
            dockingRecords: [],
            ticketRecords: [],
            isLoading: false,
          });
        }
        return;
      }

      try {
        const [dockingRes, banyeraRes, ticketsRes] = await Promise.all([
          fetch(`${getApiBaseUrl()}/dockings`, {
            headers: buildApiHeaders(token),
          }),
          fetch(`${getApiBaseUrl()}/banyera-transactions?include_voided=true`, {
            headers: buildApiHeaders(token),
          }),
          fetch(`${getApiBaseUrl()}/vehicle-tickets`, {
            headers: buildApiHeaders(token),
          }),
        ]);

        const [dockingPayload, banyeraPayload, ticketsPayload] = await Promise.all([
          dockingRes.json().catch(() => []),
          banyeraRes.json().catch(() => []),
          ticketsRes.json().catch(() => []),
        ]);

        if (!isMounted) {
          return;
        }

        const dockingRecords = normalizeHistoryPayload(dockingPayload).filter((record: any) => {
          return isOwnedByCurrentUser(record, currentUserId) && isRecordActive(record) && isTodayRecord(record);
        });
        const filteredBanyeraRecords = normalizeHistoryPayload(banyeraPayload).filter((record: any) => {
          return isOwnedByCurrentUser(record, currentUserId) && isRecordActive(record) && isTodayRecord(record);
        });
        const ticketRecords = normalizeHistoryPayload(ticketsPayload).filter((record: any) => {
          return isOwnedByCurrentUser(record, currentUserId) && isRecordActive(record) && isTodayRecord(record);
        });

        setHomeData({
          overviewCounts: {
            banyera: filteredBanyeraRecords.length,
            docking: dockingRecords.length,
            tickets: ticketRecords.length,
          },
          banyeraRecords: filteredBanyeraRecords,
          dockingRecords: dockingRecords,
          ticketRecords: ticketRecords,
          isLoading: false,
        });
      } catch (error) {
        if (isMounted) {
          showToast("error", "Unable to load today's overview.");
          setHomeData({
            overviewCounts: { banyera: 0, docking: 0, tickets: 0 },
            banyeraRecords: [],
            dockingRecords: [],
            ticketRecords: [],
            isLoading: false,
          });
        }
      }
    }

    loadOverviewCounts();

    return () => {
      isMounted = false;
    };
  }, [authSession?.user?.user_id, refreshKey, showToast, setHomeData]);

  const banyeraCards = banyeraRecords.map((record) => {
    const itemCount = Array.isArray(record?.items) ? record.items.length : 0;
    const itemLabel = itemCount > 0 ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : "No items";
    const boatName = record?.boat?.boat_name || record?.boat_name || "Unknown Boat";
    const transactionDate = record?.transaction_date || record?.created_at || record?.docking_date || null;
    const subtitle = `${itemLabel} • ${formatBanyeraDate(transactionDate)} • ${formatBanyeraTime(transactionDate)}`;
    const totalFee = Number(record?.total_fee || 0);

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
    };
  });

  const dockingCards = dockingRecords.map((record) => {
    const boatName = record?.boat?.boat_name || record?.boat_name || "Unknown Boat";
    const transactionDate = record?.docking_date || record?.created_at || null;
    const subtitle = `${formatBanyeraDate(transactionDate)} • ${formatBanyeraTime(transactionDate)}`;
    const totalFee = Number(record?.docking_fee || 0);

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
    };
  });

  const ticketCards = ticketRecords.map((record) => {
    const title = record?.plate_number || record?.vehicle_type?.type_name || record?.vehicleType?.type_name || "Ticket";
    const transactionDate = record?.transaction_date || record?.ticket_date || record?.created_at || null;
    const subtitle = formatBanyeraDate(transactionDate);
    const totalFee = Number(record?.total_fee || record?.ticket_fee || 0);

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
    };
  });

  return (
    <View className="flex-1 bg-[#1A1F36]">
      <StatusBar barStyle="light-content" backgroundColor="#1A1F36" />

      <SafeAreaView
        className="absolute left-0 right-0 top-0 z-50 bg-transparent"
        edges={["top"]}
      >
        <View
          className="flex-row items-center justify-between overflow-hidden rounded-b-[20px] bg-[#1A1F36] px-5 py-3"
          style={{
            shadowColor: "#000000",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 18,
          }}
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
              className="mr-4"
              hitSlop={10}
              onPress={() => router.push("/notifications")}
            >
              <Ionicons
                name="notifications-outline"
                size={24}
                color="#FFFFFF"
              />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => router.push("/profile")}>
              <Ionicons name="person-circle-outline" size={28} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <SafeAreaView className="bg-[#1A1F36]" edges={["top"]}>
          <ImageBackground
            source={require("../../../assets/images/port1.png")}
            resizeMode="cover"
            className="h-[240px] overflow-hidden"
          >
            <View
              className="absolute inset-0"
              style={{ backgroundColor: "rgba(26, 31, 54, 0.72)" }}
            />
            <View className="px-5 pt-[82px]">
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
        </SafeAreaView>

        <View className="-mt-5 flex-1 rounded-t-[20px] bg-[#FFFDFB]">
          <View
            style={{ paddingHorizontal: 20, paddingTop: 80, paddingBottom: 28 }}
          >
            <View
              className="-mt-[155px] self-stretch overflow-hidden rounded-[18px] border border-[#E8E1E6] bg-white"
              style={{ elevation: 8, zIndex: 20 }}
            >
              <View className="flex-row items-center justify-between px-5 pt-5 pb-4">
                <Text
                  className="text-[13px] uppercase tracking-[1.4px] text-[#6B7280]"
                  style={{ fontFamily: "Montserrat_600SemiBold" }}
                >
                  Today's Overview
                </Text>
                <Pressable onPress={() => router.push("/history")} hitSlop={10}>
                  <Ionicons name="arrow-forward" size={16} color="#8A94A3" />
                </Pressable>
              </View>

              <View style={{ height: 1, backgroundColor: "#E8E1E6" }} />

              <View style={{ flexDirection: "row", height: 130 }}>
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

                <View style={{ width: 1, backgroundColor: "#E8E1E6" }} />

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

                <View style={{ width: 1, backgroundColor: "#E8E1E6" }} />

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
              </View>
            </View>

            {[
              { title: "Docking", cards: dockingCards, tab: "docking" },
              { title: "Banyera", cards: banyeraCards, tab: "banyera" },
              { title: "Tickets", cards: ticketCards, tab: "tickets" },
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
                    onPress={() => router.push(`/history?tab=${section.tab}`)}
                  >
                    <Ionicons name="arrow-forward" size={16} color="#8A94A3" />
                  </Pressable>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 4 }}
                >
                  {Array.isArray(section.cards) && section.cards.length > 0 ? (
                    section.cards.map((card, index) => (
                      <Pressable
                        key={card.id}
                        onPress={() =>
                          router.push({
                            pathname: "/(tabs)/home/[id]",
                            params: { id: String(card.detailId), type: card.type },
                          })
                        }
                        className={`mr-3 w-[250px] rounded-[18px] border border-[#E8E1E6] bg-white px-4 py-4 ${
                          index === section.cards.length - 1 ? "mr-0" : ""
                        }`}
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
                    <View key={`empty-${section.tab}`} className="mr-3 w-[250px] rounded-[18px] border border-[#E8E1E6] bg-white px-4 py-4 opacity-80 items-start justify-center">
                      <View className="flex-row items-start justify-between w-full">
                        <View className="flex-1 pr-3">
                          <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                            {section.tab === "docking"
                              ? "No Docking Yet"
                              : section.tab === "banyera"
                                ? "No Banyera Yet"
                                : "No Tickets Issued Yet"}
                          </Text>
                          <Text className="mt-1 text-[12px] text-[#8A94A3]" style={{ fontFamily: "Montserrat_400Regular" }}>
                            {section.tab === "docking"
                              ? "Looks like no boats have docked today."
                              : section.tab === "banyera"
                                ? "No banyera have been recorded today."
                                : "No tickets have been issued today."}
                          </Text>
                        </View>
                        <View className="h-11 w-11 items-center justify-center rounded-[14px]" style={{ backgroundColor: "rgba(37,99,235,0.08)" }}>
                          <Ionicons name={section.tab === "banyera" ? "clipboard-outline" : section.tab === "docking" ? "boat-outline" : "ticket-outline"} size={20} color="#2563EB" />
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
