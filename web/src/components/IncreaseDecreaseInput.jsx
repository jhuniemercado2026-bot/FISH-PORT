import React from "react";
import "typeface-montserrat";

const FONT = "'Montserrat', sans-serif";

const normalizeNumericValue = (value) => String(value ?? "").replace(/\D/g, "");

const IncreaseDecreaseInput = ({
  value,
  onChange,
  min = 0,
  step = 1,
  placeholder = "0",
  ariaLabel = "Quantity",
  className = "",
}) => {
  const normalizedValue = normalizeNumericValue(value);

  const emitChange = (nextValue) => {
    onChange?.(String(nextValue ?? ""));
  };

  const adjustValue = (delta) => {
    const currentValue = parseInt(normalizedValue, 10);
    const safeCurrentValue = Number.isNaN(currentValue) ? min : currentValue;
    const nextValue = Math.max(min, safeCurrentValue + delta);
    emitChange(nextValue === min && min === 0 ? "" : nextValue);
  };

  return (
    <div
      className={`flex h-[46px] w-full items-center overflow-hidden rounded-[10px] border border-slate-200 bg-white transition-colors focus-within:border-[#4096ff] ${className}`.trim()}
      style={{ fontFamily: FONT }}
    >
      <button
        type="button"
        onClick={() => adjustValue(-step)}
        className="flex h-full w-7 shrink-0 items-center justify-center border-none bg-white text-[16px] font-bold leading-none text-slate-700 transition-colors hover:bg-slate-50"
        aria-label={`Decrease ${ariaLabel}`}
      >
        -
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={normalizedValue}
        onChange={(event) => emitChange(normalizeNumericValue(event.target.value))}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 border-none bg-white px-1 text-center text-[12px] font-semibold text-slate-800 outline-none"
        style={{ fontFamily: FONT }}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        onClick={() => adjustValue(step)}
        className="flex h-full w-7 shrink-0 items-center justify-center border-none bg-white text-[16px] font-bold leading-none text-slate-700 transition-colors hover:bg-slate-50"
        aria-label={`Increase ${ariaLabel}`}
      >
        +
      </button>
    </div>
  );
};

export default IncreaseDecreaseInput;
