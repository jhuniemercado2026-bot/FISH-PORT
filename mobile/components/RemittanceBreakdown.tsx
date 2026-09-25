import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

export type RemittanceBreakdownRow = {
  transaction?: string | null;
  type_name?: string | null;
  boat_name?: string | null;
  boatName?: string | null;
  boat_type?: string | null;
  vehicle_type?: string | null;
  cash_received?: number | string | null;
};

type RemittanceBreakdownProps = {
  visible: boolean;
  rows?: RemittanceBreakdownRow[];
  totalAmount: number;
  onClose: () => void;
};

function parseAmount(value: number | string | null | undefined) {
  const amount = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function formatPeso(value: number) {
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function RemittanceBreakdown({
  visible,
  rows = [],
  totalAmount,
  onClose,
}: RemittanceBreakdownProps) {
  const breakdownRows = (Array.isArray(rows) ? rows : []).map((row, index) => ({
    key: `${row?.transaction ?? "transaction"}-${row?.type_name ?? "type"}-${index}`,
    transaction: row?.transaction || "-",
    typeName:
      row?.type_name ||
      row?.boat_name ||
      row?.boatName ||
      row?.boat_type ||
      row?.vehicle_type ||
      "-",
    cashReceived: parseAmount(row?.cash_received),
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/35 px-5">
        <View className="max-h-[82%] w-full max-w-[520px] rounded-[14px] border border-[#E8E1E6] bg-white">
          <View className="flex-row items-center justify-between border-b border-[#F2ECEF] px-4 py-3">
            <Text
              className="text-[16px] text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              Remittance Breakdown
            </Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={20} color="#6F6F82" />
            </Pressable>
          </View>

          <ScrollView
            className="px-4 py-2"
            style={{ maxHeight: 280 }}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {breakdownRows.length === 0 ? (
              <View className="min-h-[120px] items-center justify-center px-4 py-6">
                <Text
                  className="text-center text-[13px] text-[#64748B]"
                  style={{ fontFamily: "Montserrat_400Regular" }}
                >
                  No collection breakdown available.
                </Text>
              </View>
            ) : (
              <View>
                {breakdownRows.map((row) => (
                  <View
                    key={row.key}
                    className="border-b border-[#F8F1F4] py-2"
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <Text
                        className="flex-1 text-[13px] text-[#1A1F36]"
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        {row.transaction}
                      </Text>
                      <View className="flex-row items-center rounded-full bg-[#DBEAFE] px-2 py-1">
                        <Ionicons name="cash-outline" size={12} color="#2563EB" />
                        <Text
                          className="ml-1 text-[11px] text-[#2563EB]"
                          style={{ fontFamily: "Montserrat_600SemiBold", fontVariant: ["tabular-nums"] }}
                        >
                          {formatPeso(row.cashReceived)}
                        </Text>
                      </View>
                    </View>
                    <Text
                      className="text-[12px] text-[#6F6F82]"
                      numberOfLines={2}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {row.typeName}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View className="border-t border-[#F2ECEF] px-4 py-3">
            <Text
              className="text-[11px] uppercase text-[#6F6F82]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              Today's Collection
            </Text>
            <Text
              className="text-[28px] leading-9 text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_700Bold", fontVariant: ["tabular-nums"] }}
            >
              {formatPeso(totalAmount)}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
