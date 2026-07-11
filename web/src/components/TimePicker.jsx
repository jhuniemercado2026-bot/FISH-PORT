import React, { useEffect, useId, useRef, useState } from "react";
import { TimePicker as AntTimePicker } from "antd";
import dayjs from "dayjs";

function ClockIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12L15 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TimePicker({
  id,
  label,
  value,
  defaultValue,
  onChange,
  placeholder = "Select time",
  disabled = false,
  containerClassName = "w-full",
  labelClassName = "mb-2.5 block text-sm font-medium text-gray-700",
  className = "",
  popupClassName = "banyera-ant-time-picker-dropdown codex-ant-time-picker-dropdown",
  use12Hours = true,
  format = "h:mm A",
  minuteStep = 1,
  allowClear = false,
  getPopupContainer,
  placement = "bottomLeft",
}) {
  const generatedId = useId();
  const containerRef = useRef(null);
  const [popupWidth, setPopupWidth] = useState(undefined);
  const inputId = id || `time-picker-${generatedId}`;
  const resolvedValue = value ?? defaultValue ?? null;
  const pickerValue = resolvedValue ? dayjs(String(resolvedValue), "HH:mm") : null;

  useEffect(() => {
    const measureWidth = () => {
      const pickerElement = containerRef.current?.querySelector(".ant-picker");
      const nextWidth = pickerElement?.getBoundingClientRect().width;
      setPopupWidth(nextWidth ? Math.max(Math.round(nextWidth), 280) : 280);
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
    "banyera-ant-time-picker-input",
    "codex-ant-time-picker-input",
    "w-full",
    "h-[46px]",
    "rounded-[10px]",
    "bg-white",
    "text-[13px]",
    "border-slate-200",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div ref={containerRef} className={containerClassName}>
      {label ? (
        <label htmlFor={inputId} className={labelClassName}>
          {label}
        </label>
      ) : null}

      <AntTimePicker
        id={inputId}
        use12Hours={use12Hours}
        format={format}
        minuteStep={minuteStep}
        needConfirm={false}
        allowClear={allowClear}
        disabled={disabled}
        value={pickerValue}
        onChange={(nextValue, timeString) => {
          const normalized = nextValue ? nextValue.format("HH:mm") : "";
          onChange?.(nextValue, normalized || timeString || "");
        }}
        placeholder={placeholder}
        className={mergedClassName}
        popupClassName={popupClassName}
        popupStyle={popupWidth ? { width: popupWidth } : undefined}
        suffixIcon={<ClockIcon className="h-[18px] w-[18px] text-gray-500" />}
        placement={placement}
        getPopupContainer={getPopupContainer ?? ((triggerNode) => triggerNode.parentElement)}
      />
    </div>
  );
}
