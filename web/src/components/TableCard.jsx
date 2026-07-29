import React from "react";
import { IoChevronBackOutline, IoChevronForwardOutline } from "react-icons/io5";
import "typeface-montserrat";
import {
  getNextPaginationWindowPage,
  getPaginationWindow,
  getPreviousPaginationWindowPage,
  hasNextPaginationWindow,
  hasPreviousPaginationWindow,
} from "../utils/pagination";
import { SkeletonLoadingProvider, useSkeletonLoading } from "./SkeletonLoadingContext";

const FONT = "'Montserrat', sans-serif";

const TableCard = ({
  title,
  subtitle,
  actions,
  children,
  footer,
  pagination,
  className = "",
  bodyClassName = "",
  headerClassName = "",
  footerClassName = "",
  loading = false,
  headerActionsSkeletonCount = 3,
  style,
}) => {
  const isLoading = useSkeletonLoading(loading);
  const hasHeader = Boolean(title || subtitle || actions);
  const paginationFooter = pagination ? (
    <TableCardPagination {...pagination} />
  ) : null;
  const hasPaginationFooter = Boolean(paginationFooter);
  const renderedFooter = footer ?? paginationFooter;

  return (
    <section
      className={`table-card overflow-hidden bg-white ${isLoading ? "table-card--loading" : ""} ${className}`.trim()}
      style={{ border: "1px solid #e5e7eb", ...style }}
      aria-busy={isLoading}
    >
      <style>{`
        .table-card thead th,
        .table-card thead th * {
          color: #6f6f82 !important;
          font-size: 11px !important;
          text-transform: uppercase !important;
        }

        .table-card__footer > .flex.items-center.justify-between > div {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-width: calc((32px * 27) + (6px * 26));
          justify-content: flex-end;
        }

        .table-card__footer > .flex.items-center.justify-between > p {
          flex-shrink: 0;
        }

        .table-card--loading thead th {
          position: relative;
          color: transparent !important;
        }

        .table-card--loading thead th,
        .table-card--loading thead th * {
          color: transparent !important;
          text-shadow: none !important;
        }

        .table-card--loading thead th > * {
          visibility: hidden;
        }

        .table-card--loading thead th::after {
          content: "";
          display: block;
          width: min(86px, 80%);
          height: 12px;
          border-radius: 9999px;
          background: #e2e8f0;
          animation: table-card-pulse 1.5s ease-in-out infinite;
        }

        .table-card--loading tbody tr:not(:has(td[colspan])) td {
          position: relative;
          background-color: #ffffff !important;
          color: transparent !important;
        }

        .table-card--loading tbody tr:not(:has(td[colspan])) td > * {
          visibility: hidden !important;
        }

        .table-card--loading tbody tr:not(:has(td[colspan])) td::after {
          content: "";
          display: block;
          width: min(112px, 82%);
          height: 12px;
          border-radius: 9999px;
          background: #e2e8f0;
          animation: table-card-pulse 1.5s ease-in-out infinite;
        }

        .table-card--image-first-column.table-card--loading tbody tr:not(:has(td[colspan])) td:first-child::after {
          width: 44px;
          height: 44px;
          border-radius: 10px;
        }

        .table-card--loading tbody tr:not(:has(td[colspan])) td:last-child::after {
          width: 72px;
          height: 32px;
          border-radius: 10px;
        }

        @keyframes table-card-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
      {hasHeader ? (
        <div className={`border-b border-slate-200 px-6 py-4 ${headerClassName}`.trim()}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              {isLoading ? (
                <>
                  <div className="h-[18px] w-52 animate-pulse rounded bg-slate-200" />
                  {subtitle ? <div className="mt-1.5 h-[14px] w-72 max-w-[70vw] animate-pulse rounded bg-slate-200" /> : null}
                </>
              ) : (
                <>
                  <p className="m-0 text-[15px] font-bold text-[#1a1f36]" style={{ fontFamily: FONT }}>
                    {title}
                  </p>
                  {subtitle ? (
                    <p className="m-0 mt-0.5 text-xs text-slate-700" style={{ fontFamily: FONT }}>
                      {subtitle}
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2">
                {isLoading ? (
                  Array.from({ length: headerActionsSkeletonCount }).map((_, index) => (
                    <div
                      key={`table-card-action-skeleton-${index}`}
                      className={`h-[42px] animate-pulse rounded-[10px] border border-slate-200 bg-slate-100 ${
                        index === 0
                          ? "w-[280px] max-w-full"
                          : headerActionsSkeletonCount >= 4 && index === headerActionsSkeletonCount - 1
                            ? "w-[150px]"
                            : index === headerActionsSkeletonCount - 1
                              ? "w-[140px]"
                              : "w-[120px]"
                      }`}
                    />
                  ))
                ) : (
                  actions
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <SkeletonLoadingProvider loading={isLoading}>
        <div className={bodyClassName}>{children}</div>
      </SkeletonLoadingProvider>

      {renderedFooter ? (
        <div className={`table-card__footer border-t border-slate-200 px-5 py-3.5 ${footerClassName}`.trim()}>
          {isLoading && !hasPaginationFooter ? <TableCardFooterSkeleton /> : renderedFooter}
        </div>
      ) : null}
    </section>
  );
};

const TableCardFooterSkeleton = () => (
  <div className="flex w-full items-center justify-between gap-4" aria-busy="true">
    <div className="h-[17px] w-40 animate-pulse rounded bg-slate-200" />
    <div className="ml-auto h-8 w-44 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
  </div>
);

const TableCardPagination = ({
  meta,
  total,
  totalPages,
  currentPage,
  requestedPage,
  isLoading = false,
  onPageChange,
  onPreviousPage,
  onNextPage,
  beforePageChange,
}) => {
  const recordsTotal = Math.max(0, Number(total ?? meta?.total ?? 0) || 0);
  const safeTotalPages = Math.max(1, Number(totalPages ?? meta?.last_page ?? 1) || 1);
  const hasRecords = recordsTotal > 0;
  const controlsDisabled = !hasRecords;
  const safeCurrentPage = controlsDisabled
    ? 1
    : Math.min(Math.max(1, Number(currentPage ?? meta?.current_page ?? 1) || 1), safeTotalPages);
  const safeRequestedPage = controlsDisabled
    ? 1
    : Math.min(Math.max(1, Number(requestedPage ?? safeCurrentPage) || 1), safeTotalPages);
  const pages = controlsDisabled ? [1] : getPaginationWindow(safeTotalPages, safeRequestedPage);
  const hasPrevious = !controlsDisabled && hasPreviousPaginationWindow(safeTotalPages, safeCurrentPage);
  const hasNext = !controlsDisabled && hasNextPaginationWindow(safeTotalPages, safeCurrentPage);

  if (isLoading && !hasRecords) {
    return <TableCardFooterSkeleton />;
  }

  const changePage = (page) => {
    if (controlsDisabled || !onPageChange) return;
    beforePageChange?.();
    onPageChange(page);
  };

  const changePrevious = () => {
    if (!hasPrevious) return;
    beforePageChange?.();
    if (onPreviousPage) {
      onPreviousPage();
      return;
    }
    onPageChange?.(getPreviousPaginationWindowPage(safeTotalPages, safeRequestedPage));
  };

  const changeNext = () => {
    if (!hasNext) return;
    beforePageChange?.();
    if (onNextPage) {
      onNextPage();
      return;
    }
    onPageChange?.(getNextPaginationWindowPage(safeTotalPages, safeRequestedPage));
  };

  const disabledButtonClass = "cursor-not-allowed text-gray-300";
  const activeButtonClass = "cursor-pointer hover:bg-gray-50";

  return (
    <div className="flex w-full items-center justify-between gap-4">
      <p className="m-0 text-[13px] text-slate-700">
        {controlsDisabled
          ? "Showing 0 of 0"
          : `Showing ${meta?.from ?? 0} to ${meta?.to ?? 0} of ${recordsTotal}`}
      </p>
      <div className="ml-auto flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={changePrevious}
          disabled={!hasPrevious}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white transition-colors ${hasPrevious ? activeButtonClass : disabledButtonClass}`}
          style={{ color: hasPrevious ? "#1a1f36" : undefined }}
        >
          <IoChevronBackOutline className="text-sm" />
        </button>
        {pages.map((page) => {
          const isActive = !controlsDisabled && page === safeCurrentPage;

          return (
            <button
              key={page}
              type="button"
              onClick={() => changePage(page)}
              disabled={controlsDisabled}
              className={`h-8 w-8 rounded-lg text-[13px] transition-colors ${
                isActive ? "border-none font-bold text-white" : `border border-gray-200 bg-white ${controlsDisabled ? disabledButtonClass : activeButtonClass}`
              }`}
              style={{
                fontFamily: FONT,
                backgroundColor: isActive ? "#1a1f36" : undefined,
                color: isActive ? "#ffffff" : controlsDisabled ? "#d1d5db" : "#1a1f36",
              }}
            >
              {page}
            </button>
          );
        })}
        <button
          type="button"
          onClick={changeNext}
          disabled={!hasNext}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white transition-colors ${hasNext ? activeButtonClass : disabledButtonClass}`}
          style={{ color: hasNext ? "#1a1f36" : undefined }}
        >
          <IoChevronForwardOutline className="text-sm" />
        </button>
      </div>
    </div>
  );
};

export default TableCard;
