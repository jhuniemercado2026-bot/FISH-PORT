import React from "react";
import "typeface-montserrat";
import ReportDailyDatePicker from "../components/ReportDailyDatePicker";
import FilterButton from "../components/FilterButton";

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
  billingFilterType,
  onBillingFilterTypeChange,
  vehicleDailyFilterType,
  onVehicleDailyFilterTypeChange,
  monthOptions,
  yearOptions,
  onGenerateReport,
  onExportExcel,
  isGenerating,
  isGenerateDisabled = false,
  isExportDisabled = false,
  showUserFilter = false,
  userFilterValue = "all",
  userFilterOptions = [],
  onUserFilterChange,
  isUserFilterLoading = false,
  showBoatFilter = false,
  boatFilterValue = "all",
  boatFilterOptions = [],
  onBoatFilterChange,
  isBoatFilterLoading = false,
}) => {
  const isRevenueReport = activeReport === "revenue";
  const isDailyReport = activeReport === "daily";
  const isRemittanceReport = activeReport === "remittance";
  const isBillingReport = activeReport === "billing";
  const isMonthlyReport = activeReport === "monthly";
  const isYearlyReport = activeReport === "yearly";

  const isRegisteredBoatsReport = activeReport === "registered-boats";
  const isBoatTypesReport = activeReport === "boat-types";
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
    isBillingReport ||
    isDailyVehicleTicketReport ||
    isVehicleTicketReport ||
    isVehicleTypesReport ||
    isBoatTypesReport ||
    isFeesReport;

  const activeFilterType =
    isVehicleTicketReport ||
    isVehicleTypesReport ||
    isBoatTypesReport ||
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
      : isBillingReport
      ? billingFilterType
      : remittanceFilterType;

  const onFilterTypeChange =
    isVehicleTicketReport || isVehicleTypesReport || isBoatTypesReport || isFeesReport
      ? undefined
      : isRevenueReport
      ? onRevenueFilterTypeChange
      : isDockingReport
      ? onDockingFilterTypeChange
      : isBanyeraReport || isBfarReport
      ? onBanyeraFilterTypeChange
      : isDailyVehicleTicketReport
      ? onVehicleDailyFilterTypeChange
      : isBillingReport
      ? onBillingFilterTypeChange
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
          {!isVehicleTicketReport && !isVehicleTypesReport && !isBoatTypesReport && !isFeesReport && (
            <div className={REPORT_INPUT_WIDTH_CLASS}>
              <FilterButton
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

          {showBoatFilter && (
            <div className={REPORT_INPUT_WIDTH_CLASS}>
              <FilterButton
                width="100%"
                height={46}
                value={boatFilterValue}
                onChange={onBoatFilterChange}
                options={boatFilterOptions}
                loading={isBoatFilterLoading}
                optionLabelProp="displayLabel"
                popupClassName="report-user-filter-dropdown"
              />
            </div>
          )}

          {/* DAILY */}
          {showDaily && (
            <div className={REPORT_INPUT_WIDTH_CLASS}>
              <ReportDailyDatePicker
                value={dailyDate || undefined}
                onChange={onDailyDateChange}
                placeholder="Select a Day"
                dateFormat="YYYY-MM-DD"
                containerClassName="w-full"
              />
            </div>
          )}

          {/* MONTHLY */}
          {showMonthly && (
            <>
              <div className={REPORT_INPUT_WIDTH_CLASS}>
                <FilterButton
                  width="100%"
                  height={46}
                  placeholder="Select a Month"
                  value={monthlyDate ?? undefined}
                  onChange={onMonthlyDateChange}
                  options={monthOptions}
                />
              </div>

              <div className={REPORT_INPUT_WIDTH_CLASS}>
                <FilterButton
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
              <FilterButton
                width="100%"
                height={46}
                placeholder="Select a Year"
                value={yearlyDate ?? undefined}
                onChange={onYearlyDateChange}
                options={yearOptions}
              />
            </div>
          )}

          {showUserFilter && (
            <div className={REPORT_INPUT_WIDTH_CLASS}>
              <FilterButton
                width="100%"
                height={46}
                value={userFilterValue}
                onChange={onUserFilterChange}
                options={userFilterOptions}
                loading={isUserFilterLoading}
                optionLabelProp="displayLabel"
                popupClassName="report-user-filter-dropdown"
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
            Generate PDF
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
          {showBoatFilter ? (
            <div className={REPORT_INPUT_WIDTH_CLASS}>
              <FilterButton
                width="100%"
                height={46}
                value={boatFilterValue}
                onChange={onBoatFilterChange}
                options={boatFilterOptions}
                loading={isBoatFilterLoading}
                optionLabelProp="displayLabel"
                popupClassName="report-user-filter-dropdown"
              />
            </div>
          ) : (
            <div
              className={`${REPORT_INPUT_WIDTH_CLASS} flex h-[46px] items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-normal text-[#1a1f36] shadow-sm`}
            >
              {title ||
                (isRegisteredBoatsReport
                  ? "Registered Boats"
                  : isOwnerInfoReport
                  ? "Boat Owner"
                  : isVehicleTypesReport
                  ? "Vehicle Types"
                  : isFeesReport
                  ? "Fees"
                  : "Fisheries (BFAR)")}
            </div>
          )}

          {showUserFilter && (
            <div className={REPORT_INPUT_WIDTH_CLASS}>
              <FilterButton
                width="100%"
                height={46}
                value={userFilterValue}
                onChange={onUserFilterChange}
                options={userFilterOptions}
                loading={isUserFilterLoading}
                optionLabelProp="displayLabel"
                popupClassName="report-user-filter-dropdown"
              />
            </div>
          )}

          {/* GENERATE */}
          <button
            type="button"
            onClick={onGenerateReport}
            disabled={isGenerateDisabled || isGenerating}
            className={`${REPORT_INPUT_WIDTH_CLASS} flex h-[46px] items-center justify-center gap-2 rounded-xl bg-[#1A1F36] text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <IoDocumentTextOutline size={18} />
            Generate PDF
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
