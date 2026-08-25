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

type SupportedPrecision = "year" | "month" | "day";

export type DatePickerProps = {
  label?: string;
  required?: boolean;
  error?: string;
  errorVariant?: "text" | "card";
  placeholder?: string;
  value?: Date | null;
  defaultValue?: Date;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  precision?: SupportedPrecision;
  containerStyle?: StyleProp<ViewStyle>;
  displayFormat?: (value: Date) => string;
  onChange?: (value: Date) => void;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const PICKER_ROW_HEIGHT = 48;

function clampDate(value: Date, minDate?: Date, maxDate?: Date) {
  const nextValue = new Date(value);

  if (minDate && nextValue < minDate) {
    return new Date(minDate);
  }

  if (maxDate && nextValue > maxDate) {
    return new Date(maxDate);
  }

  return nextValue;
}

function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function normalizeDateParts(
  year: number,
  monthIndex: number,
  day: number,
  minDate?: Date,
  maxDate?: Date
) {
  const safeDay = Math.min(day, getDaysInMonth(year, monthIndex));
  const clamped = clampDate(new Date(year, monthIndex, safeDay), minDate, maxDate);

  return {
    year: clamped.getFullYear(),
    monthIndex: clamped.getMonth(),
    day: clamped.getDate(),
  };
}

function formatDateValue(value: Date, precision: SupportedPrecision) {
  const year = value.getFullYear();
  const monthName = MONTH_NAMES[value.getMonth()];
  const day = value.getDate();

  if (precision === "year") {
    return `${year}`;
  }

  if (precision === "month") {
    return `${monthName} ${year}`;
  }

  return `${monthName} ${day}, ${year}`;
}

export default function DatePicker({
  label,
  required = false,
  error = "",
  errorVariant = "text",
  placeholder = "Select date",
  value,
  defaultValue,
  minDate,
  maxDate,
  disabled = false,
  precision = "day",
  containerStyle,
  displayFormat,
  onChange,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [sheetTranslateY] = useState(() => new Animated.Value(56));
  const monthScrollRef = useRef<ScrollView | null>(null);
  const dayScrollRef = useRef<ScrollView | null>(null);
  const yearScrollRef = useRef<ScrollView | null>(null);

  const currentYear = new Date().getFullYear();
  const currentYearStart = new Date(currentYear, 0, 1);
  const currentYearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);
  const effectiveMinDate = minDate ?? currentYearStart;
  const effectiveMaxDate = maxDate ?? currentYearEnd;

  const resolvedValue = useMemo(() => {
    if (value) {
      return clampDate(value, effectiveMinDate, effectiveMaxDate);
    }

    if (defaultValue) {
      return clampDate(defaultValue, effectiveMinDate, effectiveMaxDate);
    }

    return null;
  }, [defaultValue, effectiveMaxDate, effectiveMinDate, value]);

  const fallbackDate = useMemo(
    () => clampDate(new Date(), effectiveMinDate, effectiveMaxDate),
    [effectiveMaxDate, effectiveMinDate]
  );

  const [draftYear, setDraftYear] = useState(
    resolvedValue?.getFullYear() ?? fallbackDate.getFullYear()
  );
  const [draftMonthIndex, setDraftMonthIndex] = useState(
    resolvedValue?.getMonth() ?? fallbackDate.getMonth()
  );
  const [draftDay, setDraftDay] = useState(
    resolvedValue?.getDate() ?? fallbackDate.getDate()
  );

  useEffect(() => {
    const nextValue = resolvedValue ?? fallbackDate;
    setDraftYear(nextValue.getFullYear());
    setDraftMonthIndex(nextValue.getMonth());
    setDraftDay(nextValue.getDate());
  }, [fallbackDate, resolvedValue]);

  const minYear = effectiveMinDate.getFullYear();
  const maxYear = effectiveMaxDate.getFullYear();

  const years = useMemo(() => {
    const nextYears: number[] = [];

    for (let current = minYear; current <= maxYear; current += 1) {
      nextYears.push(current);
    }

    return nextYears;
  }, [maxYear, minYear]);

  const months = useMemo(() => {
    return MONTH_NAMES.map((name, index) => ({
      label: name,
      value: index,
    })).filter((month) => {
      if (draftYear === minYear && effectiveMinDate && month.value < effectiveMinDate.getMonth()) {
        return false;
      }

      if (draftYear === maxYear && effectiveMaxDate && month.value > effectiveMaxDate.getMonth()) {
        return false;
      }

      return true;
    });
  }, [draftYear, effectiveMaxDate, effectiveMinDate, maxYear, minYear]);

  const normalizedDraft = useMemo(
    () => normalizeDateParts(draftYear, draftMonthIndex, draftDay, minDate, maxDate),
    [draftDay, draftMonthIndex, draftYear, maxDate, minDate]
  );

  const days = useMemo(() => {
    const totalDays = getDaysInMonth(
      normalizedDraft.year,
      normalizedDraft.monthIndex
    );
    const nextDays: number[] = [];

    for (let current = 1; current <= totalDays; current += 1) {
      nextDays.push(current);
    }

    return nextDays.filter((dayValue) => {
      if (
        effectiveMinDate &&
        normalizedDraft.year === effectiveMinDate.getFullYear() &&
        normalizedDraft.monthIndex === effectiveMinDate.getMonth() &&
        dayValue < effectiveMinDate.getDate()
      ) {
        return false;
      }

      if (
        effectiveMaxDate &&
        normalizedDraft.year === effectiveMaxDate.getFullYear() &&
        normalizedDraft.monthIndex === effectiveMaxDate.getMonth() &&
        dayValue > effectiveMaxDate.getDate()
      ) {
        return false;
      }

      return true;
    });
  }, [effectiveMaxDate, effectiveMinDate, normalizedDraft.monthIndex, normalizedDraft.year]);

  const displayValue = resolvedValue
    ? displayFormat
      ? displayFormat(resolvedValue)
      : formatDateValue(resolvedValue, precision)
    : "";

  const openPicker = () => {
    const nextValue = resolvedValue ?? fallbackDate;
    setDraftYear(nextValue.getFullYear());
    setDraftMonthIndex(nextValue.getMonth());
    setDraftDay(nextValue.getDate());
    setVisible(true);
    setOpen(true);
  };

  const applySelection = () => {
    const nextDate = clampDate(
      new Date(
        normalizedDraft.year,
        normalizedDraft.monthIndex,
        normalizedDraft.day
      ),
      minDate,
      maxDate
    );

    onChange?.(nextDate);
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
      if (precision !== "year") {
        const monthIndex = months.findIndex(
          (month) => month.value === normalizedDraft.monthIndex
        );

        if (monthIndex >= 0) {
          monthScrollRef.current?.scrollTo({
            y: monthIndex * PICKER_ROW_HEIGHT,
            animated: false,
          });
        }
      }

      if (precision === "day") {
        const dayIndex = days.findIndex((dayValue) => dayValue === normalizedDraft.day);

        if (dayIndex >= 0) {
          dayScrollRef.current?.scrollTo({
            y: dayIndex * PICKER_ROW_HEIGHT,
            animated: false,
          });
        }
      }

      const yearIndex = years.findIndex((year) => year === normalizedDraft.year);

      if (yearIndex >= 0) {
        yearScrollRef.current?.scrollTo({
          y: yearIndex * PICKER_ROW_HEIGHT,
          animated: false,
        });
      }
    }, 40);

    return () => clearTimeout(timeoutId);
  }, [days, months, normalizedDraft.day, normalizedDraft.monthIndex, normalizedDraft.year, open, precision, years]);

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
        <Ionicons name="calendar-outline" size={18} color="#8A94A3" />
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
                    Select Date
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
                    {formatDateValue(
                      new Date(
                        normalizedDraft.year,
                        normalizedDraft.monthIndex,
                        normalizedDraft.day
                      ),
                      precision
                    )}
                  </Text>
                </View>

                <View className="flex-row gap-3">
                  {precision === "year" ? null : (
                    <View className="flex-1">
                      <Text
                        className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        Month
                      </Text>
                      <ScrollView
                        className="max-h-[240px] rounded-[10px] border border-[#E8E1E6] bg-white"
                        ref={monthScrollRef}
                        showsVerticalScrollIndicator={false}
                      >
                        {months.map((month) => {
                          const active =
                            normalizedDraft.monthIndex === month.value;

                          return (
                            <Pressable
                              key={month.value}
                              className={`px-4 py-3 ${
                                active ? "bg-[#1A1F36]" : "bg-white"
                              }`}
                              style={{ minHeight: PICKER_ROW_HEIGHT }}
                              onPress={() => {
                                const nextParts = normalizeDateParts(
                                  normalizedDraft.year,
                                  month.value,
                                  normalizedDraft.day,
                                  minDate,
                                  maxDate
                                );
                                setDraftMonthIndex(nextParts.monthIndex);
                                setDraftDay(nextParts.day);
                              }}
                            >
                              <Text
                                className={`text-[13px] ${
                                  active ? "text-white" : "text-[#1A1F36]"
                                }`}
                                style={{ fontFamily: "Montserrat_600SemiBold" }}
                              >
                                {month.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {precision === "day" ? (
                    <View className="w-[92px]">
                      <Text
                        className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        Day
                      </Text>
                      <ScrollView
                        className="max-h-[240px] rounded-[10px] border border-[#E8E1E6] bg-white"
                        ref={dayScrollRef}
                        showsVerticalScrollIndicator={false}
                      >
                        {days.map((dayValue) => {
                          const active = normalizedDraft.day === dayValue;

                          return (
                            <Pressable
                              key={dayValue}
                              className={`px-4 py-3 ${
                                active ? "bg-[#1A1F36]" : "bg-white"
                              }`}
                              style={{ minHeight: PICKER_ROW_HEIGHT }}
                              onPress={() => setDraftDay(dayValue)}
                            >
                              <Text
                                className={`text-center text-[13px] ${
                                  active ? "text-white" : "text-[#1A1F36]"
                                }`}
                                style={{ fontFamily: "Montserrat_600SemiBold" }}
                              >
                                {dayValue}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}

                  <View
                    className={precision === "year" ? "flex-1" : "w-[108px]"}
                  >
                    <Text
                      className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      Year
                    </Text>
                    <ScrollView
                      className="max-h-[240px] rounded-[10px] border border-[#E8E1E6] bg-white"
                      ref={yearScrollRef}
                      showsVerticalScrollIndicator={false}
                    >
                      {years.map((year) => {
                        const active = normalizedDraft.year === year;

                        return (
                          <Pressable
                            key={year}
                            className={`px-4 py-3 ${
                              active ? "bg-[#1A1F36]" : "bg-white"
                            }`}
                            style={{ minHeight: PICKER_ROW_HEIGHT }}
                            onPress={() => {
                              const nextParts = normalizeDateParts(
                                year,
                                normalizedDraft.monthIndex,
                                normalizedDraft.day,
                                minDate,
                                maxDate
                              );
                              setDraftYear(nextParts.year);
                              setDraftMonthIndex(nextParts.monthIndex);
                              setDraftDay(nextParts.day);
                            }}
                          >
                            <Text
                              className={`text-center text-[13px] ${
                                active ? "text-white" : "text-[#1A1F36]"
                              }`}
                              style={{ fontFamily: "Montserrat_600SemiBold" }}
                            >
                              {year}
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
