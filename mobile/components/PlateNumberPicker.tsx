import { StyleProp, ViewStyle } from "react-native";
import SearchFilter, { SearchFilterOption } from "./SearchFilter";

type PlateNumberPickerProps = {
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
  searchText?: string;
  onSearchTextChange?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  sheetTitle?: string;
};

export default function PlateNumberPicker({
  label = "Plate Number",
  required = false,
  error = "",
  errorVariant = "card",
  placeholder = "Select annual vehicle plate no.",
  value = "",
  options,
  onChangeValue,
  disabled = false,
  loading = false,
  emptyText = "No active annual vehicle plates found.",
  containerStyle,
  searchText,
  onSearchTextChange,
  onOpenChange,
  sheetTitle = "Select Plate Number",
}: PlateNumberPickerProps) {
  return (
    <SearchFilter
      label={label}
      required={required}
      error={error}
      errorVariant={errorVariant}
      placeholder={placeholder}
      value={value}
      options={options}
      onChangeValue={onChangeValue}
      disabled={disabled}
      loading={loading}
      emptyText={emptyText}
      containerStyle={containerStyle}
      searchText={searchText}
      onSearchTextChange={onSearchTextChange}
      onOpenChange={onOpenChange}
      sheetTitle={sheetTitle}
      optionIcon="pricetag-outline"
    />
  );
}
