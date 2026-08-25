import { ActivityIndicator, Modal as NativeModal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type OfflineSyncModalProps = {
  visible: boolean;
  percentage: number;
  processed: number;
  total: number;
  onSkip: () => void;
};

export default function OfflineSyncModal({
  visible,
  percentage,
  processed,
  total,
  onSkip,
}: OfflineSyncModalProps) {
  const boundedPercentage = Math.max(0, Math.min(100, percentage));

  return (
    <NativeModal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onSkip}
    >
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <View
          className="w-full rounded-[18px] border border-[#E8E1E6] bg-white px-5 py-5"
          style={{
            boxShadow: "0px 8px 16px rgba(0, 0, 0, 0.14)",
            elevation: 12,
          }}
        >
          <View className="flex-row items-center">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-[#DBEAFE]">
              <Ionicons name="cloud-upload-outline" size={22} color="#2563EB" />
            </View>
            <View className="ml-3 flex-1">
              <Text
                className="text-[15px] text-[#1A1F36]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Syncing drafts
              </Text>
              <Text
                className="mt-1 text-[12px] text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                {processed} of {total} drafts
              </Text>
            </View>
            <ActivityIndicator size="small" color="#2563EB" />
          </View>

          <View className="mt-5">
            <View className="mb-2 flex-row items-center justify-between">
              <Text
                className="text-[12px] text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                Upload progress
              </Text>
              <Text
                className="text-[18px] text-[#2563EB]"
                style={{ fontFamily: "Montserrat_800ExtraBold" }}
              >
                {boundedPercentage}%
              </Text>
            </View>
            <View className="h-3 overflow-hidden rounded-full bg-[#E8EEF8]">
              <View
                className="h-full rounded-full bg-[#2563EB]"
                style={{ width: `${boundedPercentage}%` }}
              />
            </View>
          </View>

          <Pressable
            className="mt-5 h-12 items-center justify-center rounded-[10px] border border-[#D7DCE8] bg-white"
            onPress={onSkip}
          >
            <Text
              className="text-[13px] text-[#1A1F36]"
              style={{ fontFamily: "Montserrat_600SemiBold" }}
            >
              Skip
            </Text>
          </Pressable>
        </View>
      </View>
    </NativeModal>
  );
}
