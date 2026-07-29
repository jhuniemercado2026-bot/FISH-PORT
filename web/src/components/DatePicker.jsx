import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { DatePicker as AntDatePicker } from "antd";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { useFiscalYearStore } from "../store/fiscalYearStore";

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

const toDayjsValue = (rawValue, format, isRange) => {
  if (!rawValue) return null;

  const parseDate = (value) => {
    const parsed = dayjs(String(value), format, true);
    return parsed.isValid() ? parsed : null;
  };

  if (isRange) {
    if (!Array.isArray(rawValue)) return null;
    const [start, end] = rawValue;
    return [
      start ? parseDate(start) : null,
      end ? parseDate(end) : null,
    ];
  }

  return parseDate(rawValue);
};

const fiscalYearDate = (fiscalYear) => {
  const year = Number(fiscalYear);
  return Number.isInteger(year) ? dayjs().year(year) : dayjs();
};

const formatFiscalDefaultValue = (fiscalYear, format, isRange) => {
  const defaultDate = fiscalYearDate(fiscalYear).format(format);
  return isRange ? [defaultDate, defaultDate] : defaultDate;
};

const hasDateValue = (dateValue) => {
  if (Array.isArray(dateValue)) return dateValue.some(Boolean);
  return dateValue !== undefined && dateValue !== null && dateValue !== "";
};

const syncValueToFiscalYear = (dateValue, fiscalYear, format, isRange) => {
  if (!hasDateValue(dateValue)) return dateValue;
  const year = Number(fiscalYear);
  if (!Number.isInteger(year)) return dateValue;

  const syncDate = (value) => {
    if (!value) return value;
    const parsed = dayjs(String(value), format, true);
    return parsed.isValid() ? parsed.year(year).format(format) : value;
  };

  return isRange ? dateValue.map(syncDate) : syncDate(dateValue);
};

export default function DatePicker({
  id,
  label,
  value,
  defaultValue,
  onChange,
  placeholder = "Select date",
  mode = "single",
  dateFormat = "YYYY-MM-DD",
  disabled = false,
  readOnly = false,
  options,
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
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);
  const inputId = id || `date-picker-${generatedId}`;
  const isRange = mode === "range";
  const shouldUseFiscalYearDefault = options?.useFiscalYearDefault !== false;
  const fiscalDefaultValue = useMemo(
    () => (shouldUseFiscalYearDefault ? formatFiscalDefaultValue(fiscalYear, dateFormat, isRange) : null),
    [dateFormat, fiscalYear, isRange, shouldUseFiscalYearDefault]
  );
  const rawResolvedValue = hasDateValue(value)
    ? value
    : hasDateValue(defaultValue)
      ? defaultValue
      : shouldUseFiscalYearDefault
        ? fiscalDefaultValue
        : undefined;
  const resolvedValue = shouldUseFiscalYearDefault
    ? syncValueToFiscalYear(rawResolvedValue, fiscalYear, dateFormat, isRange)
    : rawResolvedValue;
  const pickerValue = toDayjsValue(resolvedValue, dateFormat, isRange);
  const pickerKey = useMemo(() => {
    if (isRange) {
      const values = Array.isArray(resolvedValue) ? resolvedValue : [];
      return `${mode}-${values.map((item) => String(item ?? "")).join("|")}`;
    }

    return `${mode}-${String(resolvedValue ?? "")}`;
  }, [isRange, mode, resolvedValue]);
  const displayFormat = options?.displayFormat ?? "MMMM D, YYYY";
  const defaultPickerValue = useMemo(() => {
    if (!shouldUseFiscalYearDefault) return undefined;
    const defaultDate = fiscalYearDate(fiscalYear);
    return isRange ? [defaultDate, defaultDate] : defaultDate;
  }, [fiscalYear, isRange, shouldUseFiscalYearDefault]);

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
    inputReadOnly: readOnly,
    size: "middle",
    className: mergedClassName,
    popupClassName,
    placement,
    placeholder: isRange ? [placeholder, placeholder] : placeholder,
    format: displayFormat,
    allowClear: options?.allowClear ?? false,
    popupStyle: popupWidth ? { width: popupWidth } : undefined,
    suffixIcon: <CalendarIcon className="h-[18px] w-[18px] text-gray-500" />,
    defaultPickerValue,
  };

  const currentYearStart = dayjs().startOf("year");
  const currentYearEnd = dayjs().endOf("year");
  const shouldClampToCurrentYear = options?.disableCurrentYearClamp !== true;

  const minDate = options?.minDate
    ? dayjs(String(options.minDate), dateFormat)
    : shouldClampToCurrentYear
      ? currentYearStart
      : null;
  const maxDate = options?.maxDate === "today"
    ? dayjs()
    : options?.maxDate
      ? dayjs(String(options.maxDate), dateFormat)
      : shouldClampToCurrentYear
        ? currentYearEnd
        : null;

  const effectiveMinDate =
    shouldClampToCurrentYear && minDate?.isBefore(currentYearStart) ? currentYearStart : minDate;
  const effectiveMaxDate =
    shouldClampToCurrentYear && maxDate?.isAfter(currentYearEnd) ? currentYearEnd : maxDate;

  const disabledDate = (current) => {
    if (!current) return false;
    if (effectiveMinDate?.isValid?.() && current.isBefore(effectiveMinDate, "day")) return true;
    if (effectiveMaxDate?.isValid?.() && current.isAfter(effectiveMaxDate, "day")) return true;
    return false;
  };

  return (
    <div ref={containerRef} className={containerClassName}>
      {label ? (
        <label htmlFor={inputId} className={labelClassName}>
          {label}
        </label>
      ) : null}

      {isRange ? (
        <AntDatePicker.RangePicker
          key={pickerKey}
          {...commonProps}
          value={pickerValue ?? null}
          disabledDate={disabledDate}
          onChange={(nextValue) => {
            const selectedDates = nextValue?.filter(Boolean).map((item) => item.toDate()) ?? [];
            const currentDateString = nextValue
              ?.map((item) => (item ? item.format(dateFormat) : ""))
              .filter(Boolean)
              .join(" to ") ?? "";
            onChange?.(selectedDates, currentDateString, null);
          }}
        />
      ) : (
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
      )}
    </div>
  );
}

export function DateRangePicker(props) {
  return <DatePicker mode="range" placeholder="Select date range" {...props} />;
}

export { CalendarIcon };
