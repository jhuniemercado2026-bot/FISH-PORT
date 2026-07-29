import React from "react";
import DatePicker from "./DatePicker";

export default function EndDatePicker({
  placeholder = "Select end date",
  options,
  ...props
}) {
  return (
    <DatePicker
      {...props}
      placeholder={placeholder}
      options={{
        useFiscalYearDefault: false,
        allowClear: true,
        disableCurrentYearClamp: true,
        ...(options || {}),
      }}
    />
  );
}
