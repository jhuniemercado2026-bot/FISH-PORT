import React from "react";

const ICON_STYLE = {
  bg: "#dbeafe",
  icon: "#2563eb",
};

const OverviewCard = ({
  title,
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  loading = false,
  compact = false,
  className = "",
  style,
}) => {
  const heading = title ?? label;
  const isLoading = loading || value === "...";
  const paddingClass = compact ? "px-4 py-3" : "px-6 py-5";
  const valueClass = compact ? "text-[24px]" : "text-[28px]";
  const iconSizeClass = compact ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-2xl";

  return (
    <div
      className={`${paddingClass} ${className}`.trim()}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "10px",
        backgroundColor: "#ffffff",
        ...style,
      }}
    >
      <style>{`
        @keyframes overview-skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }

        .overview-card__skeleton {
          animation: overview-skeleton-pulse 1.35s ease-in-out infinite;
          background-color: #e2e8f0;
        }
      `}</style>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {isLoading ? (
            <>
              <div className="overview-card__skeleton h-3 w-24 rounded-full" />
              <div className="overview-card__skeleton mt-2 h-7 w-16 rounded-lg" />
            </>
          ) : (
            <>
              <p className="m-0 truncate text-[12px] font-medium text-slate-500">{heading}</p>
              <p className={`m-0 mt-2 font-bold leading-none text-[#0d1117] ${valueClass}`}>{value}</p>
            </>
          )}
        </div>
        {isLoading ? (
          <div className={`overview-card__skeleton flex-shrink-0 ${iconSizeClass}`} />
        ) : Icon ? (
          <div
            className={`flex flex-shrink-0 items-center justify-center ${iconSizeClass}`}
            style={{ backgroundColor: iconBg ?? ICON_STYLE.bg }}
          >
            <Icon style={{ color: iconColor ?? ICON_STYLE.icon, fontSize: compact ? 18 : 20 }} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default OverviewCard;
