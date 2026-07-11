import React, { useEffect, useState } from "react";
import "typeface-montserrat";
import { SkeletonLoadingProvider } from "./SkeletonLoadingContext";

const FONT = "'Montserrat', sans-serif";

const Tabs = ({
  tabs = [],
  activeKey,
  onTabChange,
  className = "",
  fontFamily = FONT,
  centerContent = null,
  rightContent = null,
  loading = false,
  skeletonCount,
  children,
}) => {
  const resolvedSkeletonCount = skeletonCount ?? Math.max(tabs.length, 1);
  const [hasLoadedTabsOnce, setHasLoadedTabsOnce] = useState(!loading);
  const showTabSkeleton = loading && !hasLoadedTabsOnce;
  const groupedChildren = (
    <SkeletonLoadingProvider loading={loading}>
      {children}
    </SkeletonLoadingProvider>
  );

  useEffect(() => {
    if (!loading) {
      setHasLoadedTabsOnce(true);
    }
  }, [loading]);

  if (showTabSkeleton) {
    return (
      <div className={className} aria-busy="true">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap items-end gap-0 border border-slate-200 bg-white">
            {Array.from({ length: resolvedSkeletonCount }).map((_, index) => (
              <div
                key={`tab-skeleton-${index}`}
                className="flex items-center gap-2 border-y-0 border-r-0 border-l border-slate-200 px-5 py-3 first:border-l-0"
                style={{ fontFamily }}
              >
                <span className="h-4 w-4 animate-pulse rounded bg-slate-200" />
                <span className="h-[16px] w-20 animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>

          {centerContent ? (
            <div className="mb-3 flex min-w-[220px] flex-1 items-center justify-center text-center text-[12px] text-slate-600">
              <span className="h-[14px] w-40 animate-pulse rounded bg-slate-200" />
            </div>
          ) : null}

          {rightContent ? (
            <div className="mb-3 ml-auto flex flex-wrap items-center justify-end gap-4 text-[12px] text-slate-600">
              {rightContent}
            </div>
          ) : null}
        </div>

        <div className="mt-[-1px]">{groupedChildren}</div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap items-end gap-0 border border-slate-200 bg-white">
          {tabs.map(({ key, label, icon: Icon }) => {
            const active = activeKey === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange?.(key)}
                className={`relative flex items-center gap-2 border-y-0 border-r-0 border-l border-slate-200 px-5 py-3 text-[13px] font-semibold cursor-pointer transition-all duration-150 first:border-l-0 ${
                  active
                    ? "z-10 bg-white text-[#2563eb]"
                    : "bg-white text-slate-500"
                }`}
                style={{ fontFamily }}
              >
                {active ? <span className="absolute inset-x-0 bottom-[-1px] h-px bg-white" /> : null}
                {Icon ? <Icon style={{ fontSize: "16px", flexShrink: 0 }} /> : null}
                {label}
              </button>
            );
          })}
        </div>

        {centerContent ? (
          <div className="mb-3 flex min-w-[220px] flex-1 items-center justify-center text-center text-[12px] text-slate-600">
            {centerContent}
          </div>
        ) : null}

        {rightContent ? (
          <div className="mb-3 ml-auto flex flex-wrap items-center justify-end gap-4 text-[12px] text-slate-600">
            {rightContent}
          </div>
        ) : null}
      </div>

      <div className="mt-[-1px]">{groupedChildren}</div>
    </div>
  );
};

export default Tabs;
