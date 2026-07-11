import React from "react";
import "typeface-montserrat";

const FONT = "'Montserrat', sans-serif";

const InlineLegend = ({
  items = [],
  marker = "circle",
  showMeaning = false,
  className = "",
  itemClassName = "",
  fontFamily = FONT,
  loading = false,
  skeletonCount = 3,
}) => {
  const markerClassName =
    marker === "box"
      ? "inline-block h-3 w-3 flex-shrink-0"
      : "inline-block h-3 w-3 flex-shrink-0 rounded-full";

  if (loading) {
    return (
      <div className={`flex flex-wrap items-center gap-4 ${className}`.trim()} aria-busy="true">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div key={`legend-skeleton-${index}`} className={`flex items-center gap-2 ${itemClassName}`.trim()}>
            <span className={marker === "box" ? "h-3 w-3 animate-pulse bg-slate-200" : "h-3 w-3 animate-pulse rounded-full bg-slate-200"} />
            <span className="h-[14px] w-20 animate-pulse rounded bg-slate-200" />
            {showMeaning ? <span className="h-[14px] w-28 animate-pulse rounded bg-slate-200" /> : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-4 text-[12px] text-slate-600 ${className}`.trim()}>
      {items.map((item) => (
        <div key={item.key ?? item.label} className={`flex items-center gap-2 ${itemClassName}`.trim()}>
          <span
            className={markerClassName}
            style={{ backgroundColor: item.color, minWidth: 12, minHeight: 12 }}
          />
          <span className="font-semibold text-[#1a1f36]" style={{ fontFamily }}>
            {item.label}
          </span>
          {showMeaning && item.meaning ? (
            <span style={{ fontFamily }}>{item.meaning}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
};

export default InlineLegend;
