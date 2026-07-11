import React, { useEffect, useMemo, useRef, useState } from "react";
import { ConfigProvider, Drawer, Select, Tooltip } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import "typeface-montserrat";
import {
  IoAddOutline,
  IoCalendarOutline,
  IoCarOutline,
  IoCashOutline,
  IoCheckmarkCircleOutline,
  IoChevronDownOutline,
  IoCloseCircleOutline,
  IoCloseOutline,
  IoCreateOutline,
  IoDocumentTextOutline,
  IoEllipsisHorizontalOutline,
  IoListOutline,
  IoPersonOutline,
  IoAlertCircleOutline,
  IoPricetagOutline,
  IoReloadOutline,
  IoSearchOutline,
  IoTimeOutline,
  IoTrashOutline,
  IoWarningOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import FilterSelect from "../../components/FilterSelect";
import DatePicker from "../../components/DatePicker";
import Modal from "../../components/Modal";
import StatusPill from "../../components/StatusPill";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Legend from "../../components/Legend";
import DetailDrawer, { DrawerInfoCard, DrawerSection } from "../../components/Drawer";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import Spinner from "../../components/Spinner";
import NoDataFound from "../../components/NoDataFound";
import { useSidebar } from "../../store/sidebarStore";
import { showAddedToast, showBottomToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import api from "../../api/axios";
import { useVehicleTicketsDataQuery, useVehicleTicketsLookupsQuery, useVehicleTypesDataQuery } from "../../hooks/useVehicleTicketsDataQuery";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { upsertArchiveItemInDataCache } from "../../utils/archiveCache";
import { upsertVehicleTicketInCache, updateVehicleTicketStatsInCache, syncVehicleTypeUsageInCache, removeVehicleTicketFromCache } from "../../utils/ticketsCache";

const FONT = "'Montserrat', sans-serif";
const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;
const VEHICLE_TICKET_FILTER_DROPDOWN_PROPS = {
  getPopupContainer: (triggerNode) => (typeof document !== "undefined" ? document.body : triggerNode.parentElement),
  placement: "bottomLeft",
};

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

const TABS = [
  { value: "daily", label: "Daily", icon: IoCarOutline },
  { value: "annual", label: "Annual", icon: IoPricetagOutline },
  { value: "types", label: "Vehicle Types", icon: IoListOutline },
];
const VEHICLE_TICKET_OVERVIEW_ORDER = [
  "daily",
  "annual",
  "types",
  "today",
  "collections",
];
const VEHICLE_TICKET_SEARCH_GROUPS = ["Vehicle Tickets", "Daily Vehicle Tickets", "Annual Vehicle Tickets"];
const VEHICLE_TYPE_SEARCH_GROUPS = ["Vehicle Type", "Vehicle Types"];
const VEHICLE_TICKET_TABS = new Set(["daily", "annual", "types"]);
const VEHICLE_TICKET_TAB_PATHS = {
  daily: "/daily-vehicle-tickets",
  annual: "/annual-vehicle-tickets",
  types: "/vehicle-types",
};
const VEHICLE_TICKET_PATH_TABS = {
  "/daily-vehicle-tickets": "daily",
  "/annual-vehicle-tickets": "annual",
  "/vehicle-types": "types",
  "/vehicle-tickets": "daily",
};
const getVehicleTicketTabPath = (tab) => VEHICLE_TICKET_TAB_PATHS[tab] ?? VEHICLE_TICKET_TAB_PATHS.daily;
const isVehicleTicketSearchGroup = (group) => VEHICLE_TICKET_SEARCH_GROUPS.includes(String(group || ""));
const isVehicleTypeSearchGroup = (group) => VEHICLE_TYPE_SEARCH_GROUPS.includes(String(group || ""));
const getVehicleTicketHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = isVehicleTicketSearchGroup(highlightedSearchResult?.group) ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("ticket-") ? rawId.slice("ticket-".length) : "";
};
const getVehicleTypeHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = isVehicleTypeSearchGroup(highlightedSearchResult?.group) ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("vehicle-type-") ? rawId.slice("vehicle-type-".length) : "";
};
const getVehicleTicketTabFromLocation = ({ highlightedSearchResult, pathname, search }) => {
  if (highlightedSearchResult?.group === "Annual Vehicle Tickets") return "annual";
  if (highlightedSearchResult?.group === "Daily Vehicle Tickets") return "daily";
  if (isVehicleTypeSearchGroup(highlightedSearchResult?.group)) return "types";

  const tab = new URLSearchParams(search).get("tab");
  if (VEHICLE_TICKET_TABS.has(tab)) return tab;

  return VEHICLE_TICKET_PATH_TABS[pathname] ?? "daily";
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "voided", label: "Voided" },
];
const VEHICLE_TYPE_USAGE_FILTER_OPTIONS = [
  { value: "all", label: "All Vehicle Types" },
  { value: "used", label: "Used" },
  { value: "unused", label: "Unused" },
];
const VEHICLE_TICKET_TYPE_LEGEND = [
  { key: "active", label: "Active", color: "#16a34a" },
  { key: "voided", label: "Voided", color: "#f59e0b" },
];
const PERIOD_FILTER_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];
const VOID_REASON_OPTIONS = [
  { value: "duplicate-entry", label: "Duplicate Entry" },
  { value: "entered-by-mistake", label: "Entered by Mistake" },
  { value: "others", label: "Others" },
];

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

const DAY_OPTIONS = Array.from({ length: 31 }, (_, idx) => {
  const day = String(idx + 1).padStart(2, "0");
  return { value: day, label: day };
});

const YEAR_OPTIONS = Array.from({ length: 6 }, (_, idx) => {
  const year = new Date().getFullYear() - 2 + idx;
  return { value: String(year), label: String(year) };
});

const getTodayDateString = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const isFutureTicketDate = (dateString) => {
  if (!dateString) return false;
  return dateString > getTodayDateString();
};

const filterTicketsByPeriod = (records, period) => {
  if (period === "all") return records;

  const todayStr = getTodayDateString();
  const now = new Date(`${todayStr}T00:00:00`);

  if (period === "today") {
    return records.filter((record) => String(record.rawTicketDate || "").slice(0, 10) === todayStr);
  }

  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());

    return records.filter((record) => {
      const date = new Date(`${String(record.rawTicketDate || "").slice(0, 10)}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date >= start && date <= now;
    });
  }

  if (period === "month") {
    return records.filter((record) => {
      const date = new Date(`${String(record.rawTicketDate || "").slice(0, 10)}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
  }

  if (period === "year") {
    return records.filter((record) => {
      const date = new Date(`${String(record.rawTicketDate || "").slice(0, 10)}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear();
    });
  }

  return records;
};

const getInitialTicketForm = (ticketType = "daily") => {
  const sourceDate = getTodayDateString();

  return {
    vehicle_type_id: "",
    control_number: "",
    official_receipt_no: "",
    plate_number: "",
    driver_name: "",
    ticket_type: ticketType,
    fee_id: "",
    ticket_fee: "",
    ticket_date: sourceDate,
    ticket_date_month: sourceDate.slice(5, 7),
    ticket_date_day: sourceDate.slice(8, 10),
    ticket_date_year: sourceDate.slice(0, 4),
    end_date: "",
    end_date_month: "",
    end_date_day: "",
    end_date_year: "",
  };
};

const getInitialVehicleTypeForm = () => ({
  type_name: "",
});

const getInitialFeeItems = () => [
  {
    fee_id: "",
    quantity: "1",
  },
];

const buildTicketFormFromRecord = (ticket, ticketType = "daily") => {
  const ticketDate = String(ticket?.ticket_date || getTodayDateString()).slice(0, 10);
  const endDate = String(ticket?.end_date || "").slice(0, 10);
  const ticketDateParts = getDateParts(ticketDate);
  const endDateParts = getDateParts(endDate);

  return {
    vehicle_type_id: String(ticket?.vehicle_type_id ?? ""),
    control_number: ticket?.control_number || "",
    official_receipt_no: ticket?.official_receipt_no || "",
    plate_number: ticket?.plate_number || "",
    driver_name: ticket?.driver_name || "",
    ticket_type: ticketType,
    fee_id: String(ticket?.fee_id ?? ""),
    ticket_fee: ticket?.ticket_fee !== undefined && ticket?.ticket_fee !== null ? String(ticket.ticket_fee) : "",
    ticket_date: ticketDate,
    ticket_date_month: ticketDateParts.month,
    ticket_date_day: ticketDateParts.day,
    ticket_date_year: ticketDateParts.year,
    end_date: endDate,
    end_date_month: endDateParts.month,
    end_date_day: endDateParts.day,
    end_date_year: endDateParts.year,
  };
};

const buildFeeItemsFromRecord = (ticket, fees = [], ticketType = "daily") => {
  if (!ticket) return getInitialFeeItems();

  if (ticketType === "daily") {
    const quantity = "1";
    const dailyItems = buildDailyFeeItems(fees, ticket?.vehicle_type_id, quantity);
    const savedFeeId = String(ticket?.fee_id ?? "");

    if (savedFeeId && !dailyItems.some((item) => item.fee_id === savedFeeId)) {
      return [{ fee_id: savedFeeId, quantity }, ...dailyItems];
    }

    if (dailyItems.length > 0) return dailyItems;
  }

  return [
    {
      fee_id: String(ticket?.fee_id ?? ""),
      quantity: "1",
      row_type: ticketType === "daily" ? "daily" : "annual",
    },
  ];
};

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const normalized = String(value).slice(0, 10);
  const [year = "", month = "", day = ""] = normalized.split("-");
  if (!year || !month || !day) return normalized;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const buildDateFromParts = (year, month, day) => {
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
};

const getDateParts = (value) => {
  if (!value) return { year: "", month: "", day: "" };

  return {
    year: String(value).slice(0, 4),
    month: String(value).slice(5, 7),
    day: String(value).slice(8, 10),
  };
};

const addOneYearToDateString = (value) => {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setFullYear(date.getFullYear() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const syncAnnualEndDate = (nextValue, annual = false) => {
  if (!annual) return nextValue;

  const builtTicketDate = buildDateFromParts(
    nextValue.ticket_date_year,
    nextValue.ticket_date_month,
    nextValue.ticket_date_day
  );
  const nextEndDate = addOneYearToDateString(builtTicketDate);
  const parts = getDateParts(nextEndDate);

  return {
    ...nextValue,
    end_date: nextEndDate,
    end_date_year: parts.year,
    end_date_month: parts.month,
    end_date_day: parts.day,
  };
};

const getFeeTypeName = (fee) =>
  String(fee?.fee_type_name || fee?.fee_type?.fee_name || fee?.feeType?.fee_name || fee?.fee_name || "").toLowerCase();

const isFeeActive = (fee) => {
  const today = getTodayDateString();
  const effectiveFrom = String(fee?.effective_from || "").slice(0, 10);
  const effectiveTo = String(fee?.effective_to || "").slice(0, 10);
  if (effectiveFrom && effectiveFrom > today) return false;
  if (effectiveTo && effectiveTo <= today) return false;
  return true;
};

const getAutoFeeForTicketType = (fees, ticketType) => {
  if (!ticketType) return null;

  const targetFeeTypeName =
    ticketType === "annual" ? "vehicle ticket annual" : "vehicle ticket daily";

  return fees.find((fee) => getFeeTypeName(fee) === targetFeeTypeName) ?? null;
};

const getBanyeraVehicleFee = (fees) =>
  fees.find((fee) => getFeeTypeName(fee) === "banyera") ?? null;

const getVehicleSpecificFees = (fees, vehicleTypeId) => {
  if (!vehicleTypeId) return [];

  return fees.filter(
    (fee) =>
      String(fee.vehicle_type_id ?? "") === String(vehicleTypeId) &&
      isFeeActive(fee),
  );
};

const getDailyApplicableFees = (fees, vehicleTypeId) => {
  const vehicleFees = getVehicleSpecificFees(fees, vehicleTypeId);
  return vehicleFees.filter((fee) => {
    const feeTypeName = getFeeTypeName(fee);
    return feeTypeName === "vehicle ticket daily" || feeTypeName === "banyera";
  });
};

const isLinkedToAnnualRegistration = (controlNumber, annualTickets = []) => {
  const normalizedControlNumber = String(controlNumber || "").trim();
  if (!normalizedControlNumber) return false;

  return annualTickets.some(
    (ticket) => String(ticket?.control_number || "").trim() === normalizedControlNumber
  );
};

const isValidAnnualTicket = (ticket) => {
  if (String(ticket?.ticket_type || "").toLowerCase() !== "annual") return false;
  if (ticket?.is_voided || ticket?.voided_at) return false;

  const today = getTodayDateString();
  const startDate = String(ticket?.ticket_date || "").slice(0, 10);
  const endDate = String(ticket?.end_date || ticket?.ticket_date || "").slice(0, 10);

  if (startDate && startDate > today) return false;
  if (endDate && endDate < today) return false;
  return true;
};

const buildDailyFeeItems = (fees, vehicleTypeId, quantity = "1", options = {}) => {
  const { zeroDailyTicket = false } = options;
  const applicableFees = getDailyApplicableFees(fees, vehicleTypeId);
  const dailyFee = getAutoFeeForTicketType(applicableFees, "daily");
  const banyeraFee = getBanyeraVehicleFee(applicableFees);

  return [
    {
      fee_id: zeroDailyTicket ? "" : dailyFee ? String(dailyFee.fee_id) : "",
      quantity,
      row_type: "daily",
    },
    {
      fee_id: banyeraFee ? String(banyeraFee.fee_id) : "",
      quantity: "1",
      row_type: "banyera",
    },
  ];
};

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatPeso = (value) =>
  `\u20B1${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatMoneyValue = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const resolveStatus = (ticket) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const ticketDate = ticket.ticket_date ? new Date(`${String(ticket.ticket_date).slice(0, 10)}T00:00:00`) : null;
  const endDate = ticket.end_date ? new Date(`${String(ticket.end_date).slice(0, 10)}T00:00:00`) : null;

  if (endDate && endDate < today) return "expired";
  if (ticketDate && ticketDate > today) return "pending";
  return "active";
};

const normalizeTicket = (ticket) => ({
  id: ticket.ticket_id,
  controlNumber:
    String(ticket.ticket_type || "").toLowerCase() === "annual"
      ? ticket.control_number || `VTC-${String(ticket.ticket_id).padStart(4, "0")}`
      : ticket.control_number || "",
  officialReceiptNo: ticket.official_receipt_no || ticket.officialReceiptNo || "-",
  vehicleTypeId: String(ticket.vehicle_type_id ?? ""),
  vehicleTypeName: ticket.vehicle_type?.type_name || "-",
  plateNumber: ticket.plate_number || "-",
  driverName: ticket.driver_name || "-",
  ticketType: String(ticket.ticket_type || "").toLowerCase() === "annual" ? "Annual" : "Daily",
  feeName:
    ticket.fee?.fee_type_name ||
    ticket.fee?.fee_type?.fee_name ||
    ticket.fee?.feeType?.fee_name ||
    ticket.fee?.fee_name ||
    "-",
  feeId: String(ticket.fee_id ?? ""),
  ticketFee: Number(ticket.ticket_fee || 0),
  dailyFee: Number(ticket.daily_fee || 0),
  banyeraFee: Number(ticket.banyera_fee || 0),
  rawTicketDate: String(ticket.ticket_date || "").slice(0, 10),
  ticketDate: formatDisplayDate(ticket.ticket_date),
  endDate: formatDisplayDate(ticket.end_date),
  status: String(ticket.status || resolveStatus(ticket)),
  isVoided: Boolean(ticket.is_voided || ticket.voided_at),
  voidReason: ticket.void_reason || "",
  voidedAt: ticket.voided_at || null,
  voidedBy:
    String(ticket.voided_by_name || "").trim() ||
    String(ticket.voidedBy?.full_name || "").trim() ||
    String(ticket.voidedBy?.email || "").trim() ||
    String(ticket.voided_by?.email || "").trim() ||
    "-",
  encodedBy:
    String(ticket.created_by_name || "").trim() ||
    String(ticket.createdBy?.full_name || "").trim() ||
    String(ticket.createdBy?.email || "").trim() ||
    String(ticket.created_by?.full_name || "").trim() ||
    String(ticket.created_by?.email || "").trim() ||
    "-",
});

const toMoneyCents = (value) => Math.round(Number(value || 0) * 100);

const fromMoneyCents = (value) => value / 100;

const getDailyTicketFeeBreakdown = (ticket, fees) => {
  const savedDailyFee = Number(ticket.dailyFee || 0);
  const savedBanyeraFee = Number(ticket.banyeraFee || 0);
  if (savedDailyFee > 0 || savedBanyeraFee > 0) {
    const totalFee = savedDailyFee + savedBanyeraFee;

    return {
      dailyFee: savedDailyFee,
      banyeraFee: savedBanyeraFee,
      totalFee: totalFee || Number(ticket.ticketFee || 0),
    };
  }

  const vehicleFees = getVehicleSpecificFees(fees, ticket.vehicleTypeId);
  const savedFee = fees.find((fee) => String(fee.fee_id) === String(ticket.feeId)) ?? null;
  const configuredDailyFee = getAutoFeeForTicketType(vehicleFees, "daily") ?? null;
  const configuredBanyeraFee = getBanyeraVehicleFee(vehicleFees) ?? null;
  const savedTotal = Number(ticket.ticketFee || 0);

  if (savedFee) {
    const savedFeeAmount = Number(savedFee.amount || 0);
    const savedFeeType = getFeeTypeName(savedFee);
    const savedIsBanyera = savedFeeType === "banyera";
    const normalizedTotal = savedTotal > 0 ? savedTotal : savedFeeAmount;
    const totalCents = toMoneyCents(normalizedTotal);
    const savedFeeCents = toMoneyCents(savedFeeAmount);
    const dailyFeeCents = toMoneyCents(configuredDailyFee?.amount || 0);
    const banyeraFeeCents = toMoneyCents(configuredBanyeraFee?.amount || 0);

    if (!savedIsBanyera && savedFeeCents > 0) {
      if (totalCents % savedFeeCents === 0) {
        return {
          dailyFee: normalizedTotal,
          banyeraFee: 0,
          totalFee: normalizedTotal,
        };
      }

      const possibleDailyCents = totalCents - banyeraFeeCents;
      if (banyeraFeeCents > 0 && possibleDailyCents > 0 && possibleDailyCents % savedFeeCents === 0) {
        return {
          dailyFee: fromMoneyCents(possibleDailyCents),
          banyeraFee: fromMoneyCents(banyeraFeeCents),
          totalFee: normalizedTotal,
        };
      }
    }

    if (savedIsBanyera && savedFeeCents > 0) {
      if (totalCents % savedFeeCents === 0) {
        return {
          dailyFee: 0,
          banyeraFee: normalizedTotal,
          totalFee: normalizedTotal,
        };
      }

      const possibleBanyeraCents = savedFeeCents;
      const possibleDailyCents = totalCents - possibleBanyeraCents;
      if (dailyFeeCents > 0 && possibleDailyCents > 0 && possibleDailyCents % dailyFeeCents === 0) {
        return {
          dailyFee: fromMoneyCents(possibleDailyCents),
          banyeraFee: fromMoneyCents(possibleBanyeraCents),
          totalFee: normalizedTotal,
        };
      }
    }

    const dailyFee = savedIsBanyera ? 0 : normalizedTotal;
    const banyeraFee = savedIsBanyera ? normalizedTotal : 0;

    return {
      dailyFee,
      banyeraFee,
      totalFee: normalizedTotal,
    };
  }

  return {
    dailyFee: Number(configuredDailyFee?.amount || 0),
    banyeraFee: Number(configuredBanyeraFee?.amount || 0),
    totalFee: Number(configuredDailyFee?.amount || 0) + Number(configuredBanyeraFee?.amount || 0),
  };
};

const getTicketQuantityFromFeeTotal = (totalFee, unitFee) => {
  const totalCents = toMoneyCents(totalFee);
  const unitCents = toMoneyCents(unitFee);

  if (totalCents <= 0) return 0;
  if (unitCents <= 0) return 1;

  return Math.max(1, Math.round(totalCents / unitCents));
};

const getDailyTicketCount = (ticket, fees) => {
  const vehicleFees = getVehicleSpecificFees(fees, ticket.vehicleTypeId);
  const dailyFee = getAutoFeeForTicketType(vehicleFees, "daily");
  const banyeraFee = getBanyeraVehicleFee(vehicleFees);
  const feeBreakdown = getDailyTicketFeeBreakdown(ticket, fees);

  return (
    getTicketQuantityFromFeeTotal(feeBreakdown.dailyFee, dailyFee?.amount) +
    getTicketQuantityFromFeeTotal(feeBreakdown.banyeraFee, banyeraFee?.amount)
  );
};

const getAnnualTicketFeeBreakdown = (ticket, fees) => {
  const vehicleFees = getVehicleSpecificFees(fees, ticket.vehicleTypeId);
  const annualFeeRecord =
    getAutoFeeForTicketType(vehicleFees, "annual") ??
    vehicleFees[0] ??
    null;

  return {
    annualFee: Number(annualFeeRecord?.amount || 0),
    banyeraFee: 0,
    totalFee: Number(ticket.ticketFee || 0),
  };
};

const normalizeVehicleType = (type) => ({
  id: type.vehicle_type_id,
  typeName: type.type_name || "-",
  ticketsUsing: Number(type.tickets_count || 0),
  encodedBy:
    type.created_by_name ||
    type.createdBy?.full_name ||
    type.created_by_email ||
    type.createdBy?.email ||
    "-",
  createdByName: type.created_by_name || type.createdBy?.full_name || null,
  created_by_name: type.created_by_name || type.createdBy?.full_name || null,
  createdByEmail: type.created_by_email || type.createdBy?.email || null,
  created_by_email: type.created_by_email || type.createdBy?.email || null,
  createdAt: formatDisplayDate(type.created_at),
});

const sortVehicleTypesByCreatedAt = (items = []) => {
  const normalizedItems = Array.isArray(items) ? items : [];

  return [...normalizedItems].sort((left, right) => {
    const leftTime = Date.parse(left?.created_at || left?.createdAt || left?.date_added || "");
    const rightTime = Date.parse(right?.created_at || right?.createdAt || right?.date_added || "");
    const leftHasTime = Number.isFinite(leftTime);
    const rightHasTime = Number.isFinite(rightTime);

    if (leftHasTime && rightHasTime) {
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return Number(right?.vehicle_type_id ?? 0) - Number(left?.vehicle_type_id ?? 0);
    }

    if (leftHasTime !== rightHasTime) {
      return leftHasTime ? -1 : 1;
    }

    return Number(right?.vehicle_type_id ?? 0) - Number(left?.vehicle_type_id ?? 0);
  });
};

const formatUsageCountLabel = (count) => {
  const normalized = Number(count ?? 0);
  return `${normalized} ${normalized === 1 ? "count" : "counts"}`;
};

const getVehicleTicketSortTimestamp = (value) => {
  const timestamp = new Date(value ?? 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const sortVehicleTicketsNewestFirst = (items) =>
  [...items].sort((left, right) => {
    const ticketDateDifference =
      getVehicleTicketSortTimestamp(right?.ticket_date) - getVehicleTicketSortTimestamp(left?.ticket_date);

    if (ticketDateDifference !== 0) return ticketDateDifference;

    return getVehicleTicketSortTimestamp(right?.created_at) - getVehicleTicketSortTimestamp(left?.created_at);
  });

const upsertVehicleTicketRecord = (tickets, nextTicket) => {
  const currentTickets = Array.isArray(tickets) ? tickets : [];
  const nextTicketId = String(nextTicket?.ticket_id ?? "");
  const existingIndex = currentTickets.findIndex((ticket) => String(ticket?.ticket_id ?? "") === nextTicketId);

  if (existingIndex === -1) return sortVehicleTicketsNewestFirst([...currentTickets, nextTicket]);

  const updatedTickets = [...currentTickets];
  updatedTickets[existingIndex] = nextTicket;
  return sortVehicleTicketsNewestFirst(updatedTickets);
};

const isVehicleFee = (fee) => {
  const feeTypeName = getFeeTypeName(fee);
  return feeTypeName === "vehicle ticket daily" || feeTypeName === "vehicle ticket annual" || feeTypeName === "banyera";
};

const TailDropdown = ({ value, onChange, options, height = 38 }) => (
  <FilterSelect
    {...VEHICLE_TICKET_FILTER_DROPDOWN_PROPS}
    value={value}
    onChange={onChange}
    options={options}
    height={height}
    width={160}
  />
);

const RowMenu = ({ onView }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClose = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClose);
    return () => document.removeEventListener("mousedown", handleClose);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-transparent text-gray-400 cursor-pointer hover:bg-gray-50"
      >
        <IoEllipsisHorizontalOutline className="text-[15px]" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+4px)] z-50 rounded-xl border border-gray-100 bg-white shadow-lg"
          style={{ width: 148 }}
        >
          <button
            type="button"
            onClick={() => {
              onView();
              setOpen(false);
            }}
            className="w-full border-none bg-transparent px-4 py-2.5 text-left text-[13px] text-gray-700 cursor-pointer hover:bg-gray-50"
            style={{ fontFamily: FONT }}
          >
            View Details
          </button>
        </div>
      )}
    </div>
  );
};


const TH = ({ children }) => (
  <th
    className="whitespace-nowrap bg-white px-4 py-3 text-left text-[13px] font-semibold"
    style={{ color: "#1a1f36", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}
  >
    {children}
  </th>
);

const DrawerField = ({ label, required, error, children }) => (
  <div>
    <label className="mb-1.5 block text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>
      {label}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
    <div className={error ? "modal-field-control-error" : ""}>{children}</div>
    {error ? (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
        <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
        <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>
          {error}
        </p>
      </div>
    ) : null}
  </div>
);

const ModalInput = ({ label, required, error, icon: Icon, inputStyle, ...props }) => {
  const visibleError = props.readOnly ? "" : error;

  return (
  <DrawerField label={label} required={required} error={visibleError}>
    <div className="modal-input-shell flex h-[46px] items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-4 transition-all focus-within:border-[#4096ff]">
      <input
        {...props}
        className="w-full border-none bg-transparent text-[14px] font-medium text-[#0d1117] outline-none placeholder:font-normal placeholder:text-slate-400"
        style={{ fontFamily: FONT, ...(inputStyle || {}) }}
      />
    </div>
  </DrawerField>
  );
};

const DeleteConfirmModal = ({ open, title, recordLabel, message, deleting, onClose, onConfirm }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4" style={{ backgroundColor: "rgba(10,13,28,0.55)", backdropFilter: "blur(6px)" }}>
      <div
        className="bg-white w-full overflow-hidden"
        style={{ maxWidth: 400, borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.2)", fontFamily: FONT, animation: "modalPop 0.22s cubic-bezier(0.34,1.56,0.64,1)" }}
      >
        <style>{`@keyframes modalPop{from{opacity:0;transform:scale(0.92) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <div className="px-6 pt-8 pb-5 flex flex-col items-center text-center">
          <div className="mb-5 flex items-center justify-center" style={{ width: 68, height: 68, borderRadius: 18, backgroundColor: "#fef2f2" }}>
            <IoWarningOutline style={{ fontSize: 36, color: "#ef4444" }} />
          </div>
          <p className="m-0 text-[18px] font-bold mb-2" style={{ color: "#0d1117" }}>{title}</p>
          <p className="m-0 text-[15px] leading-relaxed" style={{ color: "#64748b" }}>
            {message || (
              <>
                Are you sure you want to archive{" "}
                <span className="font-bold" style={{ color: "#1a1f36" }}>"{recordLabel || "this record"}"</span>?
              </>
            )}
          </p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] font-semibold cursor-pointer hover:bg-gray-50 transition-colors"
            style={{ fontFamily: FONT, color: "#1a1f36" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2"
            style={{ fontFamily: FONT, backgroundColor: deleting ? "#fca5a5" : "#ef4444", border: "none" }}
            onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.backgroundColor = "#dc2626"; }}
            onMouseLeave={(e) => { if (!deleting) e.currentTarget.style.backgroundColor = "#ef4444"; }}
          >
            {deleting ? <Spinner size={15} /> : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
};

const VoidVehicleTicketModal = ({
  open,
  ticket,
  selectedReason,
  customReason,
  error,
  saving,
  onReasonChange,
  onCustomReasonChange,
  onClose,
  onConfirm,
}) => {
  if (!open || !ticket) return null;
  const voidReasonOptions =
    ticket.ticketType === "Annual"
      ? VOID_REASON_OPTIONS.filter((option) => option.value !== "duplicate-entry")
      : VOID_REASON_OPTIONS;

  return (
    <Modal
      title="Void Vehicle Ticket"
      onClose={onClose}
      onSave={onConfirm}
      saving={saving}
      saveLabel="Save"
      closeLabel="Cancel"
      closeOnBackdrop
      maxWidth="560px"
    >
     
      <div className="flex flex-col gap-5">
        <ModalInput
          label="Vehicle Type"
          icon={IoCarOutline}
          value={ticket.vehicleTypeName || "-"}
          readOnly
          disabled
          inputStyle={{ color: "#64748b" }}
        />
        <ModalInput
          label="Date"
          icon={IoCalendarOutline}
          value={ticket.ticketDate || "-"}
          readOnly
          disabled
          inputStyle={{ color: "#64748b" }}
        />
        <ModalInput
          label="Ticket Fee"
          icon={IoCashOutline}
          value={`₱${formatMoneyValue(ticket.ticketFee || 0)}`}
          readOnly
          disabled
          inputStyle={{ color: "#64748b" }}
        />
        <DrawerField label="Reason" required error={selectedReason === "others" ? "" : error}>
          <FilterSelect
            width="100%"
            height={46}
            placeholder="Select void reason"
            value={selectedReason || undefined}
            onChange={onReasonChange}
            options={voidReasonOptions}
          />
        </DrawerField>
        {selectedReason === "others" ? (
          <DrawerField label="Other Reason" required error={error}>
            <textarea
              value={customReason}
              onChange={(event) => onCustomReasonChange(event.target.value)}
              placeholder="Enter the specific reason"
              className="min-h-[120px] w-full resize-none rounded-[10px] border border-slate-200 px-4 py-3 text-[14px] outline-none transition-all focus:border-[#4096ff]"
              style={{ fontFamily: FONT, color: "#0d1117" }}
            />
          </DrawerField>
        ) : null}
      </div>
    </Modal>
  );
};

const DrawerInput = ({ icon: Icon, as = "input", children, ...props }) => {
  const Component = as;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      {Icon ? <Icon className="flex-shrink-0 text-[16px] text-slate-400" /> : null}
      <Component
        {...props}
        className="w-full border-none bg-transparent text-[14px] font-medium text-[#0d1117] outline-none"
        style={{ fontFamily: FONT, resize: as === "textarea" ? "vertical" : undefined }}
      >
        {children}
      </Component>
    </div>
  );
};

const AddVehicleTicketDrawer = ({
  open,
  onClose,
  onSave,
  saving,
  vehicleTypes = [],
  fees = [],
  tickets = [],
  ticketType = "daily",
  editingTicket = null,
  isLookupsLoading = false,
}) => {
  const [draftTicketType, setDraftTicketType] = useState(ticketType);
  const canSwitchTicketType = !editingTicket && ticketType === "daily";
  const isDailyAnnualShortcut = canSwitchTicketType && draftTicketType === "annual";
  const effectiveTicketType = !canSwitchTicketType && ticketType === "annual" ? "annual" : "daily";
  const [form, setForm] = useState(getInitialTicketForm(effectiveTicketType));
  const [feeItems, setFeeItems] = useState(() =>
    effectiveTicketType === "annual" ? getInitialFeeItems() : buildDailyFeeItems(fees, "", "1")
  );
  const [errors, setErrors] = useState({});
  const isAnnualTicket = effectiveTicketType === "annual";
  const isEditing = Boolean(editingTicket);
  const isEditingAnnualTicket = isAnnualTicket && isEditing;
  const applicableFees = useMemo(
    () =>
      isAnnualTicket
        ? getVehicleSpecificFees(fees, form.vehicle_type_id).filter(
            (fee) => getFeeTypeName(fee) === "vehicle ticket annual"
          )
        : getDailyApplicableFees(fees, form.vehicle_type_id),
    [fees, form.vehicle_type_id, isAnnualTicket]
  );
  const totalTicketFee = feeItems.reduce((sum, item) => {
    const selectedItemFee = fees.find((fee) => String(fee.fee_id) === String(item.fee_id));
    const quantity = Number.parseInt(item.quantity || "0", 10) || 0;
    return sum + Number(selectedItemFee?.amount || 0) * quantity;
  }, 0);
  const selectedVehicleType = vehicleTypes.find(
    (type) => String(type.vehicle_type_id) === String(form.vehicle_type_id || "")
  );
  const selectedAnnualFee = applicableFees.find(
    (fee) => String(fee.fee_id) === String(feeItems[0]?.fee_id || "")
  );
  const isVehicleTypeReadOnly = !isAnnualTicket && Boolean(String(form.plate_number || "").trim());
  const annualShortcutOptions = useMemo(() => {
    const annualTicketMap = new Map();

    tickets.forEach((ticket) => {
      if (!isValidAnnualTicket(ticket)) return;

      const controlNumber = String(ticket?.control_number || "").trim();
      if (!controlNumber || annualTicketMap.has(controlNumber)) return;

      annualTicketMap.set(controlNumber, {
        ...ticket,
        control_number: controlNumber,
      });
    });

    return Array.from(annualTicketMap.values());
  }, [tickets]);
  const isAnnualRegisteredDailyEntry =
    !isAnnualTicket && isLinkedToAnnualRegistration(form.control_number, annualShortcutOptions);

  useEffect(() => {
    if (!open) return;
    setDraftTicketType(ticketType);
  }, [open, ticketType]);

  useEffect(() => {
    if (!open) {
      setForm(getInitialTicketForm("daily"));
      setFeeItems(buildDailyFeeItems(fees, "", "1"));
      setErrors({});
      return;
    }
    if (editingTicket) {
      setForm(syncAnnualEndDate(buildTicketFormFromRecord(editingTicket, effectiveTicketType), isAnnualTicket));
      setFeeItems(buildFeeItemsFromRecord(editingTicket, fees, effectiveTicketType));
    } else {
      setForm(syncAnnualEndDate(getInitialTicketForm(effectiveTicketType), isAnnualTicket));
      setFeeItems(isAnnualTicket ? getInitialFeeItems() : buildDailyFeeItems(fees, "", "1"));
    }
    setErrors({});
  }, [draftTicketType, editingTicket, effectiveTicketType, fees, isAnnualTicket, open]);

  useEffect(() => {
    if (!open || isAnnualTicket) return;

    setFeeItems((current) => {
      const dailyRow = current.find((item) => item.row_type === "daily") ?? current[0] ?? { fee_id: "", quantity: "1" };
      const banyeraRow = current.find((item) => item.row_type === "banyera") ?? current[1] ?? { fee_id: "", quantity: "1" };

      return [
        { ...dailyRow, row_type: "daily", quantity: dailyRow.quantity || "1" },
        { ...banyeraRow, row_type: "banyera", quantity: banyeraRow.quantity || "1" },
      ];
    });
  }, [isAnnualTicket, open]);

  useEffect(() => {
    if (!open || isAnnualTicket || !form.vehicle_type_id) return;

    setFeeItems((current) => {
      const nextRows = buildDailyFeeItems(
        fees,
        form.vehicle_type_id,
        current[0]?.quantity || "1",
        { zeroDailyTicket: isAnnualRegisteredDailyEntry }
      );
      const currentDailyRow = current.find((item) => item.row_type === "daily");
      const currentBanyeraRow = current.find((item) => item.row_type === "banyera");

      return nextRows.map((row) => {
        const currentRow = row.row_type === "banyera" ? currentBanyeraRow : currentDailyRow;
        const nextFeeId =
          isAnnualRegisteredDailyEntry && row.row_type === "daily"
            ? row.fee_id
            : row.fee_id || currentRow?.fee_id || "";
        return {
          ...row,
          fee_id: nextFeeId,
          quantity: currentRow?.quantity || row.quantity || "1",
        };
      });
    });
  }, [fees, form.vehicle_type_id, isAnnualRegisteredDailyEntry, isAnnualTicket, open]);

  useEffect(() => {
    setForm((current) => {
      const primaryFeeId = isAnnualTicket
        ? feeItems.find((item) => item.fee_id)?.fee_id ?? ""
        : feeItems.find((item) => item.fee_id)?.fee_id ?? "";
      return {
        ...current,
        fee_id: primaryFeeId,
        ticket_fee: totalTicketFee > 0 ? String(totalTicketFee) : "",
      };
    });
  }, [feeItems, isAnnualRegisteredDailyEntry, isAnnualTicket, totalTicketFee]);

  const applyTicketDate = (nextValue, dateString) => {
    const parts = getDateParts(dateString);
    return {
      ...nextValue,
      ticket_date: dateString,
      ticket_date_year: parts.year,
      ticket_date_month: parts.month,
      ticket_date_day: parts.day,
    };
  };

  const applyEndDate = (nextValue, dateString) => {
    const parts = getDateParts(dateString);
    return {
      ...nextValue,
      end_date: dateString,
      end_date_year: parts.year,
      end_date_month: parts.month,
      end_date_day: parts.day,
    };
  };

  const handleVehicleTypeChange = (value) => {
    const nextVehicleTypeId = value ?? "";
    const nextApplicableFees = isAnnualTicket
      ? getVehicleSpecificFees(fees, nextVehicleTypeId).filter(
          (fee) => getFeeTypeName(fee) === "vehicle ticket annual"
        )
      : getDailyApplicableFees(fees, nextVehicleTypeId);
    const selectedFee = getAutoFeeForTicketType(nextApplicableFees, isAnnualTicket ? "annual" : "daily");

    setForm((current) => ({ ...current, vehicle_type_id: nextVehicleTypeId }));
    setFeeItems((current) =>
      isAnnualTicket
        ? [
            {
              fee_id: selectedFee ? String(selectedFee.fee_id) : "",
              quantity: current[0]?.quantity || "1",
            },
          ]
        : buildDailyFeeItems(fees, nextVehicleTypeId, current[0]?.quantity || "1", {
            zeroDailyTicket: isLinkedToAnnualRegistration(form.control_number, annualShortcutOptions),
          })
    );
    setErrors((current) => ({
      ...current,
      vehicle_type_id: "",
      fee_id: "",
      ticket_fee: "",
      fee_item_0: "",
      fee_item_1: "",
      fee_item_2: "",
    }));
  };

  const handleFeeItemQuantityChange = (rowType, value) => {
    const sanitizedValue = String(value || "").replace(/\D/g, "");

    setFeeItems((current) =>
      current.map((item) =>
        item.row_type === rowType
          ? { ...item, quantity: sanitizedValue }
          : item
      )
    );
    setErrors((current) => ({
      ...current,
      fee_id: "",
      fee_qty_0: "",
      fee_qty_1: "",
      ticket_fee: "",
    }));
  };

  const handleFeeItemRemove = (rowType) => {
    setFeeItems((current) =>
      current.map((item) =>
        item.row_type === rowType
          ? { ...item, fee_id: "" }
          : item
      )
    );
    setErrors((current) => ({
      ...current,
      fee_id: "",
      fee_item_0: "",
      fee_item_1: "",
      ticket_fee: "",
    }));
  };

  const applyAnnualShortcutTicket = (matchedAnnualVehicle, controlNumber = "") => {
    const nextControlNumber = String(controlNumber || matchedAnnualVehicle?.control_number || "");
    const nextVehicleTypeId = String(matchedAnnualVehicle?.vehicle_type_id ?? "");

    setForm((current) =>
      syncAnnualEndDate(
        {
          ...current,
          control_number: nextControlNumber,
          vehicle_type_id: nextVehicleTypeId,
          plate_number: matchedAnnualVehicle?.plate_number || "",
          driver_name: matchedAnnualVehicle?.driver_name || "",
          official_receipt_no: matchedAnnualVehicle?.official_receipt_no || "",
        },
        true
      )
    );
    setFeeItems(
      buildDailyFeeItems(fees, nextVehicleTypeId, "1", {
        zeroDailyTicket: Boolean(matchedAnnualVehicle),
      })
    );
    setErrors((current) => ({
      ...current,
      control_number: "",
      vehicle_type_id: "",
      plate_number: "",
      driver_name: "",
      official_receipt_no: "",
      fee_id: "",
      fee_item_0: "",
      ticket_fee: "",
    }));
  };

  const handleAnnualShortcutControlNumberChange = (value) => {
    const nextControlNumber = String(value ?? "");
    const matchedAnnualVehicle = annualShortcutOptions.find(
      (ticket) => String(ticket.control_number || "") === nextControlNumber
    );

    applyAnnualShortcutTicket(matchedAnnualVehicle, nextControlNumber);
  };

  const handleAnnualShortcutPlateNumberChange = (value) => {
    const nextControlNumber = String(value ?? "");
    const matchedAnnualVehicle = annualShortcutOptions.find(
      (ticket) => String(ticket.control_number || "") === nextControlNumber
    );

    applyAnnualShortcutTicket(matchedAnnualVehicle, nextControlNumber);
  };

  const handleSave = async () => {
    const nextErrors = {};
    const builtTicketDate = buildDateFromParts(form.ticket_date_year, form.ticket_date_month, form.ticket_date_day);
    const builtEndDate = buildDateFromParts(form.end_date_year, form.end_date_month, form.end_date_day);
    const visibleFeeItems = isAnnualTicket ? feeItems.slice(0, 1) : feeItems;
    const hasFeeSelection = visibleFeeItems.some((item) => item.fee_id);

    if (isDailyAnnualShortcut && !form.control_number.trim()) nextErrors.control_number = "Control no. is required.";
    if (!form.vehicle_type_id) nextErrors.vehicle_type_id = "Vehicle type is required.";
    if (isAnnualTicket && !form.control_number.trim()) nextErrors.control_number = "Control no. is required.";
    if (isAnnualTicket && !form.official_receipt_no.trim()) nextErrors.official_receipt_no = "Official Receipt No. is required.";
    if (isAnnualTicket && !form.plate_number.trim()) nextErrors.plate_number = "Plate number is required.";
    if (isAnnualTicket && !form.driver_name.trim()) nextErrors.driver_name = "Driver name is required.";
    if (isAnnualTicket && form.control_number.trim() && !/^\d{6}$/.test(form.control_number.trim())) {
      nextErrors.control_number = "Control no. must be exactly 6 digits.";
    }
    if (isAnnualTicket && form.official_receipt_no.trim() && !/^\d{6}$/.test(form.official_receipt_no.trim())) {
      nextErrors.official_receipt_no = "Official Receipt No. must be exactly 6 digits.";
    }
    if (!hasFeeSelection) nextErrors.fee_id = "Fee is required.";
    if (!builtTicketDate) nextErrors.ticket_date = "Ticket date is required.";
    if (builtTicketDate && isFutureTicketDate(builtTicketDate)) nextErrors.ticket_date = "Ticket date cannot be in the future.";
    if (builtEndDate && builtEndDate < builtTicketDate) nextErrors.end_date = "End date must be after or equal to ticket date.";
    visibleFeeItems.forEach((item, index) => {
      const isAutoBanyeraRow = item.row_type === "banyera";
      const isZeroedDailyRow = isAnnualRegisteredDailyEntry && item.row_type === "daily";
      if (isAutoBanyeraRow && !item.fee_id) return;
      if (isZeroedDailyRow) return;
      if (!item.fee_id) return;
      if (!item.quantity || Number.parseInt(item.quantity, 10) < 1) nextErrors[`fee_qty_${index}`] = "Required";
    });

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    // Prevent duplicate Plate Number for Annual tickets
    if (isAnnualTicket) {
      const normalizedPlate = String(form.plate_number || "").trim().toLowerCase();
      if (normalizedPlate) {
        const duplicate = (tickets || []).find((t) => {
          const tPlate = String(t.plate_number || t.plateNumber || "").trim().toLowerCase();
          if (!tPlate) return false;
          const tType = String(t.ticket_type || t.ticketType || "").toLowerCase();
          if (tType !== "annual") return false;
          const tVoided = Boolean(t.is_voided || t.isVoided || t.voided_at || t.voidedAt);
          if (tVoided) return false;
          const tId = String(t.ticket_id || t.id || "");
          const editingId = String(editingTicket?.ticket_id || editingTicket?.id || "");
          if (editingTicket && editingId && tId === editingId) return false;
          return tPlate === normalizedPlate;
        });

        if (duplicate) {
          setErrors({ ...nextErrors, plate_number: "Plate number already has an active annual ticket." });
          return;
        }
      }
    }

    setErrors({});

    if (isEditing && editingTicket) {
      const currentTicketDate = String(editingTicket.ticket_date || "").slice(0, 10);
      const currentEndDate = String(editingTicket.end_date || "").slice(0, 10);
      const nextControlNumber = isAnnualTicket ? form.control_number.trim() : "";
      const nextOfficialReceiptNo = isAnnualTicket ? form.official_receipt_no.trim() : "";
      const nextPlateNumber = form.plate_number.trim();
      const nextDriverName = form.driver_name.trim();
      const nextPrimaryFeeId = String(form.fee_id || "");
      const currentPrimaryFeeId = String(editingTicket.fee_id ?? "");
      const nextTicketFee = Number(form.ticket_fee || 0);
      const currentTicketFee = Number(editingTicket.ticket_fee || 0);

      const noChanges =
        String(editingTicket.vehicle_type_id ?? "") === String(form.vehicle_type_id ?? "") &&
        String(editingTicket.control_number || "") === nextControlNumber &&
        String(editingTicket.official_receipt_no || "") === nextOfficialReceiptNo &&
        String(editingTicket.plate_number || "") === nextPlateNumber &&
        String(editingTicket.driver_name || "") === nextDriverName &&
        String(editingTicket.ticket_type || "") === String(form.ticket_type || "") &&
        currentPrimaryFeeId === nextPrimaryFeeId &&
        currentTicketFee === nextTicketFee &&
        currentTicketDate === builtTicketDate &&
        currentEndDate === (builtEndDate || "");

      if (noChanges) {
        showNoChangesToast();
        onClose();
        return;
      }
    }

    try {
      const ticketFeeParts = visibleFeeItems.reduce(
        (parts, item) => {
          const selectedItemFee = fees.find((fee) => String(fee.fee_id) === String(item.fee_id));
          const quantity = Number.parseInt(item.quantity || "0", 10) || 0;
          const amount = Number(selectedItemFee?.amount || 0);
          const subtotal = item.fee_id && quantity > 0 ? amount * quantity : 0;
          const rowType = item.row_type || (isAnnualTicket ? "annual" : "daily");

          if (rowType === "banyera") return { ...parts, banyeraFee: parts.banyeraFee + subtotal };
          if (rowType === "daily") return { ...parts, dailyFee: parts.dailyFee + subtotal };
          return parts;
        },
        { dailyFee: 0, banyeraFee: 0 },
      );

      await onSave({
        control_number: isAnnualTicket || isDailyAnnualShortcut ? (form.control_number.trim() || null) : null,
        official_receipt_no: isAnnualTicket ? (form.official_receipt_no.trim() || null) : null,
        vehicle_type_id: Number(form.vehicle_type_id),
        plate_number: form.plate_number.trim(),
        driver_name: form.driver_name.trim() || null,
        ticket_type: form.ticket_type,
        fee_id: Number(form.fee_id),
        daily_fee: ticketFeeParts.dailyFee,
        banyera_fee: ticketFeeParts.banyeraFee,
        ticket_fee: Number(form.ticket_fee),
        ticket_date: builtTicketDate,
        end_date: builtEndDate || null,
      });
    } catch (error) {
      const backendErrors = error.response?.data?.errors;
      if (backendErrors) {
        setErrors({
          control_number: backendErrors.control_number?.[0],
          official_receipt_no: backendErrors.official_receipt_no?.[0],
          vehicle_type_id: backendErrors.vehicle_type_id?.[0],
          plate_number: backendErrors.plate_number?.[0],
          driver_name: backendErrors.driver_name?.[0],
          ticket_type: backendErrors.ticket_type?.[0],
          fee_id: backendErrors.fee_id?.[0],
          ticket_date: backendErrors.ticket_date?.[0],
          end_date: backendErrors.end_date?.[0],
        });
      }
      showBottomToast("error", isEditing ? "Update Failed" : "Save Failed", error.response?.data?.message ?? "Unable to save vehicle ticket.");
    }
  };

  if (!open) return null;

  return (
    <Modal
      title={isAnnualTicket ? "Annual Vehicle Ticket" : "Daily Vehicle Ticket"}
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      saveLabel={isEditing ? "Save" : "Add"}
      closeOnBackdrop
      maxWidth="560px"
    >
      <div className="flex flex-col gap-5">
        {isAnnualTicket ? (
          <>
            <DrawerField label="Vehicle Type" required error={errors.vehicle_type_id}>
              <FilterSelect
                width="100%"
                height={46}
                showSearch
                loading={isLookupsLoading}
                placeholder="Select vehicle type"
                optionFilterProp="label"
                optionLabelProp="label"
                getPopupContainer={() => document.body}
                placement="bottomLeft"
                value={form.vehicle_type_id || undefined}
                onChange={handleVehicleTypeChange}
                options={vehicleTypes.map((type) => ({
                  value: String(type.vehicle_type_id),
                  label: `${type.type_name}`,
                }))}
              />
            </DrawerField>

            <ModalInput
              label="Control No."
              required
              error={errors.control_number}
              icon={IoDocumentTextOutline}
              value={form.control_number}
              onChange={(event) => {
                const nextValue = String(event.target.value || "").replace(/\D/g, "").slice(0, 6);
                setForm((current) => ({ ...current, control_number: nextValue }));
                setErrors((current) => ({ ...current, control_number: "" }));
              }}
              placeholder="Enter control no."
            />

            <ModalInput
              label="Plate Number"
              required
              error={errors.plate_number}
              icon={IoPricetagOutline}
              value={form.plate_number}
              onChange={(event) => {
                setForm((current) => ({ ...current, plate_number: event.target.value }));
                setErrors((current) => ({ ...current, plate_number: "" }));
              }}
              placeholder="Enter plate number"
            />

            <ModalInput
              label="Driver Name"
              required
              error={errors.driver_name}
              icon={IoPersonOutline}
              value={form.driver_name}
              onChange={(event) => {
                setForm((current) => ({ ...current, driver_name: event.target.value }));
                setErrors((current) => ({ ...current, driver_name: "" }));
              }}
              placeholder="Enter driver name"
            />
          </>
        ) : isDailyAnnualShortcut ? (
          <>
            <DrawerField label="Control No." required error={errors.control_number}>
              <FilterSelect
                width="100%"
                height={46}
                showSearch
                placeholder="Select control no."
                optionFilterProp="label"
                optionLabelProp="value"
                getPopupContainer={() => document.body}
                placement="bottomLeft"
                value={form.control_number || undefined}
                onChange={handleAnnualShortcutControlNumberChange}
                options={annualShortcutOptions.map((ticket) => ({
                  value: String(ticket.control_number),
                  label: `${ticket.control_number}`,
                }))}
              />
            </DrawerField>

            <ModalInput
              label="Vehicle Type"
              required
              icon={IoCarOutline}
              value={selectedVehicleType?.type_name || selectedVehicleType?.typeName || ""}
              readOnly
              disabled
              placeholder="Auto-filled from control no."
              inputStyle={{ color: selectedVehicleType ? "#0d1117" : "#94a3b8" }}
            />
          </>
        ) : (
          <>
            <DrawerField label="Plate Number" error={errors.plate_number}>
              <FilterSelect
                width="100%"
                height={46}
                showSearch
                allowClear
                loading={isLookupsLoading}
                placeholder="Select annual vehicle plate no."
                optionFilterProp="label"
                optionLabelProp="label"
                getPopupContainer={() => document.body}
                placement="bottomLeft"
                value={form.control_number || undefined}
                onChange={handleAnnualShortcutPlateNumberChange}
                options={annualShortcutOptions.map((ticket) => ({
                  value: String(ticket.control_number),
                  label: `${ticket.plate_number || "-"}`,
                }))}
              />
            </DrawerField>

            <DrawerField label="Vehicle Type" required error={errors.vehicle_type_id}>
              <FilterSelect
                width="100%"
                height={46}
                showSearch
                loading={isLookupsLoading}
                placeholder="Select vehicle type"
                optionFilterProp="label"
                optionLabelProp="label"
                getPopupContainer={() => document.body}
                placement="bottomLeft"
                value={form.vehicle_type_id || undefined}
                onChange={handleVehicleTypeChange}
                onSelect={handleVehicleTypeChange}
                disabled={isVehicleTypeReadOnly}
                options={vehicleTypes.map((type) => ({
                  value: String(type.vehicle_type_id),
                  label: `${type.type_name}`,
                }))}
              />
            </DrawerField>
          </>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>
              Applicable Fee <span className="text-red-500">*</span>
            </label>
          </div>

          {isAnnualTicket ? (
            <>
              <div className={errors.fee_id || errors.fee_item_0 ? "modal-field-control-error" : ""}>
                <FilterSelect
                  className="annual-fee-readonly"
                  width="100%"
                  height={46}
                  showSearch={false}
                  placeholder="Select an active fee"
                  optionFilterProp="label"
                  optionLabelProp="label"
                  getPopupContainer={() => document.body}
                  placement="bottomLeft"
                  value={feeItems[0]?.fee_id || undefined}
                  open={false}
                  suffixIcon={null}
                  onMouseDown={(event) => event.preventDefault()}
                  placeholder={form.vehicle_type_id ? "Select an active fee" : "Select vehicle type first"}
                  onChange={(value) => {
                    setFeeItems((current) => [{ ...current[0], fee_id: value ?? "", quantity: current[0]?.quantity || "1" }]);
                    setErrors((current) => ({
                      ...current,
                      fee_id: "",
                      fee_item_0: "",
                      ticket_fee: "",
                    }));
                  }}
                  options={applicableFees.map((fee) => ({
                    value: String(fee.fee_id),
                    label: formatMoney(fee.amount),
                  }))}
                />
              </div>
              {errors.fee_id ? (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                  <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
                  <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>
                    {errors.fee_id}
                  </p>
                </div>
              ) : null}

              <div className="mt-5">
                <ModalInput
                  label="Official Receipt No."
                  error={errors.official_receipt_no}
                  icon={IoDocumentTextOutline}
                  value={form.official_receipt_no}
                  onChange={(event) => {
                    const nextValue = String(event.target.value || "").replace(/\D/g, "").slice(0, 6);
                    setForm((current) => ({ ...current, official_receipt_no: nextValue }));
                    setErrors((current) => ({ ...current, official_receipt_no: "" }));
                  }}
                  placeholder="Enter official receipt no."
                />
              </div>
            </>
          ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div
              className="mb-2 grid items-center gap-2 px-1"
              style={{ gridTemplateColumns: "minmax(0,2.8fr) minmax(72px,0.7fr) minmax(120px,1fr) 36px" }}
            >
              <p className="m-0 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>DAILY TICKET</p>
              <p className="m-0 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>Qty</p>
              <p className="m-0 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>Subtotal</p>
              <span />
            </div>

            {[
              feeItems.find((item) => item.row_type === "daily") ?? { fee_id: "", quantity: "1", row_type: "daily" },
              feeItems.find((item) => item.row_type === "banyera") ?? { fee_id: "", quantity: "1", row_type: "banyera" },
            ].map((item, index) => {
              const selectedItemFee = fees.find((fee) => String(fee.fee_id) === String(item.fee_id));
              const quantity = Number.parseInt(item.quantity || "0", 10) || 0;
              const subtotal = Number(selectedItemFee?.amount || 0) * quantity;
              const selectedRowFee = item.fee_id
                ? fees.find((fee) => String(fee.fee_id) === String(item.fee_id))
                : null;
              const rowType = item.row_type || (index === 0 ? "daily" : "banyera");
              const isZeroedDailyRow = isAnnualRegisteredDailyEntry && rowType === "daily";
              const rowFeesBase = applicableFees.filter((fee) => {
                const feeTypeName = getFeeTypeName(fee);
                return rowType === "banyera"
                  ? feeTypeName === "banyera"
                  : feeTypeName === "vehicle ticket daily";
              });
              const rowFees = selectedRowFee && !rowFeesBase.some((fee) => String(fee.fee_id) === String(selectedRowFee.fee_id))
                ? [...rowFeesBase, selectedRowFee]
                : rowFeesBase;
              const showRowLabel = rowType === "banyera";

              return (
                <div
                  key={`fee-item-${index}`}
                  className="mb-2 grid items-start gap-2 last:mb-0"
                  style={{ gridTemplateColumns: "minmax(0,2.8fr) minmax(72px,0.7fr) minmax(120px,1fr) 36px" }}
                >
                  <div>
                    {showRowLabel ? (
                      <p className="mb-1 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>
                        BANYERA TICKET
                      </p>
                    ) : null}
                    <input
                      type="text"
                      readOnly
                      value={selectedItemFee ? formatMoney(selectedItemFee.amount) : isZeroedDailyRow ? formatMoney(0) : ""}
                      placeholder="₱0.00"
                      className="h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-medium outline-none"
                      style={{ color: selectedItemFee || isZeroedDailyRow ? "#0d1117" : "#94a3b8", fontFamily: FONT }}
                    />
                  </div>

                  <div className={showRowLabel ? "pt-[18px]" : ""}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(event) => handleFeeItemQuantityChange(rowType, event.target.value)}
                      placeholder="0"
                      className="h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-[12px] outline-none"
                      style={{ fontFamily: FONT }}
                    />
                    {errors[`fee_qty_${index}`] ? (
                      <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                        <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
                        <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>
                          {errors[`fee_qty_${index}`]}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className={showRowLabel ? "pt-[18px]" : ""}>
                    <input
                      type="text"
                      readOnly
                      value={item.fee_id || item.quantity || isZeroedDailyRow ? `₱${formatMoneyValue(subtotal)}` : "₱0.00"}
                      placeholder="₱0.00"
                      className="h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-medium outline-none"
                      style={{ color: item.fee_id || item.quantity || isZeroedDailyRow ? "#0d1117" : "#94a3b8", fontFamily: FONT }}
                    />
                  </div>

                  <div>
                    {showRowLabel ? <div className="mb-1 h-[13px]" /> : null}
                    <div className="flex h-[46px] items-center justify-center">
                      {item.fee_id && !isZeroedDailyRow ? (
                        <button
                          type="button"
                          onClick={() => handleFeeItemRemove(rowType)}
                          className="text-red-500 transition-colors hover:text-red-600"
                          aria-label={`Remove ${rowType} fee`}
                        >
                          <IoTrashOutline className="text-[22px]" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
          )}

          {!isAnnualTicket && errors.fee_id ? (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
              <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
              <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>
                {errors.fee_id}
              </p>
            </div>
          ) : null}
        </div>

        <DrawerField label="Ticket Date" required error={errors.ticket_date}>
          <DatePicker
            value={buildDateFromParts(form.ticket_date_year, form.ticket_date_month, form.ticket_date_day)}
            onChange={(_, currentDateString) => {
              const [year = "", month = "", day = ""] = String(currentDateString || "").split("-");
              setForm((current) =>
                syncAnnualEndDate(
                  {
                    ...current,
                    ticket_date: currentDateString || "",
                    ticket_date_year: year,
                    ticket_date_month: month,
                    ticket_date_day: day,
                  },
                  isAnnualTicket
                )
              );
              setErrors((current) => ({ ...current, ticket_date: "" }));
            }}
            placeholder="Select ticket date"
            containerClassName="w-full"
            inputClassName={errors.ticket_date ? "border-red-300" : "border-slate-200"}
            options={{ maxDate: "today" }}
          />
        </DrawerField>

        {isAnnualTicket ? (
          // End date auto-calculated and shown as a labeled, read-only input
          <ModalInput
            label="End Date"
            error={errors.end_date}
            icon={IoCalendarOutline}
            value={(function () {
              const built = buildDateFromParts(form.ticket_date_year, form.ticket_date_month, form.ticket_date_day);
              const next = addOneYearToDateString(built);
              return next ? formatDisplayDate(next) : "";
            })()}
            readOnly
            disabled
            inputStyle={{ color: "#64748b" }}
          />
        ) : null}

        <ModalInput
          label="Ticket Fee"
          required
          icon={IoCashOutline}
          readOnly
          disabled={isEditingAnnualTicket}
          value={form.ticket_fee ? formatMoney(form.ticket_fee) : ""}
          placeholder="₱0.00"
          inputStyle={{ color: isEditingAnnualTicket ? "#64748b" : Number(form.ticket_fee || 0) > 0 ? "#0d1117" : "#94a3b8" }}
        />
      </div>
    </Modal>
  );
};

const AddVehicleTypeDrawer = ({ open, onClose, form, setForm, setErrors, errors, onSave, saving, isEditing = false }) => {
  if (!open) return null;

  return (
    <Modal
      title={isEditing ? "Edit Vehicle Type" : "Add Vehicle Type"}
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      saveLabel={isEditing ? "Save" : "Add"}
      closeOnBackdrop
      maxWidth="560px"
    >
      <ModalInput
        label="Vehicle Type Name"
        required
        error={errors.type_name}
        icon={IoCarOutline}
        value={form.type_name}
        onChange={(event) => {
          setForm({ type_name: event.target.value });
          setErrors((current) => ({ ...current, type_name: undefined }));
        }}
        placeholder="Enter vehicle type name"
      />
    </Modal>
  );
};

const VehicleTypeDetailsDrawer = ({ type, open, onClose }) => {
  if (!open || !type) return null;

  const createdByName = (() => {
    const name = String(type.createdByName || type.created_by_name || type.createdBy?.full_name || "").trim();
    if (name) return name;
    const email = String(type.createdByEmail || type.created_by_email || type.createdBy?.email || "").trim();
    return email || "-";
  })();

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={460}
      fontFamily={FONT}
      title="Vehicle Type Details"
      subtitle="Review the selected vehicle type record."
      icon={IoCarOutline}
    >
      <DrawerSection
        icon={IoCarOutline}
        title="Vehicle Type Info"
        subtitle="Details for this vehicle type"
        fontFamily={FONT}
      >
        <div className="grid grid-cols-1 gap-3">
          <DrawerInfoCard label="Vehicle Type" value={type.typeName || "-"} />
          <DrawerInfoCard
            label="Usage Count - Daily (Yearly)"
            value={formatUsageCountLabel(type.dailyTicketsUsing)}
          />
          <DrawerInfoCard
            label="Usage Count - Annual (Yearly)"
            value={formatUsageCountLabel(type.annualTicketsUsing)}
          />
        </div>
      </DrawerSection>

      <DrawerSection
        icon={IoCalendarOutline}
        title="Created Details"
        subtitle="Record creation information"
        fontFamily={FONT}
      >
        <div className="grid grid-cols-1 gap-3">
          <DrawerInfoCard label="Created By" value={createdByName} />
          <DrawerInfoCard label="Date Added" value={type.createdAt || "-"} />
        </div>
      </DrawerSection>
    </DetailDrawer>
  );
};

const VehicleTicketDetailDrawer = ({ ticket, fees, open, onClose }) => {
  if (!open || !ticket) return null;

  const feeBreakdown = getDailyTicketFeeBreakdown(ticket, fees ?? []);
  const detailPairs =
    ticket.ticketType === "Daily"
      ? [
          { label: "Ticket Date", value: ticket.ticketDate || "-" },
          { label: "Ticket Fee", value: `₱${formatMoneyValue(ticket.ticketFee)}` },
          { label: "Inspector", value: ticket.encodedBy || "-", className: "col-span-2" },
        ]
      : [
          { label: "Control No.", value: ticket.controlNumber || "-" },
          { label: "Ticket Date", value: ticket.ticketDate || "-" },
          { label: "Ticket Fee", value: `₱${formatMoneyValue(ticket.ticketFee)}` },
          { label: "Received By", value: ticket.encodedBy || "-" },
        ];

  if (ticket.ticketType === "Annual") {
    // Insert Plate Number right after Control No.
    detailPairs.splice(1, 0, { label: "Plate Number", value: ticket.plateNumber || "-" });

    // Insert Driver Name and Official Receipt No. to follow Plate Number
    detailPairs.splice(2, 0, { label: "Driver Name", value: ticket.driverName || "-" }, { label: "Official Receipt No.", value: ticket.officialReceiptNo || "-" });

    // Insert End Date right after Ticket Date
    const ticketDateIndex = detailPairs.findIndex((p) => p.label === "Ticket Date");
    if (ticketDateIndex !== -1) {
      detailPairs.splice(ticketDateIndex + 1, 0, { label: "End Date", value: ticket.endDate || "-" });
    } else {
      detailPairs.push({ label: "End Date", value: ticket.endDate || "-" });
    }

    // Ensure Received By is immediately after Ticket Fee
    const feeIndex = detailPairs.findIndex((p) => p.label === "Ticket Fee");
    if (feeIndex !== -1) {
      // remove any existing Received By entry
      const existingReceivedIndex = detailPairs.findIndex((p) => p.label === "Received By");
      let receivedPair = { label: "Received By", value: ticket.encodedBy || "-" };
      if (existingReceivedIndex !== -1) {
        // if existing is before feeIndex, removing shifts feeIndex left; adjust accordingly
        detailPairs.splice(existingReceivedIndex, 1);
      }
      // insert after feeIndex (which may have shifted after splice)
      const newFeeIndex = detailPairs.findIndex((p) => p.label === "Ticket Fee");
      detailPairs.splice(newFeeIndex + 1, 0, receivedPair);
    }
  }

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={460}
      fontFamily={FONT}
      title="Vehicle Ticket Details"
      subtitle="Review the selected vehicle ticket record."
      icon={IoCarOutline}
    >
      <DrawerSection
        icon={IoDocumentTextOutline}
        title="Ticket Information"
        subtitle="Recorded details for this vehicle ticket"
        fontFamily={FONT}
      >
        <DrawerInfoCard label="Vehicle Type" value={ticket.vehicleTypeName} className="mb-3" />
        <DrawerInfoCard
          label="Status"
          value={ticket.isVoided ? "Voided" : "Active"}
          indicatorColor={VEHICLE_TICKET_TYPE_LEGEND.find((item) => item.key === (ticket.isVoided ? "voided" : "active"))?.color}
          className="mb-3"
        />
        <div className="grid grid-cols-2 gap-3">
          {detailPairs.map(({ label, value, className }) => (
            <DrawerInfoCard key={label} label={label} value={value} className={className} />
          ))}
        </div>
      </DrawerSection>

      {ticket.ticketType === "Daily" ? (
        <DrawerSection
          icon={IoCashOutline}
          title="Fee Breakdown"
          subtitle="Applied fees for this daily ticket"
          fontFamily={FONT}
        >
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#1a1f36]">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase" style={{ color: "#FFFFFF" }}>Fee Type</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase" style={{ color: "#FFFFFF" }}>Amount (₱)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200 bg-white">
                  <td className="px-3 py-2.5 text-[12px] text-slate-700">Daily Ticket</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-700 font-semibold text-right">{formatMoneyValue(feeBreakdown.dailyFee)}</td>
                </tr>
                <tr className="border-b border-gray-200 bg-slate-50/50">
                  <td className="px-3 py-2.5 text-[12px] text-slate-700">Banyera</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-700 font-semibold text-right">
                    {formatMoneyValue(feeBreakdown.banyeraFee)}
                  </td>
                </tr>
                <tr className="bg-white">
                  <td className="px-3 py-2.5 text-[12px] text-slate-700 font-semibold uppercase">TOTAL FEE</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-700 font-semibold text-right">{formatMoneyValue(feeBreakdown.totalFee)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </DrawerSection>
      ) : null}
      {ticket.isVoided ? (
        <DrawerSection
          icon={IoAlertCircleOutline}
          title="Void Details"
          subtitle="Reason and personnel for this voided vehicle ticket"
          fontFamily={FONT}
        >
          <div className="grid grid-cols-2 gap-3">
            <DrawerInfoCard label="Void Reason" value={ticket.voidReason || "-"} className="col-span-2" />
            <DrawerInfoCard label="Voided By" value={ticket.voidedBy || "-"} className="col-span-2" />
          </div>
        </DrawerSection>
      ) : null}
    </DetailDrawer>
  );
};

const SuperVehicleTickets = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const queryClient = useQueryClient();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const { transactionLock, isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();

  const initialActiveTab = getVehicleTicketTabFromLocation({
    highlightedSearchResult,
    pathname: location.pathname,
    search: location.search,
  });

  const [activeItem, setActiveItem] = useState("Vehicle Tickets");
  const [contentMargin, setContentMargin] = useState(() => (window.innerWidth >= 1024 ? 256 : 0));
  const [search, setSearch] = useState("");
  const [typeSearch, setTypeSearch] = useState("");
  const [typeUsageFilter, setTypeUsageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ticketPeriodFilter, setTicketPeriodFilter] = useState("all");
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const breadcrumbLabel = activeTab === "daily" ? "Daily Vehicle Tickets" : activeTab === "annual" ? "Annual Vehicle Tickets" : "Vehicle Types";
  const [requestedPage, setRequestedPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [typesPage, setTypesPage] = useState(1);
  const typePage = typesPage;
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showAddVehicleTypeDrawer, setShowAddVehicleTypeDrawer] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);
  const [editingTicket, setEditingTicket] = useState(null);
  const [editingVehicleType, setEditingVehicleType] = useState(null);
  const [vehicleTypeForm, setVehicleTypeForm] = useState(getInitialVehicleTypeForm());
  const [vehicleTypeErrors, setVehicleTypeErrors] = useState({});
  const [deletingVehicleTypeId, setDeletingVehicleTypeId] = useState(null);
  const [deletingTicketId, setDeletingTicketId] = useState(null);
  const [pendingVoidTicket, setPendingVoidTicket] = useState(null);
  const [voidReasonOption, setVoidReasonOption] = useState("");
  const [voidReasonCustom, setVoidReasonCustom] = useState("");
  const [voidReasonError, setVoidReasonError] = useState("");
  const [pendingDeleteVehicleType, setPendingDeleteVehicleType] = useState(null);
  const [detailVehicleType, setDetailVehicleType] = useState(null);

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const debouncedTypeSearch = useDebouncedValue(typeSearch, SEARCH_DEBOUNCE_MS);
  const rawHighlightedTicketId = getVehicleTicketHighlightId({ highlightedSearchResult, search: location.search });
  const rawHighlightedVehicleTypeId = getVehicleTypeHighlightId({ highlightedSearchResult, search: location.search });
  const highlightToken = rawHighlightedTicketId
    ? `${rawHighlightedTicketId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : rawHighlightedVehicleTypeId
      ? `${rawHighlightedVehicleTypeId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedTicketId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedTicketId;
  const highlightedVehicleTypeId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedVehicleTypeId;
  const clearUniversalHighlight = React.useCallback((nextTab = "") => {
    const params = new URLSearchParams(location.search);
    const hadHighlight = params.delete("highlight");
    const targetPath = VEHICLE_TICKET_TABS.has(nextTab) ? getVehicleTicketTabPath(nextTab) : location.pathname;

    params.delete("tab");

    if (!highlightedSearchResult && !hadHighlight && targetPath === location.pathname) return;

    if (highlightToken) {
      setDismissedHighlightToken(highlightToken);
    }

    const nextSearch = params.toString();
    navigate(
      {
        pathname: targetPath,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: targetPath === location.pathname, state: null }
    );
  }, [highlightToken, highlightedSearchResult, location.pathname, location.search, navigate]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryTab = params.get("tab");
    const queryTabPath = VEHICLE_TICKET_TAB_PATHS[queryTab];

    if (queryTabPath) {
      params.delete("tab");
      const nextSearch = params.toString();
      navigate(
        {
          pathname: queryTabPath,
          search: nextSearch ? `?${nextSearch}` : "",
        },
        { replace: true, state: location.state }
      );
      return;
    }

    if (location.pathname === "/vehicle-tickets") {
      navigate(
        {
          pathname: getVehicleTicketTabPath("daily"),
          search: location.search,
        },
        { replace: true, state: location.state }
      );
    }
  }, [location.pathname, location.search, location.state, navigate]);
  useEffect(() => {
    setDismissedHighlightToken("");
  }, [location.key]);
  const ticketTypeFilter = activeTab === "daily" || activeTab === "annual" ? activeTab : "all";
  const lookupsQuery = useVehicleTicketsLookupsQuery({
    enabled: showAddDrawer || Boolean(editingTicket),
  });
  const vehicleTypesQuery = useVehicleTypesDataQuery({
    page: typePage,
    perPage: PAGE_SIZE,
    search: highlightedVehicleTypeId ? "" : debouncedTypeSearch,
    status: typeUsageFilter,
    highlightVehicleTypeId: highlightedVehicleTypeId,
  }, {
    enabled: activeTab === "types" || Boolean(highlightedVehicleTypeId),
  });
  const { data, isLoading, isFetching, isError } = useVehicleTicketsDataQuery({
    page: currentPage,
    perPage: PAGE_SIZE,
    search: debouncedSearch,
    status: statusFilter,
    period: ticketPeriodFilter,
    vehicleType: "all",
    ticketType: ticketTypeFilter,
    highlightTicketId: highlightedTicketId,
    filters: {
      status: statusFilter,
      period: ticketPeriodFilter,
      vehicleType: "all",
      ticketType: ticketTypeFilter,
      highlightTicketId: highlightedTicketId,
    },
    sort: "latest",
    paginated: true,
    includeStats: true,
  }, {
    enabled: activeTab !== "types",
  });
  const annualVehicleTicketsQuery = useVehicleTicketsDataQuery({
    perPage: 100,
    status: "active",
    period: "all",
    vehicleType: "all",
    ticketType: "annual",
    sort: "latest",
    paginated: false,
    includeStats: false,
  }, {
    enabled: showAddDrawer && activeTab === "daily" && !editingTicket,
  });

  const rawTickets = data?.tickets ?? [];
  const annualVehicleTickets = annualVehicleTicketsQuery.data?.tickets ?? [];
  const ticketsMeta = data?.ticketsMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const ticketStats = data?.stats ?? {
    annual_tickets: 0,
    daily_tickets: 0,
    daily_tickets_today: 0,
    today_collections: 0,
  };
  const rawVehicleTypes = sortVehicleTypesByCreatedAt(
    lookupsQuery.data?.vehicleTypes ?? vehicleTypesQuery.data?.vehicleTypes ?? []
  );
  const rawVehicleTypeRows = sortVehicleTypesByCreatedAt(vehicleTypesQuery.data?.vehicleTypes ?? []);
  const vehicleTypesMeta = vehicleTypesQuery.data?.vehicleTypesMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const vehicleTypesSummary = vehicleTypesQuery.data?.vehicleTypesSummary ?? {
    total: 0,
    used: 0,
    unused: 0,
  };
  const fees = lookupsQuery.data?.fees ?? [];
  const resetTicketPage = () => {
    setRequestedPage(1);
    setCurrentPage(1);
  };
  const vehicleFees = useMemo(() => {
    const matchedVehicleFees = fees.filter((fee) => isVehicleFee(fee));
    return matchedVehicleFees.length > 0 ? matchedVehicleFees : fees;
  }, [fees]);
  const tickets = useMemo(() => rawTickets.map(normalizeTicket), [rawTickets]);
  const vehicleTypes = useMemo(
    () =>
      rawVehicleTypes.map((type) => {
        const normalized = normalizeVehicleType(type);
        const dailyTicketsUsing = Number(type.daily_tickets_using ?? 0);
        const annualTicketsUsing = Number(type.annual_tickets_using ?? 0);

        return {
          ...normalized,
          dailyTicketsUsing,
          annualTicketsUsing,
        };
      }),
    [rawVehicleTypes]
  );
  const vehicleTypeRows = useMemo(
    () =>
      rawVehicleTypeRows.map((type) => {
        const normalized = normalizeVehicleType(type);
        const dailyTicketsUsing = Number(type.daily_tickets_using ?? 0);
        const annualTicketsUsing = Number(type.annual_tickets_using ?? 0);

        return {
          ...normalized,
          dailyTicketsUsing,
          annualTicketsUsing,
        };
      }),
    [rawVehicleTypeRows]
  );
  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) {
      setContentMargin(sidebarCollapsed ? 72 : 256);
    } else if (window.innerWidth < 1024) {
      setContentMargin(0);
    }
  }, [sidebarCollapsed, sidebarOpen]);

  useEffect(() => {
    resetTicketPage();
  }, [debouncedSearch, statusFilter, ticketPeriodFilter, activeTab]);

  useEffect(() => {
    setTypesPage(1);
  }, [debouncedTypeSearch, typeUsageFilter]);

  useEffect(() => {
    let nextTab = "";
    if (highlightedSearchResult?.group === "Daily Vehicle Tickets") {
      nextTab = "daily";
    } else if (highlightedSearchResult?.group === "Annual Vehicle Tickets") {
      nextTab = "annual";
    } else if (isVehicleTypeSearchGroup(highlightedSearchResult?.group)) {
      nextTab = "types";
    }

    if (!nextTab) return;

    setActiveTab(nextTab);
    const nextPath = getVehicleTicketTabPath(nextTab);
    if (location.pathname !== nextPath) {
      navigate(
        {
          pathname: nextPath,
          search: location.search,
        },
        { replace: true, state: location.state }
      );
    }
  }, [highlightedSearchResult?.group, location.pathname, location.search, location.state, navigate]);

  const getVehicleTicketQueryType = (query) => {
    const queryKey = query?.queryKey;
    if (!Array.isArray(queryKey) || queryKey.length < 2) return "";

    const filters = queryKey[1] ?? {};
    return String(filters?.ticketType ?? filters?.filters?.ticketType ?? "").toLowerCase();
  };

  const getTicketRecordType = (ticket) => {
    return String(ticket?.ticket_type ?? ticket?.ticketType ?? "").toLowerCase() === "annual" ? "annual" : "daily";
  };

  const upsertTicketInCache = (nextTicket) => {
    if (!nextTicket?.ticket_id) return;

    const targetTicketType = getTicketRecordType(nextTicket);

    queryClient.setQueriesData(
      {
        queryKey: ["vehicle-tickets-data"],
        predicate: (query) => getVehicleTicketQueryType(query) === targetTicketType,
      },
      (previous) => {
        if (!previous?.tickets) return previous;

        return {
          ...previous,
          tickets: upsertVehicleTicketRecord(previous.tickets, nextTicket),
        };
      }
    );
  };

  const removeVehicleTypeFromCache = (id) => {
    queryClient.setQueriesData({ queryKey: ["vehicle-tickets-data", "vehicle-types"] }, (previous) => {
      if (!previous?.vehicleTypes) return previous;

      const nextVehicleTypes = (previous.vehicleTypes ?? []).filter(
        (type) => String(type?.vehicle_type_id ?? "") !== String(id)
      );

      if (nextVehicleTypes.length === (previous.vehicleTypes ?? []).length) {
        return previous;
      }

      return {
        ...previous,
        vehicleTypes: nextVehicleTypes,
        vehicleTypesMeta: previous.vehicleTypesMeta
          ? {
              ...previous.vehicleTypesMeta,
              total: Math.max(0, Number(previous.vehicleTypesMeta.total ?? 0) - 1),
            }
          : previous.vehicleTypesMeta,
      };
    });

    queryClient.setQueryData(["vehicle-tickets-lookups"], (previous) =>
      previous
        ? {
            ...previous,
            vehicleTypes: (previous.vehicleTypes ?? []).filter(
              (type) => String(type?.vehicle_type_id ?? "") !== String(id)
            ),
          }
        : previous
    );
  };

  const invalidateVehicleTicketCaches = ({ ticketType, includeVehicleTypes = true, includeLookups = true } = {}) => {
    void queryClient.invalidateQueries({
      queryKey: ["vehicle-tickets-data"],
      predicate: (query) => {
        if (!ticketType) return true;
        return getVehicleTicketQueryType(query) === ticketType;
      },
      refetchType: "active",
    });

    if (includeVehicleTypes) {
      void queryClient.invalidateQueries({ queryKey: ["vehicle-tickets-data", "vehicle-types"], refetchType: "active" });
    }

    if (includeLookups) {
      void queryClient.invalidateQueries({ queryKey: ["vehicle-tickets-lookups"], refetchType: "active" });
    }
  };

  const createTicketMutation = useMutation({
    mutationFn: async (payload) => {
      if (isTransactionLocked || isLockedTicketDate(payload?.ticket_date)) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.post("/vehicle-tickets", payload);
      return response.data;
    },
    onSuccess: (savedTicket) => {
      upsertTicketInCache(savedTicket);
      updateVehicleTicketStatsInCache(queryClient, savedTicket, "add");
      syncVehicleTypeUsageInCache(queryClient, savedTicket);
      setShowAddDrawer(false);
      setEditingTicket(null);
      showAddedToast("Vehicle Ticket", "vehicle ticket");
      invalidateVehicleTicketCaches({ ticketType: getTicketRecordType(savedTicket), includeVehicleTypes: false, includeLookups: false });
    },
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      if (isTransactionLocked || isLockedTicketDate(payload?.ticket_date)) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.put(`/vehicle-tickets/${id}`, payload);
      return response.data;
    },
    onSuccess: (savedTicket) => {
      upsertTicketInCache(savedTicket);
      updateVehicleTicketStatsInCache(queryClient, savedTicket, "add");
      syncVehicleTypeUsageInCache(queryClient, savedTicket);
      setShowAddDrawer(false);
      setEditingTicket(null);
      showUpdatedToast("Vehicle Ticket", "vehicle ticket");
      invalidateVehicleTicketCaches({ ticketType: getTicketRecordType(savedTicket), includeVehicleTypes: false, includeLookups: false });
    },
  });

  const createVehicleTypeMutation = useMutation({
    mutationFn: async (payload) => {
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.post("/vehicle-types", payload);
      return response.data;
    },
    onSuccess: () => {
      setShowAddVehicleTypeDrawer(false);
      setVehicleTypeForm(getInitialVehicleTypeForm());
      setVehicleTypeErrors({});
      setActiveTab("types");
      navigate(getVehicleTicketTabPath("types"), { replace: location.pathname === getVehicleTicketTabPath("types"), state: null });
      showAddedToast("Vehicle Type", "vehicle type");
      invalidateVehicleTicketCaches();
    },
    onError: (error) => {
      const backendErrors = error.response?.data?.errors;
      if (backendErrors) {
        setVehicleTypeErrors({
          type_name: backendErrors.type_name?.[0],
        });
      }
      showBottomToast("error", "Save Failed", error.response?.data?.message ?? "Unable to save vehicle type.");
    },
  });

  const updateVehicleTypeMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.put(`/vehicle-types/${id}`, payload);
      return response.data;
    },
    onSuccess: () => {
      setShowAddVehicleTypeDrawer(false);
      setVehicleTypeForm(getInitialVehicleTypeForm());
      setVehicleTypeErrors({});
      setEditingVehicleType(null);
      setActiveTab("types");
      navigate(getVehicleTicketTabPath("types"), { replace: location.pathname === getVehicleTicketTabPath("types"), state: null });
      showUpdatedToast("Vehicle Type", "vehicle type");
      invalidateVehicleTicketCaches();
    },
    onError: (error) => {
      const backendErrors = error.response?.data?.errors;
      if (backendErrors) {
        setVehicleTypeErrors({
          type_name: backendErrors.type_name?.[0],
        });
      }
      showBottomToast("error", "Update Failed", error.response?.data?.message ?? "Unable to update vehicle type.");
    },
  });

  const archiveVehicleTypeMutation = useMutation({
    mutationFn: async (id) => {
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.patch(`/vehicle-types/${id}/archive`);
      return response.data;
    },
    onSuccess: (archivedVehicleType, id) => {
      showBottomToast("success", "Vehicle Type Archived", "The vehicle type was archived successfully.");
      upsertArchiveItemInDataCache(
        queryClient,
        archivedVehicleType || { vehicle_type_id: id },
        "vehicleTypes"
      );
      removeVehicleTypeFromCache(id);
      invalidateVehicleTicketCaches();
    },
    onError: (error) => {
      showBottomToast("error", "Archive Failed", error.response?.data?.message ?? "Unable to archive the vehicle type.");
    },
    onSettled: () => setDeletingVehicleTypeId(null),
  });

  const voidTicketMutation = useMutation({
    mutationFn: async ({ id, void_reason }) => {
      const ticket = tickets.find((entry) => String(entry.id) === String(id));
      if (isTransactionLocked || isLockedTicketDate(ticket?.rawTicketDate)) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.patch(`/vehicle-tickets/${id}/void`, { void_reason });
      return response.data;
    },
    onSuccess: (response) => {
      if (response?.ticket) {
        upsertTicketInCache(response.ticket);
        updateVehicleTicketStatsInCache(queryClient, response.ticket, "add");
        syncVehicleTypeUsageInCache(queryClient, response.ticket);
      }
      showBottomToast("success", "Ticket Voided", "The vehicle ticket was voided successfully.");
      invalidateVehicleTicketCaches();
      void queryClient.invalidateQueries({ queryKey: ["dashboard-data"], refetchType: "active" });
    },
    onError: (error) => {
      showBottomToast("error", "Void Failed", error.response?.data?.message ?? "Unable to void the vehicle ticket.");
    },
    onSettled: () => setDeletingTicketId(null),
  });

  const restoreVoidedTicketMutation = useMutation({
    mutationFn: async (id) => {
      const ticket = tickets.find((entry) => String(entry.id) === String(id));
      if (isTransactionLocked || isLockedTicketDate(ticket?.rawTicketDate)) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.patch(`/vehicle-tickets/${id}/unvoid`);
      return response.data;
    },
    onSuccess: (response) => {
      if (response?.ticket) {
        upsertTicketInCache(response.ticket);
        updateVehicleTicketStatsInCache(queryClient, response.ticket, "add");
        syncVehicleTypeUsageInCache(queryClient, response.ticket);
      }
      showBottomToast("success", "Ticket Restored", "The voided vehicle ticket was restored successfully.");
      invalidateVehicleTicketCaches();
      void queryClient.invalidateQueries({ queryKey: ["dashboard-data"], refetchType: "active" });
    },
    onError: (error) => {
      showBottomToast("error", "Restore Failed", error.response?.data?.message ?? "Unable to restore the voided vehicle ticket.");
    },
    onSettled: () => setDeletingTicketId(null),
  });

  const filteredTickets = tickets;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearch(highlightedSearchResult ? "" : params.get("q") || "");
    setTypeSearch(highlightedSearchResult ? "" : params.get("typeQ") || "");
    setActiveTab(getVehicleTicketTabFromLocation({ highlightedSearchResult, pathname: location.pathname, search: location.search }));
    if (params.get("highlight")?.startsWith("ticket-")) {
      setRequestedPage(1);
      setCurrentPage(1);
    }
    if (params.get("highlight")?.startsWith("vehicle-type-")) {
      setActiveTab("types");
      if (location.pathname !== getVehicleTicketTabPath("types")) {
        navigate(
          {
            pathname: getVehicleTicketTabPath("types"),
            search: location.search,
          },
          { replace: true, state: location.state }
        );
      }
      setTypeSearch("");
      setTypesPage(1);
    }
  }, [highlightedSearchResult, location.pathname, location.search, location.state, navigate]);

  const filteredVehicleTypes = useMemo(() => {
    return vehicleTypeRows;
  }, [vehicleTypeRows]);

  const totalPages = Math.max(1, Number(ticketsMeta.last_page || 1));
  const safePage = Math.min(requestedPage, totalPages);
  const paginatedTickets = filteredTickets;
  const hasTicketResponse = Boolean(data?.ticketsMeta);
  const isTicketInitialLoading = !isError && isLoading && !data && !showAddDrawer && !editingTicket;
  const isTicketOverviewLoading = false;
  const requestTicketPage = (pageOrUpdater) => {
    void queryClient.cancelQueries({ queryKey: ["vehicle-tickets-data"] });

    const nextPage = typeof pageOrUpdater === "function"
      ? pageOrUpdater(requestedPage)
      : pageOrUpdater;
    const normalizedPage = Math.min(Math.max(1, Number(nextPage) || 1), totalPages);

    setRequestedPage(normalizedPage);
    setCurrentPage(normalizedPage);
  };
  const highlightedTicketIndex =
    highlightedTicketId
      ? filteredTickets.findIndex((ticket) => String(highlightedTicketId) === String(ticket.id))
      : -1;
  const highlightedVehicleTypeIndex =
    highlightedVehicleTypeId
      ? filteredVehicleTypes.findIndex((type) => String(highlightedVehicleTypeId) === String(type.id))
      : -1;

  useEffect(() => {
    if (highlightedTicketIndex < 0) return;
    setRequestedPage(safePage);
    setCurrentPage(safePage);
  }, [highlightedTicketIndex]);

  useEffect(() => {
    if (!highlightedTicketId) return;
    const resolvedPage = Number(ticketsMeta.current_page || 0);
    if (resolvedPage > 0 && (resolvedPage !== currentPage || resolvedPage !== requestedPage)) {
      setRequestedPage(resolvedPage);
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, highlightedTicketId, requestedPage, ticketsMeta.current_page]);

  useEffect(() => {
    if (highlightedVehicleTypeIndex < 0) return;
    setTypesPage(safeTypePage);
  }, [highlightedVehicleTypeIndex]);

  useEffect(() => {
    if (!highlightedVehicleTypeId) return;
    const resolvedPage = Number(vehicleTypesMeta.current_page || 0);
    if (resolvedPage > 0 && resolvedPage !== typePage) {
      setTypesPage(resolvedPage);
    }
  }, [highlightedVehicleTypeId, typePage, vehicleTypesMeta.current_page]);

  useEffect(() => {
    if (requestedPage === currentPage) return undefined;

    const timeout = window.setTimeout(() => {
      setCurrentPage(requestedPage);
    }, 140);

    return () => window.clearTimeout(timeout);
  }, [currentPage, requestedPage]);

  useEffect(() => {
    if (requestedPage <= totalPages) return;
    setRequestedPage(totalPages);
    setCurrentPage(totalPages);
  }, [requestedPage, totalPages]);

  const totalTypePages = Math.max(1, Number(vehicleTypesMeta.last_page || 1));
  const safeTypePage = Math.min(typePage, totalTypePages);
  const paginatedVehicleTypes = filteredVehicleTypes;
  const isVehicleTypesOverviewLoading = !lookupsQuery.data && lookupsQuery.isLoading;
  const hasVehicleTypesResponse = Boolean(vehicleTypesQuery.data?.vehicleTypesMeta);
  const isVehicleTypesInitialLoading =
    !vehicleTypesQuery.isError &&
    vehicleTypesQuery.isLoading &&
    !vehicleTypesQuery.data;
  const isOverviewLoading = activeTab === "types"
    ? (isVehicleTypesInitialLoading || !vehicleTypesQuery.data)
    : isTicketInitialLoading;
  const isActiveTabLoading = activeTab === "types" ? isVehicleTypesInitialLoading : isTicketInitialLoading;

  const todayManila = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const isLockedTicketDate = (value) =>
    Boolean(transactionLock?.date) && String(value || "").slice(0, 10) === transactionLock.date;
  const isDailyTicketEditableToday = (ticket) =>
    ticket?.ticketType !== "Daily" || String(ticket?.rawTicketDate || "").slice(0, 10) === todayManila;
  const isTodayDateLocked = transactionLock?.date === todayManila;
  const annualTickets = ticketStats.annual_tickets ?? 0;
  const dailyTickets = ticketStats.daily_tickets ?? 0;
  const dailyTicketsToday = ticketStats.daily_tickets_today ?? 0;
  const todayCollections = Number(
    ticketStats.today_collections ??
      (Number(ticketStats.daily_collections_today ?? 0) + Number(ticketStats.annual_collections_today ?? 0))
  );

  const vehicleTypesTotal = vehicleTypesSummary.total ?? vehicleTypes.length;
  const vehicleTypesInUse = vehicleTypesSummary.used ?? vehicleTypes.filter((type) => type.ticketsUsing > 0).length;
  const vehicleTypesNotInUse = vehicleTypesSummary.unused ?? Math.max(0, vehicleTypesTotal - vehicleTypesInUse);
  const totalTypeLinks = vehicleTypes.reduce((sum, type) => sum + type.ticketsUsing, 0);
  const isAnnualTicketsTab = activeTab === "annual";
  const ticketTableColumnCount = activeTab === "daily" ? 7 : 8;
  const drawerTicketType = editingTicket
    ? String(editingTicket.ticket_type || "").toLowerCase() === "annual"
      ? "annual"
      : "daily"
    : activeTab === "annual"
      ? "annual"
      : "daily";

  const openAddDrawer = () => {
    if (isTransactionLocked || isTodayDateLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    if (lookupsQuery.isFetched && rawVehicleTypes.length === 0) {
      setActiveTab("types");
      navigate(getVehicleTicketTabPath("types"), { replace: location.pathname === getVehicleTicketTabPath("types"), state: null });
      showBottomToast("error", "No Vehicle Types", "Add a vehicle type first before creating a ticket.");
      return;
    }

    if (lookupsQuery.isFetched && vehicleFees.length === 0) {
      showBottomToast("error", "No Fees", "Add a fee record first before creating a ticket.");
      return;
    }

    setEditingTicket(null);
    setShowAddDrawer(true);
  };

  const openVoidTicket = (ticket) => {
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    if (isLockedTicketDate(ticket?.rawTicketDate)) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    if (ticket.ticketType !== "Annual" && !isDailyTicketEditableToday(ticket)) {
      showBottomToast("error", "Void Disabled", "Only today's daily vehicle ticket records can be voided.");
      return;
    }

    if (ticket.isVoided) return;
    setPendingVoidTicket(ticket);
    setVoidReasonOption("");
    setVoidReasonCustom("");
    setVoidReasonError("");
  };

  const openAddVehicleType = () => {
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    setVehicleTypeForm(getInitialVehicleTypeForm());
    setVehicleTypeErrors({});
    setEditingVehicleType(null);
    setShowAddVehicleTypeDrawer(true);
  };

  const openEditVehicleType = (type) => {
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    setEditingVehicleType(type);
    setVehicleTypeForm({ type_name: type.typeName });
    setVehicleTypeErrors({});
    setShowAddVehicleTypeDrawer(true);
  };

  const handleSaveTicket = async (payload) => {
    if (editingTicket?.ticket_id) {
      return updateTicketMutation.mutateAsync({
        id: editingTicket.ticket_id,
        payload,
      });
    }

    return createTicketMutation.mutateAsync(payload);
  };

  const handleSaveVehicleType = () => {
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    const trimmedTypeName = vehicleTypeForm.type_name.trim();

    if (!trimmedTypeName) {
      setVehicleTypeErrors({ type_name: "Vehicle type name is required." });
      return;
    }

    setVehicleTypeErrors({});
    if (editingVehicleType) {
      const currentTypeName = String(editingVehicleType.typeName ?? "").trim();

      if (currentTypeName === trimmedTypeName) {
        showNoChangesToast();
        setShowAddVehicleTypeDrawer(false);
        setEditingVehicleType(null);
        setVehicleTypeForm(getInitialVehicleTypeForm());
        return;
      }

      updateVehicleTypeMutation.mutate({
        id: editingVehicleType.id,
        payload: { type_name: trimmedTypeName },
      });
      return;
    }

    createVehicleTypeMutation.mutate({ type_name: trimmedTypeName });
  };

  const ticketOverviewCardsByKey = {
    daily: { title: "Total Daily Tickets", value: dailyTickets, icon: IoCarOutline, tone: "blue", loading: isOverviewLoading },
    annual: { title: "Total Annual Tickets", value: annualTickets, icon: IoCarOutline, tone: "slate", loading: isOverviewLoading },
    today: { title: "Today's Daily Ticket", value: dailyTicketsToday, icon: IoCarOutline, tone: "blue", loading: isOverviewLoading },
    collections: { title: "Today's Ticket Collections", value: formatPeso(todayCollections), icon: IoCashOutline, tone: "green", loading: isOverviewLoading },
  };
  const ticketOverviewCards = VEHICLE_TICKET_OVERVIEW_ORDER.filter((key) => key !== "types").map((key, index) => ({
    ...ticketOverviewCardsByKey[key],
    key,
    order: index + 1,
  }));
  const displayOverviewCards = activeTab === "types"
    ? [
        { key: "totalVehicleTypes", title: "Total Vehicle Types", value: vehicleTypesTotal, icon: IoCarOutline, tone: "amber", loading: isOverviewLoading },
        { key: "vehicleTypesInUse", title: "Vehicle Types in Use", value: vehicleTypesInUse, icon: IoCheckmarkCircleOutline, tone: "green", loading: isOverviewLoading },
        { key: "vehicleTypesNotInUse", title: "Vehicle Types Not in Use", value: vehicleTypesNotInUse, icon: IoCloseCircleOutline, tone: "amber", loading: isOverviewLoading },
      ]
    : ticketOverviewCards;

  return (
    <ConfigProvider theme={antTheme}>
      <style>{`
        * { font-family: ${FONT} !important; }
        .docking-ant-select .ant-select-selector {
          border-radius: 12px !important;
          border: 1px solid #e2e8f0 !important;
          box-shadow: none !important;
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
        .docking-ant-select .ant-select-selection-search-input::placeholder,
        .docking-ant-select .ant-select-selection-placeholder,
        .ant-picker-input > input::placeholder {
          color: #94a3b8 !important;
          opacity: 1 !important;
          font-weight: 400 !important;
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
      `}</style>
      <div className="flex h-screen overflow-hidden bg-white">
        <Sidebar
          activeItem={activeItem}
          setActiveItem={setActiveItem}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onWidthChange={setContentMargin}
        />

        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{
            marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px",
            transition: "margin-left 0.3s ease",
          }}
        >
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />

          <main className="flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">
              <div className="mb-5 flex items-center justify-between">
                <TitlePage title="Vehicle Tickets" subtitle="Track live vehicle tickets and vehicle types activities" loading={isOverviewLoading} />
                <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: breadcrumbLabel }]} fontFamily={FONT} loading={isOverviewLoading} />
              </div>

              <div className={`mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 ${activeTab === "types" ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
                {displayOverviewCards.map((card, index) => (
                  <OverviewCard
                    key={card.key}
                    title={card.title}
                    value={card.value}
                    icon={card.icon}
                    tone={card.tone}
                    loading={card.loading}
                    style={{ order: card.order ?? index + 1 }}
                  />
                ))}
              </div>

              <Tabs
                key={activeTab}
                tabs={TABS.map((tab) => ({ key: tab.value, label: tab.label, icon: tab.icon }))}
                activeKey={activeTab}
                onTabChange={(value) => {
                  clearUniversalHighlight(value);
                  setActiveTab(value);
                  resetTicketPage();
                  setTypesPage(1);
                  setSearch("");
                  setTypeSearch("");
                  setTypeUsageFilter("all");
                  setStatusFilter("all");
                  setTicketPeriodFilter("all");
                }}
                fontFamily={FONT}
                className="mb-5"
                loading={isOverviewLoading}
                rightContent={
                  activeTab !== "types" ? (
                    <Legend
                  items={VEHICLE_TICKET_TYPE_LEGEND}
                  className="gap-3"
                  itemClassName="gap-2"
                  loading={isOverviewLoading}
                />
                  ) : null
                }
              >
              {activeTab !== "types" ? (
                <>
                <TableCard
                  title={
                    isAnnualTicketsTab
                      ? "Annual Vehicle Ticket"
                      : "Daily Vehicle Ticket"
                  }
                  subtitle={
                    isAnnualTicketsTab
                      ? "All record of annual vehicle tickets."
                      : "All record of daily vehicle tickets."
                  }
                  loading={isTicketInitialLoading}
                  headerActionsSkeletonCount={5}
                  className=""
                  bodyClassName="overflow-x-auto"
                  footerClassName="flex items-center justify-between"
                  actions={
                    <>
                      <div className="modal-input-shell flex h-[46px] items-center gap-2.5 rounded-[10px] border border-slate-200 bg-white px-4 transition-all focus-within:border-[#4096ff]" style={{ width: 300 }}>
                        <IoSearchOutline className="flex-shrink-0 text-[17px]" style={{ color: "#1a1f36" }} />
                        <input
                          value={search}
                          onChange={(event) => {
                            clearUniversalHighlight();
                            setSearch(event.target.value);
                          }}
                          placeholder={isAnnualTicketsTab ? "Search for vehicle type, plate number, driver name, date, ticket fee" : "Search for vehicle type, date, ticket fee"}
                          className="w-full border-none bg-transparent text-[13px] outline-none"
                          style={{ fontFamily: FONT, color: "#1a1f36" }}
                        />
                      </div>
                      <TailDropdown
                        value={ticketPeriodFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setTicketPeriodFilter(value);
                        }}
                        options={PERIOD_FILTER_OPTIONS}
                        height={42}
                      />
                      <TailDropdown
                        value={statusFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setStatusFilter(value);
                        }}
                        options={STATUS_FILTER_OPTIONS}
                        height={42}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          clearUniversalHighlight();
                          openAddDrawer();
                        }}
                        disabled={isTransactionLocked || isTodayDateLocked}
                        className="flex h-[42px] items-center justify-center gap-2 rounded-xl border-none px-5 text-[13px] font-semibold text-white cursor-pointer disabled:cursor-not-allowed"
                        style={{ backgroundColor: isTransactionLocked || isTodayDateLocked ? "#94a3b8" : "#1a1f36" }}
                      >
                        <IoAddOutline className="text-[16px]" />
                        Add Ticket
                      </button>
                    </>
                  }
                  pagination={{
                    meta: ticketsMeta,
                    totalPages,
                    currentPage: safePage,
                    requestedPage,
                    isLoading: isTicketInitialLoading,
                    beforePageChange: clearUniversalHighlight,
                    onPageChange: requestTicketPage,
                  }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: 980 }}>
                      <thead>
                        <tr>
                          <TH>Vehicle Type</TH>
                          {isAnnualTicketsTab ? (
                            <>
                              <TH>Control No.</TH>
                              <TH>Plate Number</TH>
                              <TH>Driver Name</TH>
                            </>
                          ) : null}
                          <TH>{isAnnualTicketsTab ? "Ticket Date" : "Date"}</TH>
                          <TH><div className="text-right">{isAnnualTicketsTab ? "Ticket Fee(₱)" : "Daily Fee(₱)"}</div></TH>
                          {activeTab === "daily" ? <TH><div className="text-right">Banyera Fee(₱)</div></TH> : null}
                          {activeTab === "daily" ? <TH><div className="text-right">Ticket Fee(₱)</div></TH> : null}
                          <TH>Voided Reason</TH>
                          <TH>Action</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {isTicketInitialLoading ? (
                          Array.from({ length: PAGE_SIZE }).map((_, index) => (
                            <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                              {Array.from({ length: ticketTableColumnCount }).map((__, column) => (
                                <td key={column} className="px-4 py-3">
                                  {column === ticketTableColumnCount - 1 ? (
                                    <div className="flex gap-2">
                                      <div className="h-8 w-8 rounded-lg bg-slate-100" />
                                      {activeTab === "daily" ? <div className="h-8 w-8 rounded-lg bg-slate-100" /> : null}
                                    </div>
                                  ) : (
                                    <div className="h-3 rounded bg-slate-100" style={{ width: column === 0 ? 120 : 90 }} />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : isError ? (
                          <tr>
                            <td colSpan={ticketTableColumnCount} className="px-5 py-8 text-center text-[13px] font-normal text-red-500">
                              Unable to load vehicle tickets right now.
                            </td>
                          </tr>
                        ) : paginatedTickets.length === 0 ? (
                          <tr>
                            <td colSpan={ticketTableColumnCount}>
                              <NoDataFound title="No results found" />
                            </td>
                          </tr>
                        ) : (
                          paginatedTickets.map((ticket, index) => (
                            (() => {
                              const isHighlighted =
                                highlightedTicketId &&
                                String(highlightedTicketId) === String(ticket.id);
                              return (
                            <tr
                              key={ticket.id}
                              onClick={() => {
                                setDetailTicket(ticket);
                              }}
                              className={`cursor-pointer transition-colors ${highlightedTicketIndex >= 0 ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${isHighlighted ? "universal-search-highlight" : ""}`.trim()}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                    style={{ backgroundColor: ticket.isVoided ? "#f59e0b" : activeTab === "daily" ? "#16a34a" : ticket.ticketType === "Annual" ? "#16a34a" : "#2563eb", minWidth: 10, minHeight: 10 }}
                                  />
                                  <span className="text-[13px] font-normal" style={{ color: "#1a1f36" }}>{ticket.vehicleTypeName}</span>
                                </div>
                              </td>
                              {activeTab === "daily" ? (
                                <>
                                  <td className="px-4 py-3">
                                    <span className="text-[13px] font-normal" style={{ color: "#1a1f36" }}>{ticket.ticketDate}</span>
                                  </td>
                                  <td
                                    className="px-4 py-3 text-right text-[13px] font-semibold text-[#1a1f36]"
                                    style={{ fontVariantNumeric: "tabular-nums" }}
                                  >
                                    {formatMoneyValue(getDailyTicketFeeBreakdown(ticket, vehicleFees).dailyFee)}
                                  </td>
                                  <td
                                    className="px-4 py-3 text-right text-[13px] font-semibold text-[#1a1f36]"
                                    style={{ fontVariantNumeric: "tabular-nums" }}
                                  >
                                    {formatMoneyValue(getDailyTicketFeeBreakdown(ticket, vehicleFees).banyeraFee)}
                                  </td>
                                  <td
                                    className="px-4 py-3 text-right text-[13px] font-semibold text-[#1a1f36]"
                                    style={{ fontVariantNumeric: "tabular-nums" }}
                                  >
                                    {formatMoneyValue(getDailyTicketFeeBreakdown(ticket, vehicleFees).totalFee)}
                                  </td>
                                  <td className="px-4 py-3 text-[13px] font-normal text-[#1a1f36]">
                                    {ticket.voidReason || "-"}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-4 py-3 text-[13px] font-medium text-[#1a1f36]">{ticket.controlNumber}</td>
                                  <td className="px-4 py-3 text-[13px] font-normal text-[#1a1f36]">{ticket.plateNumber}</td>
                                  <td className="px-4 py-3 text-[13px] font-normal text-slate-600">{ticket.driverName}</td>
                                  <td className="px-4 py-3">
                                    <span className="text-[13px] font-normal" style={{ color: "#1a1f36" }}>{ticket.ticketDate}</span>
                                  </td>
                                  <td
                                    className="px-4 py-3 text-right text-[13px] font-semibold text-[#1a1f36]"
                                    style={{ fontVariantNumeric: "tabular-nums" }}
                                  >
                                    {formatMoneyValue(ticket.ticketFee)}
                                  </td>
                                  <td className="px-4 py-3 text-[13px] font-normal text-[#1a1f36]">
                                    {ticket.voidReason || "-"}
                                  </td>
                                </>
                              )}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {(ticket.ticketType === "Daily" || ticket.ticketType === "Annual") ? (
                                  <Tooltip title={isTransactionLocked || isLockedTicketDate(ticket.rawTicketDate) ? transactionLockMessage : ticket.ticketType !== "Annual" && !isDailyTicketEditableToday(ticket) ? "Only today's daily vehicle ticket records can be voided" : ticket.isVoided ? "Restore" : "Void"}>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          clearUniversalHighlight();
                                          if (deletingTicketId === ticket.id || isTransactionLocked || isLockedTicketDate(ticket.rawTicketDate) || (ticket.ticketType !== "Annual" && !isDailyTicketEditableToday(ticket))) return;
                                          if (ticket.isVoided) {
                                            setDeletingTicketId(ticket.id);
                                            restoreVoidedTicketMutation.mutate(ticket.id);
                                            return;
                                          }
                                          openVoidTicket(ticket);
                                        }}
                                        disabled={deletingTicketId === ticket.id || isTransactionLocked || isLockedTicketDate(ticket.rawTicketDate) || (ticket.ticketType !== "Annual" && !isDailyTicketEditableToday(ticket))}
                                        className={`w-8 h-8 rounded-lg border flex items-center justify-center bg-white transition-colors ${
                                          deletingTicketId === ticket.id || isTransactionLocked || isLockedTicketDate(ticket.rawTicketDate) || (ticket.ticketType !== "Annual" && !isDailyTicketEditableToday(ticket))
                                            ? "cursor-not-allowed border-slate-200"
                                            : ticket.isVoided
                                              ? "cursor-pointer hover:bg-emerald-50"
                                              : "cursor-pointer hover:bg-amber-50"
                                        }`}
                                        style={{ borderColor: deletingTicketId === ticket.id || isTransactionLocked || isLockedTicketDate(ticket.rawTicketDate) || (ticket.ticketType !== "Annual" && !isDailyTicketEditableToday(ticket)) ? undefined : ticket.isVoided ? "#10b981" : "#f59e0b" }}
                                      >
                                        {ticket.isVoided ? (
                                          <IoReloadOutline style={{ fontSize: "16px", color: "#10b981" }} />
                                        ) : (
                                          <IoCloseOutline style={{ fontSize: "16px", color: "#f59e0b" }} />
                                        )}
                                      </button>
                                    </Tooltip>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                              );
                            })()
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                </TableCard>
                </>
              ) : (
                <TableCard
                  title="Vehicle Type Records"
                  subtitle="All record of vehicle types."
                  loading={isVehicleTypesInitialLoading}
                  headerActionsSkeletonCount={3}
                  className=""
                  bodyClassName="overflow-x-auto"
                  footerClassName="flex items-center justify-between"
                  actions={
                    <>
                      <div className="modal-input-shell flex h-[46px] items-center gap-2.5 rounded-[10px] border border-slate-200 bg-white px-4 transition-all focus-within:border-[#4096ff]" style={{ width: 300 }}>
                        <IoSearchOutline className="flex-shrink-0 text-[17px]" style={{ color: "#1a1f36" }} />
                        <input
                          value={typeSearch}
                          onChange={(event) => {
                            clearUniversalHighlight();
                            setTypeSearch(event.target.value);
                          }}
                          placeholder="Search for Vehicle Type"
                          className="w-full border-none bg-transparent text-[13px] outline-none"
                          style={{ fontFamily: FONT, color: "#1a1f36" }}
                        />
                      </div>
                      <TailDropdown
                        value={typeUsageFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setTypeUsageFilter(value);
                        }}
                        options={VEHICLE_TYPE_USAGE_FILTER_OPTIONS}
                        height={42}
                      />
                      <Tooltip title={isTransactionLocked ? transactionLockMessage : "Add Vehicle Type"}>
                        <button
                          type="button"
                          onClick={() => {
                            clearUniversalHighlight();
                            openAddVehicleType();
                          }}
                          disabled={isTransactionLocked}
                          className="flex h-[42px] items-center justify-center gap-2 rounded-xl border-none bg-[#1a1f36] px-5 text-[13px] font-semibold text-white cursor-pointer hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <IoAddOutline className="text-[16px]" />
                          Add Vehicle Type
                        </button>
                      </Tooltip>
                    </>
                  }
                  pagination={{
                    meta: vehicleTypesMeta,
                    totalPages: totalTypePages,
                    currentPage: safeTypePage,
                    requestedPage: safeTypePage,
                    isLoading: isVehicleTypesInitialLoading,
                    beforePageChange: clearUniversalHighlight,
                    onPageChange: setTypesPage,
                  }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: 700 }}>
                      <thead>
                        <tr style={{ backgroundColor: "#ffffff" }}>
                          <TH>Vehicle Type</TH>
                          <TH>Usage Count - Daily (Yearly)</TH>
                          <TH>Usage Count - Annual (Yearly)</TH>
                          <TH>Action</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {isVehicleTypesInitialLoading ? (
                          Array.from({ length: PAGE_SIZE }).map((_, index) => (
                            <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td className="px-4 py-3"><div className="h-3 w-32 rounded bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="h-6 w-20 rounded-full bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="h-6 w-20 rounded-full bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="flex gap-2"><div className="h-8 w-8 rounded-lg bg-slate-100" /><div className="h-8 w-8 rounded-lg bg-slate-100" /></div></td>
                            </tr>
                          ))
                        ) : vehicleTypesQuery.isError ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-10 text-center">
                              <div className="flex flex-col items-center gap-3">
                                <IoWarningOutline className="text-[32px] text-red-400" />
                                <p className="m-0 text-[13px] font-normal text-red-500">Unable to load vehicle types.</p>
                                <button
                                  onClick={() => window.location.reload()}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
                                  style={{ fontFamily: FONT }}
                                >
                                  <IoReloadOutline /> Retry
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : paginatedVehicleTypes.length === 0 ? (
                          <tr>
                            <td colSpan={4}>
                              <NoDataFound title={debouncedTypeSearch || typeUsageFilter !== "all" ? "No results found" : "No Data Found"} />
                            </td>
                          </tr>
                        ) : (
                          paginatedVehicleTypes.map((type, index) => (
                            <tr
                              key={type.id}
                              onClick={(event) => {
                                if (event.target instanceof HTMLElement && event.target.closest('button')) return;
                                setDetailVehicleType(type);
                              }}
                              className={`cursor-pointer transition-colors ${highlightedVehicleTypeId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${String(highlightedVehicleTypeId) === String(type.id) ? "universal-search-highlight" : ""}`.trim()}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: highlightedVehicleTypeId ? "#ffffff" : index % 2 === 0 ? "#ffffff" : "#ededed",
                              }}
                            >
                              <td className="px-4 py-3 text-[13px] font-normal text-[#1a1f36]">{type.typeName}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    clearUniversalHighlight("daily");
                                    setActiveTab("daily");
                                    resetTicketPage();
                                    setTypesPage(1);
                                    setTypeSearch("");
                                    setSearch(type.typeName);
                                  }}
                                  className="border-none bg-transparent p-0"
                                  style={{ cursor: "pointer" }}
                                  title="View daily vehicle tickets using this type"
                                >
                                  <StatusPill
                                    status={type.dailyTicketsUsing > 0 ? "enabled" : "disabled"}
                                    label={`${type.dailyTicketsUsing} ${type.dailyTicketsUsing <= 1 ? "count" : "counts"}`}
                                    className="text-[13px]"
                                  />
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    clearUniversalHighlight("annual");
                                    setActiveTab("annual");
                                    resetTicketPage();
                                    setTypesPage(1);
                                    setTypeSearch("");
                                    setSearch(type.typeName);
                                  }}
                                  className="border-none bg-transparent p-0"
                                  style={{ cursor: "pointer" }}
                                  title="View annual vehicle tickets using this type"
                                >
                                  <StatusPill
                                    status={type.annualTicketsUsing > 0 ? "enabled" : "disabled"}
                                    label={`${type.annualTicketsUsing} ${type.annualTicketsUsing <= 1 ? "count" : "counts"}`}
                                    className="text-[13px]"
                                  />
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Tooltip title={isTransactionLocked ? transactionLockMessage : "Edit"}>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        clearUniversalHighlight();
                                        openEditVehicleType(type);
                                      }}
                                      disabled={isTransactionLocked}
                                      className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors ${isTransactionLocked ? "cursor-not-allowed border-slate-200" : "hover:bg-blue-50"}`}
                                      style={{ borderColor: isTransactionLocked ? undefined : "#1a1f36" }}
                                    >
                                      <IoCreateOutline style={{ fontSize: "15px", color: isTransactionLocked ? "#94a3b8" : "#1a1f36" }} />
                                    </button>
                                  </Tooltip>
                                  <Tooltip title={isTransactionLocked ? transactionLockMessage : (Number(type.dailyTicketsUsing ?? 0) > 0 || Number(type.annualTicketsUsing ?? 0) > 0) ? "Cannot archive vehicle types with usage count" : "Archive"}>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        clearUniversalHighlight();
                                        if (isTransactionLocked || Number(type.dailyTicketsUsing ?? 0) > 0 || Number(type.annualTicketsUsing ?? 0) > 0) return;
                                        setPendingDeleteVehicleType(type);
                                      }}
                                      disabled={isTransactionLocked || (archiveVehicleTypeMutation.isPending && deletingVehicleTypeId === type.id) || Number(type.dailyTicketsUsing ?? 0) > 0 || Number(type.annualTicketsUsing ?? 0) > 0}
                                      className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors ${
                                        isTransactionLocked || (archiveVehicleTypeMutation.isPending && deletingVehicleTypeId === type.id) || Number(type.dailyTicketsUsing ?? 0) > 0 || Number(type.annualTicketsUsing ?? 0) > 0
                                          ? "cursor-not-allowed border-slate-200"
                                          : "cursor-pointer hover:bg-red-50"
                                      }`}
                                      style={{ borderColor: isTransactionLocked || (archiveVehicleTypeMutation.isPending && deletingVehicleTypeId === type.id) || Number(type.dailyTicketsUsing ?? 0) > 0 || Number(type.annualTicketsUsing ?? 0) > 0 ? undefined : "#ef4444" }}
                                    >
                                      {archiveVehicleTypeMutation.isPending && deletingVehicleTypeId === type.id ? (
                                        <span className="text-red-500"><Spinner size={15} /></span>
                                      ) : (
                                        <IoTrashOutline style={{ fontSize: "15px", color: (isTransactionLocked || Number(type.dailyTicketsUsing ?? 0) > 0 || Number(type.annualTicketsUsing ?? 0) > 0) ? "#94a3b8" : "#ef4444" }} />
                                      )}
                                    </button>
                                  </Tooltip>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                </TableCard>
              )}
              </Tabs>
            </div>
          </main>
        </div>
      </div>

      <AddVehicleTicketDrawer
        open={showAddDrawer}
        onClose={() => {
          setShowAddDrawer(false);
          setEditingTicket(null);
        }}
        onSave={handleSaveTicket}
        saving={createTicketMutation.isPending || updateTicketMutation.isPending}
        vehicleTypes={rawVehicleTypes}
        fees={vehicleFees}
        tickets={drawerTicketType === "daily" ? annualVehicleTickets : rawTickets}
        ticketType={drawerTicketType}
        editingTicket={editingTicket}
        isLookupsLoading={lookupsQuery.isLoading}
      />
      <AddVehicleTypeDrawer
        open={showAddVehicleTypeDrawer}
        onClose={() => setShowAddVehicleTypeDrawer(false)}
        form={vehicleTypeForm}
        setForm={setVehicleTypeForm}
        setErrors={setVehicleTypeErrors}
        errors={vehicleTypeErrors}
        onSave={handleSaveVehicleType}
        saving={createVehicleTypeMutation.isPending || updateVehicleTypeMutation.isPending}
        isEditing={Boolean(editingVehicleType)}
      />
      <VehicleTypeDetailsDrawer type={detailVehicleType} open={Boolean(detailVehicleType)} onClose={() => setDetailVehicleType(null)} />
      <VehicleTicketDetailDrawer ticket={detailTicket} fees={vehicleFees} open={Boolean(detailTicket)} onClose={() => setDetailTicket(null)} />
      <VoidVehicleTicketModal
        open={Boolean(pendingVoidTicket)}
        ticket={pendingVoidTicket}
        selectedReason={voidReasonOption}
        customReason={voidReasonCustom}
        error={voidReasonError}
        saving={deletingTicketId === pendingVoidTicket?.id}
        onReasonChange={(value) => {
          setVoidReasonOption(value);
          if (value !== "others") setVoidReasonCustom("");
          if (voidReasonError) setVoidReasonError("");
        }}
        onCustomReasonChange={(value) => {
          setVoidReasonCustom(value);
          if (voidReasonError) setVoidReasonError("");
        }}
        onClose={() => {
          if (deletingTicketId) return;
          setPendingVoidTicket(null);
          setVoidReasonOption("");
          setVoidReasonCustom("");
          setVoidReasonError("");
        }}
        onConfirm={() => {
          if (!pendingVoidTicket || deletingTicketId) return;
          if (!voidReasonOption) {
            setVoidReasonError("Void reason is required.");
            return;
          }

          const availableVoidReasonOptions =
            pendingVoidTicket.ticketType === "Annual"
              ? VOID_REASON_OPTIONS.filter((option) => option.value !== "duplicate-entry")
              : VOID_REASON_OPTIONS;
          const selectedReasonLabel = availableVoidReasonOptions.find(
            (option) => option.value === voidReasonOption,
          )?.label;
          const trimmedReason =
            voidReasonOption === "others"
              ? voidReasonCustom.trim()
              : selectedReasonLabel?.trim() || "";

          if (!trimmedReason) {
            setVoidReasonError(
              voidReasonOption === "others"
                ? "Other reason is required."
                : "Void reason is required.",
            );
            return;
          }

          setDeletingTicketId(pendingVoidTicket.id);
          voidTicketMutation.mutate(
            { id: pendingVoidTicket.id, void_reason: trimmedReason },
            {
              onSettled: () => {
                setPendingVoidTicket(null);
                setVoidReasonOption("");
                setVoidReasonCustom("");
                setVoidReasonError("");
              },
            },
          );
        }}
      />
      <DeleteConfirmModal
        open={Boolean(pendingDeleteVehicleType)}
        title="Archive Vehicle Type"
        recordLabel={pendingDeleteVehicleType?.typeName || "this record"}
        deleting={deletingVehicleTypeId === pendingDeleteVehicleType?.id}
        onClose={() => {
          if (deletingVehicleTypeId) return;
          setPendingDeleteVehicleType(null);
        }}
        onConfirm={() => {
          if (!pendingDeleteVehicleType || deletingVehicleTypeId) return;
          setDeletingVehicleTypeId(pendingDeleteVehicleType.id);
          archiveVehicleTypeMutation.mutate(pendingDeleteVehicleType.id, {
            onSettled: () => setPendingDeleteVehicleType(null),
          });
        }}
      />
    </ConfigProvider>
  );
};

export default SuperVehicleTickets;
