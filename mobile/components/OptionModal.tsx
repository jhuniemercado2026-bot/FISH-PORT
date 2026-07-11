import { Ionicons } from "@expo/vector-icons";
import { Modal as NativeModal, Pressable, SafeAreaView, Text, View } from "react-native";

export type HistoryStatusFilter = "all" | "active" | "voided";

type OptionModalProps = {
  visible: boolean;
  selectedValue: HistoryStatusFilter;
  onClose: () => void;
  onSelect: (value: HistoryStatusFilter) => void;
};

const options: Array<{ value: HistoryStatusFilter; label: string }> = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "voided", label: "Voided" },
];

export default function OptionModal({ visible, selectedValue, onClose, onSelect }: OptionModalProps) {
  return (
    <NativeModal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView className="flex-1 bg-black/30">
        <Pressable className="flex-1 items-center justify-center px-4" onPress={onClose}>
          <Pressable className="w-full max-w-[280px] overflow-hidden rounded-[14px] border border-[#E8E1E6] bg-white shadow-sm shadow-black/10">
            <View className="border-b border-[#F2ECEF] px-4 py-3">
              <Text className="text-[14px] font-semibold text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                Filter
              </Text>
            </View>

            {options.map((option) => {
              const isSelected = selectedValue === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  className={`flex-row items-center justify-between px-4 py-3 ${isSelected ? "bg-[#EFF6FF]" : "bg-white"}`}
                >
                  <Text className={`text-[14px] ${isSelected ? "text-[#1D4ED8]" : "text-[#1A1F36]"}`} style={{ fontFamily: "Montserrat_400Regular" }}>
                    {option.label}
                  </Text>
                  {isSelected ? <Ionicons name="checkmark" size={18} color="#1D4ED8" /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </SafeAreaView>
    </NativeModal>
  );
}
