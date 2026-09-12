import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export type SearchFilterOption = {
  value: string;
  label: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

type SearchFilterProps = {
  label?: string;
  required?: boolean;
  error?: string;
  errorVariant?: "text" | "card";
  placeholder?: string;
  value?: string;
  options: SearchFilterOption[];
  onChangeValue: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  emptyText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  maxDropdownHeight?: number;
  searchText?: string;
  onSearchTextChange?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  sheetTitle?: string;
  optionIcon?: keyof typeof Ionicons.glyphMap;
  showChevron?: boolean;
};

export default function SearchFilter({
  label,
  required = false,
  error = "",
  errorVariant = "text",
  placeholder = "Search and select",
  value = "",
  options,
  onChangeValue,
  disabled = false,
  loading = false,
  emptyText = "No matching options found.",
  containerStyle,
  maxDropdownHeight = 276,
  searchText,
  onSearchTextChange,
  onOpenChange,
  sheetTitle,
  optionIcon = "car-outline",
  showChevron = true,
}: SearchFilterProps) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [internalSearchText, setInternalSearchText] = useState("");
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [sheetOpacity] = useState(() => new Animated.Value(0));
  const [sheetTranslateY] = useState(() => new Animated.Value(28));
  const [listHeight] = useState(() => new Animated.Value(maxDropdownHeight));
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const selectedOption =
    options.find((option) => String(option.value) === String(value)) ?? null;

  const resolvedSearchText =
    typeof searchText === "string" ? searchText : internalSearchText;

  const normalizedQuery = resolvedSearchText.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      return (
        option.label.toLowerCase().includes(normalizedQuery) ||
        option.value.toLowerCase().includes(normalizedQuery) ||
        String(option.subtitle ?? "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [normalizedQuery, options]);

  useEffect(() => {
    if (open) {
      backdropOpacity.stopAnimation();
      sheetOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      backdropOpacity.setValue(0);
      sheetOpacity.setValue(0);
      sheetTranslateY.setValue(28);
      setVisible(true);
      onOpenChange?.(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: 190,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 210,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 18,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setVisible(false);
        onOpenChange?.(false);
        Keyboard.dismiss();
      }
    });
  }, [backdropOpacity, onOpenChange, open, sheetOpacity, sheetTranslateY]);

  useEffect(() => {
    if (!visible) {
      setIsKeyboardVisible(false);
      return undefined;
    }

    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setIsKeyboardVisible(true);
    });

    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [visible]);

  useEffect(() => {
    const nextHeight = isKeyboardVisible
      ? Math.min(maxDropdownHeight, 144)
      : maxDropdownHeight;

    Animated.timing(listHeight, {
      toValue: nextHeight,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isKeyboardVisible, listHeight, maxDropdownHeight]);

  const setSearchText = (nextValue: string) => {
    if (onSearchTextChange) {
      onSearchTextChange(nextValue);
      return;
    }

    setInternalSearchText(nextValue);
  };

  const clearLocalSearchText = () => {
    if (typeof searchText !== "string") {
      setInternalSearchText("");
    }
  };

  const openPicker = () => {
    if (disabled) {
      return;
    }

    setOpen(true);
  };

  const closePicker = () => {
    setOpen(false);
  };

  const handleSelect = (nextValue: string) => {
    onChangeValue(nextValue);
    clearLocalSearchText();
    closePicker();
  };

  const handleSearchChange = (nextValue: string) => {
    setSearchText(nextValue);

    if (value && nextValue.trim()) {
      onChangeValue("");
    }
  };

  const handleDone = () => {
    clearLocalSearchText();
    closePicker();
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
            selectedOption ? "text-[#1A1F36]" : "text-[#9AA3AF]"
          }`}
          style={{ fontFamily: "Montserrat_400Regular" }}
        >
          {selectedOption?.label || placeholder}
        </Text>
        {showChevron ? <Ionicons name="chevron-down" size={18} color="#8A94A3" /> : null}
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
          <KeyboardAvoidingView
            className="flex-1 justify-end"
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <Pressable className="absolute inset-0" onPress={closePicker} />

            <Animated.View
              className="overflow-hidden rounded-t-[28px] bg-white"
              onStartShouldSetResponder={() => true}
              style={{
                maxHeight: "82%",
                opacity: sheetOpacity,
                transform: [{ translateY: sheetTranslateY }],
              }}
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
                      {sheetTitle || `Select ${label ?? "Option"}`}
                    </Text>

                    <Pressable onPress={handleDone}>
                      <Text
                        className="text-[14px] text-[#2563EB]"
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        Done
                      </Text>
                    </Pressable>
                  </View>

                  <View className="mb-4 flex-row items-center rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-4">
                    <Ionicons name="search-outline" size={18} color="#8A94A3" />
                    <TextInput
                      className="h-12 flex-1 px-3 text-[14px] text-[#1A1F36]"
                      placeholder={placeholder}
                      placeholderTextColor="#9AA3AF"
                      value={resolvedSearchText}
                      onChangeText={handleSearchChange}
                      autoCorrect={false}
                      blurOnSubmit={false}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    />
                  </View>

                  {loading ? (
                    <View className="h-40 items-center justify-center rounded-[10px] border border-[#E8E1E6] bg-white">
                      <ActivityIndicator color="#1A1F36" size="small" />
                    </View>
                  ) : filteredOptions.length ? (
                    <AnimatedScrollView
                      keyboardShouldPersistTaps="always"
                      showsVerticalScrollIndicator={false}
                      style={{ height: listHeight }}
                    >
                      <View className="flex-row flex-wrap justify-between">
                        {filteredOptions.map((option) => {
                          const isActive = String(value) === String(option.value);

                          return (
                            <Pressable
                              key={option.value}
                              className={`mb-3 min-h-[112px] w-[48%] items-center justify-center rounded-[10px] border p-3 ${
                                isActive
                                  ? "border-[#1A1F36] bg-[#1A1F36]"
                                  : "border-[#E8E1E6] bg-white"
                              }`}
                              onPress={() => handleSelect(option.value)}
                            >
                              <View
                                className={`mb-3 h-10 w-10 items-center justify-center rounded-[10px] ${
                                  isActive ? "bg-white/15" : "bg-[#F8F8FA]"
                                }`}
                              >
                                <Ionicons
                                  name={option.icon ?? optionIcon}
                                  size={18}
                                  color={isActive ? "#FFFFFF" : "#1A1F36"}
                                />
                              </View>
                              <Text
                                className={`text-center text-[13px] leading-5 ${
                                  isActive ? "text-white" : "text-[#1A1F36]"
                                }`}
                                numberOfLines={2}
                                style={{ fontFamily: "Montserrat_600SemiBold" }}
                              >
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </AnimatedScrollView>
                  ) : (
                    <View className="rounded-[10px] border border-dashed border-[#E8E1E6] bg-white px-4 py-5">
                      <Text
                        className="text-center text-[12px] leading-5 text-[#8A94A3]"
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        {emptyText}
                      </Text>
                    </View>
                  )}
                </View>
              </SafeAreaView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
