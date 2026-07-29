import React from "react";
import "typeface-montserrat";
import { useSkeletonLoading } from "./SkeletonLoadingContext";

const FONT = "'Montserrat', sans-serif";

const SkeletonField = ({ span = 1, textarea = false }) => (
  <div className={span === 2 ? "md:col-span-2" : ""}>
    <div className="mb-2 h-3 w-24 rounded bg-slate-200" />
    <div className={`${textarea ? "h-24" : "h-11"} rounded-[10px] bg-slate-200`} />
  </div>
);

const SkeletonBlocks = ({ layout = [], rows = 6 }) => {
  const blocks = layout.length ? layout : [{ type: "fields", count: rows, columns: 2, fullEvery: 3 }];

  return (
    <div className="animate-pulse space-y-4">
      {blocks.map((block, blockIndex) => {
        if (block.type === "upload") {
          return <div key={blockIndex} className={`${block.height ?? "h-52"} rounded-[10px] bg-slate-200`} />;
        }

        if (block.type === "button") {
          return (
            <div
              key={blockIndex}
              className={`${block.width ?? "w-full"} ${block.height ?? "h-11"} rounded-[10px] bg-slate-200`}
            />
          );
        }

        if (block.type === "segmented") {
          return (
            <div
              key={blockIndex}
              className={`grid gap-2.5 ${block.columns === 4 ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-2"}`}
            >
              {Array.from({ length: block.count ?? 2 }).map((_, index) => (
                <div key={index} className="h-11 rounded-[10px] bg-slate-200" />
              ))}
            </div>
          );
        }

        if (block.type === "table") {
          return (
            <div key={blockIndex} className="rounded-[10px] border border-slate-200 bg-slate-50/60 p-3">
              <div
                className="mb-2 grid gap-2"
                style={{ gridTemplateColumns: `repeat(${block.columns ?? 3}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: block.columns ?? 3 }).map((_, index) => (
                  <div key={index} className="h-3 rounded bg-slate-200" />
                ))}
              </div>
              <div className="space-y-2">
                {Array.from({ length: block.rows ?? 4 }).map((_, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${block.columns ?? 3}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: block.columns ?? 3 }).map((_, colIndex) => (
                      <div key={colIndex} className="h-11 rounded-[10px] bg-slate-200" />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (block.type === "summary") {
          return (
            <div key={blockIndex} className="rounded-[10px] border border-slate-200 bg-slate-50/70 p-4">
              <div className="space-y-3">
                {Array.from({ length: block.rows ?? 4 }).map((_, index) => (
                  <div key={index} className="flex items-center justify-between gap-4">
                    <div className="h-3 w-28 rounded bg-slate-200" />
                    <div className="h-4 w-24 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            </div>
          );
        }

        const columns = block.columns ?? 2;

        return (
          <div
            key={blockIndex}
            className={`grid grid-cols-1 gap-4 ${columns === 2 ? "md:grid-cols-2" : ""}`}
          >
            {Array.from({ length: block.count ?? rows }).map((_, index) => (
              <SkeletonField
                key={index}
                span={block.spans?.[index] ?? (block.fullEvery && index % block.fullEvery === 0 ? 2 : 1)}
                textarea={block.textareaIndexes?.includes(index)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
};

const Card = ({
  icon: Icon,
  title,
  subtitle,
  children,
  headerAction = null,
  loading = false,
  loadingBodyOnly = false,
  skeletonRows = 6,
  skeletonLayout = [],
  className = "",
  bodyClassName = "",
  headerClassName = "",
  iconClassName = "",
  titleClassName = "",
  subtitleClassName = "",
  style,
  bodyStyle,
  fontFamily = FONT,
  as: Component = "section",
}) => {
  const isLoading = useSkeletonLoading(loading);
  const shouldShowHeaderSkeleton = isLoading && !loadingBodyOnly;

  return (
    <Component
      className={`overflow-hidden rounded-[10px] bg-white ${className}`.trim()}
      style={{
        border: "1px solid #e5e7eb",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        ...style,
      }}
      aria-busy={isLoading}
    >
      <div
        className={`flex items-center justify-between gap-3 px-5 py-4 ${headerClassName}`.trim()}
        style={{ borderBottom: "1px solid #e5e7eb" }}
      >
        {shouldShowHeaderSkeleton ? (
          <>
            <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-[10px] bg-slate-200" />
            <div className="min-w-0 flex-1 animate-pulse">
              <div className="h-3.5 w-36 rounded bg-slate-200" />
              {subtitle ? <div className="mt-2 h-3 w-56 max-w-full rounded bg-slate-200" /> : null}
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-3">
              {Icon ? (
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-blue-50 ${iconClassName}`.trim()}>
                  <Icon className="text-[17px] text-blue-500" />
                </div>
              ) : null}
              <div className="min-w-0">
                <p className={`m-0 text-[13px] font-medium text-[#1a1f36] ${titleClassName}`.trim()} style={{ fontFamily }}>
                  {title}
                </p>
                {subtitle ? (
                  <p className={`m-0 mt-0.5 text-[11px] text-slate-700 ${subtitleClassName}`.trim()} style={{ fontFamily }}>
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            {headerAction ? <div className="flex flex-shrink-0 items-center">{headerAction}</div> : null}
          </>
        )}
      </div>
      <div className={`p-5 ${bodyClassName}`.trim()} style={bodyStyle}>
        {isLoading ? <SkeletonBlocks layout={skeletonLayout} rows={skeletonRows} /> : children}
      </div>
    </Component>
  );
};

export default Card;
