import DatePicker, { DatePickerProps } from "./DatePicker";

export default function BirthdayPicker(
  props: Omit<DatePickerProps, "precision">,
) {
  const today = new Date();
  const defaultMinDate = new Date(1950, 0, 1);

  return (
    <DatePicker
      {...props}
      precision="day"
      minDate={props.minDate ?? defaultMinDate}
      maxDate={props.maxDate ?? today}
    />
  );
}
