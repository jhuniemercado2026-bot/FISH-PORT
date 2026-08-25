import { ActivityIndicator, Modal as NativeModal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";

type BanyeraItem = Record<string, any>;

type EditModalProps = {
  visible: boolean;
  transaction?: Record<string, any> | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (updatedItems: BanyeraItem[]) => void;
};

const parseLocalDateTime = (value?: string | null) => {
  if (!value) return "N/A";
  const raw = String(value).trim();

  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const parsedDate = new Date(raw.replace(/\.(\d{3})\d+/, ".$1"));
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
      hasTime: true,
    };
  }

  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "0"),
    minute: Number(match[5] ?? "0"),
    second: Number(match[6] ?? "0"),
    hasTime: Boolean(match[4] && match[5]),
  };
};

const formatDateTime = (value?: string | null) => {
  const parsed = parseLocalDateTime(value);

  if (parsed && parsed !== "N/A") {
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
      new Date(parsed.year, parsed.month - 1, 1)
    );
    const dateText = `${monthName} ${parsed.day}, ${parsed.year}`;

    if (!parsed.hasTime) return dateText;

    const timeText = new Date(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      parsed.hour,
      parsed.minute,
      parsed.second
    )
      .toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/\b(am|pm)\b/i, (value) => value.toUpperCase());

    return `${dateText} at ${timeText}`;
  }

  if (!value) return "N/A";
  const parsedDate = new Date(String(value).trim());
  if (Number.isNaN(parsedDate.getTime())) return "N/A";

  return parsedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatPeso = (value: number) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function EditModal({
  visible,
  transaction,
  saving,
  onClose,
  onSave,
}: EditModalProps) {
  const [items, setItems] = useState<BanyeraItem[]>([]);

  useEffect(() => {
    if (!transaction || !visible) {
      setItems([]);
      return;
    }

    const transactionItems = Array.isArray(transaction.items)
      ? transaction.items.map((item) => ({
          ...item,
          daug:
            item.daug !== undefined && item.daug !== null
              ? String(item.daug)
              : "",
        }))
      : [];

    setItems(transactionItems);
  }, [transaction, visible]);

  const boatName =
    transaction?.boat?.boat_name || transaction?.boat_name || "Unknown Boat";
  const dateValue = transaction?.transaction_date || null;
  const dateText = formatDateTime(dateValue);
  const totalFee = Number(transaction?.total_fee || 0);

  const handleDaugChange = (index: number, value: string) => {
    const normalized = value.replace(/[^0-9]/g, "");
    setItems((prevItems) =>
      prevItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, daug: normalized } : item
      )
    );
  };

  return (
    <NativeModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 items-center justify-center bg-black/30 px-5">
        <View className="w-full max-w-[420px] rounded-[10px] bg-white p-5 shadow-lg shadow-black/20">
          <View className="mb-4 flex-row items-center justify-between">
            <Text
              className="text-[18px] font-semibold text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              Edit Banyera
            </Text>
            <Pressable onPress={onClose} disabled={saving} hitSlop={10}>
              <Ionicons name="close" size={22} color="#1A1F36" />
            </Pressable>
          </View>

          <View className="mb-4 rounded-[10px] bg-[#F8F8FA] p-3">
            <Text
              className="text-[10px] uppercase text-[#6F6F82]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              Boat Name
            </Text>
            <Text
              className="text-[14px] text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {boatName}
            </Text>
          </View>

          <View className="mb-4 rounded-[10px] bg-[#F8F8FA] p-3">
            <Text
              className="text-[10px] uppercase text-[#6F6F82]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              Banyera Date & Time
            </Text>
            <Text
              className="text-[14px] text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {dateText}
            </Text>
          </View>

          <Text
            className="mb-3 text-[11px] uppercase tracking-[0.3px] text-[#6F6F82]"
            style={{ fontFamily: "Montserrat_600SemiBold" }}
          >
            Fish Items
          </Text>

          <ScrollView className="max-h-[300px]" nestedScrollEnabled>
              {items.length > 0 ? (
                items.map((item, index) => {
                  const classification =
                    item.classification_name ||
                    item.classification?.classification_name ||
                    item.classification?.name ||
                    "Unknown Classification";
                  const qty = Number(item.quantity || 0);
                  const subtotal = Number(item.subtotal || 0);
                  const daug = item.daug ?? "";

                  return (
                    <View key={`edit-item-${index}`} className="mb-4 rounded-[10px] border border-[#E8E1E6] bg-white p-3">
                      <View className="mb-4 rounded-[10px] border border-[#E8E1E6] bg-white p-3">
                        <Text
                          className="text-[10px] uppercase text-[#6F6F82]"
                          style={{ fontFamily: "Montserrat_600SemiBold" }}
                        >
                          Item {index + 1}
                        </Text>
                      </View>

                      <View className="mb-4 rounded-[10px] border border-[#E8E1E6] bg-white p-3">
                        <Text
                          className="text-[10px] uppercase text-[#6F6F82]"
                          style={{ fontFamily: "Montserrat_600SemiBold" }}
                        >
                          Classification
                        </Text>
                        <Text
                          className="text-[14px] text-[#1A1F36]"
                          style={{ fontFamily: "Montserrat_400Regular" }}
                        >
                          {classification}
                        </Text>
                      </View>

                      <View className="mb-4 flex-row gap-3">
                        <View className="flex-1 rounded-[10px] border border-[#E8E1E6] bg-white p-3">
                          <Text
                            className="text-[10px] uppercase text-[#6F6F82]"
                            style={{ fontFamily: "Montserrat_600SemiBold" }}
                          >
                            Qty
                          </Text>
                          <Text
                            className="text-[14px] text-[#1A1F36]"
                            style={{ fontFamily: "Montserrat_400Regular" }}
                          >
                            {qty}
                          </Text>
                        </View>
                        <View className="flex-1 rounded-[10px] border border-[#E8E1E6] bg-white p-3">
                          <Text
                            className="text-[10px] uppercase text-[#6F6F82]"
                            style={{ fontFamily: "Montserrat_600SemiBold" }}
                          >
                            Subtotal
                          </Text>
                          <Text
                            className="text-[14px] text-[#1A1F36]"
                            style={{ fontFamily: "Montserrat_400Regular" }}
                          >
                            {formatPeso(subtotal)}
                          </Text>
                        </View>
                      </View>

                      <View className="rounded-[10px] border border-[#E8E1E6] bg-white p-3">
                        <Text
                          className="mb-2 text-[10px] uppercase text-[#6F6F82]"
                          style={{ fontFamily: "Montserrat_600SemiBold" }}
                        >
                          Daug
                        </Text>
                        <TextInput
                          value={daug}
                          onChangeText={(value) => handleDaugChange(index, value)}
                          placeholder="Enter daug"
                          placeholderTextColor="#9AA3AF"
                          keyboardType="numeric"
                            className="rounded-[10px] border border-[#E2E8F0] bg-white px-4 py-3 text-[14px] text-[#1A1F36]"
                          style={{ fontFamily: "Montserrat_400Regular" }}
                        />
                      </View>
                    </View>
                  );
                })
              ) : (
                <View className="rounded-[10px] bg-white p-3">
                  <Text
                    className="text-[14px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  >
                    No fish item details available.
                  </Text>
                </View>
              )}
            </ScrollView>

          <View className="mt-4 rounded-[10px] bg-[#F8F8FA] p-3">
            <Text
              className="text-[10px] uppercase text-[#6F6F82]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              Total Fee
            </Text>
            <Text
              className="text-[14px] text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {formatPeso(totalFee)}
            </Text>
          </View>

          <View className="mt-4 flex-row items-center justify-between gap-3">
            <Pressable
              onPress={onClose}
              disabled={saving}
              className="flex-1 rounded-[10px] border border-[#CBD5E1] bg-white px-4 py-3"
            >
              <Text
                className="text-center text-[14px] font-semibold text-[#1A1F36]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(items)}
              disabled={saving}
              className="flex-1 items-center justify-center rounded-[10px] bg-[#1A1F36] px-4 py-3"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text
                  className="text-center text-[14px] font-semibold text-white"
                  style={{ fontFamily: "Montserrat_600SemiBold" }}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </NativeModal>
  );
}
