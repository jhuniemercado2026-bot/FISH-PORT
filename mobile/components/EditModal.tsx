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
  const dateText = dateValue
    ? new Date(dateValue).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";
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
                            ₱{subtotal.toLocaleString("en-PH", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
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
