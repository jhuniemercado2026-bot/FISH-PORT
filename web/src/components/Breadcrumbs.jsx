import React from "react";
import { useNavigate } from "react-router-dom";

const DEFAULT_FONT = "'Montserrat', sans-serif";

const Breadcrumbs = ({ items = [], fontFamily = DEFAULT_FONT, loading = false, className = "" }) => {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`.trim()} aria-busy="true">
        <span className="h-[16px] w-20 animate-pulse rounded bg-slate-200" />
        <span className="h-[16px] w-2 animate-pulse rounded bg-slate-200" />
        <span className="h-[16px] w-24 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 text-[13px] ${className}`.trim()}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {item.to && !isLast ? (
              <button
                type="button"
                onClick={() => navigate(item.to)}
                className="cursor-pointer border-none bg-transparent p-0 hover:opacity-70"
                style={{ color: "#1a1f36", fontFamily }}
              >
                {item.label}
              </button>
            ) : (
              <span
                className={isLast ? "font-semibold" : ""}
                style={{ color: "#1a1f36", fontFamily }}
              >
                {item.label}
              </span>
            )}
            {!isLast ? (
              <span style={{ color: "#94a3b8", fontFamily }}>{"\u203A"}</span>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default Breadcrumbs;
