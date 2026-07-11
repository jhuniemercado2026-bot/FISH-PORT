import React from "react";
import "typeface-montserrat";
import DatePicker from "../components/DatePicker";
import FilterSelect from "../components/FilterSelect";

import { IoDocumentTextOutline, IoSyncOutline } from "react-icons/io5";

const FONT = "'Montserrat', sans-serif";
const REPORT_INPUT_WIDTH_CLASS = "w-full md:w-[260px]";

const ReportsInnerTopbar = ({
  activeReport,
  title,
  dailyDate,
  onDailyDateChange,
  monthlyDate,
  onMonthlyDateChange,
  yearlyDate,
  onYearlyDateChange,
  revenueFilterType,
  onRevenueFilterTypeChange,
  dockingFilterType,
  onDockingFilterTypeChange,
  banyeraFilterType,
  onBanyeraFilterTypeChange,
  remittanceFilterType,
  onRemittanceFilterTypeChange,
  vehicleDailyFilterType,
  onVehicleDailyFilterTypeChange,
  monthOptions,
  yearOptions,
  onGenerateReport,
  onExportExcel,
  isGenerating,
  isGenerateDisabled = false,
  isExportDisabled = false,
}) => {
  const isRevenueReport = activeReport === "revenue";
  const isDailyReport = activeReport === "daily";
  const isRemittanceReport = activeReport === "remittance";
  const isMonthlyReport = activeReport === "monthly";
  const isYearlyReport = activeReport === "yearly";

  const isRegisteredBoatsReport = activeReport === "registered-boats";
  const isOwnerInfoReport = activeReport === "owner-info";
  const isVehicleTypesReport = activeReport === "vehicle-types";
  const isBfarReport = activeReport === "fisheries-bfar";

  const isDockingReport = activeReport === "docking";
  const isBanyeraReport = activeReport === "banyera";
  const isDailyVehicleTicketReport = activeReport === "daily-vehicle-ticket";
  const isVehicleTicketReport = activeReport === "vehicle-ticket";
  const isFeesReport = activeReport === "fees";

  const usesCustomReportFilters =
    isRevenueReport ||
    isDockingReport ||
    isBanyeraReport ||
    isBfarReport ||
    isRemittanceReport ||
    isDailyVehicleTicketReport ||
    isVehicleTicketReport ||
    isVehicleTypesReport ||
    isFeesReport;

  const activeFilterType =
    isVehicleTicketReport ||
    isVehicleTypesReport ||
    isFeesReport
      ? "yearly"
      : isRevenueReport
      ? revenueFilterType
      : isDockingReport
      ? dockingFilterType
      : isBanyeraReport
      ? banyeraFilterType
      : isBfarReport
      ? banyeraFilterType
      : isDailyVehicleTicketReport
      ? vehicleDailyFilterType
      : remittanceFilterType;

  const onFilterTypeChange =
    isVehicleTicketReport || isVehicleTypesReport || isFeesReport
      ? undefined
      : isRevenueReport
      ? onRevenueFilterTypeChange
      : isDockingReport
      ? onDockingFilterTypeChange
      : isBanyeraReport || isBfarReport
      ? onBanyeraFilterTypeChange
      : isDailyVehicleTicketReport
      ? onVehicleDailyFilterTypeChange
      : onRemittanceFilterTypeChange;

  const showDaily =
    usesCustomReportFilters && activeFilterType === "daily";
  const showMonthly =
    usesCustomReportFilters && activeFilterType === "monthly";
  const showYearly =
    usesCustomReportFilters && activeFilterType === "yearly";

  const isReadonlyInputStyleReport =
    isRegisteredBoatsReport ||
    isOwnerInfoReport ||
    isFeesReport;
  // NOTE: isFeesReport added here

  return (
    <div
      className="flex min-h-[86px] items-center justify-center border-b border-slate-200 px-6 py-5"
      style={{ fontFamily: FONT }}
    >
      {/* CUSTOM FILTER REPORTS */}
      {usesCustomReportFilters ? (
        <div className="mx-auto flex w-full max-w-[1100px] flex-nowrap items-center justify-center gap-2 overflow-x-auto">

          {/* FILTER TYPE */}
          {!isVehicleTicketReport && !isVehicleTypesReport && !isFeesReport && (
            <div className={REPORT_INPUT_WIDTH_CLASS}>
              <FilterSelect
                width="100%"
                height={46}
                value={activeFilterType || "daily"}
                onChange={onFilterTypeChange}
                options={[
                  { value: "daily", label: "Daily" },
                  { value: "monthly", label: "Monthly" },
                  { value: "yearly", label: "Yearly" },
                ]}
              />
            </div>
          )}

          {/* DAILY */}
          {showDaily && (
            <div className={REPORT_INPUT_WIDTH_CLASS}>
              <DatePicker
                value={dailyDate || undefined}
                onChange={onDailyDateChange}
                placeholder="Select a Day"
                dateFormat="YYYY-MM-DD"
                containerClassName="w-full"
                options={{ useFiscalYearDefault: false }}
              />
            </div>
          )}

          {/* MONTHLY */}
          {showMonthly && (
            <>
              <div className={REPORT_INPUT_WIDTH_CLASS}>
                <FilterSelect
                  width="100%"
                  height={46}
                  placeholder="Select a Month"
                  value={monthlyDate ?? undefined}
                  onChange={onMonthlyDateChange}
                  options={monthOptions}
                />
              </div>

              <div className={REPORT_INPUT_WIDTH_CLASS}>
                <FilterSelect
                  width="100%"
                  height={46}
                  placeholder="Select a Year"
                  value={yearlyDate ?? undefined}
                  onChange={onYearlyDateChange}
                  options={yearOptions}
                />
              </div>
            </>
          )}

          {/* YEARLY */}
          {showYearly && (
            <div className={REPORT_INPUT_WIDTH_CLASS}>
              <FilterSelect
                width="100%"
                height={46}
                placeholder="Select a Year"
                value={yearlyDate ?? undefined}
                onChange={onYearlyDateChange}
                options={yearOptions}
              />
            </div>
          )}

          {/* BUTTONS */}
          <button
            type="button"
            onClick={onGenerateReport}
            disabled={isGenerateDisabled || isGenerating}
            className={`${REPORT_INPUT_WIDTH_CLASS} flex h-[46px] items-center justify-center gap-2 rounded-xl bg-[#1A1F36] text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <IoDocumentTextOutline size={18} />
            Generate Report
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            disabled={isExportDisabled}
            className={`${REPORT_INPUT_WIDTH_CLASS} flex h-[46px] items-center justify-center gap-2 rounded-xl bg-green-600 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <IoDocumentTextOutline size={18} />
            Export Excel
          </button>
        </div>

      ) : isReadonlyInputStyleReport ? (
        /* REGISTERED BOATS / OWNER INFO / BFAR / FEES STYLE (UNIFIED) */
        <div className="mx-auto flex w-full max-w-[1100px] flex-nowrap items-center justify-center gap-2 overflow-x-auto">

          {/* READONLY INPUT LOOK */}
          <div
            className={`${REPORT_INPUT_WIDTH_CLASS} flex h-[46px] items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-normal text-[#1a1f36] shadow-sm`}
          >
            {title ||
              (isRegisteredBoatsReport
                ? "Registered Boats"
                : isOwnerInfoReport
                ? "Owner Information"
                : isVehicleTypesReport
                ? "Vehicle Types"
                : isFeesReport
                ? "Fees"
                : "Fisheries (BFAR)")}
          </div>

          {/* GENERATE */}
          <button
            type="button"
            onClick={onGenerateReport}
            disabled={isGenerateDisabled || isGenerating}
            className={`${REPORT_INPUT_WIDTH_CLASS} flex h-[46px] items-center justify-center gap-2 rounded-xl bg-[#1A1F36] text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <IoDocumentTextOutline size={18} />
            Generate Report
          </button>

          {/* EXPORT */}
          <button
            type="button"
            onClick={onExportExcel}
            disabled={isExportDisabled}
            className={`${REPORT_INPUT_WIDTH_CLASS} flex h-[46px] items-center justify-center gap-2 rounded-xl bg-green-600 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <IoDocumentTextOutline size={18} />
            Export Excel
          </button>
        </div>

      ) : (
        /* DEFAULT TITLE */
        <div className="flex h-[46px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-5 text-[13px] font-semibold text-[#1a1f36]">
          {title || "Report"}
        </div>
      )}
    </div>
  );
};

export default ReportsInnerTopbar;