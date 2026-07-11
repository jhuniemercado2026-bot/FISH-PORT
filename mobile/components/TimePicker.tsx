import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export type TimePickerValue = {
  hour: string;
  minute: string;
  meridiem: "AM" | "PM";
};

type TimePickerProps = {
  label?: string;
  required?: boolean;
  error?: string;
  errorVariant?: "text" | "card";
  placeholder?: string;
  value?: TimePickerValue | null;
  defaultValue?: TimePickerValue;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  onChange?: (value: TimePickerValue) => void;
};

const PICKER_ROW_HEIGHT = 48;

function normalizeTimeValue(value?: TimePickerValue | null): TimePickerValue {
  const rawHour = String(value?.hour ?? "").trim();
  const rawMinute = String(value?.minute ?? "").trim();
  const term: "AM" | "PM" = value?.meridiem === "PM" ? "PM" : "AM";

  const hourNumber = Number(rawHour);
  const minuteNumber = Number(rawMinute);

  const normalizedHour =
    !Number.isNaN(hourNumber) && hourNumber >= 1 && hourNumber <= 12
      ? String(hourNumber)
      : "12";

  const normalizedMinute =
    !Number.isNaN(minuteNumber) && minuteNumber >= 0 && minuteNumber <= 59
      ? String(minuteNumber).padStart(2, "0")
      : "00";

  return {
    hour: normalizedHour,
    minute: normalizedMinute,
    meridiem: term,
  };
}

function formatTimeValue(value: TimePickerValue) {
  const hour = String(Number(value.hour)).padStart(2, "0");
  const minute = String(Number(value.minute)).padStart(2, "0");
  return `${hour}:${minute} ${value.meridiem}`;
}

export default function TimePicker({
  label,
  required = false,
  error = "",
  errorVariant = "text",
  placeholder = "Select time",
  value,
  defaultValue,
  disabled = false,
  containerStyle,
  onChange,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [sheetTranslateY] = useState(() => new Animated.Value(56));
  const hourScrollRef = useRef<ScrollView | null>(null);
  const minuteScrollRef = useRef<ScrollView | null>(null);
  const meridiemScrollRef = useRef<ScrollView | null>(null);

  const resolvedValue = useMemo<TimePickerValue>(() => {
    return normalizeTimeValue(value ?? defaultValue);
  }, [defaultValue, value]);

  const [draftHour, setDraftHour] = useState(resolvedValue.hour);
  const [draftMinute, setDraftMinute] = useState(resolvedValue.minute);
  const [draftMeridiem, setDraftMeridiem] = useState<"AM" | "PM">(
    resolvedValue.meridiem
  );

  useEffect(() => {
    const nextValue = normalizeTimeValue(value ?? defaultValue);
    setDraftHour(nextValue.hour);
    setDraftMinute(nextValue.minute);
    setDraftMeridiem(nextValue.meridiem);
  }, [defaultValue, value]);

  const hours = useMemo(() => Array.from({ length: 12 }, (_, index) => String(index + 1)), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")), []);
  const meridiemOptions = useMemo(
    () => [
      { label: "AM", value: "AM" as const },
      { label: "PM", value: "PM" as const },
    ],
    []
  );

  const displayValue = resolvedValue ? formatTimeValue(resolvedValue) : "";

  const openPicker = () => {
    const nextValue = normalizeTimeValue(value ?? defaultValue);
    setDraftHour(nextValue.hour);
    setDraftMinute(nextValue.minute);
    setDraftMeridiem(nextValue.meridiem);
    setVisible(true);
    setOpen(true);
  };

  const applySelection = () => {
    const nextValue: TimePickerValue = {
      hour: draftHour,
      minute: draftMinute,
      meridiem: draftMeridiem,
    };

    onChange?.(nextValue);
    setOpen(false);
  };

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      return;
    }

    if (!visible) {
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 56,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setVisible(false);
      }
    });
  }, [backdropOpacity, open, sheetTranslateY, visible]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const hourIndex = hours.findIndex((hour) => hour === draftHour);
      const minuteIndex = minutes.findIndex((minute) => minute === draftMinute);
      const meridiemIndex = meridiemOptions.findIndex((option) => option.value === draftMeridiem);

      if (hourIndex >= 0) {
        hourScrollRef.current?.scrollTo({ y: hourIndex * PICKER_ROW_HEIGHT, animated: false });
      }

      if (minuteIndex >= 0) {
        minuteScrollRef.current?.scrollTo({ y: minuteIndex * PICKER_ROW_HEIGHT, animated: false });
      }

      if (meridiemIndex >= 0) {
        meridiemScrollRef.current?.scrollTo({ y: meridiemIndex * PICKER_ROW_HEIGHT, animated: false });
      }
    }, 40);

    return () => clearTimeout(timeoutId);
  }, [draftHour, draftMeridiem, draftMinute, hours, meridiemOptions, minutes, open]);

  const closePicker = () => {
    setOpen(false);
  };

  return (
    <View style={containerStyle}>
      {label ? (
        <Text
          className="mb-2 text-[11px] uppercase text-[#6F6F82]"
          style={{ fontFamily: "Montserrat_600SemiBold" }}
        >
          {label}
          {required ? <Text style={{ color: "#DC2626" }}> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        className={`h-14 flex-row items-center rounded-[14px] border bg-white px-4 ${
          error ? "border-[#DC2626]" : "border-[#E8E1E6]"
        }`}
        disabled={disabled}
        onPress={openPicker}
      >
        <Text
          className={`flex-1 text-[14px] ${
            displayValue ? "text-[#1A1F36]" : "text-[#9AA3AF]"
          }`}
          style={{ fontFamily: "Montserrat_400Regular" }}
        >
          {displayValue || placeholder}
        </Text>
        <Ionicons name="time-outline" size={18} color="#8A94A3" />
      </Pressable>

      {error ? (
        errorVariant === "card" ? (
          <View className="mt-2 flex-row items-center gap-2 rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2">
            <Ionicons name="alert-circle-outline" size={14} color="#F87171" />
            <Text
              className="flex-1 text-[12px] text-[#DC2626]"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {error}
            </Text>
          </View>
        ) : (
          <Text
            className="mt-2 text-[12px] text-[#DC2626]"
            style={{ fontFamily: "Montserrat_600SemiBold" }}
          >
            {error}
          </Text>
        )
      ) : null}

      <Modal
        transparent
        visible={visible}
        onRequestClose={closePicker}
        statusBarTranslucent
      >
        <View className="flex-1">
          <Animated.View
            className="absolute inset-0 bg-[rgba(10,15,28,0.66)]"
            style={{ opacity: backdropOpacity }}
          />
          <Pressable className="flex-1" onPress={closePicker} />

          <Animated.View
            className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-[28px] bg-white"
            style={{ transform: [{ translateY: sheetTranslateY }] }}
          >
            <SafeAreaView edges={["bottom"]} className="rounded-t-[28px] bg-white">
              <View className="px-5 pb-4 pt-5">
                <View className="mb-4 items-center">
                  <View className="h-1.5 w-14 rounded-full bg-[#D7DCE3]" />
                </View>

                <View className="mb-4 flex-row items-center justify-between">
                  <Pressable onPress={closePicker}>
                    <Text
                      className="text-[14px] text-[#8A94A3]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      Cancel
                    </Text>
                  </Pressable>

                  <Text
                    className="text-[15px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    Select Time
                  </Text>

                  <Pressable onPress={applySelection}>
                    <Text
                      className="text-[14px] text-[#2563EB]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      Done
                    </Text>
                  </Pressable>
                </View>

                <View className="mb-4 rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4 py-3">
                  <Text
                    className="text-center text-[16px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    {formatTimeValue({
                      hour: draftHour,
                      minute: draftMinute,
                      meridiem: draftMeridiem,
                    })}
                  </Text>
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text
                      className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      Hour
                    </Text>
                    <ScrollView
                      className="max-h-[240px] rounded-[10px] border border-[#E8E1E6] bg-white"
                      ref={hourScrollRef}
                      showsVerticalScrollIndicator={false}
                    >
                      {hours.map((hour) => {
                        const active = draftHour === hour;
                        return (
                          <Pressable
                            key={hour}
                            className={`px-4 py-3 ${active ? "bg-[#1A1F36]" : "bg-white"}`}
                            style={{ minHeight: PICKER_ROW_HEIGHT }}
                            onPress={() => setDraftHour(hour)}
                          >
                            <Text
                              className={`text-center text-[13px] ${
                                active ? "text-white" : "text-[#1A1F36]"
                              }`}
                              style={{ fontFamily: "Montserrat_600SemiBold" }}
                            >
                              {hour}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View className="flex-1">
                    <Text
                      className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      Minute
                    </Text>
                    <ScrollView
                      className="max-h-[240px] rounded-[10px] border border-[#E8E1E6] bg-white"
                      ref={minuteScrollRef}
                      showsVerticalScrollIndicator={false}
                    >
                      {minutes.map((minute) => {
                        const active = draftMinute === minute;
                        return (
                          <Pressable
                            key={minute}
                            className={`px-4 py-3 ${active ? "bg-[#1A1F36]" : "bg-white"}`}
                            style={{ minHeight: PICKER_ROW_HEIGHT }}
                            onPress={() => setDraftMinute(minute)}
                          >
                            <Text
                              className={`text-center text-[13px] ${
                                active ? "text-white" : "text-[#1A1F36]"
                              }`}
                              style={{ fontFamily: "Montserrat_600SemiBold" }}
                            >
                              {minute}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View className="w-[84px]">
                    <Text
                      className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      Meridiem
                    </Text>
                    <ScrollView
                      className="max-h-[240px] rounded-[10px] border border-[#E8E1E6] bg-white"
                      ref={meridiemScrollRef}
                      showsVerticalScrollIndicator={false}
                    >
                      {meridiemOptions.map((option) => {
                        const active = draftMeridiem === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            className={`px-4 py-3 ${active ? "bg-[#1A1F36]" : "bg-white"}`}
                            style={{ minHeight: PICKER_ROW_HEIGHT }}
                            onPress={() => setDraftMeridiem(option.value)}
                          >
                            <Text
                              className={`text-center text-[13px] ${
                                active ? "text-white" : "text-[#1A1F36]"
                              }`}
                              style={{ fontFamily: "Montserrat_600SemiBold" }}
                            >
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
