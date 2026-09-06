import { ActivityIndicator, Modal as NativeModal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type PrintPreviewLine = {
  name: string;
  quantity: number;
  feeText: string;
  subtotalText: string;
  daugText?: string | null;
};

type PrintPreviewModalProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  details: { label: string; value: string }[];
  lines: PrintPreviewLine[];
  totalText: string;
  printLabel?: string;
  printing?: boolean;
  saving?: boolean;
  onClose: () => void;
  onPrint: () => void;
  onSave?: () => void;
};

export default function PrintPreviewModal({
  visible,
  title,
  subtitle,
  details,
  lines,
  totalText,
  printLabel = "Print",
  printing = false,
  saving = false,
  onClose,
  onPrint,
  onSave,
}: PrintPreviewModalProps) {
  const isBusy = printing || saving;

  return (
    <NativeModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/35">
        <View className="max-h-[88%] overflow-hidden rounded-t-[18px] bg-white">
          <View className="flex-row items-center justify-between border-b border-[#E8E1E6] px-5 py-4">
            <View className="flex-row items-center">
              <Ionicons name="receipt-outline" size={19} color="#1A1F36" />
              <Text
                className="ml-2 text-[15px] text-[#1A1F36]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Print Preview
              </Text>
            </View>
            <Pressable disabled={isBusy} hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={22} color={isBusy ? "#9AA3AF" : "#1A1F36"} />
            </Pressable>
          </View>

          <ScrollView
            className="bg-[#F8F8FA]"
            contentContainerStyle={{ padding: 18 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="overflow-hidden rounded-[10px] border border-[#D7DEE8] bg-white">
              <View className="px-5 py-4">
                <Text
                  className="text-center text-[13px] uppercase text-[#1A1F36]"
                  style={{ fontFamily: "Montserrat_800ExtraBold" }}
                >
                  {title}
                </Text>
                <Text
                  className="mt-1 text-center text-[11px] uppercase text-[#6F6F82]"
                  style={{ fontFamily: "Montserrat_600SemiBold" }}
                >
                  {subtitle}
                </Text>

                <View className="my-3 h-px bg-[#E8E1E6]" />

                <View className="gap-1.5">
                  {details.map((detail) => (
                    <View key={detail.label} className="flex-row gap-3">
                      <Text
                        className="w-[58px] text-[11px] text-[#6F6F82]"
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        {detail.label}
                      </Text>
                      <Text
                        className="flex-1 text-[11px] leading-4 text-[#1A1F36]"
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        {detail.value}
                      </Text>
                    </View>
                  ))}
                </View>

                <View className="my-3 h-px bg-[#E8E1E6]" />

                {lines.map((line, index) => (
                  <View key={`${line.name}-${index}`} className={index ? "mt-3" : ""}>
                    <Text
                      className="text-[12px] text-[#1A1F36]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      {index + 1}. {line.name}
                    </Text>
                    <View className="mt-1 flex-row items-center justify-between">
                      <Text
                        className="text-[11px] text-[#6F6F82]"
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        {line.quantity} x {line.feeText}
                      </Text>
                      <Text
                        className="text-[11px] text-[#1A1F36]"
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        {line.subtotalText}
                      </Text>
                    </View>
                    {line.daugText ? (
                      <View className="mt-1 flex-row items-center justify-between">
                        <Text
                          className="text-[11px] text-[#6F6F82]"
                          style={{ fontFamily: "Montserrat_400Regular" }}
                        >
                          Daug
                        </Text>
                        <Text
                          className="text-[11px] text-[#1A1F36]"
                          style={{ fontFamily: "Montserrat_600SemiBold" }}
                        >
                          {line.daugText}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ))}

                <View className="my-3 h-px bg-[#E8E1E6]" />

                <View className="flex-row items-center justify-between">
                  <Text
                    className="text-[12px] uppercase text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_800ExtraBold" }}
                  >
                    Total
                  </Text>
                  <Text
                    className="text-[13px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_800ExtraBold" }}
                  >
                    {totalText}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          <View className="border-t border-[#E8E1E6] bg-white px-5 pb-5 pt-4">
            <Pressable
              className={`h-12 flex-row items-center justify-center rounded-[10px] ${
                printing ? "bg-[#46506E]" : "bg-[#2563EB]"
              }`}
              disabled={isBusy}
              onPress={onPrint}
            >
              {printing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="print-outline" size={17} color="#FFFFFF" />
                  <Text
                    className="ml-2 text-[14px] text-white"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    {printLabel}
                  </Text>
                </>
              )}
            </Pressable>
            {onSave ? (
              <Pressable
                className={`mt-3 h-12 flex-row items-center justify-center rounded-[10px] ${
                  saving ? "bg-[#46506E]" : "bg-[#1A1F36]"
                }`}
                disabled={isBusy}
                onPress={onSave}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={17} color="#FFFFFF" />
                    <Text
                      className="ml-2 text-[14px] text-white"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      Save
                    </Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </NativeModal>
  );
}
