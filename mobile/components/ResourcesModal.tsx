import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";

type ResourceEntry = {
  key: string;
  label: string;
  isReady: boolean;
  saved_at: string;
};

type ResourcesModalProps = {
  visible: boolean;
  readyPercent: number;
  lastUpdated: string;
  entries: ResourceEntry[];
  onClose: () => void;
};

const formatUpdatedAt = (value?: string | null) => {
  if (!value) return "Not yet updated";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet updated";

  const dateText = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

  const timeText = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return `${dateText} | ${timeText}`;
};

export default function ResourcesModal({
  visible,
  readyPercent,
  lastUpdated,
  entries,
  onClose,
}: ResourcesModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/35 px-5">
        <View className="w-full max-w-[340px] rounded-[14px] border border-[#E8E1E6] bg-white">
          <View className="flex-row items-center justify-between border-b border-[#F2ECEF] px-4 py-3">
            <View className="flex-1 pr-3">
              <Text
                className="text-[15px] text-[#1A1F36]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Resources {readyPercent}%
              </Text>
              <Text
                className="text-[11px] text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                Updated in {formatUpdatedAt(lastUpdated)}
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={20} color="#6F6F82" />
            </Pressable>
          </View>

          <View className="px-4 py-2">
            {entries.map((entry) => (
              <View
                key={entry.key}
                className="flex-row items-center justify-between border-b border-[#F8F1F4] py-3 last:border-b-0"
              >
                <Text
                  className="text-[13px] text-[#1A1F36]"
                  style={{ fontFamily: "Montserrat_400Regular" }}
                >
                  {entry.label}
                </Text>
                <View
                  className={`flex-row items-center rounded-full px-2 py-1 ${
                    entry.isReady ? "bg-[#DCFCE7]" : "bg-[#FEF3C7]"
                  }`}
                >
                  <Ionicons
                    name={entry.isReady ? "checkmark-circle" : "time-outline"}
                    size={12}
                    color={entry.isReady ? "#16A34A" : "#D97706"}
                  />
                  <Text
                    className={`ml-1 text-[10px] ${
                      entry.isReady ? "text-[#16A34A]" : "text-[#D97706]"
                    }`}
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    {entry.isReady ? "Ready" : "Missing"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
