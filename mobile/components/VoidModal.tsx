import { ActivityIndicator, Modal as NativeModal, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useState } from "react";

const parseIsoDateTime = (value?: string | null) => {
  if (!value) return null;
  const raw = String(value).trim();
  const withoutZone = raw.replace(/([+-]\d{2}:\d{2})$/, "").replace(/Z$/, "");
  const match = withoutZone.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/
  );

  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "0"),
    minute: Number(match[5] ?? "0"),
    second: Number(match[6] ?? "0"),
  };
};

const formatDateOnly = (value?: string | null) => {
  const parsed = parseIsoDateTime(value);
  if (!parsed) return "N/A";
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(parsed.year, parsed.month - 1, 1)
  );
  return `${monthName} ${parsed.day}, ${parsed.year}`;
};

export const VOID_REASON_OPTIONS = [
  { value: "duplicate-entry", label: "Duplicate Entry" },
  { value: "entered-by-mistake", label: "Entered by mistake" },
  { value: "others", label: "Others" },
] as const;

export const GENERIC_VOID_REASON_OPTIONS = [
  { value: "entered-by-mistake", label: "Entered by mistake" },
  { value: "wrong-boat-selected", label: "Wrong boat selected" },
  { value: "wrong-date", label: "Wrong date" },
  { value: "others", label: "Others" },
] as const;

export const getVoidReasonOptions = (transactionType: "docking" | "banyera" | "tickets") =>
  transactionType === "tickets" ? VOID_REASON_OPTIONS : GENERIC_VOID_REASON_OPTIONS;

function FormSectionLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <Text className="mb-2 text-[11px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
      {label}
      {required ? <Text style={{ color: "#DC2626" }}> *</Text> : null}
    </Text>
  );
}

function InlineErrorCard({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <View className="mt-2 flex-row items-center gap-2 rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2">
      <Ionicons name="alert-circle-outline" size={14} color="#F87171" />
      <Text className="flex-1 text-[12px] text-[#DC2626]" style={{ fontFamily: "Montserrat_400Regular" }}>
        {message}
      </Text>
    </View>
  );
}

type ReasonSelectProps = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  error?: string;
  onChangeValue: (value: string) => void;
};

function ReasonSelect({ label, value, options, error, onChangeValue }: ReasonSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((option) => option.value === value);

  return (
    <View className="mb-3">
      <FormSectionLabel label={label} required />
      <View>
        <Pressable
          className={`h-14 flex-row items-center justify-between rounded-[14px] border px-4 bg-white ${
            error ? "border-[#DC2626]" : "border-[#E8E1E6]"
          }`}
          onPress={() => setOpen((prev) => !prev)}
        >
          <Text className={`text-[14px] ${selectedOption ? "text-[#1A1F36]" : "text-[#9AA3AF]"}`} style={{ fontFamily: "Montserrat_400Regular" }}>
            {selectedOption?.label || "Select void reason"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#8A94A3" />
        </Pressable>

        {open ? (
          <View className="mt-2 overflow-hidden rounded-[14px] border border-[#E8E1E6] bg-white shadow-sm shadow-black/5">
            {options.map((option, index) => {
              const isFirst = index === 0;
              const isLast = index === options.length - 1;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onChangeValue(option.value);
                    setOpen(false);
                  }}
                  className={`px-4 py-3 ${value === option.value ? "bg-[#EFF6FF]" : "bg-white"} ${
                    isFirst ? "rounded-t-[14px]" : ""
                  } ${isLast ? "rounded-b-[14px]" : ""}`}
                >
                  <Text className={`text-[14px] ${value === option.value ? "text-[#1D4ED8]" : "text-[#1A1F36]"}`} style={{ fontFamily: "Montserrat_400Regular" }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <InlineErrorCard message={error} />
    </View>
  );
}

type ModalProps = {
  visible: boolean;
  transparent?: boolean;
  animationType?: "none" | "slide" | "fade";
  onRequestClose?: () => void;
  statusBarTranslucent?: boolean;
  children: ReactNode;
};

export default function Modal({
  visible,
  transparent = true,
  animationType = "fade",
  onRequestClose,
  statusBarTranslucent = true,
  children,
}: ModalProps) {
  return (
    <NativeModal
      visible={visible}
      transparent={transparent}
      animationType={animationType}
      onRequestClose={onRequestClose}
      statusBarTranslucent={statusBarTranslucent}
    >
      {children}
    </NativeModal>
  );
}

type TransactionType = "docking" | "banyera" | "tickets";

type VoidTransactionModalProps = {
  visible: boolean;
  transactionType: TransactionType;
  transaction?: Record<string, any> | null;
  selectedReason: string;
  customReason: string;
  reasonError?: string;
  saving?: boolean;
  onReasonChange: (value: string) => void;
  onCustomReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function VoidTransactionModal({
  visible,
  transactionType,
  transaction,
  selectedReason,
  customReason,
  reasonError,
  saving,
  onReasonChange,
  onCustomReasonChange,
  onClose,
  onConfirm,
}: VoidTransactionModalProps) {
  const title =
    transactionType === "banyera"
      ? "Void Banyera"
      : transactionType === "tickets"
      ? "Void Ticket"
      : "Void Docking";

  const primaryLabel = transactionType === "tickets" ? "Vehicle Type" : "Boat Name";
  const primaryValue =
    transactionType === "tickets"
      ? transaction?.vehicle_type?.type_name ||
        transaction?.vehicleType?.type_name ||
        transaction?.vehicle_type_name ||
        transaction?.vehicleType?.vehicle_type_name ||
        "N/A"
      : transaction?.boat?.boat_name || transaction?.boat_name || "Unknown Boat";

  const dateValue =
    transactionType === "tickets"
      ? transaction?.transaction_date || transaction?.ticket_date || transaction?.created_at || transaction?.docking_date || null
      : transaction?.transaction_date || transaction?.docking_date || null;
  const dateText = dateValue ? formatDateOnly(dateValue) : "N/A";

  const feeValue =
    transactionType === "banyera"
      ? transaction?.total_fee
      : transactionType === "tickets"
      ? (transaction?.total_fee && Number(transaction.total_fee) > 0
          ? transaction.total_fee
          : transaction?.ticket_fee)
      : transaction?.docking_fee;
  const feeLabel =
    transactionType === "banyera"
      ? "Total Fee"
      : transactionType === "tickets"
      ? "Ticket Fee"
      : "Docking Fee";

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
            <Text className="text-[18px] font-semibold text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              {title}
            </Text>
            <Pressable onPress={onClose} disabled={saving} hitSlop={10}>
              <Ionicons name="close" size={22} color="#1A1F36" />
            </Pressable>
          </View>
          <View className="mb-3 rounded-[10px] bg-[#F8F8FA] p-3">
            <Text className="text-[10px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              {primaryLabel}
            </Text>
            <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
              {primaryValue}
            </Text>
          </View>

          <View className="mb-3 rounded-[14px] bg-[#F8F8FA] p-3">
            <Text className="text-[10px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              {transactionType === "banyera"
                ? "Banyera Date"
                : transactionType === "docking"
                ? "Docking Date"
                : "Ticket Date"}
            </Text>
            <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
              {dateText}
            </Text>
          </View>

          <View className="mb-4 rounded-[14px] bg-[#F8F8FA] p-3">
            <Text className="text-[10px] uppercase text-[#6F6F82]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              {feeLabel}
            </Text>
            <Text className="text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
              ₱{Number(feeValue || 0).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
          </View>

          <ReasonSelect
            label="Reason"
            value={selectedReason}
            error={reasonError}
            options={getVoidReasonOptions(transactionType)}
            onChangeValue={onReasonChange}
          />
          {selectedReason === "others" ? (
            <View className="mt-1">
              <FormSectionLabel label="Other reason" required />
              <TextInput
                value={customReason}
                onChangeText={onCustomReasonChange}
                editable={!saving}
                multiline
                numberOfLines={4}
                placeholder="Enter the void reason"
                placeholderTextColor="#9AA3AF"
                className="mb-1 min-h-[110px] rounded-[10px] border border-[#E8E1E6] bg-white px-4 py-3 text-[14px] text-[#1A1F36]"
                style={{ fontFamily: "Montserrat_400Regular", textAlignVertical: "top" }}
              />
              <InlineErrorCard message={reasonError} />
            </View>
          ) : null}

          <View className="mt-4 flex-row items-center justify-between gap-3">
            <Pressable
              onPress={onClose}
              disabled={saving}
              className="flex-1 rounded-[10px] border border-[#CBD5E1] bg-white px-4 py-3"
            >
              <Text className="text-center text-[14px] font-semibold text-[#1A1F36]" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={saving}
              className="flex-1 items-center justify-center rounded-[10px] bg-[#1A1F36] px-4 py-3"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-center text-[14px] font-semibold text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
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
