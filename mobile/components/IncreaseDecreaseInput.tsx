import { Pressable, Text, TextInput, View } from "react-native";

type IncreaseDecreaseInputProps = {
  value?: string | number | null;
  onChange?: (value: string) => void;
  min?: number;
  step?: number;
  placeholder?: string;
  accessibilityLabel?: string;
  className?: string;
  buttonClassName?: string;
  buttonTextClassName?: string;
  emptyWhenMin?: boolean;
  inputClassName?: string;
};

const normalizeNumericValue = (value?: string | number | null) =>
  String(value ?? "").replace(/\D/g, "");

export default function IncreaseDecreaseInput({
  value,
  onChange,
  min = 0,
  step = 1,
  placeholder = "0",
  accessibilityLabel = "Quantity",
  className = "",
  buttonClassName = "w-9",
  buttonTextClassName = "text-[18px]",
  emptyWhenMin = false,
  inputClassName = "",
}: IncreaseDecreaseInputProps) {
  const normalizedValue = normalizeNumericValue(value);
  const displayValue = normalizedValue === "" ? String(min) : normalizedValue;

  const emitChange = (nextValue?: string | number | null) => {
    const nextNormalizedValue = normalizeNumericValue(nextValue);
    onChange?.(nextNormalizedValue === "" ? String(min) : nextNormalizedValue);
  };

  const adjustValue = (delta: number) => {
    const currentValue = Number.parseInt(displayValue, 10);
    const safeCurrentValue = Number.isNaN(currentValue) ? min : currentValue;
    const nextValue = Math.max(min, safeCurrentValue + delta);

    emitChange(emptyWhenMin && nextValue === min && min === 0 ? "" : nextValue);
  };

  return (
    <View
      className={`h-14 w-full flex-row items-center overflow-hidden rounded-[10px] border border-[#E8E1E6] bg-white ${className}`.trim()}
    >
      <Pressable
        accessibilityLabel={`Decrease ${accessibilityLabel}`}
        className={`h-full items-center justify-center bg-white ${buttonClassName}`.trim()}
        hitSlop={4}
        onPress={() => adjustValue(-step)}
      >
        <Text
          className={`${buttonTextClassName} text-[#1A1F36]`.trim()}
          style={{ fontFamily: "Montserrat_700Bold" }}
        >
          -
        </Text>
      </Pressable>

      <TextInput
        accessibilityLabel={accessibilityLabel}
        className={`h-full min-w-0 flex-1 bg-white px-0 text-center text-[13px] text-[#1A1F36] ${inputClassName}`.trim()}
        keyboardType="number-pad"
        onChangeText={(nextValue) => emitChange(normalizeNumericValue(nextValue))}
        placeholder={placeholder}
        style={{ fontFamily: "Montserrat_600SemiBold" }}
        textAlign="center"
        value={displayValue}
      />

      <Pressable
        accessibilityLabel={`Increase ${accessibilityLabel}`}
        className={`h-full items-center justify-center bg-white ${buttonClassName}`.trim()}
        hitSlop={4}
        onPress={() => adjustValue(step)}
      >
        <Text
          className={`${buttonTextClassName} text-[#1A1F36]`.trim()}
          style={{ fontFamily: "Montserrat_700Bold" }}
        >
          +
        </Text>
      </Pressable>
    </View>
  );
}
