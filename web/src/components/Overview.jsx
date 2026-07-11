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
  loading = false,
  className = "",
  style,
}) => {
  const heading = title ?? label;
  const isLoading = loading || value === "...";

  return (
    <div
      className={`px-6 py-5 ${className}`.trim()}
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
              <p className="m-0 text-[12px] font-medium text-slate-500">{heading}</p>
              <p className="m-0 mt-2 text-[28px] font-bold leading-none text-[#0d1117]">{value}</p>
            </>
          )}
        </div>
        {isLoading ? (
          <div className="overview-card__skeleton h-11 w-11 flex-shrink-0 rounded-2xl" />
        ) : Icon ? (
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: ICON_STYLE.bg }}
          >
            <Icon style={{ color: ICON_STYLE.icon, fontSize: 20 }} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default OverviewCard;
