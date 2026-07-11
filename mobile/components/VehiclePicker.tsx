import { StyleProp, ViewStyle } from "react-native";
import SearchFilter, { SearchFilterOption } from "./SearchFilter";

type VehiclePickerProps = {
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

export default function VehiclePicker({
  label = "Vehicle Type",
  required = false,
  error = "",
  errorVariant = "card",
  placeholder = "Select vehicle type",
  value = "",
  options,
  onChangeValue,
  disabled = false,
  loading = false,
  emptyText = "No matching vehicle types found.",
  containerStyle,
  searchText,
  onSearchTextChange,
  onOpenChange,
  sheetTitle = "Select Vehicle Type",
}: VehiclePickerProps) {
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
      optionIcon="car-outline"
    />
  );
}
