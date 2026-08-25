import DatePicker, { DatePickerProps } from "./DatePicker";

export default function BirthdayPicker(
  props: Omit<DatePickerProps, "precision">,
) {
  const today = new Date();
  const defaultMinDate = new Date(1900, 0, 1);
  const defaultMaxDate = new Date(
    today.getFullYear() - 15,
    today.getMonth(),
    today.getDate(),
  );

  return (
    <DatePicker
      {...props}
      precision="day"
      minDate={props.minDate ?? defaultMinDate}
      maxDate={props.maxDate ?? defaultMaxDate}
    />
  );
}
