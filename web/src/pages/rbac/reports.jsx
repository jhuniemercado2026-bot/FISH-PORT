import React, { useEffect, useMemo, useRef, useState } from "react";
import { ConfigProvider } from "antd";
import "typeface-montserrat";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import ReportsInnerSidebar, { REPORT_TABS } from "../../layout/ReportsInnerSidebar";
import ReportsInnerTopbar from "../../layout/ReportsInnerTopbar";
import { useLocation } from "react-router-dom";
import { useDailyReportDataQuery } from "../../hooks/useDailyReportDataQuery";
import { useRevenueReportDataQuery } from "../../hooks/useRevenueReportDataQuery";
import { useFeeReportDataQuery } from "../../hooks/useFeeReportDataQuery";
import { useMonthlyReportDataQuery } from "../../hooks/useMonthlyReportDataQuery";
import { useYearlyReportDataQuery } from "../../hooks/useYearlyReportDataQuery";
import { useRemittanceReportDataQuery } from "../../hooks/useRemittanceReportDataQuery";
import { useRegisteredBoatsReportDataQuery, useOwnerInfoReportDataQuery } from "../../hooks/useBoatManagement";
import { useDockingReportDataQuery } from "../../hooks/useDockingsDataQuery";
import { useVehicleTicketReportDataQuery } from "../../hooks/useVehicleTicketReportDataQuery";
import { useBillingReportDataQuery } from "../../hooks/useBillingReportDataQuery";
import { buildRevenuePdf } from "../../lib/pdfDocumentRevenue";
import { buildRemittanceReportPdf } from "../../lib/pdfDocumentRemittanceReport";
import { buildBillingReportPdf } from "../../lib/pdfDocumentBillingReport";
import { buildDockingPdf } from "../../lib/pdfDocumentDocking";
import { buildVehicleDailyPdf } from "../../lib/pdfDocumentVehicleDaily";
import { buildVehicleAnnualPdf } from "../../lib/pdfDocumentVehicleAnnual";
import { buildFeePdf } from "../../lib/pdfDocumentFee";
import { buildBanyeraPdf } from "../../lib/pdfDocumentBanyera";
import { buildBfarPdf } from "../../lib/pdfDocumentBfar";
import { buildRegisteredBoatsPdf } from "../../lib/pdfDocumentRegisteredBoats";
import { buildOwnerInfoPdf } from "../../lib/pdfDocumentOwnerInfo";
import { useSidebar } from "../../store/sidebarStore";
import { createExcelExportBlob } from "../../lib/excelFormat";
import { useBanyeraReportDataQuery } from "../../hooks/useBanyeraDataQuery";
import { useBfarReportDataQuery } from "../../hooks/useBfarReportDataQuery";
import { useFiscalYearStore, getFiscalYearOptions } from "../../store/fiscalYearStore";
import { showBottomToast } from "../../store/bottomToastStore";

const FONT = "'Montserrat', sans-serif";
const antTheme = {
  token: {
    colorPrimary: "#4096ff",
    colorPrimaryHover: "#4096ff",
    colorPrimaryActive: "#4096ff",
    borderRadius: 12,
    fontFamily: FONT,
    controlHeight: 42,
    fontSize: 13,
  },
};

const REPORT_CONTENT = {
  revenue: { title: "Revenue Reports" },
  remittance: { title: "Remittance Reports" },
  "registered-boats": { title: "Registered Boats" },
  "owner-info": { title: "Owner Info" },
  docking: { title: "Docking" },
  banyera: { title: "Banyera" },
  "fisheries-bfar": { title: "Fisheries (BFAR)" },
  "daily-vehicle-ticket": { title: "Vehicle Ticket Report" },
  "vehicle-ticket": { title: "Vehicle Ticket Report" },
  billing: { title: "Billing" },
  fees: { title: "Fees" },
};

const HEAD_ONLY_REPORT_KEYS = ["fees"];

const MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const YEAR_OPTIONS = getFiscalYearOptions().map((year) => ({ value: year, label: year }));

const getExportValue = (value) => {
  if (value === undefined || value === null) return "";
  return value;
};

const getExportFileName = (reportKey, filters) => {
  const title = REPORT_CONTENT[reportKey]?.title || reportKey;
  const suffix = filters?.date
    ? filters.date
    : filters?.month && filters?.year
    ? `${filters.year}-${filters.month}`
    : filters?.year
    ? filters.year
    : "report";

  return `${title.replace(/\s+/g, "_")}_${suffix}.xlsx`;
};

const getReportFileSuffix = (filters = {}) => {
  if (filters?.filterType === "daily" && filters?.date) return filters.date;
  if (filters?.filterType === "monthly" && filters?.month && filters?.year) {
    return `${filters.year}-${Number(filters.month)}`;
  }
  if (filters?.filterType === "yearly" && filters?.year) return filters.year;
  if (filters?.year) return filters.year;
  if (filters?.date) return filters.date;
  if (filters?.month && filters?.year) return `${filters.year}-${Number(filters.month)}`;
  return "";
};

const getPdfFileName = (reportKey, filters) => {
  const title = REPORT_CONTENT[reportKey]?.title || reportKey || "Report";
  const staticReportNames = new Set(["registered-boats", "owner-info"]);

  if (staticReportNames.has(reportKey)) {
    return `${title}.pdf`;
  }

  const suffix = getReportFileSuffix(filters);
  return suffix ? `${title}_${suffix}.pdf` : `${title}.pdf`;
};

const createBlobPdfPreviewUrl = (pdfBytes, fileName) => {
  const pdfFile = new File([pdfBytes], fileName, { type: "application/pdf" });
  return URL.createObjectURL(pdfFile);
};

const getExportReportHeader = ({ activeReport, filters }) => {
  const filterType = filters?.filterType;
  const monthLabel = MONTH_OPTIONS.find((option) => option.value === filters?.month)?.label;
  const formattedDate = filters?.date || "";
  const formattedMonth = monthLabel ? `${monthLabel} ${filters?.year || ""}`.trim() : `${filters?.year || ""}`.trim();
  const formattedYear = filters?.year || "";

  switch (activeReport) {
    case "revenue":
      return {
        reportTitle: "Revenue Report",
        reportTypeLabel:
          filterType === "monthly"
            ? "Monthly Revenue"
            : filterType === "yearly"
            ? "Yearly Revenue"
            : "Daily Revenue",
        coverageLabel:
          filterType === "monthly"
            ? "Coverage Month"
            : filterType === "yearly"
            ? "Coverage Year"
            : "Coverage Date",
        coverageValue:
          filterType === "monthly"
            ? formattedMonth
            : filterType === "yearly"
            ? formattedYear
            : formattedDate,
      };
    case "remittance":
      return {
        reportTitle: "Remittance Report",
        reportTypeLabel:
          filterType === "monthly"
            ? "Remittance Monthly"
            : filterType === "yearly"
            ? "Remittance Yearly"
            : "Remittance Daily",
        coverageLabel:
          filterType === "monthly"
            ? "Coverage Month"
            : filterType === "yearly"
            ? "Coverage Year"
            : "Coverage Date",
        coverageValue:
          filterType === "monthly"
            ? formattedMonth
            : filterType === "yearly"
            ? formattedYear
            : formattedDate,
      };
    case "docking":
      return {
        reportTitle: "Docking Report",
        reportTypeLabel:
          filterType === "monthly"
            ? "Monthly Docking"
            : filterType === "yearly"
            ? "Yearly Docking"
            : "Daily Docking",
        coverageLabel: "Coverage",
        coverageValue:
          filterType === "monthly"
            ? formattedMonth
            : filterType === "yearly"
            ? formattedYear
            : formattedDate,
      };
    case "banyera":
      return {
        reportTitle: "Banyera Report",
        reportTypeLabel:
          filterType === "monthly"
            ? "Monthly Banyera"
            : filterType === "yearly"
            ? "Yearly Banyera"
            : "Daily Banyera",
        coverageLabel: "Coverage",
        coverageValue:
          filterType === "monthly"
            ? formattedMonth
            : filterType === "yearly"
            ? formattedYear
            : formattedDate,
      };
    case "fisheries-bfar":
      return {
        reportTitle: "Fisheries (BFAR) Report",
        reportTypeLabel:
          filterType === "monthly"
            ? "Monthly Fisheries"
            : filterType === "yearly"
            ? "Yearly Fisheries"
            : "Daily Fisheries",
        coverageLabel:
          filterType === "monthly"
            ? "Coverage Month"
            : filterType === "yearly"
            ? "Coverage Year"
            : "Coverage Date",
        coverageValue:
          filterType === "monthly"
            ? formattedMonth
            : filterType === "yearly"
            ? formattedYear
            : formattedDate,
      };
    case "daily-vehicle-ticket":
      return {
        reportTitle: "Vehicle Ticket Report",
        reportTypeLabel:
          filterType === "monthly"
            ? "Vehicle Ticket Monthly"
            : filterType === "yearly"
            ? "Vehicle Ticket Yearly"
            : "Vehicle Ticket Daily",
        coverageLabel:
          filterType === "monthly"
            ? "Coverage Month"
            : filterType === "yearly"
            ? "Coverage Year"
            : "Coverage Date",
        coverageValue:
          filterType === "monthly"
            ? formattedMonth
            : filterType === "yearly"
            ? formattedYear
            : formattedDate,
      };
    case "vehicle-ticket":
      return {
        reportTitle: "Vehicle Ticket Report",
        reportTypeLabel: "Yearly",
        coverageLabel: "Coverage Year",
        coverageValue: formattedYear,
      };
    case "billing":
      return {
        reportTitle: "Billing Report",
        reportTypeLabel:
          filterType === "monthly"
            ? "Billing Monthly"
            : filterType === "yearly"
            ? "Billing Yearly"
            : "Billing Daily",
        coverageLabel:
          filterType === "monthly"
            ? "Coverage Month"
            : filterType === "yearly"
            ? "Coverage Year"
            : "Coverage Date",
        coverageValue:
          filterType === "monthly"
            ? formattedMonth
            : filterType === "yearly"
            ? formattedYear
            : formattedDate,
      };
    case "fees":
      return {
        reportTitle: "Fees Report",
        reportTypeLabel: "Fee Yearly",
        coverageLabel: "Coverage Year",
        coverageValue: formattedYear,
      };
    case "registered-boats":
      return {
        reportTitle: "Registered Boats Report",
        reportTypeLabel: "Registered Boats",
        coverageLabel: "Report Date",
        coverageValue: formattedDate,
        useGeneratedOn: true,
      };
    case "owner-info":
      return {
        reportTitle: "Owner Info Report",
        reportTypeLabel: "Owner Info",
        coverageLabel: "Report Date",
        coverageValue: formattedDate,
        useGeneratedOn: true,
      };
    default:
      return {
        reportTitle: "Report",
        reportTypeLabel: "Report",
        coverageLabel: "Report Date",
        coverageValue: formattedDate,
      };
  }
};

const getExportReportSummary = ({
  activeReport,
  revenueReportData,
  remittanceReportData,
  dockingReportData,
  banyeraData,
  bfarData,
  vehicleTicketReportData,
  billingReportData,
  feeReportData,
  registeredBoatsReportData,
  ownerInfoReportData,
}) => {
  const sumRows = (rows, key) =>
    Array.isArray(rows)
      ? rows.reduce((sum, row) => sum + Number(row?.[key] || 0), 0)
      : 0;
  const formatCurrency = (value) =>
    `PHP ${Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  switch (activeReport) {
    case "revenue": {
      const revenueTotal =
        Number(revenueReportData?.totalRevenue || 0) ||
        sumRows(revenueReportData?.rows, "total") ||
        sumRows(revenueReportData?.rows, "fee") ||
        sumRows(revenueReportData?.rows, "receivable");
      return {
        totalLabel: "Total Revenue:",
        totalValue: formatCurrency(revenueTotal),
      };
    }
    case "remittance": {
      const remittanceTotal =
        Number(remittanceReportData?.totalRemittances || 0) ||
        sumRows(remittanceReportData?.rows, "amountToRemit") ||
        sumRows(remittanceReportData?.rows, "confirmedCash") ||
        sumRows(remittanceReportData?.rows, "amount");
      return {
        totalLabel: "Total Remittances:",
        totalValue: formatCurrency(remittanceTotal),
      };
    }
    case "docking": {
      const dockingTotal =
        Number((dockingReportData?.total_fee ?? dockingReportData?.totalDocking) || 0) ||
        sumRows(dockingReportData?.dockings, "fee") ||
        sumRows(dockingReportData?.dockings, "docking_fee");
      return {
        totalLabel: "Total Dockings:",
        totalValue: formatCurrency(dockingTotal),
      };
    }
    case "banyera": {
      const banyeraTotal =
        Number(banyeraData?.totalRevenue || 0) ||
        sumRows(banyeraData?.rows ?? banyeraData?.banyeraTransactions, "total");
      return {
        totalLabel: "Total Banyera:",
        totalValue: formatCurrency(banyeraTotal),
      };
    }
    case "fisheries-bfar": {
      const qtyTotal = sumRows(bfarData?.rows, "qty");
      return {
        totalLabel: "Total Qty:",
        totalValue: String(qtyTotal),
      };
    }
    case "daily-vehicle-ticket":
    case "vehicle-ticket": {
      const ticketFeeTotal =
        Number(vehicleTicketReportData?.totalTicketFee ?? 0) ||
        Number(vehicleTicketReportData?.total_ticket_fee ?? 0) ||
        sumRows(vehicleTicketReportData?.tickets, "ticketFee") ||
        sumRows(vehicleTicketReportData?.tickets, "ticket_fee") ||
        sumRows(vehicleTicketReportData?.tickets, "dailyFee") ||
        sumRows(vehicleTicketReportData?.tickets, "daily_fee") ||
        sumRows(vehicleTicketReportData?.tickets, "banyeraFee") ||
        sumRows(vehicleTicketReportData?.tickets, "banyera_fee") ||
        sumRows(vehicleTicketReportData?.tickets, "amount");
      return {
        totalLabel: "Total Ticket Fee:",
        totalValue: formatCurrency(ticketFeeTotal),
      };
    }
    case "billing": {
      const billingRows = billingReportData?.rows ?? billingReportData?.bills ?? [];
      const billingTotal =
        Number(billingReportData?.totalBillings ?? billingReportData?.totalBilling ?? 0) ||
        sumRows(billingRows, "totalAmount") ||
        sumRows(billingRows, "total_amount") ||
        sumRows(billingRows, "amount") ||
        sumRows(billingRows, "total") ||
        sumRows(billingRows, "grand_total");
      return {
        totalLabel: "Total Billings:",
        totalValue: formatCurrency(billingTotal),
      };
    }
    case "fees": {
      const feeCount = Number(feeReportData?.totalRecords ?? (Array.isArray(feeReportData?.fees) ? feeReportData.fees.length : 0));
      return {
        totalLabel: "Total Fees:",
        totalValue: String(Number.isFinite(feeCount) ? feeCount : 0),
      };
    }
    case "registered-boats": {
      const boatsCount = Array.isArray(registeredBoatsReportData?.boats)
        ? registeredBoatsReportData.boats.length
        : 0;
      return {
        totalLabel: "Total Boats:",
        totalValue: String(boatsCount),
      };
    }
    case "owner-info": {
      const ownersCount = Number(ownerInfoReportData?.totalOwners ?? (Array.isArray(ownerInfoReportData?.owners) ? ownerInfoReportData.owners.length : 0));
      return {
        totalLabel: "Total Owners:",
        totalValue: String(Number.isFinite(ownersCount) ? ownersCount : 0),
      };
    }
    default:
      return {
        totalLabel: "",
        totalValue: "",
      };
  }
};

const getExportTotalsRow = (rows, columns) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const totals = {};
  let hasTotal = false;

  columns.forEach((column) => {
    const sum = rows.reduce((acc, row) => {
      const value = row?.[column.key];
      const numeric = typeof value === "number" ? value : Number(value);
      return acc + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);

    if (sum !== 0) {
      totals[column.key] = sum;
      hasTotal = true;
    }
  });

  if (!hasTotal) return null;

  return columns.reduce((acc, column, index) => {
    if (index === 0) {
      acc[column.key] = "Total";
    } else if (totals[column.key] !== undefined) {
      acc[column.key] = totals[column.key];
    } else {
      acc[column.key] = "";
    }
    return acc;
  }, {});
};


const getReportRowsForExport = ({
  activeReport,
  revenueReportData,
  remittanceReportData,
  registeredBoatsReportData,
  ownerInfoReportData,
  dockingReportData,
  banyeraData,
  bfarData,
  vehicleTicketReportData,
  billingReportData,
  feeReportData,
}) => {
  if (activeReport === "revenue") return revenueReportData?.rows ?? [];
  if (activeReport === "remittance") return remittanceReportData?.rows ?? [];
  if (activeReport === "registered-boats") return registeredBoatsReportData?.boats ?? [];
  if (activeReport === "owner-info") return ownerInfoReportData?.owners ?? [];
  if (activeReport === "docking") return dockingReportData?.dockings ?? [];
  if (activeReport === "banyera") return banyeraData?.rows ?? banyeraData?.banyeraTransactions ?? [];
  if (activeReport === "fisheries-bfar") return bfarData?.rows ?? [];
  if (activeReport === "daily-vehicle-ticket" || activeReport === "vehicle-ticket") return vehicleTicketReportData?.tickets ?? [];
  if (activeReport === "billing") return billingReportData?.rows ?? billingReportData?.bills ?? [];
  if (activeReport === "fees") return feeReportData?.fees ?? [];
  return [];
};

const getExportColumnsForReport = ({
  activeReport,
  generatedFilters,
  revenueFilterType,
  remittanceFilterType,
  dockingFilterType,
  banyeraFilterType,
  billingFilterType,
  vehicleDailyFilterType,
}) => {
  const filterType = generatedFilters?.filterType
    ?? (activeReport === "revenue" ? revenueFilterType
      : activeReport === "remittance" ? remittanceFilterType
      : activeReport === "docking" ? dockingFilterType
      : activeReport === "banyera" || activeReport === "fisheries-bfar" ? banyeraFilterType
      : activeReport === "billing" ? billingFilterType
      : activeReport === "daily-vehicle-ticket" ? vehicleDailyFilterType
      : undefined);

  if (activeReport === "revenue") {
    if (filterType === "monthly") {
      return [
        { key: "date", label: "Date" },
        { key: "payorName", label: "Name of Payor" },
        { key: "orNumber", label: "OR No." },
        { key: "description", label: "Transaction" },
        { key: "receivable", label: "Receivable (PHP)" },
        { key: "fee", label: "Amount (PHP)" },
        { key: "quantity", label: "Quantity" },
        { key: "total", label: "Total (PHP)" },
      ];
    }

    if (filterType === "yearly") {
      return [
        { key: "date", label: "Date" },
        { key: "payorName", label: "Name of Payor" },
        { key: "orNumber", label: "OR No." },
        { key: "description", label: "Transaction" },
        { key: "receivable", label: "Receivable (PHP)" },
        { key: "fee", label: "Amount (PHP)" },
        { key: "quantity", label: "Quantity" },
        { key: "total", label: "Total (PHP)" },
      ];
    }

    return [
      { key: "payorName", label: "Name of Payor" },
      { key: "orNumber", label: "OR No." },
      { key: "description", label: "Transaction" },
      { key: "receivable", label: "Receivable (PHP)" },
      { key: "fee", label: "Amount (PHP)" },
      { key: "quantity", label: "Quantity" },
      { key: "total", label: "Total (PHP)" },
    ];
  }

  if (activeReport === "remittance") {
    return [
      { key: "remittanceReferenceNo", label: "Remittance Ref. No." },
      { key: "todaysCashReceived", label: "Today's Cash (PHP)" },
      { key: "amountToRemit", label: "Amount to Remit (PHP)" },
      { key: "surplus", label: "Surplus (PHP)" },
      { key: "deficit", label: "Deficit (PHP)" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status" },
    ];
  }

  if (activeReport === "registered-boats") {
    return [
      { key: "boat_name", label: "Boat Name" },
      { key: "type", label: "Type" },
      { key: "owner", label: "Owner" },
      { key: "date_registered", label: "Date Registered" },
      { key: "boat_status", label: "Status" },
    ];
  }

  if (activeReport === "owner-info") {
    return [
      { key: "full_name", label: "Full Name" },
      { key: "contact_number", label: "Contact" },
      { key: "address", label: "Address" },
    ];
  }

  if (activeReport === "docking") {
    return filterType === "daily"
      ? [
          { key: "time", label: "Time" },
          { key: "boatName", label: "Boat Name" },
          { key: "boatType", label: "Boat Type" },
          { key: "fee", label: "Fee (PHP)" },
        ]
      : [
          { key: "dockingDate", label: "Docking Date" },
          { key: "time", label: "Time" },
          { key: "boatName", label: "Boat Name" },
          { key: "boatType", label: "Boat Type" },
          { key: "fee", label: "Fee (PHP)" },
        ];
  }

  if (activeReport === "banyera") {
    return filterType === "daily"
      ? [
          { key: "transactionTime", label: "Time" },
          { key: "boatName", label: "Boat Name" },
          { key: "boatType", label: "Boat Type" },
          { key: "fishItems", label: "Fish Items" },
          { key: "totalQuantity", label: "Total Qty" },
          { key: "fee", label: "Fee (PHP)" },
          { key: "total", label: "Total (PHP)" },
        ]
      : [
          { key: "transactionDate", label: "Banyera Date" },
          { key: "transactionTime", label: "Time" },
          { key: "boatName", label: "Boat Name" },
          { key: "boatType", label: "Boat Type" },
          { key: "fishItems", label: "Fish Items" },
          { key: "totalQuantity", label: "Total Qty" },
          { key: "fee", label: "Fee (PHP)" },
          { key: "total", label: "Total (PHP)" },
        ];
  }

  if (activeReport === "fisheries-bfar") {
    return filterType === "daily"
      ? [
          { key: "boatName", label: "Boat Name" },
          { key: "fishClassification", label: "Fish Classification" },
          { key: "qty", label: "Qty" },
          { key: "daug", label: "Daug (PHP)" },
        ]
      : [
          { key: "date", label: "Date" },
          { key: "boatName", label: "Boat Name" },
          { key: "fishClassification", label: "Fish Classification" },
          { key: "qty", label: "Qty" },
          { key: "daug", label: "Daug (PHP)" },
        ];
  }

  if (activeReport === "daily-vehicle-ticket") {
    // Match the PDF daily layout: omit Date column, start with Vehicle Type
    return [
      { key: "vehicleType", label: "Vehicle Type" },
      { key: "dailyFee", label: "Daily Fee (PHP)" },
      { key: "banyeraFee", label: "Banyera Fee (PHP)" },
      { key: "ticketFee", label: "Ticket Fee (PHP)" },
    ];
  }

  if (activeReport === "vehicle-ticket") {
    return [
      { key: "date", label: "Date", width: 16 },
      { key: "vehicleType", label: "Vehicle Type", width: 22 },
      { key: "driverName", label: "Driver Name", width: 18 },
      { key: "plateNumber", label: "Plate Number", width: 14 },
      { key: "officialReceiptNo", label: "OR No.", width: 10 },
      { key: "controlNumber", label: "Control No.", width: 12 },
      { key: "ticketFee", label: "Ticket Fee (PHP)", width: 16 },
    ];
  }

  if (activeReport === "billing") {
    return [
      { key: "billReferenceNo", label: "Billing Ref. No.", width: 18 },
      { key: "boatName", label: "Boat Name", width: 22 },
      { key: "date", label: "Date Issued", width: 16 },
      { key: "status", label: "Status", width: 14 },
      { key: "totalAmount", label: "Total Charges (PHP)", width: 20 },
    ];
  }

  if (activeReport === "fees") {
    return [
      { key: "effectiveFrom", label: "Effective From" },
      { key: "effectiveTo", label: "Effective To" },
      { key: "feeType", label: "Fee Type" },
      { key: "applicableType", label: "Boat / Vehicle Type" },
      { key: "amount", label: "Amount (PHP)" },
      { key: "status", label: "Status" },
    ];
  }

  return [];
};

const getExportRowsForColumns = (rows, columns, activeReport) => {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(columns)) return [];
  // Helper: format owner object into name
  const formatBoatOwner = (owner) => {
    if (!owner) return "";
    if (typeof owner === "string") return owner;
    return (
      owner.full_name || `${owner.owner_firstname || ""} ${owner.owner_lastname || ""}`.trim() || ""
    );
  };

  const formatBoatType = (boat) => {
    if (!boat) return "";
    if (boat.boatType && boat.boatType.type_name) return boat.boatType.type_name;
    if (boat.boat_type && boat.boat_type.type_name) return boat.boat_type.type_name;
    return "";
  };

  const formatExportDate = (value) => {
    if (!value) return "";
    const normalized = String(value).slice(0, 10);
    const date = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(date.getTime())) return normalized;
    return date.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  };

  const formatDockingTime = (value) => {
    if (!value) return "";
    const normalized = String(value).replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return String(value).slice(11, 16) || value;
    return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  };

  const formatBanyeraDate = (value) => {
    if (!value) return "";
    const normalized = String(value).replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) || value;
    return date.toLocaleDateString("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatBanyeraTime = (value) => {
    if (!value) return "";
    const normalized = String(value).replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return String(value).slice(11, 16) || value;
    return date.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatBanyeraFishItems = (items) => {
    if (!Array.isArray(items) || items.length === 0) return "";
    return [...new Set(
      items
        .map((item) => item?.classification?.classification_name || item?.classification_name || "")
        .map((value) => String(value).trim())
        .filter(Boolean),
    )].join(", ");
  };

  const getBanyeraTotalQuantity = (items) =>
    Array.isArray(items)
      ? items.reduce((sum, item) => sum + Number(item?.quantity ?? 0), 0)
      : 0;

  const getBanyeraFeePerUnit = (row) => {
    const items = Array.isArray(row?.items) ? row.items : [];
    const firstItem = items.find((item) => item?.fee?.amount || item?.fee_amount != null);
    const explicitFeeAmount = Number(firstItem?.fee?.amount ?? firstItem?.fee_amount ?? 0);
    if (explicitFeeAmount > 0) return explicitFeeAmount;
    const totalQuantity = getBanyeraTotalQuantity(items);
    const totalFee = Number(row?.total_fee ?? 0);
    return totalQuantity > 0 ? totalFee / totalQuantity : 0;
  };

  const formatStatus = (value) => {
    if (!value) return "";
    return String(value).replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const firstValue = (...values) =>
    values.find((value) => value !== undefined && value !== null && value !== "");

  const getBillingTotalAmount = (row) =>
    Number(firstValue(row?.totalAmount, row?.total_amount, row?.amount, row?.total, row?.grand_total, row?.balance_due, 0) || 0);

  const getBillingPaidAmount = (row) =>
    Number(firstValue(row?.paidAmount, row?.paid_amount, row?.amount_paid, row?.total_paid, row?.payments_total, 0) || 0);

  const getBillingBalanceDue = (row) =>
    Number(firstValue(row?.balanceDue, row?.balance_due, row?.remaining_balance, getBillingTotalAmount(row) - getBillingPaidAmount(row), 0) || 0);

  const getBillingStatus = (row) =>
    firstValue(row?.status, row?.payment_status, getBillingBalanceDue(row) <= 0 ? "Paid" : "Unpaid");

  const normalizeVehicleTicketRow = (row) => {
    if (!row || typeof row !== "object") return row;
    const normalized = { ...row };

    if (normalized.ticket_fee !== undefined) normalized.ticketFee = normalized.ticket_fee;
    if (normalized.daily_fee !== undefined) normalized.dailyFee = normalized.daily_fee;
    if (normalized.banyera_fee !== undefined) normalized.banyeraFee = normalized.banyera_fee;
    if (normalized.vehicle_type_id !== undefined) normalized.vehicleTypeId = normalized.vehicle_type_id;
    if (normalized.vehicle_type?.type_name) normalized.vehicleType = normalized.vehicle_type.type_name;
    if (normalized.vehicleType?.type_name) normalized.vehicleType = normalized.vehicleType.type_name;
    if (normalized.plate_number !== undefined) normalized.plateNumber = normalized.plate_number;
    if (normalized.driver_name !== undefined) normalized.driverName = normalized.driver_name;
    if (normalized.official_receipt_no !== undefined) normalized.officialReceiptNo = normalized.official_receipt_no;
    if (normalized.control_number !== undefined) normalized.controlNumber = normalized.control_number;
    return normalized;
  };

  const normalizedRows = (activeReport === "daily-vehicle-ticket" || activeReport === "vehicle-ticket")
    ? rows.map(normalizeVehicleTicketRow)
    : rows;

  return normalizedRows.map((row) =>
    columns.reduce((acc, column) => {
      const resolveRowValue = (src, k) => {
        if (!src) return undefined;
        // direct match
        if (src[k] !== undefined && src[k] !== null) return src[k];
        // try snake_case for camelCase keys
        const snake = String(k).replace(/([A-Z])/g, "_$1").toLowerCase();
        if (src[snake] !== undefined && src[snake] !== null) return src[snake];
        // try camelCase for snake_case keys
        const camel = String(k).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (src[camel] !== undefined && src[camel] !== null) return src[camel];
        // nested relation checks common for vehicle tickets
        if (k.toLowerCase().includes("vehicle") && (src.vehicleType || src.vehicle_type)) {
          return src.vehicleType?.type_name || src.vehicle_type?.type_name || undefined;
        }
        if (k.toLowerCase().includes("driver")) return src.driver_name ?? src.driverName ?? undefined;
        if (k.toLowerCase().includes("plate")) return src.plate_number ?? src.plateNumber ?? undefined;
        if (k.toLowerCase().includes("ticketfee") || k.toLowerCase().includes("ticket_fee")) return src.ticket_fee ?? src.ticketFee ?? undefined;
        if (k.toLowerCase().includes("dailyfee") || k.toLowerCase().includes("daily_fee")) return src.daily_fee ?? src.dailyFee ?? undefined;
        if (k.toLowerCase().includes("banyerafee") || k.toLowerCase().includes("banyera_fee")) return src.banyera_fee ?? src.banyeraFee ?? undefined;
        return undefined;
      };

      let val = resolveRowValue(row, column.key);

      // Registered boats: some fields are nested objects and need formatting
      if (column.key === "owner") {
        val = formatBoatOwner(row?.owner);
      } else if (column.key === "type") {
        val = formatBoatType(row);
      } else if (column.key === "date_registered") {
        // backend may use created_at or date_registered
        val = formatExportDate(row?.date_registered ?? row?.created_at ?? row?.createdAt);
      } else if (column.key === "boat_status" || column.key === "status") {
        val = activeReport === "billing"
          ? getBillingStatus(row)
          : formatStatus(row?.boat_status ?? row?.status ?? val);
      } else if (column.key === "dockingDate") {
        val = formatExportDate(row?.docking_date ?? row?.created_at ?? row?.dockingDate);
      } else if (column.key === "time") {
        val = formatDockingTime(row?.docking_date ?? row?.created_at ?? row?.time);
      } else if (column.key === "transactionDate") {
        val = formatBanyeraDate(row?.transaction_date ?? row?.created_at ?? row?.transactionDate);
      } else if (column.key === "transactionTime") {
        val = formatBanyeraTime(row?.transaction_date ?? row?.created_at ?? row?.transactionTime);
      } else if (column.key === "fishItems") {
        val = formatBanyeraFishItems(row?.items || []);
      } else if (column.key === "totalQuantity") {
        val = getBanyeraTotalQuantity(row?.items || []);
      } else if (column.key === "fee") {
        val = getBanyeraFeePerUnit(row);
      } else if (column.key === "total") {
        val = Number(row?.total_fee ?? row?.total ?? 0);
      } else if (column.key === "date") {
        val = formatExportDate(row?.date ?? row?.billing_date ?? row?.bill_date ?? row?.date_billed ?? row?.transaction_date ?? row?.created_at ?? row?.transactionDate);
      } else if (column.key === "fishClassification") {
        val = row?.classification_name || row?.fishClassification || row?.classification?.classification_name || "";
      } else if (column.key === "qty") {
        val = Number(row?.qty ?? row?.quantity ?? 0);
      } else if (column.key === "daug") {
        val = Number(row?.daug ?? row?.daug_amount ?? row?.daug_value ?? 0);
      } else if (column.key === "boatName") {
        val =
          row?.boat?.boat_name ||
          row?.boatName ||
          row?.boat_name ||
          row?.boat?.boatName ||
          "";
      } else if (column.key === "boatType") {
        val =
          row?.boat?.boat_type?.type_name ||
          row?.boat?.boatType?.type_name ||
          row?.boatType ||
          row?.boat_type ||
          "";
      } else if (column.key === "fee") {
        val = row?.docking_fee ?? row?.fee ?? val;
      } else if (column.key === "full_name") {
        val =
          row?.full_name ||
          `${row?.owner_firstname || row?.first_name || ""} ${row?.owner_lastname || row?.last_name || ""}`.trim();
      } else if (column.key === "contact_number") {
        val = row?.contact_number ?? row?.contactNumber ?? val;
      } else if (column.key === "address") {
        val = row?.address ?? val;
      } else if (column.key === "billReferenceNo") {
        val = firstValue(row?.billReferenceNo, row?.bill_reference_no, row?.bill_reference, row?.reference_no, row?.referenceNo, row?.id, "");
      } else if (column.key === "totalAmount") {
        val = getBillingTotalAmount(row);
      }

      acc[column.key] = getExportValue(val);
      return acc;
    }, {}),
  );
};

const getExportFilters = ({
  activeReport,
  generatedFilters,
  revenueFilterType,
  remittanceFilterType,
  dockingFilterType,
  banyeraFilterType,
  billingFilterType,
  vehicleDailyFilterType,
  dailyDate,
  monthlyMonth,
  monthlyYear,
  yearlyDate,
  remittanceDailyDate,
  remittanceMonthlyMonth,
  remittanceMonthlyYear,
  remittanceYearlyDate,
}) => {
  if (generatedFilters?.filterType) return generatedFilters;

  if (activeReport === "revenue") {
    return {
      filterType: revenueFilterType,
      date: revenueFilterType === "daily" ? dailyDate : undefined,
      month: revenueFilterType === "monthly" ? monthlyMonth : undefined,
      year: revenueFilterType === "monthly" ? monthlyYear : revenueFilterType === "yearly" ? yearlyDate : undefined,
    };
  }

  if (activeReport === "remittance") {
    return {
      filterType: remittanceFilterType,
      date: remittanceFilterType === "daily" ? remittanceDailyDate : undefined,
      month: remittanceFilterType === "monthly" ? remittanceMonthlyMonth : undefined,
      year: remittanceFilterType === "monthly" ? remittanceMonthlyYear : remittanceFilterType === "yearly" ? remittanceYearlyDate : undefined,
    };
  }

  if (activeReport === "docking") {
    return {
      filterType: dockingFilterType,
      date: dockingFilterType === "daily" ? dailyDate : undefined,
      month: dockingFilterType === "monthly" ? monthlyMonth : undefined,
      year: dockingFilterType === "monthly" ? monthlyYear : dockingFilterType === "yearly" ? yearlyDate : undefined,
    };
  }

  if (activeReport === "banyera" || activeReport === "fisheries-bfar") {
    const filterType = activeReport === "banyera" ? banyeraFilterType : banyeraFilterType;
    return {
      filterType,
      date: filterType === "daily" ? dailyDate : undefined,
      month: filterType === "monthly" ? monthlyMonth : undefined,
      year: filterType === "monthly" ? monthlyYear : filterType === "yearly" ? yearlyDate : undefined,
    };
  }

  if (activeReport === "billing") {
    return {
      filterType: billingFilterType,
      date: billingFilterType === "daily" ? dailyDate : undefined,
      month: billingFilterType === "monthly" ? monthlyMonth : undefined,
      year: billingFilterType === "monthly" ? monthlyYear : billingFilterType === "yearly" ? yearlyDate : undefined,
    };
  }

  if (activeReport === "daily-vehicle-ticket") {
    return {
      filterType: vehicleDailyFilterType,
      date: vehicleDailyFilterType === "daily" ? dailyDate : undefined,
      month: vehicleDailyFilterType === "monthly" ? monthlyMonth : undefined,
      year: vehicleDailyFilterType === "monthly" ? monthlyYear : vehicleDailyFilterType === "yearly" ? yearlyDate : undefined,
    };
  }

  if (activeReport === "vehicle-ticket" || activeReport === "fees") {
    return {
      filterType: "yearly",
      year: yearlyDate,
    };
  }

  return {};
};

const getExportSheetName = (reportKey) => {
  switch (reportKey) {
    case "revenue": return "Revenue";
    case "remittance": return "Remittance";
    case "registered-boats": return "RegisteredBoats";
    case "owner-info": return "OwnerInfo";
    case "docking": return "Docking";
    case "banyera": return "Banyera";
    case "fisheries-bfar": return "BFAR";
    case "daily-vehicle-ticket": return "VehicleDaily";
    case "vehicle-ticket": return "VehicleAnnual";
    case "billing": return "Billing";
    case "fees": return "Fees";
    default: return "Report";
  }
};


const getExportRowCount = ({
  activeReport,
  revenueReportData,
  remittanceReportData,
  registeredBoatsReportData,
  ownerInfoReportData,
  dockingReportData,
  banyeraData,
  bfarData,
  vehicleTicketReportData,
  billingReportData,
  feeReportData,
}) => {
  const rows = getReportRowsForExport({
    activeReport,
    revenueReportData,
    remittanceReportData,
    registeredBoatsReportData,
    ownerInfoReportData,
    dockingReportData,
    banyeraData,
    bfarData,
    vehicleTicketReportData,
    billingReportData,
    feeReportData,
  });
  return Array.isArray(rows) ? rows.length : 0;
};

const getExportBlobFileName = (activeReport, filters) => getExportFileName(activeReport, filters);

const getExportHref = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const getExportStatus = ({
  activeReport,
  revenueReportData,
  remittanceReportData,
  registeredBoatsReportData,
  ownerInfoReportData,
  dockingReportData,
  banyeraData,
  bfarData,
  vehicleTicketReportData,
  billingReportData,
  feeReportData,
}) => ({
  rows: getReportRowsForExport({
    activeReport,
    revenueReportData,
    remittanceReportData,
    registeredBoatsReportData,
    ownerInfoReportData,
    dockingReportData,
    banyeraData,
    bfarData,
    vehicleTicketReportData,
    billingReportData,
    feeReportData,
  }),
});

const getExportData = ({
  activeReport,
  revenueReportData,
  remittanceReportData,
  registeredBoatsReportData,
  ownerInfoReportData,
  dockingReportData,
  banyeraData,
  bfarData,
  vehicleTicketReportData,
  billingReportData,
  feeReportData,
}) => getReportRowsForExport({
  activeReport,
  revenueReportData,
  remittanceReportData,
  registeredBoatsReportData,
  ownerInfoReportData,
  dockingReportData,
  banyeraData,
  bfarData,
  vehicleTicketReportData,
  billingReportData,
  feeReportData,
});

const getExportBlobAndName = async (context) => {
  const rows = getExportData(context);
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const filters = getExportFilters(context);
  const fileName = getExportFileName(context.activeReport, filters);
  const columns = getExportColumnsForReport({
    activeReport: context.activeReport,
    generatedFilters: context.generatedFilters,
    revenueFilterType: context.revenueFilterType,
    remittanceFilterType: context.remittanceFilterType,
    dockingFilterType: context.dockingFilterType,
    banyeraFilterType: context.banyeraFilterType,
    billingFilterType: context.billingFilterType,
    vehicleDailyFilterType: context.vehicleDailyFilterType,
  });
  const reportHeader = getExportReportHeader({
    activeReport: context.activeReport,
    filters,
  });
  const reportSummary = getExportReportSummary({
    activeReport: context.activeReport,
    revenueReportData: context.revenueReportData,
    remittanceReportData: context.remittanceReportData,
    dockingReportData: context.dockingReportData,
    banyeraData: context.banyeraData,
    bfarData: context.bfarData,
    vehicleTicketReportData: context.vehicleTicketReportData,
    billingReportData: context.billingReportData,
    feeReportData: context.feeReportData,
    registeredBoatsReportData: context.registeredBoatsReportData,
    ownerInfoReportData: context.ownerInfoReportData,
  });
  const exportRows = getExportRowsForColumns(rows, columns, context.activeReport);
  const hasExportableRows = Array.isArray(exportRows) && exportRows.some((row) =>
    Object.values(row).some((value) => value !== undefined && value !== null && value !== ""),
  );

  if (!hasExportableRows) {
    return null;
  }

  const blob = await createExcelExportBlob({
    rows: exportRows,
    columns,
    sheetName: getExportSheetName(context.activeReport),
    reportHeader,
    reportSummary,
    preparedBy: context.preparedBy || "Admin",
  });
  return { blob, fileName };
};


const getError = null;

const getNull = null;

const getTrue = true;

const getFalse = false;

const getUndefined = undefined;

const getNaN = NaN;

const getDateParts = (value) => {
  if (!value) return { year: "", month: "", day: "" };
  return {
    year: String(value).slice(0, 4),
    month: String(value).slice(5, 7),
    day: String(value).slice(8, 10),
  };
};

const setMonthYear = (value, year) => {
  const normalized = String(value || `${year}-01`);
  return `${year}-${normalized.slice(5, 7) || "01"}`;
};

const SuperReports = () => {
  const location = useLocation();
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } =
    useSidebar();
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);
  const normalizedRole = String(currentUser?.role || "").trim().toLowerCase();
  const isHead = normalizedRole === "head";
  const preparedBy = useMemo(
    () =>
      currentUser?.full_name ||
      [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(" ") ||
      currentUser?.user_name ||
      "Admin",
    [currentUser],
  );
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedTab = searchParams.get("tab");
  const requestedReportTab = ["daily", "monthly", "yearly"].includes(requestedTab)
    ? "revenue"
    : requestedTab;
  const requestedDate = searchParams.get("date");
  const isAllowedReportKey = (reportKey) =>
    Boolean(REPORT_CONTENT[reportKey]) && (isHead || !HEAD_ONLY_REPORT_KEYS.includes(reportKey));
  const availableReportTabs = useMemo(
    () => REPORT_TABS.filter((tab) => isAllowedReportKey(tab.key)),
    [isHead],
  );
  const defaultReportTab = availableReportTabs[0]?.key || "revenue";
  const initialReportTab = isAllowedReportKey(requestedReportTab) ? requestedReportTab : defaultReportTab;
  const [activeItem, setActiveItem] = useState(
    initialReportTab === "remittance" ? "Remittance" : "Reports",
  );
  const [activeReport, setActiveReport] = useState(initialReportTab);
  const [contentMargin, setContentMargin] = useState(() =>
    window.innerWidth >= 1024 ? 256 : 0,
  );
  const [reportPdfUrl, setReportPdfUrl] = useState("");
  const [reportPdfFileName, setReportPdfFileName] = useState("");
  const [reportPdfLoading, setReportPdfLoading] = useState(false);
  const [isGenerateActionDisabled, setIsGenerateActionDisabled] = useState(false);
  const [isExportActionDisabled, setIsExportActionDisabled] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [reportBuildKey, setReportBuildKey] = useState(0);
  const [reportBuildRequest, setReportBuildRequest] = useState(null);
  const [generatedFilters, setGeneratedFilters] = useState({});
  const reportPreviewCacheRef = useRef({});
  const ownerInfoReportDataRef = useRef(null);
  const dockingReportDataRef = useRef(null);
  const banyeraReportDataRef = useRef(null);
  const bfarReportDataRef = useRef(null);
  const vehicleTicketReportDataRef = useRef(null);
  const feeReportDataRef = useRef(null);
  const [dailyDate, setDailyDate] = useState(() => {
    if (requestedDate && requestedTab !== "remittance") return requestedDate;
    return undefined;
  });
  const [monthlyDate, setMonthlyDate] = useState(() => undefined);
  const [monthlyMonth, setMonthlyMonth] = useState(() => undefined);
  const [monthlyYear, setMonthlyYear] = useState(() => undefined);
  const [yearlyDate, setYearlyDate] = useState(() => undefined);
  const [remittanceDailyDate, setRemittanceDailyDate] = useState(() => {
    if (requestedDate && requestedTab === "remittance") return requestedDate;
    return undefined;
  });
  const [remittanceMonthlyMonth, setRemittanceMonthlyMonth] = useState(() => undefined);
  const [remittanceMonthlyYear, setRemittanceMonthlyYear] = useState(() => undefined);
  const [remittanceYearlyDate, setRemittanceYearlyDate] = useState(() => undefined);
  const [dockingFilterType, setDockingFilterType] = useState("daily");
  const [banyeraFilterType, setBanyeraFilterType] = useState("daily");
  const [remittanceFilterType, setRemittanceFilterType] = useState("daily");
  const [billingFilterType, setBillingFilterType] = useState("daily");
  const [vehicleDailyFilterType, setVehicleDailyFilterType] = useState("daily");
  const [revenueFilterType, setRevenueFilterType] = useState(
    ["daily", "monthly", "yearly"].includes(requestedTab) ? requestedTab : "daily",
  );

  useEffect(() => {
    if (isAllowedReportKey(requestedReportTab)) {
      setActiveReport(requestedReportTab);
      setActiveItem(requestedReportTab === "remittance" ? "Remittance" : "Reports");
      if (["daily", "monthly", "yearly"].includes(requestedTab)) {
        setRevenueFilterType(requestedTab);
      }
      if (requestedDate && requestedTab === "remittance") {
        setRemittanceDailyDate(requestedDate);
      }
      return;
    }

    setActiveReport(defaultReportTab);
    setActiveItem(defaultReportTab === "remittance" ? "Remittance" : "Reports");
  }, [defaultReportTab, requestedDate, requestedReportTab, requestedTab]);

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) {
      setContentMargin(sidebarCollapsed ? 72 : 256);
    } else if (window.innerWidth < 1024) {
      setContentMargin(0);
    }
  }, [sidebarCollapsed, sidebarOpen]);

  useEffect(() => {
    setMonthlyDate((current) => (current ? setMonthYear(current, fiscalYear) : current));
    setYearlyDate((current) => (current ? fiscalYear : current));
    setRemittanceMonthlyYear((current) => (current ? fiscalYear : current));
    setRemittanceYearlyDate((current) => (current ? fiscalYear : current));
  }, [fiscalYear]);

  const shellStyle = useMemo(
    () => ({
      marginLeft:
        sidebarOpen && window.innerWidth >= 1024
          ? `${contentMargin}px`
          : "0px",
      transition: "margin-left 0.3s ease",
    }),
    [contentMargin, sidebarOpen],
  );

  const isRevenueReport = activeReport === "revenue";
  const isRemittanceReport = activeReport === "remittance";
  const isRegisteredBoatsReport = activeReport === "registered-boats";
  const isOwnerInfoReport = activeReport === "owner-info";
  const isDockingReport = activeReport === "docking";
  const isBanyeraReport = activeReport === "banyera";
  const isBfarReport = activeReport === "fisheries-bfar";
  const isDailyVehicleTicketReport = activeReport === "daily-vehicle-ticket";
  const isVehicleTicketReport = activeReport === "vehicle-ticket";
  const isBillingReport = activeReport === "billing";
  const isFeesReport = activeReport === "fees";
  const dailyDateParts = useMemo(() => getDateParts(dailyDate), [dailyDate]);
  const selectedMonthLabel = useMemo(
    () =>
      MONTH_OPTIONS.find((option) => option.value === dailyDateParts.month)?.label ||
      "January",
    [dailyDateParts.month],
  );
  const monthlyDateComputed = monthlyYear && monthlyMonth ? `${monthlyYear}-${monthlyMonth}` : undefined;
  const monthlyDateParts = useMemo(() => ({
    year: String(monthlyDateComputed).slice(0, 4),
    month: String(monthlyDateComputed).slice(5, 7),
  }), [monthlyDateComputed]);
  const selectedMonthlyLabel = useMemo(
    () =>
      MONTH_OPTIONS.find((option) => option.value === monthlyDateParts.month)?.label ||
      "January",
    [monthlyDateParts.month],
  );

  const generatedDailyDateParts = useMemo(() => getDateParts(generatedFilters.date), [generatedFilters.date]);
  const generatedMonthlyDateComputed = generatedFilters.month && generatedFilters.year ? `${generatedFilters.year}-${generatedFilters.month}` : undefined;
  const generatedMonthlyDateParts = useMemo(() => ({
    year: String(generatedMonthlyDateComputed).slice(0, 4),
    month: String(generatedMonthlyDateComputed).slice(5, 7),
  }), [generatedMonthlyDateComputed]);
  const generatedSelectedMonthLabel = useMemo(() => {
    if (generatedFilters.filterType === "daily" && generatedDailyDateParts.month) {
      return (
        MONTH_OPTIONS.find((option) => option.value === generatedDailyDateParts.month)?.label ||
        "January"
      );
    }

    return (
      MONTH_OPTIONS.find((option) => option.value === generatedMonthlyDateParts.month)?.label ||
      "January"
    );
  }, [generatedFilters.filterType, generatedDailyDateParts.month, generatedMonthlyDateParts.month]);
  const generatedYearlyDate = generatedFilters.year;

  const shouldFetchDailyRevenue = reportGenerated && generatedFilters.filterType === "daily" && Boolean(generatedFilters.date);
  const shouldFetchMonthlyRevenue = reportGenerated && generatedFilters.filterType === "monthly" && Boolean(generatedFilters.month) && Boolean(generatedFilters.year);
  const shouldFetchYearlyRevenue = reportGenerated && generatedFilters.filterType === "yearly" && Boolean(generatedFilters.year);
  
  // Revenue report query
  const shouldFetchRevenue = shouldFetchDailyRevenue || shouldFetchMonthlyRevenue || shouldFetchYearlyRevenue;
  const revenueParams = useMemo(() => ({
    filterType: generatedFilters.filterType,
    date: generatedFilters.date,
    month: generatedFilters.month,
    year: generatedFilters.year,
  }), [generatedFilters.filterType, generatedFilters.date, generatedFilters.month, generatedFilters.year]);
  
  const revenueReportQuery = useRevenueReportDataQuery(
    revenueParams,
    { enabled: isRevenueReport && shouldFetchRevenue }
  );
  const revenueReportData = revenueReportQuery.data;

  // Consolidated: use revenue query only (has all three endpoints)
  const dailyReportData = undefined;
  const monthlyReportData = undefined;
  const yearlyReportData = undefined;
  const shouldFetchRemittance = reportGenerated && isRemittanceReport && (
    (generatedFilters.filterType === "daily" && Boolean(generatedFilters.date)) ||
    (generatedFilters.filterType === "monthly" && Boolean(generatedFilters.month) && Boolean(generatedFilters.year)) ||
    (generatedFilters.filterType === "yearly" && Boolean(generatedFilters.year))
  );
  const remittanceParams = useMemo(() => ({
    filterType: generatedFilters.filterType || remittanceFilterType,
    selectedDate: generatedFilters.date,
    selectedMonth: generatedFilters.month && generatedFilters.year ? `${generatedFilters.year}-${generatedFilters.month}` : undefined,
    selectedYear: generatedFilters.year,
  }), [generatedFilters.filterType, generatedFilters.date, generatedFilters.month, generatedFilters.year, remittanceFilterType]);
  
  const remittanceReportQuery = useRemittanceReportDataQuery(
    remittanceParams,
    { enabled: shouldFetchRemittance }
  );
  const remittanceReportData = remittanceReportQuery.data;
  const registeredBoatsReportQuery = useRegisteredBoatsReportDataQuery({
    enabled: reportGenerated && isRegisteredBoatsReport,
  });
  const registeredBoatsReportData = registeredBoatsReportQuery.data;
  const ownerInfoReportQuery = useOwnerInfoReportDataQuery({
    enabled: reportGenerated && isOwnerInfoReport,
  });
  const ownerInfoReportData = ownerInfoReportQuery.data;
  const shouldFetchDocking = reportGenerated && isDockingReport && (
    (generatedFilters.filterType === "daily" && Boolean(generatedFilters.date)) ||
    (generatedFilters.filterType === "monthly" && Boolean(generatedFilters.month) && Boolean(generatedFilters.year)) ||
    (generatedFilters.filterType === "yearly" && Boolean(generatedFilters.year))
  );
  // Memoize docking query parameters
  const dockingParams = useMemo(() => ({
    filterType: generatedFilters.filterType || dockingFilterType,
    selectedDate: generatedFilters.date,
    selectedMonth: generatedFilters.month && generatedFilters.year ? `${generatedFilters.year}-${generatedFilters.month}` : undefined,
    selectedYear: generatedFilters.year,
  }), [generatedFilters.filterType, generatedFilters.date, generatedFilters.month, generatedFilters.year, dockingFilterType]);
  
  const dockingReportQuery = useDockingReportDataQuery(
    dockingParams,
    { enabled: shouldFetchDocking },
  );
  const dockingReportData = dockingReportQuery.data;
  const shouldFetchBanyera = reportGenerated && isBanyeraReport && (
    (generatedFilters.filterType === "daily" && Boolean(generatedFilters.date)) ||
    (generatedFilters.filterType === "monthly" && Boolean(generatedFilters.month) && Boolean(generatedFilters.year)) ||
    (generatedFilters.filterType === "yearly" && Boolean(generatedFilters.year))
  );
  const banyeraParams = useMemo(() => ({
    filterType: generatedFilters.filterType || banyeraFilterType,
    selectedDate: generatedFilters.date,
    selectedMonth: generatedFilters.month && generatedFilters.year ? `${generatedFilters.year}-${generatedFilters.month}` : undefined,
    selectedYear: generatedFilters.year,
  }), [generatedFilters.filterType, generatedFilters.date, generatedFilters.month, generatedFilters.year, banyeraFilterType]);
  
  const banyeraReportQuery = useBanyeraReportDataQuery(
    banyeraParams,
    { enabled: shouldFetchBanyera }
  );
  const banyeraData = banyeraReportQuery.data;

  const shouldFetchBfar = reportGenerated && isBfarReport && (
    (generatedFilters.filterType === "daily" && Boolean(generatedFilters.date)) ||
    (generatedFilters.filterType === "monthly" && Boolean(generatedFilters.month) && Boolean(generatedFilters.year)) ||
    (generatedFilters.filterType === "yearly" && Boolean(generatedFilters.year))
  );
  const bfarParams = useMemo(() => ({
    filterType: generatedFilters.filterType || "monthly",
    selectedDate: generatedFilters.date,
    selectedMonth: generatedFilters.month && generatedFilters.year ? `${generatedFilters.year}-${generatedFilters.month}` : undefined,
    selectedYear: generatedFilters.year,
  }), [generatedFilters.filterType, generatedFilters.date, generatedFilters.month, generatedFilters.year]);
  
  const bfarReportQuery = useBfarReportDataQuery(
    bfarParams,
    { enabled: shouldFetchBfar }
  );
  const bfarData = bfarReportQuery.data;

  const shouldFetchVehicleTicketReport = reportGenerated && (isDailyVehicleTicketReport || isVehicleTicketReport) && (
    (generatedFilters.filterType === "daily" && Boolean(generatedFilters.date)) ||
    (generatedFilters.filterType === "monthly" && Boolean(generatedFilters.month) && Boolean(generatedFilters.year)) ||
    (generatedFilters.filterType === "yearly" && Boolean(generatedFilters.year))
  );
  // Memoize query parameters to prevent unnecessary re-renders
  const vehicleTicketParams = useMemo(() => ({
    filterType: generatedFilters.filterType || (isVehicleTicketReport ? "yearly" : vehicleDailyFilterType),
    selectedDate: generatedFilters.date,
    selectedMonth: generatedFilters.month && generatedFilters.year ? `${generatedFilters.year}-${generatedFilters.month}` : undefined,
    selectedYear: generatedFilters.year,
    ticketType: isVehicleTicketReport ? "annual" : "daily",
  }), [generatedFilters.filterType, generatedFilters.date, generatedFilters.month, generatedFilters.year, isVehicleTicketReport, vehicleDailyFilterType]);
  
  const vehicleTicketReportQuery = useVehicleTicketReportDataQuery(
    vehicleTicketParams,
    { enabled: shouldFetchVehicleTicketReport },
  );
  const vehicleTicketReportData = vehicleTicketReportQuery.data;
  
  const shouldFetchFees = reportGenerated && isFeesReport && isHead;
  const feeParams = useMemo(() => ({
    year: generatedFilters.year,
  }), [generatedFilters.year]);
  
  const feeReportQuery = useFeeReportDataQuery(
    feeParams,
    { enabled: shouldFetchFees },
  );
  const feeReportData = feeReportQuery.data;

  const shouldFetchBilling = reportGenerated && isBillingReport && (
    (generatedFilters.filterType === "daily" && Boolean(generatedFilters.date)) ||
    (generatedFilters.filterType === "monthly" && Boolean(generatedFilters.month) && Boolean(generatedFilters.year)) ||
    (generatedFilters.filterType === "yearly" && Boolean(generatedFilters.year))
  );
  const billingParams = useMemo(() => ({
    filterType: generatedFilters.filterType || billingFilterType,
    selectedDate: generatedFilters.date,
    selectedMonth: generatedFilters.month && generatedFilters.year ? `${generatedFilters.year}-${generatedFilters.month}` : undefined,
    selectedYear: generatedFilters.year,
  }), [generatedFilters.filterType, generatedFilters.date, generatedFilters.month, generatedFilters.year, billingFilterType]);

  const billingReportQuery = useBillingReportDataQuery(
    billingParams,
    { enabled: shouldFetchBilling },
  );
  const billingReportData = billingReportQuery.data;

  const reportViewerUrl = (isRevenueReport || isRemittanceReport || isRegisteredBoatsReport || isOwnerInfoReport || isDockingReport || isBanyeraReport || isBfarReport || isDailyVehicleTicketReport || isVehicleTicketReport || isBillingReport || isFeesReport) && reportPdfUrl
    ? `${reportPdfUrl}#view=FitH`
    : "about:blank";

  const restoreCachedReportPreview = (reportKey) => {
    const cachedPreview = reportPreviewCacheRef.current[reportKey];

    if (!cachedPreview?.url) {
      setReportGenerated(false);
      setReportPdfUrl("");
      setReportPdfFileName("");
      setReportPdfLoading(false);
      setGeneratedFilters({});
      setReportBuildRequest(null);
      return;
    }

    setReportGenerated(true);
    setReportPdfUrl(cachedPreview.url);
    setReportPdfFileName(cachedPreview.fileName || getPdfFileName(reportKey, cachedPreview.generatedFilters ?? {}));
    setReportPdfLoading(false);
    setGeneratedFilters(cachedPreview.generatedFilters ?? {});
    setReportBuildRequest(null);
  };

  const clearReportPreview = () => {
    setReportGenerated(false);
    setReportPdfUrl("");
    setReportPdfFileName("");
    setReportPdfLoading(false);
    setGeneratedFilters({});
    setReportBuildRequest(null);
  };

  const resetReportFilters = () => {
    setDailyDate(undefined);
    setMonthlyDate(undefined);
    setMonthlyMonth(undefined);
    setMonthlyYear(undefined);
    setYearlyDate(undefined);
    setRemittanceDailyDate(undefined);
    setRemittanceMonthlyMonth(undefined);
    setRemittanceMonthlyYear(undefined);
    setRemittanceYearlyDate(undefined);
    setRevenueFilterType("daily");
    setDockingFilterType("daily");
    setBanyeraFilterType("daily");
    setRemittanceFilterType("daily");
    setBillingFilterType("daily");
    setVehicleDailyFilterType("daily");
  };

  const handleReportChange = (nextReport) => {
    if (!isAllowedReportKey(nextReport)) return;
    resetReportFilters();
    setActiveReport(nextReport);
    setActiveItem(nextReport === "remittance" ? "Remittance" : "Reports");
    restoreCachedReportPreview(nextReport);
  };

  const handleDailyDateChange = (_, currentDateString) => {
    setDailyDate(String(currentDateString || "").slice(0, 10));
  };

  const handleRemittanceDailyDateChange = (_, currentDateString) => {
    setRemittanceDailyDate(String(currentDateString || "").slice(0, 10));
  };

  const handleMonthlyDateChange = (value) => {
    if (!value) return;
    setMonthlyMonth(value);
    if (monthlyYear) {
      setMonthlyDate(`${monthlyYear}-${value}`);
    }
  };

  const handleRemittanceMonthlyDateChange = (value) => {
    if (!value) return;
    setRemittanceMonthlyMonth(value);
  };

  const handleYearlyDateChange = (value) => {
    if (!value) return;
    setYearlyDate(value);
    setMonthlyYear(value);
    if ((isRevenueReport && revenueFilterType === "monthly") || isBfarReport) {
      if (monthlyMonth) {
        setMonthlyDate(`${value}-${monthlyMonth}`);
      }
    }
  };

  const handleRemittanceYearlyDateChange = (value) => {
    if (!value) return;
    setRemittanceYearlyDate(value);
    setRemittanceMonthlyYear(value);
  };

  const handleRevenueFilterTypeChange = (value) => {
    if (!value) return;
    setRevenueFilterType(value);
  };

  const handleDockingFilterTypeChange = (value) => {
    if (!value) return;
    setDockingFilterType(value);
  };

  const handleBanyeraFilterTypeChange = (value) => {
    if (!value) return;
    setBanyeraFilterType(value);
  };

  const handleRemittanceFilterTypeChange = (value) => {
    if (!value) return;
    setRemittanceFilterType(value);
  };

  const handleBillingFilterTypeChange = (value) => {
    if (!value) return;
    setBillingFilterType(value);
  };

  const handleVehicleDailyFilterTypeChange = (value) => {
    if (!value) return;
    setVehicleDailyFilterType(value);
  };

  const buildGeneratedFilters = () => {
    if (isRevenueReport) {
      return {
        filterType: revenueFilterType,
        date: revenueFilterType === "daily" ? dailyDate : undefined,
        month: revenueFilterType === "monthly" ? monthlyMonth : undefined,
        year: revenueFilterType === "monthly" ? monthlyYear : revenueFilterType === "yearly" ? yearlyDate : undefined,
      };
    }

    if (isRemittanceReport) {
      return {
        filterType: remittanceFilterType,
        date: remittanceFilterType === "daily" ? remittanceDailyDate : undefined,
        month: remittanceFilterType === "monthly" ? remittanceMonthlyMonth : undefined,
        year: remittanceFilterType === "monthly" ? remittanceMonthlyYear : remittanceFilterType === "yearly" ? remittanceYearlyDate : undefined,
      };
    }

    if (isBillingReport) {
      return {
        filterType: billingFilterType,
        date: billingFilterType === "daily" ? dailyDate : undefined,
        month: billingFilterType === "monthly" ? monthlyMonth : undefined,
        year: billingFilterType === "monthly" ? monthlyYear : billingFilterType === "yearly" ? yearlyDate : undefined,
      };
    }

    if (isDockingReport) {
      return {
        filterType: dockingFilterType,
        date: dockingFilterType === "daily" ? dailyDate : undefined,
        month: dockingFilterType === "monthly" ? monthlyMonth : undefined,
        year: dockingFilterType === "monthly" ? monthlyYear : dockingFilterType === "yearly" ? yearlyDate : undefined,
      };
    }

    if (isBanyeraReport || isBfarReport) {
      return {
        filterType: banyeraFilterType,
        date: banyeraFilterType === "daily" ? dailyDate : undefined,
        month: banyeraFilterType === "monthly" ? monthlyMonth : undefined,
        year: banyeraFilterType === "monthly" ? monthlyYear : banyeraFilterType === "yearly" ? yearlyDate : undefined,
      };
    }

    if (isDailyVehicleTicketReport) {
      return {
        filterType: vehicleDailyFilterType,
        date: vehicleDailyFilterType === "daily" ? dailyDate : undefined,
        month: vehicleDailyFilterType === "monthly" ? monthlyMonth : undefined,
        year: vehicleDailyFilterType === "monthly" ? monthlyYear : vehicleDailyFilterType === "yearly" ? yearlyDate : undefined,
      };
    }

    if (isVehicleTicketReport) {
      return {
        filterType: "yearly",
        year: yearlyDate,
      };
    }

    if (isFeesReport) {
      return {
        filterType: "yearly",
        year: yearlyDate,
      };
    }

    return {};
  };

  const handleGenerateReport = () => {
    const missing = (msg) => showBottomToast("error", "Missing Filter", msg);

    if (isGenerateActionDisabled) return;

    if (isRevenueReport) {
      if (revenueFilterType === "daily" && !dailyDate) { missing("Please select a day."); return; }
      if (revenueFilterType === "monthly" && !(monthlyMonth && monthlyYear)) { missing("Please select month and year."); return; }
      if (revenueFilterType === "yearly" && !yearlyDate) { missing("Please select a year."); return; }
    } else if (isRemittanceReport) {
      if (remittanceFilterType === "daily" && !remittanceDailyDate) { missing("Please select a day."); return; }
      if (remittanceFilterType === "monthly" && !(remittanceMonthlyMonth && remittanceMonthlyYear)) { missing("Please select month and year."); return; }
      if (remittanceFilterType === "yearly" && !remittanceYearlyDate) { missing("Please select a year."); return; }
    } else if (isBillingReport) {
      if (billingFilterType === "daily" && !dailyDate) { missing("Please select a day."); return; }
      if (billingFilterType === "monthly" && !(monthlyMonth && monthlyYear)) { missing("Please select month and year."); return; }
      if (billingFilterType === "yearly" && !yearlyDate) { missing("Please select a year."); return; }
    } else if (isDockingReport) {
      if (dockingFilterType === "daily" && !dailyDate) { missing("Please select a day."); return; }
      if (dockingFilterType === "monthly" && !(monthlyMonth && monthlyYear)) { missing("Please select month and year."); return; }
      if (dockingFilterType === "yearly" && !yearlyDate) { missing("Please select a year."); return; }
    } else if (isBanyeraReport) {
      if (banyeraFilterType === "daily" && !dailyDate) { missing("Please select a day."); return; }
      if (banyeraFilterType === "monthly" && !(monthlyMonth && monthlyYear)) { missing("Please select month and year."); return; }
      if (banyeraFilterType === "yearly" && !yearlyDate) { missing("Please select a year."); return; }
    } else if (isDailyVehicleTicketReport) {
      if (vehicleDailyFilterType === "daily" && !dailyDate) { missing("Please select a day."); return; }
      if (vehicleDailyFilterType === "monthly" && !(monthlyMonth && monthlyYear)) { missing("Please select month and year."); return; }
      if (vehicleDailyFilterType === "yearly" && !yearlyDate) { missing("Please select a year."); return; }
    } else if (isVehicleTicketReport) {
      if (!yearlyDate) { missing("Please select a year."); return; }
    } else if (isFeesReport) {
      if (!yearlyDate) { missing("Please select a year."); return; }
    }

    const nextFilters = buildGeneratedFilters();
    setIsGenerateActionDisabled(true);
    setGeneratedFilters(nextFilters);
    setReportGenerated(true);
    const nextBuildKey = reportBuildKey + 1;
    setReportBuildKey(nextBuildKey);
    setReportBuildRequest({ key: nextBuildKey, report: activeReport });
    setReportPdfUrl("");
    setReportPdfFileName("");
    setReportPdfLoading(true);
  };

  const handleExportExcel = async () => {
    if (isExportActionDisabled) return;

    if (!reportGenerated || !isQueryDataReady) {
      showBottomToast("error", "Generate the report and wait for the data to finish loading before exporting.");
      return;
    }

    setIsExportActionDisabled(true);

    const exportContext = {
      activeReport,
      revenueReportData,
      remittanceReportData,
      registeredBoatsReportData,
      ownerInfoReportData,
      dockingReportData,
      banyeraData,
      bfarData,
      vehicleTicketReportData,
      billingReportData,
      feeReportData,
      generatedFilters,
      revenueFilterType,
      remittanceFilterType,
      dockingFilterType,
      banyeraFilterType,
      billingFilterType,
      vehicleDailyFilterType,
      dailyDate,
      monthlyMonth,
      monthlyYear,
      yearlyDate,
      remittanceDailyDate,
      remittanceMonthlyMonth,
      remittanceMonthlyYear,
      remittanceYearlyDate,
    };

    try {
      const exportSpec = await getExportBlobAndName(exportContext);
        if (!exportSpec) {
          // Provide more diagnostic info to help the user understand why export failed
          const rawRows = getExportData(exportContext) || [];
          const columns = getExportColumnsForReport({
            activeReport: exportContext.activeReport,
            generatedFilters: exportContext.generatedFilters,
            revenueFilterType: exportContext.revenueFilterType,
            remittanceFilterType: exportContext.remittanceFilterType,
            dockingFilterType: exportContext.dockingFilterType,
            banyeraFilterType: exportContext.banyeraFilterType,
            billingFilterType: exportContext.billingFilterType,
            vehicleDailyFilterType: exportContext.vehicleDailyFilterType,
          }) || [];
          const exportRows = getExportRowsForColumns(rawRows, columns, exportContext.activeReport) || [];
          const rawCount = Array.isArray(rawRows) ? rawRows.length : 0;
          const exportCount = Array.isArray(exportRows) ? exportRows.length : 0;
          showBottomToast(
            "error",
            rawCount === 0
              ? "There is no report data available to export."
              : exportCount === 0
              ? `Report has ${rawCount} rows but no exportable columns produced (0 export rows).`
              : "There is no report data available to export.",
          );
          console.debug("Export debug", { rawCount, exportCount, rawRows, columns, exportRows });
          return;
        }

      getExportHref(exportSpec.blob, exportSpec.fileName);
    } finally {
      setIsExportActionDisabled(false);
    }
  };
  const isQueryDataReady = reportGenerated && (
    isRevenueReport
      ? revenueReportQuery.isSuccess && !revenueReportQuery.isFetching
      : isRemittanceReport
        ? remittanceReportQuery.isSuccess && !remittanceReportQuery.isFetching
        : isRegisteredBoatsReport
          ? registeredBoatsReportQuery.isSuccess && !registeredBoatsReportQuery.isFetching
          : isOwnerInfoReport
            ? ownerInfoReportQuery.isSuccess && !ownerInfoReportQuery.isFetching
            : isDockingReport
              ? dockingReportQuery.isSuccess && !dockingReportQuery.isFetching
              : isBanyeraReport
                ? banyeraReportQuery.isSuccess && !banyeraReportQuery.isFetching
                : isBfarReport
                  ? bfarReportQuery.isSuccess && !bfarReportQuery.isFetching
                  : (isDailyVehicleTicketReport || isVehicleTicketReport)
                      ? vehicleTicketReportQuery.isSuccess && !vehicleTicketReportQuery.isFetching
                      : isBillingReport
                        ? billingReportQuery.isSuccess && !billingReportQuery.isFetching
                        : isFeesReport
                          ? feeReportQuery.isSuccess && !feeReportQuery.isFetching
                          : true
  );

  useEffect(() => {
    if (!reportPdfLoading) {
      setIsGenerateActionDisabled(false);
    }
  }, [reportPdfLoading]);

  useEffect(() => {
    return () => {
      Object.values(reportPreviewCacheRef.current).forEach((cachedPreview) => {
        if (cachedPreview?.url?.startsWith("blob:")) URL.revokeObjectURL(cachedPreview.url);
      });
      reportPreviewCacheRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!reportGenerated || !isOwnerInfoReport || !ownerInfoReportData || !isQueryDataReady) {
      ownerInfoReportDataRef.current = ownerInfoReportData || null;
      return;
    }

    if (!ownerInfoReportDataRef.current) {
      ownerInfoReportDataRef.current = ownerInfoReportData;
      return;
    }

    if (ownerInfoReportDataRef.current === ownerInfoReportData) return;

    ownerInfoReportDataRef.current = ownerInfoReportData;
    if (reportBuildRequest) return;

    setReportBuildKey((currentKey) => {
      const nextBuildKey = currentKey + 1;
      setReportBuildRequest({ key: nextBuildKey, report: "owner-info" });
      return nextBuildKey;
    });
  }, [isOwnerInfoReport, isQueryDataReady, ownerInfoReportData, reportBuildRequest, reportGenerated]);

  useEffect(() => {
    if (!reportGenerated || !isDockingReport || !dockingReportData || !isQueryDataReady) {
      dockingReportDataRef.current = dockingReportData || null;
      return;
    }

    if (!dockingReportDataRef.current) {
      dockingReportDataRef.current = dockingReportData;
      return;
    }

    if (dockingReportDataRef.current === dockingReportData) return;

    dockingReportDataRef.current = dockingReportData;
    if (reportBuildRequest) return;

    setReportBuildKey((currentKey) => {
      const nextBuildKey = currentKey + 1;
      setReportBuildRequest({ key: nextBuildKey, report: "docking" });
      return nextBuildKey;
    });
  }, [dockingReportData, isDockingReport, isQueryDataReady, reportBuildRequest, reportGenerated]);

  useEffect(() => {
    if (!reportGenerated || !isBanyeraReport || !banyeraData || !isQueryDataReady) {
      banyeraReportDataRef.current = banyeraData || null;
      return;
    }

    if (!banyeraReportDataRef.current) {
      banyeraReportDataRef.current = banyeraData;
      return;
    }

    if (banyeraReportDataRef.current === banyeraData) return;

    banyeraReportDataRef.current = banyeraData;
    if (reportBuildRequest) return;

    setReportBuildKey((currentKey) => {
      const nextBuildKey = currentKey + 1;
      setReportBuildRequest({ key: nextBuildKey, report: "banyera" });
      return nextBuildKey;
    });
  }, [banyeraData, isBanyeraReport, isQueryDataReady, reportBuildRequest, reportGenerated]);

  useEffect(() => {
    if (!reportGenerated || !isBfarReport || !bfarData || !isQueryDataReady) {
      bfarReportDataRef.current = bfarData || null;
      return;
    }

    if (!bfarReportDataRef.current) {
      bfarReportDataRef.current = bfarData;
      return;
    }

    if (bfarReportDataRef.current === bfarData) return;

    bfarReportDataRef.current = bfarData;
    if (reportBuildRequest) return;

    setReportBuildKey((currentKey) => {
      const nextBuildKey = currentKey + 1;
      setReportBuildRequest({ key: nextBuildKey, report: "fisheries-bfar" });
      return nextBuildKey;
    });
  }, [bfarData, isBfarReport, isQueryDataReady, reportBuildRequest, reportGenerated]);

  useEffect(() => {
    const isVehicleReport = isDailyVehicleTicketReport || isVehicleTicketReport;
    if (!reportGenerated || !isVehicleReport || !vehicleTicketReportData || !isQueryDataReady) {
      vehicleTicketReportDataRef.current = vehicleTicketReportData || null;
      return;
    }

    if (!vehicleTicketReportDataRef.current) {
      vehicleTicketReportDataRef.current = vehicleTicketReportData;
      return;
    }

    if (vehicleTicketReportDataRef.current === vehicleTicketReportData) return;

    vehicleTicketReportDataRef.current = vehicleTicketReportData;
    if (reportBuildRequest) return;

    setReportBuildKey((currentKey) => {
      const nextBuildKey = currentKey + 1;
      setReportBuildRequest({ key: nextBuildKey, report: activeReport });
      return nextBuildKey;
    });
  }, [activeReport, isDailyVehicleTicketReport, isQueryDataReady, isVehicleTicketReport, reportBuildRequest, reportGenerated, vehicleTicketReportData]);

  useEffect(() => {
    if (!reportGenerated || !isFeesReport || !feeReportData || !isQueryDataReady) {
      feeReportDataRef.current = feeReportData || null;
      return;
    }

    if (!feeReportDataRef.current) {
      feeReportDataRef.current = feeReportData;
      return;
    }

    if (feeReportDataRef.current === feeReportData) return;

    feeReportDataRef.current = feeReportData;
    if (reportBuildRequest) return;

    setReportBuildKey((currentKey) => {
      const nextBuildKey = currentKey + 1;
      setReportBuildRequest({ key: nextBuildKey, report: "fees" });
      return nextBuildKey;
    });
  }, [feeReportData, isFeesReport, isQueryDataReady, reportBuildRequest, reportGenerated]);

  useEffect(() => {
    // Only build when user explicitly requested generation and data is ready
    if (
      !reportGenerated ||
      !isQueryDataReady ||
      !reportBuildRequest ||
      reportBuildRequest.key !== reportBuildKey ||
      reportBuildRequest.report !== activeReport
    ) {
      return;
    }

    const isActive = { current: true };
    let nextUrl = "";

    const buildPdf = async () => {
      if (!isActive.current) return;

      if (!isRevenueReport && !isRemittanceReport && !isRegisteredBoatsReport && !isOwnerInfoReport && !isDockingReport && !isBanyeraReport && !isBfarReport && !isDailyVehicleTicketReport && !isVehicleTicketReport && !isBillingReport && !isFeesReport) {
        setReportPdfUrl("");
        setReportPdfLoading(false);
        return;
      }

      setReportPdfLoading(true);
      try {
        const nextFileName = getPdfFileName(activeReport, generatedFilters);
        const pdfBytes = isRevenueReport
          ? await buildRevenuePdf({
              filterType: generatedFilters.filterType,
              month: generatedSelectedMonthLabel,
              day: generatedDailyDateParts.day,
              year: generatedDailyDateParts.year,
              monthlyMonth: generatedMonthlyDateParts.month,
              monthlyYear: generatedMonthlyDateParts.year,
              yearlyDate: generatedYearlyDate,
              preparedBy,
              reportData: revenueReportData,
            })
          : isRegisteredBoatsReport
            ? await buildRegisteredBoatsPdf({ preparedBy, reportData: registeredBoatsReportData })
            : isOwnerInfoReport
              ? await buildOwnerInfoPdf({ preparedBy, reportData: ownerInfoReportData })
              : isDockingReport
                ? await buildDockingPdf({ filterType: generatedFilters.filterType, month: generatedSelectedMonthLabel, day: generatedDailyDateParts.day, year: generatedDailyDateParts.year, monthlyMonth: generatedMonthlyDateParts.month, monthlyYear: generatedMonthlyDateParts.year, yearlyDate: generatedYearlyDate, preparedBy, reportData: dockingReportData })
                : isBanyeraReport
                  ? await buildBanyeraPdf({ filterType: generatedFilters.filterType, month: generatedSelectedMonthLabel, day: generatedDailyDateParts.day, year: generatedDailyDateParts.year, monthlyMonth: generatedMonthlyDateParts.month, monthlyYear: generatedMonthlyDateParts.year, yearlyDate: generatedYearlyDate, preparedBy, reportData: banyeraData })
                  : isBfarReport
                    ? await buildBfarPdf({ filterType: generatedFilters.filterType, month: generatedSelectedMonthLabel, day: generatedDailyDateParts.day, year: generatedDailyDateParts.year, monthlyMonth: generatedMonthlyDateParts.month, monthlyYear: generatedMonthlyDateParts.year, yearlyDate: generatedYearlyDate, preparedBy, reportData: bfarData })
                    : isDailyVehicleTicketReport
                      ? await buildVehicleDailyPdf({ filterType: generatedFilters.filterType, month: generatedSelectedMonthLabel, day: generatedDailyDateParts.day, year: generatedDailyDateParts.year, monthlyMonth: generatedMonthlyDateParts.month, monthlyYear: generatedMonthlyDateParts.year, yearlyDate: generatedYearlyDate, preparedBy, reportData: vehicleTicketReportData })
                      : isVehicleTicketReport
                        ? await buildVehicleAnnualPdf({ year: generatedYearlyDate, yearlyDate: generatedYearlyDate, preparedBy, reportData: vehicleTicketReportData })
                        : isBillingReport
                          ? await buildBillingReportPdf({ filterType: generatedFilters.filterType, month: generatedSelectedMonthLabel, day: generatedDailyDateParts.day, year: generatedDailyDateParts.year, monthlyMonth: generatedMonthlyDateParts.month, monthlyYear: generatedMonthlyDateParts.year, yearlyDate: generatedYearlyDate, preparedBy, reportData: billingReportData })
                        : isFeesReport
                          ? await buildFeePdf({ year: generatedYearlyDate, yearlyDate: generatedYearlyDate, preparedBy, reportData: feeReportData })
                          : isRemittanceReport
                            ? await buildRemittanceReportPdf({ filterType: generatedFilters.filterType, month: generatedSelectedMonthLabel, day: generatedDailyDateParts.day, year: generatedDailyDateParts.year, monthlyMonth: generatedMonthlyDateParts.month, monthlyYear: generatedYearlyDate, yearlyDate: generatedYearlyDate, preparedBy, reportData: remittanceReportData, includeCollectionSources: false })
                            : null;

        if (!pdfBytes) return;
        nextUrl = createBlobPdfPreviewUrl(pdfBytes, nextFileName);
        if (!isActive.current) {
          if (nextUrl.startsWith("blob:")) URL.revokeObjectURL(nextUrl);
          return;
        }

        const previousUrl = reportPreviewCacheRef.current[activeReport]?.url;
        if (previousUrl && previousUrl !== nextUrl) {
          if (previousUrl.startsWith("blob:")) URL.revokeObjectURL(previousUrl);
        }

        reportPreviewCacheRef.current[activeReport] = {
          url: nextUrl,
          fileName: nextFileName,
          generatedFilters: { ...generatedFilters },
        };
        setReportPdfUrl(nextUrl);
        setReportPdfFileName(nextFileName);
      } catch (error) {
        if (isActive.current) setReportPdfUrl("");
      } finally {
        if (isActive.current) {
          setReportBuildRequest(null);
          setReportPdfLoading(false);
        }
      }
    };

    buildPdf();

    return () => {
      isActive.current = false;
    };
  }, [
    reportGenerated,
    reportBuildKey,
    reportBuildRequest,
    activeReport,
    isQueryDataReady,
    isRevenueReport,
    isRemittanceReport,
    isRegisteredBoatsReport,
    isOwnerInfoReport,
    isDockingReport,
    isBanyeraReport,
    isBfarReport,
    isDailyVehicleTicketReport,
    isVehicleTicketReport,
    isBillingReport,
    isFeesReport,
    revenueReportData,
    remittanceReportData,
    registeredBoatsReportData,
    ownerInfoReportData,
    dockingReportData,
    banyeraData,
    bfarData,
    vehicleTicketReportData,
    billingReportData,
    feeReportData,
    preparedBy,
    generatedFilters.filterType,
    generatedFilters.date,
    generatedFilters.month,
    generatedFilters.year,
    generatedSelectedMonthLabel,
    generatedDailyDateParts,
    generatedMonthlyDateParts,
    generatedYearlyDate,
  ]);

  return (
    <ConfigProvider theme={antTheme}>
      <style>{`
        .docking-ant-select .ant-select-selector {
          border-radius: 12px !important;
          border: 1px solid #e2e8f0 !important;
          box-shadow: none !important;
          background: white !important;
          font-family: ${FONT} !important;
          font-size: 13px !important;
          font-weight: 500 !important;
        }

        .docking-ant-select.ant-select-focused .ant-select-selector,
        .docking-ant-select.ant-select-open .ant-select-selector {
          border-color: #4096ff !important;
          box-shadow: none !important;
        }

        .docking-ant-select .ant-select-selection-item,
        .docking-ant-select .ant-select-selection-search-input,
        .docking-ant-select .ant-select-selection-placeholder {
          font-family: ${FONT} !important;
          font-size: 13px !important;
        }

        .docking-ant-select-dropdown {
          border-radius: 12px !important;
          overflow: hidden !important;
          border: 1px solid #e5e7eb !important;
          box-shadow: 0 4px 24px rgba(0,0,0,0.13) !important;
          padding: 4px !important;
          z-index: 11000 !important;
        }

        .docking-ant-select-dropdown .ant-select-item {
          border-radius: 8px !important;
          padding: 8px 12px !important;
          font-family: ${FONT} !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          color: #1a1f36 !important;
        }

        .docking-ant-select-dropdown .ant-select-item-option-selected {
          background-color: #1a1f36 !important;
          color: #ffffff !important;
          font-weight: 400 !important;
        }

        .monthly-report-month-dropdown,
        .monthly-report-month-dropdown .rc-virtual-list,
        .monthly-report-month-dropdown .rc-virtual-list-holder {
          scrollbar-width: none !important;
        }

        .monthly-report-month-dropdown::-webkit-scrollbar,
        .monthly-report-month-dropdown .rc-virtual-list::-webkit-scrollbar,
        .monthly-report-month-dropdown .rc-virtual-list-holder::-webkit-scrollbar {
          display: none !important;
        }
      `}</style>
      <div
        className="flex h-screen overflow-hidden bg-white"
        style={{ fontFamily: FONT }}
      >
        <Sidebar
          activeItem={activeItem}
          setActiveItem={setActiveItem}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onWidthChange={setContentMargin}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden" style={shellStyle}>
          <Topbar
            sidebarOpen={sidebarOpen}
            sidebarCollapsed={sidebarCollapsed}
            onMenuToggle={toggleSidebar}
          />
          <main className="flex-1 overflow-hidden bg-[#f8fafc]">
            <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
              <ReportsInnerSidebar
                activeKey={activeReport}
                onChange={handleReportChange}
                tabs={availableReportTabs}
              />

              <section
                className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white"
                style={{
                  borderLeft: "0",
                }}
              >
                <ReportsInnerTopbar
                  activeReport={activeReport}
                  title={REPORT_CONTENT[activeReport]?.title}
                  dailyDate={isRemittanceReport ? remittanceDailyDate : dailyDate}
                  onDailyDateChange={isRemittanceReport ? handleRemittanceDailyDateChange : handleDailyDateChange}
                  monthlyDate={isRemittanceReport ? remittanceMonthlyMonth ?? undefined : monthlyMonth ?? undefined}
                  onMonthlyDateChange={isRemittanceReport ? handleRemittanceMonthlyDateChange : handleMonthlyDateChange}
                  yearlyDate={isRemittanceReport
                    ? remittanceFilterType === "monthly"
                      ? remittanceMonthlyYear ?? undefined
                      : remittanceYearlyDate ?? undefined
                    : isRevenueReport && revenueFilterType === "monthly"
                      ? monthlyYear ?? undefined
                      : yearlyDate ?? undefined}
                  onYearlyDateChange={isRemittanceReport ? handleRemittanceYearlyDateChange : handleYearlyDateChange}
                  revenueFilterType={revenueFilterType}
                  onRevenueFilterTypeChange={handleRevenueFilterTypeChange}
                  dockingFilterType={dockingFilterType}
                  onDockingFilterTypeChange={handleDockingFilterTypeChange}
                  banyeraFilterType={banyeraFilterType}
                  onBanyeraFilterTypeChange={handleBanyeraFilterTypeChange}
                  remittanceFilterType={remittanceFilterType}
                  onRemittanceFilterTypeChange={handleRemittanceFilterTypeChange}
                  billingFilterType={billingFilterType}
                  onBillingFilterTypeChange={handleBillingFilterTypeChange}
                  vehicleDailyFilterType={vehicleDailyFilterType}
                  onVehicleDailyFilterTypeChange={handleVehicleDailyFilterTypeChange}
                  monthOptions={MONTH_OPTIONS}
                  yearOptions={YEAR_OPTIONS}
                  onGenerateReport={handleGenerateReport}
                  onExportExcel={handleExportExcel}
                  isGenerating={reportPdfLoading}
                  isGenerateDisabled={isGenerateActionDisabled}
                  isExportDisabled={isExportActionDisabled}
                />

                <div className="flex-1 min-h-0 overflow-hidden bg-white relative">
                  {reportPdfLoading ? (
                    <div className="flex h-full min-h-[calc(100vh-150px)] items-center justify-center bg-white text-[13px] text-slate-500">
                      Generating PDF preview...
                    </div>
                  ) : reportPdfUrl ? (
                    <iframe
                      title={`${REPORT_CONTENT[activeReport]?.title ?? "Reports"} Viewer`}
                      src={reportViewerUrl}
                      className="block h-full min-h-[calc(100vh-150px)] w-full border-0"
                      scrolling="no"
                      style={{ backgroundColor: "#f8fafc" }}
                    />
                  ) : reportGenerated ? (
                    <div className="flex h-full min-h-[calc(100vh-150px)] items-center justify-center bg-white text-[13px] text-slate-500">
                      Generating PDF preview...
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[calc(100vh-150px)] items-center justify-center text-[13px] text-slate-500">
                      Preview will appear after clicking Generate Report
                    </div>
                  )}
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default SuperReports;
