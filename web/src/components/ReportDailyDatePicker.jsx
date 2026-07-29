import React, { useId, useMemo, useRef, useState, useEffect } from "react";
import { DatePicker as AntDatePicker } from "antd";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { getFiscalYearOptions, useFiscalYearStore } from "../store/fiscalYearStore";
import { CalendarIcon } from "./DatePicker";

dayjs.extend(customParseFormat);

const toDayjsValue = (rawValue, format) => {
  if (!rawValue) return null;
  const parsed = dayjs(String(rawValue), format, true);
  return parsed.isValid() ? parsed : null;
};

const hasDateValue = (dateValue) =>
  dateValue !== undefined && dateValue !== null && dateValue !== "";

export default function ReportDailyDatePicker({
  id,
  value,
  onChange,
  placeholder = "Select a Day",
  dateFormat = "YYYY-MM-DD",
  disabled = false,
  readOnly = false,
  containerClassName = "w-full",
  inputClassName = "",
  popupClassName = "codex-ant-date-picker-dropdown",
  placement = "bottomLeft",
}) {
  const generatedId = useId();
  const containerRef = useRef(null);
  const [popupWidth, setPopupWidth] = useState(undefined);
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);
  const inputId = id || `report-daily-date-picker-${generatedId}`;
  const resolvedValue = hasDateValue(value) ? value : undefined;
  const pickerValue = toDayjsValue(resolvedValue, dateFormat);
  const pickerKey = `daily-${String(resolvedValue ?? "")}`;
  const fiscalYears = useMemo(() => getFiscalYearOptions(), []);
  const minFiscalYear = Number(fiscalYears[0]);
  const maxFiscalYear = new Date().getFullYear();
  const minDate = Number.isInteger(minFiscalYear)
    ? dayjs(`${minFiscalYear}-01-01`, dateFormat, true)
    : null;
  const maxDate = Number.isInteger(maxFiscalYear)
    ? dayjs(`${maxFiscalYear}-12-31`, dateFormat, true)
    : null;

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
  ].filter(Boolean).join(" ");

  const defaultPickerValue = useMemo(() => {
    if (pickerValue) return pickerValue;
    const fiscalYearNumber = Number(fiscalYear);
    return Number.isInteger(fiscalYearNumber)
      ? dayjs(`${fiscalYearNumber}-01-01`, dateFormat, true)
      : dayjs();
  }, [dateFormat, fiscalYear, pickerValue]);

  const disabledDate = (current) => {
    if (!current) return false;
    if (minDate?.isValid() && current.isBefore(minDate, "day")) return true;
    if (maxDate?.isValid() && current.isAfter(maxDate, "day")) return true;
    return false;
  };

  return (
    <div ref={containerRef} className={containerClassName}>
      <AntDatePicker
        key={pickerKey}
        id={inputId}
        disabled={disabled}
        inputReadOnly={readOnly}
        size="middle"
        className={mergedClassName}
        popupClassName={popupClassName}
        placement={placement}
        placeholder={placeholder}
        format="MMMM D, YYYY"
        allowClear={false}
        popupStyle={popupWidth ? { width: popupWidth } : undefined}
        suffixIcon={<CalendarIcon className="h-[18px] w-[18px] text-gray-500" />}
        defaultPickerValue={defaultPickerValue}
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
