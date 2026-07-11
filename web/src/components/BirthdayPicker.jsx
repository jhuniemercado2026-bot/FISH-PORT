import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { DatePicker as AntDatePicker } from "antd";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

function CalendarIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 2V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 2V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.5 9H20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

const toDayjsValue = (rawValue, format) => {
  if (!rawValue) return null;

  const parsed = dayjs(String(rawValue), format, true);
  return parsed.isValid() ? parsed : null;
};

const hasDateValue = (dateValue) => {
  return dateValue !== undefined && dateValue !== null && dateValue !== "";
};

export default function BirthdayPicker({
  id,
  label,
  value,
  defaultValue,
  onChange,
  placeholder = "Select birthday",
  dateFormat = "YYYY-MM-DD",
  disabled = false,
  containerClassName = "w-full max-w-md",
  labelClassName = "mb-2.5 block text-sm font-medium text-gray-700 dark:text-white",
  inputClassName = "",
  altInputClassName = "",
  popupClassName = "codex-ant-date-picker-dropdown",
  placement = "bottomLeft",
}) {
  const generatedId = useId();
  const containerRef = useRef(null);
  const [popupWidth, setPopupWidth] = useState(undefined);
  const inputId = id || `birthday-picker-${generatedId}`;

  const displayFormat = "MMMM D, YYYY";
  const rawResolvedValue = hasDateValue(value) ? value : defaultValue;
  const pickerValue = toDayjsValue(rawResolvedValue, dateFormat);
  const pickerKey = useMemo(() => {
    return `birthday-${String(rawResolvedValue ?? "")}`;
  }, [rawResolvedValue]);

  useEffect(() => {
    const measureWidth = () => {
      const pickerElement = containerRef.current?.querySelector(".ant-picker");
      const nextWidth = pickerElement?.getBoundingClientRect().width;
      setPopupWidth(nextWidth ? Math.round(nextWidth) : undefined);
    };

    measureWidth();

    const pickerElement = containerRef.current?.querySelector(".ant-picker");
    if (!pickerElement || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureWidth);
      return () => window.removeEventListener("resize", measureWidth);
    }

    const observer = new ResizeObserver(measureWidth);
    observer.observe(pickerElement);
    window.addEventListener("resize", measureWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureWidth);
    };
  }, []);

  const mergedClassName = [
    "codex-ant-date-picker",
    "w-full",
    "!h-[46px]",
    "!rounded-[10px]",
    "!border-slate-200",
    "!bg-white",
    "!text-[13px]",
    "!text-[#1a1f36]",
    "placeholder:!text-[rgba(26,31,54,0.4)]",
    inputClassName,
    altInputClassName,
  ].filter(Boolean).join(" ");

  const commonProps = {
    id: inputId,
    disabled,
    size: "middle",
    className: mergedClassName,
    popupClassName,
    placement,
    placeholder,
    format: displayFormat,
    allowClear: false,
    popupStyle: popupWidth ? { width: popupWidth } : undefined,
    suffixIcon: <CalendarIcon className="h-[18px] w-[18px] text-gray-500" />,
  };

  // For birthday, allow dates from 1900 to yesterday
  const minDate = dayjs("1900-01-01", dateFormat);
  const maxDate = dayjs().subtract(1, "day"); // Yesterday (not today or tomorrow)

  const disabledDate = (current) => {
    if (!current) return false;
    if (minDate && current.isBefore(minDate, "day")) return true;
    if (maxDate && current.isAfter(maxDate, "day")) return true;
    return false;
  };

  return (
    <div ref={containerRef} className={containerClassName}>
      {label ? (
        <label htmlFor={inputId} className={labelClassName}>
          {label}
        </label>
      ) : null}

      <AntDatePicker
        key={pickerKey}
        {...commonProps}
        value={pickerValue ?? null}
        disabledDate={disabledDate}
        onChange={(nextValue) => {
          const selectedDates = nextValue ? [nextValue.toDate()] : [];
          const currentDateString = nextValue ? nextValue.format(dateFormat) : "";
          onChange?.(selectedDates, currentDateString, null);
        }}
      />
    </div>
  );
}

export { CalendarIcon };
