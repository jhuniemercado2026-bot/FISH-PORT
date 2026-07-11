import React from "react";

const TitlePage = ({ title, subtitle, loading = false, className = "", style }) => {
  if (loading) {
    return (
      <div className={className} style={style} aria-busy="true">
        <div className="h-[22px] w-40 animate-pulse rounded bg-slate-200" />
        {subtitle ? (
          <div className="mt-1 h-[16px] w-64 max-w-[70vw] animate-pulse rounded bg-slate-200" />
        ) : null}
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      <h1 className="m-0 text-lg font-bold text-[#0d1117]">{title}</h1>
      {subtitle ? (
        <p className="m-0 mt-0.5 text-[13px] text-slate-700">{subtitle}</p>
      ) : null}
    </div>
  );
};

export default TitlePage;
