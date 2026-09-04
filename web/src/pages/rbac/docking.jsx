import React, { useEffect, useMemo, useRef, useState } from "react";
import { ConfigProvider, Drawer as AntDrawer, Select, Tooltip } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import "typeface-montserrat";
import {
  IoAddOutline,
  IoAlertCircleOutline,
  IoBoatOutline,
  IoCalendarOutline,
  IoCashOutline,
  IoCheckmarkOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoCloseOutline,
  IoCreateOutline,
  IoEyeOutline,
  IoLayersOutline,
  IoPersonOutline,
  IoReloadOutline,
  IoSearchOutline,
  IoTimeOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import DatePicker from "../../components/DatePicker";
import TimePicker from "../../components/TimePicker";
import DetailDrawer, { DrawerInfoCard, DrawerSection } from "../../components/Drawer";
import FilterSelect from "../../components/FilterSelect";
import FilterButton from "../../components/FilterButton";
import Modal from "../../components/Modal";
import NoDataFound from "../../components/NoDataFound";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import Spinner from "../../components/Spinner";
import Legend from "../../components/Legend";
import { showAddedToast, showBottomToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import { useSidebar } from "../../store/sidebarStore";
import { useFiscalYearStore } from "../../store/fiscalYearStore";
import { useDockingCalendarQuery, useDockingLookupsQuery, useDockingsDataQuery } from "../../hooks/useDockingsDataQuery";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import { isHeadRole } from "../../utils/transactionLock";
import { cacheTab, getCachedTab } from "../../utils/tabSession";
import {
  hasDockingCalendarItemsForDate,
  syncDockingCalendarCache as syncDockingCalendarDataCache,
  updateDockingStatsInCache,
  upsertDockingInDataCache,
} from "../../utils/dockingCache";
import api from "../../api/axios";

const FONT = "'Montserrat', sans-serif";
const PAGE_SIZE = 10;
const PAGE_DEBOUNCE_MS = 150;
const SEARCH_DEBOUNCE_MS = 300;
const PESO = "\u20B1";
const EMPTY_ARRAY = [];
const DAYS   = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOCKING_VIEW_TABS = [
  { key: "records", label: "Docking", icon: IoLayersOutline },
  { key: "schedule", label: "Calendar", icon: IoCalendarOutline },
];
const DOCKING_TAB_STORAGE_KEY = "opol:docking:active-tab";
const DOCKING_TAB_KEYS = DOCKING_VIEW_TABS.map((tab) => tab.key);

const getDockingViewFromPath = (pathname) =>
  pathname.endsWith("docking-calendar")
    ? "schedule"
    : pathname.endsWith("docking")
      ? getCachedTab(DOCKING_TAB_STORAGE_KEY, DOCKING_TAB_KEYS, "records")
      : "records";

const DOCK_COLORS = [
  { bg: "bg-blue-100",   text: "text-blue-700",   border: "bg-blue-500"   },
  { bg: "bg-green-100",  text: "text-green-700",  border: "bg-green-500"  },
  { bg: "bg-orange-100", text: "text-orange-700", border: "bg-orange-500" },
  { bg: "bg-purple-100", text: "text-purple-700", border: "bg-purple-500" },
  { bg: "bg-red-100",    text: "text-red-700",    border: "bg-red-500"    },
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
const DAY_OPTIONS = Array.from({ length: 31 }, (_, idx) => ({
  value: String(idx + 1).padStart(2, "0"),
  label: String(idx + 1),
}));
const YEAR_OPTIONS = Array.from({ length: 20 }, (_, idx) => {
  const year = String(new Date().getFullYear() - 5 + idx);
  return { value: year, label: year };
});
const PERIOD_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "voided", label: "Voided" },
];
const DOCKING_STATUS_LEGEND = [
  { key: "active", label: "Active", color: "#16a34a" },
  { key: "voided", label: "Voided", color: "#f59e0b" },
];
const getDockingStatusLegendColor = (statusLabel) => {
  const normalized = String(statusLabel || "").trim().toLowerCase();
  const match = DOCKING_STATUS_LEGEND.find(
    (item) => item.key === normalized || String(item.label).toLowerCase() === normalized
  );
  return match ? match.color : "#94a3b8";
};
const DOCKING_FILTER_DROPDOWN_PROPS = {
  getPopupContainer: (triggerNode) => (typeof document !== "undefined" ? document.body : triggerNode.parentElement),
  placement: "bottomLeft",
  dropdownAlign: { overflow: { adjustX: false, adjustY: false } },
};
const VOID_REASON_OPTIONS = [
  { value: "duplicate-entry", label: "Entered by mistake" },
  { value: "wrong-boat", label: "Wrong boat selected" },
  { value: "wrong-date-time", label: "Wrong date or time" },
  { value: "others", label: "Others" },
];

const antTheme = {
  token: {
    colorPrimary: "#4096ff",
    colorPrimaryHover: "#4096ff",
    colorPrimaryActive: "#4096ff",
    borderRadius: 10,
    fontFamily: FONT,
    controlHeight: 42,
    fontSize: 13,
  },
};

const parseDateTimeValue = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
  const timezoneMatch = raw.match(/[zZ]$|[+-]\d{2}:?\d{2}$/);

  if (timezoneMatch) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .reduce((acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      }, {});

    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour === "24" ? "0" : parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  }

  const normalized = raw.replace("T", " ").replace(/Z$/, "");
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);

  if (!match) {
    const fallbackDate = new Date(value);
    if (Number.isNaN(fallbackDate.getTime())) return null;
    return {
      year: fallbackDate.getFullYear(),
      month: fallbackDate.getMonth() + 1,
      day: fallbackDate.getDate(),
      hour: fallbackDate.getHours(),
      minute: fallbackDate.getMinutes(),
      second: fallbackDate.getSeconds(),
    };
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "0"),
    minute: Number(match[5] ?? "0"),
    second: Number(match[6] ?? "0"),
  };
};

const formatDate = (value) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return "-";
  return new Date(parsed.year, parsed.month - 1, parsed.day).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatTime = (value) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return "-";

  let hours = parsed.hour;
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${hours}:${String(parsed.minute).padStart(2, "0")} ${meridiem}`;
};

const formatDateTime = (value) => {
  const dateText = formatDate(value);
  const timeText = formatTime(value);
  if (dateText === "-") return "-";
  return timeText === "-" ? dateText : `${dateText} at ${timeText}`;
};

const normalizeDateTimeString = (value) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return "";
  return `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")} ${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}:${String(parsed.second).padStart(2, "0")}`;
};

const parseMoneyValue = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  return `${PESO}${parseMoneyValue(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatMoneyValue = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  return parseMoneyValue(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPeso = (value) => {
  if (value === null || value === undefined || value === "") return `${PESO}0.00`;
  return `${PESO}${parseMoneyValue(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatFeeOptionAmount = (value) => {
  if (value === null || value === undefined || value === "") return `${PESO}0.00`;
  return `${PESO}${parseMoneyValue(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getFeeTypeName = (fee) =>
  String(fee?.fee_type_name || fee?.fee_type?.fee_name || fee?.feeType?.fee_name || fee?.fee_name || "").toLowerCase();

const isDockingFee = (fee) => getFeeTypeName(fee) === "docking";

const isFeeActive = (fee) => {
  const today = getManilaDateString();
  const effectiveFrom = String(fee?.effective_from || "").slice(0, 10);
  const effectiveTo = String(fee?.effective_to || "").slice(0, 10);
  if (effectiveFrom && effectiveFrom > today) return false;
  if (effectiveTo && effectiveTo <= today) return false;
  return true;
};

const getDateParts = (value) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return { month: "", day: "", year: "" };
  return {
    month: String(parsed.month).padStart(2, "0"),
    day: String(parsed.day).padStart(2, "0"),
    year: String(parsed.year),
  };
};

const buildDateFromParts = (year, month, day) => {
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
};

const getManilaDateString = () =>
  new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });

const normalizeFiscalYear = (value) => {
  const year = String(value ?? "").trim();
  return /^\d{4}$/.test(year) ? Number(year) : new Date().getFullYear();
};

const getFiscalDateString = (fiscalYear) => {
  const [, month, day] = getManilaDateString().split("-");
  return `${normalizeFiscalYear(fiscalYear)}-${month}-${day}`;
};

const getFiscalCalendarDate = (fiscalYear, month = new Date().getMonth()) =>
  new Date(normalizeFiscalYear(fiscalYear), month, 1);

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
};

const isFutureDockingDate = (dateString) => {
  if (!dateString) return false;
  return dateString > getManilaDateString();
};

const getDateOnlyValue = (value) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day);
};

const filterByPeriod = (records, period) => {
  if (period === "all") return records;

  const todayStr = getManilaDateString();
  const now = new Date(`${todayStr}T00:00:00`);

  if (period === "today") {
    return records.filter((record) => String(record?.docking_date ?? "").slice(0, 10) === todayStr);
  }

  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());

    return records.filter((record) => {
      const date = getDateOnlyValue(record?.docking_date);
      return date && !Number.isNaN(date.getTime()) && date >= start && date <= now;
    });
  }

  if (period === "month") {
    return records.filter((record) => {
      const date = getDateOnlyValue(record?.docking_date);
      return date && !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
  }

  if (period === "year") {
    return records.filter((record) => {
      const date = getDateOnlyValue(record?.docking_date);
      return date && !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear();
    });
  }

  return records;
};

const getManilaTimeParts = () => {
  const manilaNow = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Manila",
    })
  );

  let hours = manilaNow.getHours();
  const minutes = String(manilaNow.getMinutes()).padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";

  hours = hours % 12 || 12;

  return {
    hour: String(hours).padStart(2, "0"),
    minute: minutes,
    meridiem,
  };
};

const buildTwentyFourHourTime = (hour, minute, meridiem) => {
  if (!hour || !minute || !meridiem) return "";
  let normalizedHour = Number(hour);
  if (meridiem === "AM") {
    if (normalizedHour === 12) normalizedHour = 0;
  } else if (normalizedHour !== 12) {
    normalizedHour += 12;
  }
  return `${String(normalizedHour).padStart(2, "0")}:${minute}:00`;
};

const getTimeParts = (value) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return getManilaTimeParts();

  const meridiem = parsed.hour >= 12 ? "PM" : "AM";
  const normalizedHour = parsed.hour % 12 || 12;

  return {
    hour: String(normalizedHour).padStart(2, "0"),
    minute: String(parsed.minute).padStart(2, "0"),
    meridiem,
  };
};

const getBoatTypeLabel = (record) =>
  record?.boat?.boat_type?.type_name ||
  record?.boat?.boatType?.type_name ||
  "-";

const getDockingHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Docking" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("docking-") ? rawId.slice("docking-".length) : "";
};

const getBoatTypeId = (boat) =>
  String(boat?.boat_type_id ?? boat?.boat_type?.boat_type_id ?? boat?.boatType?.boat_type_id ?? "");

const getCreatedByLabel = (record) => {
  const fullName =
    record?.created_by_name ||
    record?.createdByName ||
    record?.encodedBy ||
    record?.created_by?.full_name ||
    record?.createdBy?.full_name ||
    [record?.created_by?.first_name, record?.created_by?.last_name].filter(Boolean).join(" ") ||
    [record?.createdBy?.first_name, record?.createdBy?.last_name].filter(Boolean).join(" ") ||
    "";
  const email = record?.created_by?.email || record?.createdBy?.email || "";

  return String(fullName || "").trim() || String(email || "").trim() || "-";
};

const getVoidedByLabel = (record) => {
  const fullName =
    record?.voided_by_name ||
    record?.voidedBy?.full_name ||
    [record?.voided_by?.first_name, record?.voided_by?.last_name].filter(Boolean).join(" ") ||
    [record?.voidedBy?.first_name, record?.voidedBy?.last_name].filter(Boolean).join(" ") ||
    "";
  const email = record?.voidedBy?.email || record?.voided_by?.email || "";

  return String(fullName || "").trim() || String(email || "").trim() || "-";
};

const getInspectorLabel = (record) => getCreatedByLabel(record);

const getFeeLabel = (record) =>
  record?.fee_details?.fee_name ||
  record?.fee_name ||
  record?.fee?.fee_type_name ||
  record?.fee?.fee_type?.fee_name ||
  record?.fee?.feeType?.fee_name ||
  record?.fee?.fee_name ||
  "-";

const getBoatImageSrc = (boat) =>
  boat?.image_path ? `${api.defaults.baseURL.replace("/api", "")}/storage/${boat.image_path}` : null;

const isDockingEditableToday = (docking) =>
  String(docking?.docking_date ?? "").slice(0, 10) === getManilaDateString();

const isDockingVoided = (docking) =>
  Boolean(
    docking?.is_voided ||
    docking?.voided_at ||
    String(docking?.status ?? "").toLowerCase() === "voided"
  );

const normalizeDockingResponse = (responseData) =>
  responseData?.data ?? responseData?.docking ?? responseData ?? null;

const mergeDockingRecordWithLookups = (record, boats = [], fees = [], users = []) => {
  if (!record) return null;

  const normalizedBoats = Array.isArray(boats) ? boats : boats?.boats ?? [];
  const normalizedFees = Array.isArray(fees) ? fees : fees?.fees ?? [];
  const normalizedUsers = Array.isArray(users) ? users : users?.users ?? users?.data ?? [];

  const matchedBoat =
    normalizedBoats.find((boat) => String(boat.boat_id) === String(record.boat_id ?? record?.boat?.boat_id)) ??
    record.boat ??
    null;
  const matchedFee =
    normalizedFees.find((fee) => String(fee.fee_id) === String(record.fee_id ?? record?.fee?.fee_id)) ??
    record?.fee_details ??
    record.fee ??
    null;
  const fallbackUser = record?.created_by ?? record?.createdBy ?? null;
  const matchedUser =
    normalizedUsers.find(
      (user) =>
        String(user.user_id ?? user.id ?? "") ===
        String(
          record.created_by_id ??
            record.user_id ??
            record.created_by?.user_id ??
            record.createdBy?.user_id ??
            record.created_by?.id ??
            record.createdBy?.id ??
            ""
        )
    ) ??
    fallbackUser;

  const derivedCreatorName =
    matchedUser?.full_name ||
    [matchedUser?.first_name, matchedUser?.last_name].filter(Boolean).join(" ") ||
    "";

  return {
    ...record,
    boat: matchedBoat,
    fee: matchedFee,
    created_by: matchedUser,
    createdBy: matchedUser,
    created_by_name: derivedCreatorName || record?.created_by_name || record?.createdByName || "",
    createdByName: derivedCreatorName || record?.created_by_name || record?.createdByName || "",
  };
};

// Stable color derived from docking_id
const getDockColor = (docking) =>
  DOCK_COLORS[(docking?.docking_id || 0) % DOCK_COLORS.length];

const TH = ({ children }) => (
  <th
    className="whitespace-nowrap bg-white px-4 py-3 text-left font-semibold"
    style={{ backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}
  >
    {children}
  </th>
);

const Field = ({ label, required, children, error, hint }) => (
  <div>
    <label className="mb-1.5 block text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>
      {label}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
    <div className={error ? "modal-field-control-error" : ""}>{children}</div>
    {hint && !error && <p className="m-0 mt-1.5 text-[12px] font-medium text-slate-500">{hint}</p>}
    {error && (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
        <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
        <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>
          {error}
        </p>
      </div>
    )}
  </div>
);

const ModalInput = ({ label, required, error, icon: Icon, inputStyle, wrapperClassName = "", ...props }) => {
  const isReadOnly = !!props.readOnly;
  const isDisabled = !!props.disabled;
  const visibleError = isReadOnly ? "" : error;
  const isMuted = isReadOnly || isDisabled;

  return (
    <Field label={label} required={required} error={visibleError}>
      <div className={`modal-input-shell flex h-[46px] items-center gap-3 rounded-[10px] border border-slate-200 px-4 transition-all ${isMuted ? "bg-slate-50" : "bg-white focus-within:border-[#4096ff]"} ${wrapperClassName}`}>
        <input
          {...props}
          className={`w-full border-none bg-transparent text-[14px] font-medium outline-none placeholder:font-normal placeholder:text-slate-400 ${isMuted ? "cursor-not-allowed text-slate-500" : "text-[#0d1117]"}`}
          style={{ fontFamily: FONT, ...inputStyle }}
        />
      </div>
    </Field>
  );
};

const VoidDockingModal = ({
  open,
  docking,
  selectedReason,
  customReason,
  error,
  saving,
  onReasonChange,
  onCustomReasonChange,
  onClose,
  onConfirm,
}) => {
  if (!open || !docking) return null;

  return (
    <Modal
      title="Void Docking"
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
          label="Boat Name"
          icon={IoBoatOutline}
          value={docking?.boat?.boat_name || "-"}
          readOnly
          disabled
          wrapperClassName="!bg-slate-100"
          inputStyle={{ color: "#475569" }}
        />
        <ModalInput
          label="Docking Date & Time"
          icon={IoCalendarOutline}
          value={formatDateTime(docking?.docking_date)}
          readOnly
          disabled
          wrapperClassName="!bg-slate-100"
          inputStyle={{ color: "#475569" }}
        />
        <ModalInput
          label={`Docking Fee`}
          icon={IoCashOutline}
          value={formatPeso(docking?.docking_fee)}
          readOnly
          disabled
          wrapperClassName="!bg-slate-100"
          inputStyle={{ color: "#475569" }}
        />
        <Field label="Reason" required error={selectedReason === "others" ? "" : error}>
          <FilterSelect
            width="100%"
            height={46}
            placeholder="Select void reason"
            value={selectedReason || undefined}
            onChange={onReasonChange}
            options={VOID_REASON_OPTIONS}
          />
        </Field>
        {selectedReason === "others" ? (
          <Field label="Other Reason" required error={error}>
            <textarea
              value={customReason}
              onChange={(event) => onCustomReasonChange(event.target.value)}
              placeholder="Enter the specific reason"
              className="min-h-[120px] w-full resize-none rounded-[10px] border border-slate-200 px-4 py-3 text-[14px] outline-none transition-all focus:border-[#4096ff]"
              style={{ fontFamily: FONT, color: "#0d1117" }}
            />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
};

const ShellInput = ({ icon: Icon, className = "", ...props }) => (
  <div className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 ${className}`.trim()} style={{ minHeight: 42 }}>
    {Icon && <Icon className="text-slate-400 text-[16px] flex-shrink-0" />}
    <input {...props} className="h-10 w-full border-none bg-transparent text-[13px] font-medium text-[#0d1117] outline-none" style={{ fontFamily: FONT }} />
  </div>
);


const buildDockingFormState = (prefillDate, initialDocking, fiscalYear) => {
  const sourceDockingDate =
    initialDocking?.docking_date ||
    prefillDate ||
    getFiscalDateString(fiscalYear);

  const sourceDateParts = getDateParts(sourceDockingDate);
  const sourceTimeParts = initialDocking?.docking_date
    ? getTimeParts(initialDocking.docking_date)
    : getManilaTimeParts();

  return {
    boat_id: initialDocking?.boat_id ? String(initialDocking.boat_id) : "",
    fee_id: initialDocking?.fee_id !== null && initialDocking?.fee_id !== undefined ? String(initialDocking.fee_id) : undefined,
    docking_date: buildDateFromParts(sourceDateParts.year, sourceDateParts.month, sourceDateParts.day),
    docking_date_month: sourceDateParts.month,
    docking_date_day: sourceDateParts.day,
    docking_date_year: sourceDateParts.year,
    docking_time_hour: sourceTimeParts.hour,
    docking_time_minute: sourceTimeParts.minute,
    docking_time_meridiem: sourceTimeParts.meridiem,
    docking_fee:
      initialDocking?.docking_fee !== null && initialDocking?.docking_fee !== undefined
        ? String(initialDocking.docking_fee)
        : "",
  };
};

const getTimeValueFromParts = (hour, minute, meridiem) => {
  const built = buildTwentyFourHourTime(hour, minute, meridiem);
  return built ? built.slice(0, 5) : "";
};

const applyTimeValueToDockingForm = (current, timeValue) => {
  if (!timeValue) {
    return {
      ...current,
      docking_time_hour: "",
      docking_time_minute: "",
      docking_time_meridiem: "",
    };
  }

  const [hour24Raw = "00", minute = "00"] = String(timeValue).split(":");
  let hour24 = Number(hour24Raw);
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  hour24 = hour24 % 12 || 12;

  return {
    ...current,
    docking_time_hour: String(hour24).padStart(2, "0"),
    docking_time_minute: String(minute).padStart(2, "0"),
    docking_time_meridiem: meridiem,
  };
};

const normalizeDockingPayloadForComparison = (payload) =>
  JSON.stringify({
    boat_id: String(payload?.boat_id ?? ""),
    fee_id: String(payload?.fee_id ?? ""),
    docking_date: String(payload?.docking_date ?? "").slice(0, 16),
    docking_fee: parseMoneyValue(payload?.docking_fee),
  });

const CalendarDockingsDrawer = ({ open, dateLabel, dockings, onClose, onSelectDocking }) => {
  if (!open) return null;

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={480}
      fontFamily={FONT}
      title="List of Docking Records"
      subtitle={dateLabel}
      icon={IoCalendarOutline}
    >
      <div className={dockings.length === 0 ? "flex min-h-[calc(100vh-88px)] items-center justify-center px-6 py-6" : "space-y-4 px-5 py-5"}>
        {dockings.length === 0 ? (
          <NoDataFound />
        ) : (
          dockings.map((docking) => {
            const accent = {
              cardBorder: "#e2e8f0",
              cardBg: "#f8fafc",
              hoverBg: "#eff6ff",
              title: "#2563eb",
              leftBorder: "#2563eb",
            };
            return (
              <button
                key={docking.docking_id}
                onClick={() => onSelectDocking(docking)}
                className="block w-full p-4 text-left cursor-pointer transition-colors"
                style={{
                  borderTop: `1px solid ${accent.cardBorder}`,
                  borderRight: `1px solid ${accent.cardBorder}`,
                  borderBottom: `1px solid ${accent.cardBorder}`,
                  borderLeft: `4px solid ${accent.leftBorder}`,
                  backgroundColor: accent.cardBg,
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = accent.hoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = accent.cardBg;
                }}
              >
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[15px] font-bold" style={{ color: accent.title }}>{docking?.boat?.boat_name || "-"}</p>
                    </div>
                  </div>
                  <p className="m-0 mt-1 text-[12px] text-slate-500">
                    <span className="text-slate-600">TIME:</span>{" "}
                    <span style={{ color: "#1a1f36" }}>{formatTime(docking.docking_date)}</span>{" "}
                    <span className="mx-1 text-slate-300">|</span>{" "}
                    <span className="text-slate-600">INSPECTOR:</span>{" "}
                    <span style={{ color: "#1a1f36" }}>{getInspectorLabel(docking)}</span>
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </DetailDrawer>
  );
};
// ── Add Docking Modal ──────────────────────────────────────────────────────────
const AddDockingModal = ({ open, boats, fees, onClose, onSubmit, saving, prefillDate, initialDocking, serverErrors = {}, fiscalYear, isLookupsLoading }) => {
  const [form, setForm] = useState(() => buildDockingFormState(prefillDate, initialDocking, fiscalYear));
  const [errors, setErrors] = useState({});
  const hasManualTimeRef = useRef(false);

  // Convert error arrays to strings
  const normalizedServerErrors = useMemo(() => {
    const normalized = {};
    Object.entries(serverErrors).forEach(([key, value]) => {
      const message = Array.isArray(value) ? value[0] ?? "" : value;

      if (message === "Only one docking per boat per day is allowed.") {
        return;
      }

      normalized[key] = message;
    });
    return normalized;
  }, [serverErrors]);

  useEffect(() => {
    if (!open) return;
    hasManualTimeRef.current = false;
    setForm(buildDockingFormState(prefillDate, initialDocking, fiscalYear));
    setErrors(normalizedServerErrors);
  }, [open, prefillDate, initialDocking, normalizedServerErrors, fiscalYear]);

  useEffect(() => {
    if (!open || initialDocking) return undefined;

    const syncCurrentTime = () => {
      if (hasManualTimeRef.current) return;
      const currentTime = getManilaTimeParts();
      setForm((current) => {
        if (
          current.docking_time_hour === currentTime.hour &&
          current.docking_time_minute === currentTime.minute &&
          current.docking_time_meridiem === currentTime.meridiem
        ) {
          return current;
        }

        return {
          ...current,
          docking_time_hour: currentTime.hour,
          docking_time_minute: currentTime.minute,
          docking_time_meridiem: currentTime.meridiem,
        };
      });
    };

    syncCurrentTime();
    const intervalId = window.setInterval(syncCurrentTime, 1000);
    return () => window.clearInterval(intervalId);
  }, [open, initialDocking]);

  const selectedBoat = boats.find((b) => String(b.boat_id) === String(form.boat_id));
  const selectedBoatTypeId = selectedBoat ? getBoatTypeId(selectedBoat) : "";
  const availableFees = useMemo(() => fees.filter((fee) => {
    if (!isDockingFee(fee)) return false;
    if (!isFeeActive(fee)) return false;
    if (!selectedBoat) return false;
    return String(fee.boat_type_id || "") === selectedBoatTypeId;
  }), [fees, selectedBoat, selectedBoatTypeId]);

  useEffect(() => {
    if (!selectedBoat) {
      if (!form.fee_id && !form.docking_fee) return;
      setForm((current) => ({ ...current, fee_id: "", docking_fee: "" }));
      return;
    }

    if (availableFees.length === 0) {
      if (!form.fee_id && !form.docking_fee) return;
      setForm((current) => ({ ...current, fee_id: "", docking_fee: "" }));
      return;
    }

    const matchingFee = availableFees[0];
    const nextFeeId = String(matchingFee.fee_id);
    const nextDockingFee = matchingFee?.amount != null ? String(matchingFee.amount) : "";
    if (String(form.fee_id || "") === nextFeeId && String(form.docking_fee || "") === nextDockingFee) return;

    setForm((current) => ({
      ...current,
      fee_id: nextFeeId,
      docking_fee: nextDockingFee,
    }));
    setErrors((current) => ({ ...current, fee_id: "" }));
  }, [selectedBoat, availableFees, form.fee_id, form.docking_fee]);

  if (!open) return null;

  const selectedApplicableFee = availableFees.find((fee) => String(fee.fee_id) === String(form.fee_id));
  const applicableFeeValue = selectedApplicableFee ? formatFeeOptionAmount(selectedApplicableFee.amount) : "";
  const dockingFeeValue = form.docking_fee === "" ? "" : formatFeeOptionAmount(form.docking_fee);

  const validate = () => {
    const next = {};
    const builtDockingDate = buildDateFromParts(form.docking_date_year, form.docking_date_month, form.docking_date_day);
    const builtDockingTime = buildTwentyFourHourTime(form.docking_time_hour, form.docking_time_minute, form.docking_time_meridiem);
    if (!form.boat_id)      next.boat_id      = "Please select a boat.";
    if (!form.fee_id)       next.fee_id       = "Fee is required";
    if (!builtDockingDate)  next.docking_date = "Docking date is required.";
    if (builtDockingDate && isFutureDockingDate(builtDockingDate)) {
      next.docking_date = "Docking date cannot be in the future.";
    }
    if (!builtDockingTime)  next.docking_time = "Docking time is required.";
    return next;
  };

  const handleSave = () => {
    const next = validate();
    if (Object.keys(next).length) { setErrors(next); return; }
    const builtDockingDate = buildDateFromParts(form.docking_date_year, form.docking_date_month, form.docking_date_day);
    const builtDockingTime = buildTwentyFourHourTime(form.docking_time_hour, form.docking_time_minute, form.docking_time_meridiem);
    const payload = {
      boat_id:      form.boat_id,
      fee_id:       form.fee_id,
      docking_date: `${builtDockingDate} ${builtDockingTime}`,
      docking_fee:  parseMoneyValue(form.docking_fee),
    };

    if (
      initialDocking &&
      normalizeDockingPayloadForComparison(payload) ===
        normalizeDockingPayloadForComparison({
          boat_id: initialDocking.boat_id,
          fee_id: initialDocking.fee_id,
          docking_date: initialDocking.docking_date,
          docking_fee: initialDocking.docking_fee,
        })
    ) {
      onClose();
      showNoChangesToast();
      return;
    }

    onSubmit(payload);
  };

  return (
    <Modal
      title={initialDocking ? "Edit Docking" : "Add Docking"}
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      saveLabel={initialDocking ? "Save" : "Add"}
      closeOnBackdrop
    >
      <div className="flex flex-col gap-5">
        <Field label="Boat Name" required error={errors.boat_id}>
          <FilterSelect
            width="100%"
            height={46}
            showSearch
            loading={isLookupsLoading}
            placeholder="Select boat name"
            optionFilterProp="label"
            optionLabelProp="label"
            value={form.boat_id || undefined}
            onChange={(value) => {
              setForm((c) => ({ ...c, boat_id: value ?? "", fee_id: undefined, docking_fee: "" }));
              setErrors((c) => ({ ...c, boat_id: "", fee_id: "" }));
            }}
            options={boats.map((boat) => ({
              value: String(boat.boat_id),
              label: `${boat.boat_name}`,
            }))}
          />
        </Field>

        <ModalInput
          label="Boat Type"
          icon={IoLayersOutline}
          readOnly
          value={selectedBoat?.boat_type?.type_name || selectedBoat?.boatType?.type_name || ""}
          placeholder="Auto-filled after selecting a boat"
          wrapperClassName="!bg-slate-100"
        />

        <ModalInput
          label="Boat Owner"
          icon={IoPersonOutline}
          readOnly
          value={selectedBoat?.owner?.full_name || selectedBoat?.owner_name || ""}
          placeholder="Auto-filled after selecting a boat"
          wrapperClassName="!bg-slate-100"
        />

        <Field label="Applicable Fee" required error={errors.fee_id}>
          <div className="modal-input-shell flex h-[46px] items-center gap-3 rounded-[10px] border border-slate-200 bg-slate-100 px-4 transition-all">
            <input
              readOnly
              value={applicableFeeValue}
              placeholder={selectedBoat ? "No matching docking fee" : "₱0.00"}
              className="w-full cursor-default border-none bg-transparent text-[14px] font-medium text-[#0d1117] outline-none placeholder:font-normal placeholder:text-slate-400"
              style={{ fontFamily: FONT }}
            />
          </div>
        </Field>

        <Field label="Docking Date" required error={errors.docking_date}>
          <DatePicker
            value={form.docking_date || ""}
            onChange={(_, currentDateString) => {
              const selectedDate = currentDateString || "";
              const parts = getDateParts(selectedDate);
              setForm((current) => ({
                ...current,
                docking_date: selectedDate,
                docking_date_month: parts.month,
                docking_date_day: parts.day,
                docking_date_year: parts.year,
              }));
              setErrors((current) => ({ ...current, docking_date: "" }));
            }}
            placeholder="Select docking date"
            containerClassName="w-full"
            inputClassName={`!pl-4 !pr-10 ${errors.docking_date ? "border-red-300" : "border-slate-200"}`}
            popupClassName="codex-ant-date-picker-dropdown"
            options={{ maxDate: "today" }}
          />
        </Field>

        <Field label="Docking Time" required error={errors.docking_time}>
          <TimePicker
            value={getTimeValueFromParts(form.docking_time_hour, form.docking_time_minute, form.docking_time_meridiem)}
            onChange={(_, currentTimeString) => {
              hasManualTimeRef.current = true;
              setForm((current) => applyTimeValueToDockingForm(current, currentTimeString));
              setErrors((current) => ({ ...current, docking_time: "" }));
            }}
            placeholder="Select docking time"
            containerClassName="w-full"
            className={errors.docking_time ? "!border-red-300" : "!border-slate-200"}
            popupClassName="banyera-ant-time-picker-dropdown"
          />
        </Field>

        <ModalInput
          label="Docking Fee"
          icon={IoCashOutline}
          readOnly
          type="text"
          value={dockingFeeValue}
          onChange={(e) => {
            setForm((c) => ({ ...c, docking_fee: e.target.value }));
            setErrors((c) => ({ ...c, docking_fee: "" }));
          }}
          placeholder={`${PESO}0.00`}
          wrapperClassName="!bg-slate-100"
        />
      </div>
    </Modal>
  );
};

const EditDockingDrawer = ({ docking, open, boats, fees, onClose, onSubmit, saving, fiscalYear }) => {
  const [form, setForm] = useState(() => buildDockingFormState(null, docking, fiscalYear));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(buildDockingFormState(null, docking, fiscalYear));
    setErrors({});
  }, [open, docking, fiscalYear]);

  const selectedBoat = boats.find((b) => String(b.boat_id) === String(form.boat_id));
  const availableFees = fees.filter((fee) => {
    if (!isDockingFee(fee)) return false;
    if (!isFeeActive(fee)) return false;
    if (!selectedBoat) return false;
    return String(fee.boat_type_id || "") === getBoatTypeId(selectedBoat);
  });

  useEffect(() => {
    if (!selectedBoat || form.fee_id || availableFees.length === 0) return;
    const matchingFee = availableFees[0];
    setForm((current) => ({
      ...current,
      fee_id: String(matchingFee.fee_id),
      docking_fee: matchingFee?.amount != null ? String(matchingFee.amount) : "",
    }));
  }, [selectedBoat, availableFees, form.fee_id]);

  if (!docking) return null;

  const validate = () => {
    const next = {};
    const builtDockingDate = buildDateFromParts(form.docking_date_year, form.docking_date_month, form.docking_date_day);
    const builtDockingTime = buildTwentyFourHourTime(form.docking_time_hour, form.docking_time_minute, form.docking_time_meridiem);
    if (!form.boat_id) next.boat_id = "Please select a boat.";
    if (!form.fee_id) next.fee_id = "Please select a fee.";
    if (!builtDockingDate) next.docking_date = "Docking date is required.";
    if (builtDockingDate && isFutureDockingDate(builtDockingDate)) {
      next.docking_date = "Docking date cannot be in the future.";
    }
    if (!builtDockingTime) next.docking_time = "Docking time is required.";
    return next;
  };

  const handleSave = () => {
    const next = validate();
    if (Object.keys(next).length) { setErrors(next); return; }
    const builtDockingDate = buildDateFromParts(form.docking_date_year, form.docking_date_month, form.docking_date_day);
    const builtDockingTime = buildTwentyFourHourTime(form.docking_time_hour, form.docking_time_minute, form.docking_time_meridiem);
    onSubmit({
      boat_id: form.boat_id,
      fee_id: form.fee_id,
      docking_date: `${builtDockingDate} ${builtDockingTime}`,
      docking_fee: parseMoneyValue(form.docking_fee),
    });
  };

  return (
    <AntDrawer
      open={open}
      onClose={onClose}
      width={460}
      closable={false}
      classNames={{
        body: "hide-scrollbar",
        content: "hide-scrollbar",
        wrapper: "hide-scrollbar",
      }}
      styles={{
        body: { padding: 0, fontFamily: FONT, backgroundColor: "#f8fafc" },
        header: { display: "none" },
        footer: { padding: "16px 24px", borderTop: "1px solid #e5e7eb", backgroundColor: "#ffffff" },
      }}
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] font-semibold cursor-pointer hover:bg-gray-50 transition-colors"
            style={{ fontFamily: FONT, color: "#1a1f36" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-[13px] font-semibold cursor-pointer transition-colors"
            style={{ fontFamily: FONT, backgroundColor: saving ? "#6b7280" : "#1a1f36", border: "none" }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = "#2d3561"; }}
            onMouseLeave={(e) => { if (!saving) e.currentTarget.style.backgroundColor = "#1a1f36"; }}
          >
            {saving && <Spinner size={16} />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      }
    >
      <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: "#1a1f36" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10">
            <IoCreateOutline className="text-[18px] text-white" />
          </div>
          <div>
            <p className="m-0 text-[15px] font-bold text-white">Edit Docking Record</p>
            <p className="m-0 text-[11px] text-white/60">Update docking information</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center border-none cursor-pointer transition-colors"
          style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.2)"}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
        >
          <IoCloseOutline style={{ fontSize: 17 }} />
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <Field label="Boat Name" required error={errors.boat_id}>
            <FilterSelect
              width="100%"
              height={46}
              showSearch
              placeholder="Select boat name"
              optionFilterProp="label"
              optionLabelProp="label"
              value={form.boat_id || undefined}
              onChange={(value) => {
                setForm((c) => ({ ...c, boat_id: value ?? "", fee_id: undefined, docking_fee: "" }));
                setErrors((c) => ({ ...c, boat_id: "", fee_id: "" }));
              }}
              options={boats.map((boat) => ({
                value: String(boat.boat_id),
                label: `${boat.boat_name}`,
              }))}
            />
          </Field>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="space-y-4">
            <ModalInput label="Boat Type" icon={IoLayersOutline} readOnly value={selectedBoat?.boat_type?.type_name || selectedBoat?.boatType?.type_name || ""} placeholder="-" />
            <Field label="Applicable Fee" required error={errors.fee_id}>
              <FilterSelect
                width="100%"
                height={46}
                showSearch
                placeholder="Select an active fee"
                optionFilterProp="label"
                value={form.fee_id || undefined}
                disabled={!selectedBoat}
                onChange={(value) => {
                  const selectedFee = fees.find((f) => String(f.fee_id) === String(value));
                  setForm((c) => ({ ...c, fee_id: value ?? "", docking_fee: selectedFee ? String(selectedFee.amount) : "" }));
                  setErrors((c) => ({ ...c, fee_id: "" }));
                }}
                notFoundContent={selectedBoat ? "No matching docking fee for this boat type" : "Select a boat first"}
                options={availableFees.map((fee) => ({
                  value: String(fee.fee_id),
                  label: formatFeeOptionAmount(fee.amount),
                }))}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="space-y-4">
            <Field label="Docking Date" required error={errors.docking_date}>
              <DatePicker
                value={`${form.docking_date_year}-${form.docking_date_month}-${form.docking_date_day}`}
                onChange={(_, currentDateString) => {
                  const [year = "", month = "", day = ""] = String(currentDateString || "").split("-");
                  setForm((current) => ({
                    ...current,
                    docking_date_year: year,
                    docking_date_month: month,
                    docking_date_day: day,
                  }));
                  setErrors((current) => ({ ...current, docking_date: "" }));
                }}
                placeholder="Select docking date"
                containerClassName="w-full"
                inputClassName={`!pl-4 !pr-10 rounded-[10px] bg-white text-[13px] text-[#1a1f36] focus:border-[#4096ff] focus:ring-0 ${errors.docking_date ? "border-red-300" : "border-slate-200"}`}
                popupClassName="codex-ant-date-picker-dropdown"
                options={{ maxDate: "today" }}
              />
            </Field>
            <Field label="Docking Time" required error={errors.docking_time}>
              <TimePicker
                value={getTimeValueFromParts(form.docking_time_hour, form.docking_time_minute, form.docking_time_meridiem)}
                onChange={(_, currentTimeString) => {
                  setForm((current) => applyTimeValueToDockingForm(current, currentTimeString));
                  setErrors((current) => ({ ...current, docking_time: "" }));
                }}
                placeholder="Select docking time"
                containerClassName="w-full"
                className={errors.docking_time ? "!border-red-300" : "!border-slate-200"}
                popupClassName="banyera-ant-time-picker-dropdown"
              />
            </Field>
            <ModalInput label="Docking Fee" icon={IoCashOutline} readOnly type="number" min="0" step="0.01" value={form.docking_fee} onChange={(e) => { setForm((c) => ({ ...c, docking_fee: e.target.value })); setErrors((c) => ({ ...c, docking_fee: "" })); }} placeholder="0.00" />
          </div>
        </div>
      </div>
    </AntDrawer>
  );
};

// ── Docking Drawer ─────────────────────────────────────────────────────────────
const DockingDrawer = ({ docking, open, onClose, onBack }) => {
  if (!open || !docking) return null;
  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      onCloseButtonClick={onBack || onClose}
      closeIcon={onBack ? IoChevronBackOutline : IoCloseOutline}
      width={460}
      fontFamily={FONT}
      title="Docking Details"
      subtitle="Review the selected docking record."
      icon={IoBoatOutline}
    >
      <DrawerSection
        icon={IoCalendarOutline}
        title="Docking Information"
        subtitle="Recorded details for this docking entry"
        fontFamily={FONT}
      >
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Boat Name", value: docking?.boat?.boat_name || "-" },
            {
              label: "Status",
              value: isDockingVoided(docking) ? "Voided" : "Active",
              indicatorColor: getDockingStatusLegendColor(isDockingVoided(docking) ? "voided" : "active"),
            },
            { label: "Boat Type", value: getBoatTypeLabel(docking) },
            { label: "Boat Owner", value: docking?.boat?.owner?.full_name || docking?.boat?.owner_name || "-" },
            { label: "Docking Date", value: formatDate(docking.docking_date) },
            { label: "Docking Time", value: formatTime(docking.docking_date) },
            { label: "Docking Fee", value: formatPeso(docking.docking_fee), className: "col-span-2" },
          ].map(({ label, value, indicatorColor, className }) => (
            <DrawerInfoCard
              key={label}
              label={label}
              value={value}
              indicatorColor={indicatorColor}
              className={className}
            />
          ))}
        </div>
      </DrawerSection>

      <DrawerSection
        icon={IoPersonOutline}
        title="Docking Personnel"
        subtitle="Inspector information for this record"
        fontFamily={FONT}
      >
        <DrawerInfoCard label="Inspector" value={getInspectorLabel(docking)} />
      </DrawerSection>

      {isDockingVoided(docking) ? (
        <DrawerSection
          icon={IoAlertCircleOutline}
          title="Void Details"
          subtitle="Reason and status for this voided docking record"
          fontFamily={FONT}
        >
          <div className="grid grid-cols-2 gap-3">
            <DrawerInfoCard label="Void Reason" value={docking?.void_reason || "-"} className="col-span-2" />
            <DrawerInfoCard label="Voided By" value={getVoidedByLabel(docking)} className="col-span-2" />
          </div>
        </DrawerSection>
      ) : null}
    </DetailDrawer>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────
const SuperDocking = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const queryClient = useQueryClient();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);
  const fiscalYearNumber = normalizeFiscalYear(fiscalYear);

  const [activeItem, setActiveItem]           = useState("Docking");
  const [contentMargin, setContentMargin]     = useState(() => (window.innerWidth >= 900 ? 256 : 0));
  const [search, setSearch]                   = useState("");
  const [statusFilter, setStatusFilter]       = useState("all");
  const [periodFilter, setPeriodFilter]       = useState("all");
  const [activeView, setActiveView]           = useState(() => getDockingViewFromPath(location.pathname));
  const [requestedPage, setRequestedPage]     = useState(1);
  const [currentPage, setCurrentPage]         = useState(1);
  const [showAddModal, setShowAddModal]       = useState(false);
  const [prefillDate, setPrefillDate]         = useState(null);
  const [selectedDocking, setSelectedDocking] = useState(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [editingDocking, setEditingDocking]   = useState(null);
  const [voidingDockingId, setVoidingDockingId] = useState(null);
  const [pendingVoidDocking, setPendingVoidDocking] = useState(null);
  const [voidReasonOption, setVoidReasonOption] = useState("");
  const [voidReasonCustom, setVoidReasonCustom] = useState("");
  const [voidReasonError, setVoidReasonError] = useState("");
  const [saving, setSaving]                   = useState(false);
  const [serverErrors, setServerErrors]       = useState({});
  const [hasLoadedCalendarOnce, setHasLoadedCalendarOnce] = useState(false);
  const didRunTableFilterResetRef = useRef(false);
  const { transactionLock, isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const isHeadViewOnly = isHeadRole();
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const rawHighlightedDockingId = getDockingHighlightId({ highlightedSearchResult, search: location.search });
  const highlightToken = rawHighlightedDockingId
    ? `${rawHighlightedDockingId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedDockingId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedDockingId;
  const clearUniversalHighlight = React.useCallback(() => {
    const params = new URLSearchParams(location.search);
    const hadHighlight = params.delete("highlight");

    if (hadHighlight) {
      params.delete("status");
    }

    if (!highlightedSearchResult && !hadHighlight) return;

    if (highlightToken) {
      setDismissedHighlightToken(highlightToken);
    }

    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true, state: null }
    );
  }, [highlightToken, highlightedSearchResult, location.pathname, location.search, navigate]);
  useEffect(() => {
    setDismissedHighlightToken("");
  }, [location.key]);

  useEffect(() => {
    const nextView = getDockingViewFromPath(location.pathname);
    setActiveView(nextView);
    cacheTab(DOCKING_TAB_STORAGE_KEY, nextView, DOCKING_TAB_KEYS);

    if (location.pathname === "/docking" && nextView === "schedule") {
      navigate("/docking-calendar", { replace: true, state: location.state });
    }
  }, [location.pathname, location.state, navigate]);

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(() => getFiscalCalendarDate(fiscalYear));

  const calYear  = calendarDate.getFullYear();
  const calMonth = calendarDate.getMonth();
  const isFirstFiscalMonth = calMonth === 0;
  const isLastFiscalMonth = calMonth === 11;
  const calendarRange = useMemo(() => ({
    start: toDateKey(new Date(calYear, calMonth, 1)),
    end: toDateKey(new Date(calYear, calMonth + 1, 0)),
  }), [calMonth, calYear]);

  useEffect(() => {
    setCalendarDate((current) => getFiscalCalendarDate(fiscalYear, current.getMonth()));
    setSelectedCalendarDate(null);
  }, [fiscalYear]);

  const { data, isLoading, isFetching, isError } = useDockingsDataQuery({
    page: currentPage,
    perPage: PAGE_SIZE,
    search: debouncedSearch,
    dockingStatus: statusFilter,
    dockingPeriod: periodFilter,
    highlightDockingId: highlightedDockingId,
    paginated: true,
    includeLookups: false,
  }, {
    enabled: activeView === "records" || activeView === "schedule" || (!isHeadViewOnly && (showAddModal || Boolean(editingDocking))),
  });
  const { data: lookupsData, isLoading: isLookupsLoading } = useDockingLookupsQuery({
    enabled: !isHeadViewOnly && (showAddModal || Boolean(editingDocking)),
  });
  const {
    data: calendarDockings = [],
    isLoading: isCalendarLoading,
    isPlaceholderData: isCalendarPlaceholderData,
    isError: isCalendarError,
  } = useDockingCalendarQuery(calendarRange, {
    enabled: activeView === "schedule" && Boolean(calendarRange.start && calendarRange.end),
  });

  useEffect(() => {
    if (window.innerWidth >= 900 && sidebarOpen) {
      setContentMargin(sidebarCollapsed ? 72 : 256);
    } else if (window.innerWidth < 900) {
      setContentMargin(0);
    }
  }, [sidebarCollapsed, sidebarOpen]);

  const dockings = data?.dockings ?? [];
  const dockingsMeta = data?.dockingsMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const dockingStats = data?.stats ?? {
    total_records: 0,
    logged_today: 0,
    total_fee_today: 0,
  };
  const lookupBoats = lookupsData?.boats ?? EMPTY_ARRAY;
  const lookupFees = lookupsData?.fees ?? EMPTY_ARRAY;
  const lookupUsers = lookupsData?.users ?? EMPTY_ARRAY;
  const boats    = useMemo(() => lookupBoats.filter((b) => !b.deleted_at), [lookupBoats]);
  const fees     = useMemo(() => lookupFees, [lookupFees]);

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const calDays = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [firstDay, daysInMonth]);

  const dockingsByDate = useMemo(() => {
    const grouped = new Map();

    calendarDockings.forEach((docking) => {
      const dateKey = String(docking?.docking_date || "").slice(0, 10);
      if (!dateKey) return;

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }

      grouped.get(dateKey).push(docking);
    });

    return grouped;
  }, [calendarDockings]);

  const getDockingsForDay = (day) => {
    if (!day) return [];
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return dockingsByDate.get(dateStr) ?? [];
  };

  const isToday = (day) => {
    const [year, month, date] = getManilaDateString().split("-").map(Number);
    return day === date && calMonth === month - 1 && calYear === year;
  };

  const handleDayClick = (day) => {
    if (!day) return;
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedCalendarDate(dateStr);
  };

  const handleViewChange = (nextView) => {
    setActiveView(nextView);
    cacheTab(DOCKING_TAB_STORAGE_KEY, nextView, DOCKING_TAB_KEYS);

    const nextPath = nextView === "schedule" ? "/docking-calendar" : "/docking";

    if (location.pathname !== nextPath || highlightedDockingId) {
      navigate(nextPath, { replace: false, state: null });
    }
  };

  // ── Table helpers ─────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Number(dockingsMeta.last_page || 1));
  const safePage   = Math.min(requestedPage, totalPages);
  const paginated  = dockings;
  const hasDockingsResponse = Boolean(data?.dockingsMeta);
  const showInitialSkeleton = !isError && isLoading && !data;
  const showCalendarDataSkeleton = activeView === "schedule" && (isCalendarLoading || isCalendarPlaceholderData);
  const showCalendarSkeleton = activeView === "schedule" && !hasLoadedCalendarOnce && (showCalendarDataSkeleton || showInitialSkeleton);
  const showCalendarGridSkeleton = showCalendarDataSkeleton || showCalendarSkeleton;
  const isActiveTabLoading = activeView === "schedule" ? showCalendarDataSkeleton : showInitialSkeleton;

  useEffect(() => {
    if (activeView === "schedule" && !showInitialSkeleton && !showCalendarDataSkeleton) {
      setHasLoadedCalendarOnce(true);
    }
  }, [activeView, showCalendarDataSkeleton, showInitialSkeleton]);
  const selectedCalendarDockings = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return dockingsByDate.get(selectedCalendarDate) ?? [];
  }, [dockingsByDate, selectedCalendarDate]);
  const selectedCalendarDateLabel = selectedCalendarDate ? formatDate(selectedCalendarDate) : "";

  useEffect(() => {
    if (!didRunTableFilterResetRef.current) {
      didRunTableFilterResetRef.current = true;
      return;
    }

    setRequestedPage(1);
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, periodFilter]);

  useEffect(() => {
    if (requestedPage === currentPage) return undefined;

    const timeout = window.setTimeout(() => {
      setCurrentPage(requestedPage);
    }, PAGE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [currentPage, requestedPage]);

  useEffect(() => {
    if (requestedPage <= totalPages) return;
    setRequestedPage(totalPages);
    setCurrentPage(totalPages);
  }, [requestedPage, totalPages]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("q")) {
      setSearch(params.get("q") || "");
    }
    if (params.get("highlight")?.startsWith("docking-")) {
      setRequestedPage(1);
      setCurrentPage(1);
    }
  }, [location.search]);

  useEffect(() => {
    if (!highlightedDockingId) return;
    const resolvedPage = Number(dockingsMeta.current_page || 0);
    if (resolvedPage > 0 && (resolvedPage !== currentPage || resolvedPage !== requestedPage)) {
      setRequestedPage(resolvedPage);
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, dockingsMeta.current_page, highlightedDockingId, requestedPage]);

  const highlightedDockingIndex = highlightedDockingId
    ? dockings.findIndex((docking) => String(highlightedDockingId) === String(docking.docking_id))
    : -1;

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalRecords  = dockingStats.total_records ?? 0;
  const todayKey      = getManilaDateString();
  const isLockedDockingDate = (value) =>
    Boolean(transactionLock?.date) && String(value || "").slice(0, 10) === transactionLock.date;
  const isTodayDateLocked = transactionLock?.date === todayKey;
  const loggedToday   = dockingStats.logged_today ?? 0;
  const totalFeeToday = parseMoneyValue(dockingStats.total_fee_today);

  // ── API actions ───────────────────────────────────────────────────────────
  const upsertDockingInCache = React.useCallback((nextDocking) => {
    if (!nextDocking) return;

    const hydrateDocking = (record) =>
      mergeDockingRecordWithLookups(record, lookupBoats, lookupFees, lookupUsers);

    upsertDockingInDataCache(queryClient, nextDocking, hydrateDocking);

    setSelectedDocking((current) =>
      String(current?.docking_id ?? "") === String(nextDocking.docking_id)
        ? mergeDockingRecordWithLookups(
            nextDocking,
            lookupBoats,
            lookupFees,
            lookupUsers
          )
        : current
    );
  }, [lookupBoats, lookupFees, lookupUsers, queryClient]);

  const syncDockingCalendarCache = React.useCallback((nextDocking) => {
    if (!nextDocking?.docking_id) return;

    const hydrateDocking = (record) =>
      mergeDockingRecordWithLookups(record, lookupBoats, lookupFees, lookupUsers);

    syncDockingCalendarDataCache(queryClient, nextDocking, hydrateDocking, isDockingVoided);

    setSelectedCalendarDate((currentDate) => {
      if (!currentDate) return currentDate;

      const stillHasDockings = hasDockingCalendarItemsForDate(
        queryClient,
        currentDate,
        isDockingVoided
      );

      return stillHasDockings ? currentDate : null;
    });
  }, [lookupBoats, lookupFees, lookupUsers, queryClient]);

  const closeDockingModal = () => {
    setShowAddModal(false);
    setEditingDocking(null);
    setPrefillDate(null);
    setServerErrors({});
  };

  const voidDockingMutation = useMutation({
    mutationFn: async ({ dockingId, void_reason }) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.patch(`/dockings/${dockingId}/void`, { void_reason });
      return response.data;
    },
    onMutate: ({ dockingId }) => setVoidingDockingId(dockingId),
    onSuccess: (response) => {
      const nextDocking = response?.docking ?? null;
      if (nextDocking) {
        upsertDockingInCache(nextDocking);
        syncDockingCalendarCache(nextDocking);
        updateDockingStatsInCache(queryClient, nextDocking, "void");
      }
      void queryClient.invalidateQueries({ queryKey: ["dockings-calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["docking-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
      setPendingVoidDocking(null);
      setVoidReasonOption("");
      setVoidReasonCustom("");
      setVoidReasonError("");
      showBottomToast("success", "Docking Voided", response?.message ?? "The docking record was voided successfully.");
    },
    onError: (error) => {
      showBottomToast("error", "Void Failed", error.response?.data?.message ?? "Unable to void the docking record.");
    },
    onSettled: () => setVoidingDockingId(null),
  });

  const restoreDockingMutation = useMutation({
    mutationFn: async (dockingId) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.patch(`/dockings/${dockingId}/restore`);
      return response.data;
    },
    onMutate: (dockingId) => setVoidingDockingId(dockingId),
    onSuccess: (response) => {
      const nextDocking = response?.docking ?? null;
      if (nextDocking) {
        upsertDockingInCache(nextDocking);
        syncDockingCalendarCache(nextDocking);
        updateDockingStatsInCache(queryClient, nextDocking, "restore");
      }
      void queryClient.invalidateQueries({ queryKey: ["dockings-calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["docking-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
      showBottomToast("success", "Docking Restored", response?.message ?? "The docking record was restored successfully.");
    },
    onError: (error) => {
      showBottomToast("error", "Restore Failed", error.response?.data?.message ?? "Unable to restore the docking record.");
    },
    onSettled: () => setVoidingDockingId(null),
  });

  const handleSaveDocking = async (payload) => {
    if (isHeadViewOnly) return;

    if (isTransactionLocked || isLockedDockingDate(payload?.docking_date)) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    setSaving(true);
    try {
      let savedDocking = null;

      if (editingDocking?.docking_id) {
        const response = await api.put(`/dockings/${editingDocking.docking_id}`, payload);
        savedDocking = normalizeDockingResponse(response.data);
      } else {
        const response = await api.post("/dockings", payload);
        savedDocking = normalizeDockingResponse(response.data);
      }

      const hydrateDocking = (record) =>
        mergeDockingRecordWithLookups(record, lookupBoats, lookupFees, lookupUsers);

      upsertDockingInDataCache(queryClient, savedDocking ?? payload, hydrateDocking, {
        insertIfMissing: !editingDocking,
      });

      if (!editingDocking && savedDocking) {
        updateDockingStatsInCache(queryClient, savedDocking, "add");
      }

      closeDockingModal();
      if (editingDocking) {
        showUpdatedToast("Docking", "docking record");
      } else {
        showAddedToast("Docking", "docking record");
      }
      void queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["docking-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
      if (savedDocking) {
        syncDockingCalendarCache(savedDocking);
      }
      void queryClient.invalidateQueries({ queryKey: ["dockings-calendar"] });
    } catch (error) {
      // Handle validation errors from backend
      if (error.response?.status === 422 && error.response?.data?.errors) {
        setServerErrors(error.response.data.errors);
        showBottomToast(
          "error",
          editingDocking ? "Update Failed" : "Save Failed",
          error.response?.data?.message ?? "Unable to save the docking record."
        );
      } else {
        showBottomToast(
          "error",
          editingDocking ? "Update Failed" : "Save Failed",
          error.response?.data?.message ?? "Unable to save the docking record."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const openVoidDocking = (docking) => {
    if (isHeadViewOnly) return;

    if (isLockedDockingDate(docking?.docking_date)) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    if (!isDockingEditableToday(docking)) {
      showBottomToast("error", "Void Disabled", "Only today's docking records can be voided.");
      return;
    }

    if (docking?.is_billed) {
      showBottomToast("error", "Void Disabled", "This docking record has been billed and can no longer be voided.");
      return;
    }

    if (isDockingVoided(docking)) return;

    setPendingVoidDocking(docking);
    setVoidReasonOption("");
    setVoidReasonCustom("");
    setVoidReasonError("");
  };

  const restoreDocking = (docking) => {
    if (isHeadViewOnly) return;

    if (isLockedDockingDate(docking?.docking_date)) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    if (!isDockingEditableToday(docking)) {
      showBottomToast("error", "Restore Disabled", "Only today's docking records can be restored.");
      return;
    }

    if (docking?.is_billed) {
      showBottomToast("error", "Restore Disabled", "This docking record has been billed and can no longer be restored.");
      return;
    }

    if (!isDockingVoided(docking)) return;

    restoreDockingMutation.mutate(docking.docking_id);
  };

  return (
    <ConfigProvider theme={antTheme}>
      <style>{`
        * { font-family: ${FONT} !important; }
        .docking-ant-select .ant-select-selector {
          border-radius: 10px !important;
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
        .docking-ant-select.ant-select-disabled .ant-select-selector {
          background: #f8fafc !important;
          border-color: #e2e8f0 !important;
          box-shadow: none !important;
          cursor: not-allowed !important;
        }
        .docking-ant-select.ant-select-disabled .ant-select-selection-item,
        .docking-ant-select.ant-select-disabled .ant-select-selection-placeholder,
        .docking-ant-select.ant-select-disabled .ant-select-arrow {
          color: #94a3b8 !important;
          opacity: 0.6 !important;
        }
        .docking-ant-select-dropdown {
          border-radius: 10px !important;
          overflow: hidden !important;
          border: 1px solid #e5e7eb !important;
          box-shadow: 0 4px 24px rgba(0,0,0,0.13) !important;
          padding: 0 !important;
          z-index: 11000 !important;
        }
        .docking-ant-select-dropdown .ant-select-item {
          border-radius: 0 !important;
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
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onWidthChange={setContentMargin} />
        <div
          className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden"
          style={{ marginLeft: sidebarOpen && window.innerWidth >= 900 ? `${contentMargin}px` : "0px" }}
        >
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />

          <main className="min-w-0 flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">

            {/* Page Header */}
            <div className="mb-5 flex items-center justify-between">
              <TitlePage title="Docking" subtitle="Track live docking activity." loading={showInitialSkeleton} />
              <Breadcrumbs
                items={[
                  { label: "Dashboard", to: "/dashboard" },
                  { label: activeView === "schedule" ? "Docking Calendar" : "Docking" },
                ]}
                fontFamily={FONT}
                loading={showInitialSkeleton}
              />
            </div>

            {/* Overview */}
            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <OverviewCard title="Total Docking Records" value={totalRecords} icon={IoCalendarOutline} tone="navy" loading={showInitialSkeleton} />
              <OverviewCard title="Today's Docking" value={loggedToday} icon={IoCheckmarkOutline} tone="green" loading={showInitialSkeleton} />
              <OverviewCard title="Today's Total Docking" value={formatPeso(totalFeeToday)} icon={IoCashOutline} tone="navy" loading={showInitialSkeleton} />
            </div>

            {/* ── Calendar ── */}
            <Tabs
              tabs={DOCKING_VIEW_TABS}
              activeKey={activeView}
              onTabChange={handleViewChange}
              fontFamily={FONT}
              className="mb-5 bg-white"
              loading={activeView === "schedule" ? showCalendarSkeleton : !data && isLoading}
              rightContent={activeView === "records" ? (
                <Legend
                  items={DOCKING_STATUS_LEGEND}
                  className="gap-3"
                  itemClassName="gap-2"
                  loading={showInitialSkeleton}
                  skeletonCount={DOCKING_STATUS_LEGEND.length}
                />
              ) : null}
            >
            {activeView === "schedule" ? (
            <div className="mb-5 overflow-hidden border border-gray-200 bg-white">

              {/* Clean white header */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-slate-200 px-6 py-4 bg-white">
                {showCalendarSkeleton ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 animate-pulse rounded-[10px] bg-slate-200" />
                      <div className="h-8 w-8 animate-pulse rounded-[10px] bg-slate-200" />
                    </div>

                    <div className="h-[18px] w-28 animate-pulse rounded bg-slate-200" />

                    <div className="flex justify-end">
                      {!isHeadViewOnly ? <div className="h-[42px] w-32 animate-pulse rounded-[10px] bg-slate-200" /> : null}
                    </div>
                  </>
                ) : (
                  <>

                {/* Left: Prev / Next + Add Docking */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (isFirstFiscalMonth) return;
                      setCalendarDate(new Date(fiscalYearNumber, calMonth - 1, 1));
                    }}
                    disabled={isFirstFiscalMonth}
                    className={`w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors ${isFirstFiscalMonth ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
                    style={{ border: "1.5px solid #dbe2ea", backgroundColor: "#ffffff" }}
                    onMouseEnter={e => { if (!isFirstFiscalMonth) e.currentTarget.style.backgroundColor = "#f8fafc"; }}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "#ffffff"}
                  >
                    <IoChevronBackOutline style={{ color: "#1a1f36", fontSize: 14 }} />
                  </button>
                  <button
                    onClick={() => {
                      if (isLastFiscalMonth) return;
                      setCalendarDate(new Date(fiscalYearNumber, calMonth + 1, 1));
                    }}
                    disabled={isLastFiscalMonth}
                    className={`w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors ${isLastFiscalMonth ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
                    style={{ border: "1.5px solid #dbe2ea", backgroundColor: "#ffffff" }}
                    onMouseEnter={e => { if (!isLastFiscalMonth) e.currentTarget.style.backgroundColor = "#f8fafc"; }}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "#ffffff"}
                  >
                    <IoChevronForwardOutline style={{ color: "#1a1f36", fontSize: 14 }} />
                  </button>
                </div>

                {/* Center: Month / Year */}
                <p className="m-0 text-[15px] font-bold" style={{ color: "#1a1f36" }}>
                  {MONTHS[calMonth]} {calYear}
                </p>

                <div className="flex justify-end">
                  {!isHeadViewOnly ? (
                    <Tooltip title={isTransactionLocked ? transactionLockMessage : isTodayDateLocked ? transactionLockMessage : "Add Docking"}>
                      <button
                        onClick={() => {
                          clearUniversalHighlight();
                          if (isTransactionLocked || isTodayDateLocked) return;
                          setEditingDocking(null);
                          setPrefillDate(null);
                          setShowAddModal(true);
                        }}
                        disabled={isTransactionLocked || isTodayDateLocked}
                        className="flex h-[42px] items-center justify-center gap-2 rounded-[10px] border-none px-5 text-[13px] font-semibold text-white cursor-pointer transition-colors"
                        style={{ backgroundColor: isTransactionLocked || isTodayDateLocked ? "#94a3b8" : "#1a1f36" }}
                        onMouseEnter={e => { if (!isTransactionLocked && !isTodayDateLocked) e.currentTarget.style.backgroundColor = "#2d3561"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = isTransactionLocked || isTodayDateLocked ? "#94a3b8" : "#1a1f36"; }}
                      >
                        <IoAddOutline style={{ fontSize: 16 }} />
                        Add Docking
                      </button>
                    </Tooltip>
                  ) : null}
                </div>
                  </>
                )}
              </div>

              {/* Day-of-week labels */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #f3f4f6" }}>
                {DAYS.map((day) => (
                  <div key={day} style={{ padding: "12px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em" }}>
                    {showCalendarSkeleton ? (
                      <span className="mx-auto block h-[13px] w-7 animate-pulse rounded bg-slate-200" />
                    ) : (
                      day
                    )}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                {isCalendarError ? (
                  <div className="col-span-7 flex min-h-[360px] items-center justify-center text-[13px] text-red-500">
                    Unable to load docking calendar right now.
                  </div>
                ) : showCalendarGridSkeleton ? (
                  Array.from({ length: Math.max(35, calDays.length) }).map((_, idx) => (
                    <div
                      key={`calendar-skeleton-${idx}`}
                      className="animate-pulse"
                      style={{
                        minHeight: 110,
                        borderBottom: "1px solid #f3f4f6",
                        borderRight: "1px solid #f3f4f6",
                        padding: 8,
                        backgroundColor: "#ffffff",
                      }}
                    >
                      <div className="mb-4 h-5 w-5 rounded-full bg-slate-100" />
                      <div className="mb-2 h-4 w-24 rounded bg-slate-100" />
                      <div className="h-4 w-16 rounded bg-slate-100" />
                    </div>
                  ))
                ) : calDays.map((day, idx) => {
                  const dayDockings = getDockingsForDay(day);
                  const today       = isToday(day);
                  const visible     = dayDockings.slice(0, 3);
                  const overflow    = dayDockings.length - 3;

                  return (
                    <div
                      key={idx}
                      onClick={() => handleDayClick(day)}
                      style={{
                        minHeight: 110,
                        borderBottom: "1px solid #f3f4f6",
                        borderRight: "1px solid #f3f4f6",
                        padding: 8,
                        cursor: day ? "pointer" : "default",
                        backgroundColor: today ? "rgba(239,246,255,0.6)" : day ? "white" : "#fafbfc",
                        transition: "background-color 0.15s",
                      }}
                      onMouseEnter={e => { if (day && !today) e.currentTarget.style.backgroundColor = "rgba(239,246,255,0.4)"; }}
                      onMouseLeave={e => { if (day && !today) e.currentTarget.style.backgroundColor = "white"; }}
                    >
                      {day && (
                        <>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 24,
                            height: 24,
                            minWidth: 24,
                            minHeight: 24,
                            lineHeight: 1,
                            borderRadius: "50%",
                            fontSize: 12,
                            fontWeight: 600,
                            margin: "0 auto 4px",
                            backgroundColor: today ? "#1a1f36" : "transparent",
                            color: today ? "white" : "#475569",
                          }}>
                            {day}
                          </span>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {visible.map((item) => {
                              const c = { bg: "#eff6ff", bar: "#2563eb", text: "#2563eb" };
                              return (
                                <div
                                  key={item.docking_id}
                                  onClick={(e) => { e.stopPropagation(); setSelectedDocking(item); }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "2px 6px",
                                    backgroundColor: c.bg,
                                    borderLeft: `4px solid ${c.bar}`,
                                    cursor: "pointer",
                                    overflow: "hidden",
                                  }}
                                >
                                  <span style={{ fontSize: 11, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {item?.boat?.boat_name || "Docking"}
                                  </span>
                                </div>
                              );
                            })}
                            {overflow > 0 && (
                              <Tooltip
                                title={
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    {dayDockings.slice(visible.length).map((item) => (
                                      <p key={item.docking_id} style={{ margin: 0, fontSize: 13, fontFamily: FONT }}>
                                        {item?.boat?.boat_name || "Docking"}
                                      </p>
                                    ))}
                                  </div>
                                }
                                placement="top"
                              >
                                <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", padding: "2px 6px", cursor: "help" }}>+{overflow} more</div>
                              </Tooltip>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            ) : null}

            {/* ── Docking Records Table ── */}
            {activeView === "records" ? (
            <TableCard
              title="Docking Records"
              subtitle="All docking records in the system"
              loading={showInitialSkeleton}
              headerActionsSkeletonCount={isHeadViewOnly ? 3 : 4}
              className="mt-[-1px]"
              actions={
                <>
                  <div
                    className="flex items-center gap-2.5 rounded-[10px] border border-gray-200 bg-white px-4 transition-all"
                    style={{ height: 42, width: 300 }}
                    onFocus={(event) => {
                      event.currentTarget.style.borderColor = "#4096ff";
                      event.currentTarget.style.boxShadow = "none";
                    }}
                    onBlur={(event) => {
                      event.currentTarget.style.borderColor = "#e5e7eb";
                      event.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <IoSearchOutline className="flex-shrink-0 text-[17px]" style={{ color: "#1a1f36" }} />
                    <input
                      value={search}
                      onChange={(e) => {
                        clearUniversalHighlight();
                        setSearch(e.target.value);
                        setRequestedPage(1);
                        setCurrentPage(1);
                      }}
                      placeholder="Search for boat name, boat type, date added, fee"
                      className="w-full border-none bg-transparent text-[13px] outline-none"
                      style={{ fontFamily: FONT, color: "#1a1f36" }}
                    />
                  </div>
                  <FilterButton
                    {...DOCKING_FILTER_DROPDOWN_PROPS}
                    value={periodFilter}
                    onChange={(value) => {
                      clearUniversalHighlight();
                      setPeriodFilter(value);
                    }}
                    width={150}
                    height={42}
                    options={PERIOD_OPTIONS}
                  />
                  <FilterButton
                    {...DOCKING_FILTER_DROPDOWN_PROPS}
                    value={statusFilter}
                    onChange={(value) => {
                      clearUniversalHighlight();
                      setStatusFilter(value);
                    }}
                    width={140}
                    height={42}
                    options={STATUS_OPTIONS}
                  />
                  {!isHeadViewOnly ? (
                    <button
                      onClick={() => {
                        clearUniversalHighlight();
                        if (isTransactionLocked || isTodayDateLocked) return;
                        setEditingDocking(null);
                        setPrefillDate(null);
                        setShowAddModal(true);
                      }}
                      disabled={isTransactionLocked || isTodayDateLocked}
                      className="flex h-[42px] items-center justify-center gap-2 rounded-[10px] border-none px-5 text-[13px] font-semibold text-white cursor-pointer disabled:cursor-not-allowed"
                      style={{ backgroundColor: isTransactionLocked || isTodayDateLocked ? "#94a3b8" : "#1a1f36" }}
                    >
                      <IoAddOutline className="text-[16px]" />Add Docking
                    </button>
                  ) : null}
                </>
              }
              bodyClassName="overflow-x-auto"
              pagination={{
                meta: dockingsMeta,
                totalPages,
                currentPage: safePage,
                requestedPage,
                isLoading: showInitialSkeleton,
                beforePageChange: clearUniversalHighlight,
                onPageChange: setRequestedPage,
              }}
            >
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: 1260 }}>
                      <thead>
                        <tr style={{ backgroundColor: "#ffffff" }}>
                      <TH>Boat Name</TH>
                      <TH>Boat Type</TH>
                      <TH>Docking Date</TH>
                      <TH>Docking Time</TH>
                      <TH><div className="text-right">{`Fee (${PESO})`}</div></TH>
                      <TH>Voided Reason</TH>
                      {!isHeadViewOnly ? <TH>Action</TH> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {showInitialSkeleton ? (
                      Array.from({ length: PAGE_SIZE }).map((_, index) => (
                        <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td className="px-4 py-3">
                            <div className="h-3 w-28 rounded bg-slate-100" />
                          </td>
                          <td className="px-4 py-3"><div className="h-3 w-24 rounded bg-slate-100" /></td>
                          <td className="px-4 py-3"><div className="h-3 w-32 rounded bg-slate-100" /></td>
                          <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-slate-100" /></td>
                          <td className="px-4 py-3">
                            <div className="ml-auto h-3 w-20 rounded bg-slate-100" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="h-3 w-32 rounded bg-slate-100" />
                          </td>
                          {!isHeadViewOnly ? (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-lg bg-slate-100" />
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))
                    ) : isError ? (
                      <tr><td colSpan={isHeadViewOnly ? 6 : 7} className="px-5 py-8 text-center text-[13px] font-normal text-red-500">Unable to load docking records right now.</td></tr>
                    ) : paginated.length === 0 ? (
                      <tr>
                        <td colSpan={isHeadViewOnly ? 6 : 7}>
                          {search ? <NoDataFound title="No results found" /> : <NoDataFound />}
                        </td>
                      </tr>
                    ) : (
                      paginated.map((docking, index) => (
                        (() => {
                          const isHighlighted =
                            highlightedDockingId &&
                            String(highlightedDockingId) === String(docking.docking_id);
                          const isVoided = isDockingVoided(docking);
                          return (
                        <tr key={docking.docking_id} className={`cursor-pointer transition-colors ${highlightedDockingId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${isHighlighted ? "universal-search-highlight" : ""}`.trim()}
                          onClick={() => setSelectedDocking(docking)}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                          }}>
                          {/** Hide edit for voided records to match Banyera and Tickets. */}
                          <td className="px-4 py-3">
                            <button onClick={(e) => { e.stopPropagation(); setSelectedDocking(docking); }} className="border-none bg-transparent text-left cursor-pointer">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                  style={{ backgroundColor: isVoided ? "#f59e0b" : "#16a34a" }}
                                />
                                <p className="m-0 text-[13px] font-medium text-[#1a1f36]">{docking?.boat?.boat_name || "-"}</p>
                              </div>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[13px]" style={{ color: "#1a1f36" }}>{getBoatTypeLabel(docking)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[13px]" style={{ color: "#1a1f36" }}>{formatDate(docking.docking_date)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[13px]" style={{ color: "#1a1f36" }}>{formatTime(docking.docking_date)}</span>
                          </td>
                          <td
                            className="px-4 py-3 text-right text-[13px] font-semibold whitespace-nowrap"
                            style={{ color: "#1a1f36", fontVariantNumeric: "tabular-nums" }}
                          >
                            {formatMoneyValue(docking.docking_fee)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[13px]" style={{ color: "#1a1f36" }}>
                              {docking?.void_reason || "-"}
                            </span>
                          </td>
                          {!isHeadViewOnly ? (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const isLocked = isLockedDockingDate(docking.docking_date);
                                  const isTodayRecord = isDockingEditableToday(docking);
                                  const isBilled = Boolean(docking?.is_billed);
                                  const voidDisabled = isTransactionLocked || isLocked || !isTodayRecord || isBilled;
                                  const voidTooltip = isTransactionLocked || isLocked
                                    ? transactionLockMessage
                                    : isBilled
                                      ? (isVoided ? "Cannot restore - this docking record has been billed" : "Cannot void - this docking record has been billed")
                                      : !isTodayRecord
                                        ? (isVoided ? "Cannot restore - only today's docking records can be restored" : "Cannot void - only today's docking records can be voided")
                                        : isVoided
                                          ? "Restore"
                                          : "Void";

                                  return (
                                    <Tooltip title={voidTooltip}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (voidDisabled) return;
                                          if (isVoided) {
                                            restoreDocking(docking);
                                            return;
                                          }
                                          openVoidDocking(docking);
                                        }}
                                        disabled={voidDisabled}
                                        className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors ${
                                          voidDisabled
                                            ? "cursor-not-allowed border-slate-200"
                                            : isVoided
                                              ? "cursor-pointer hover:bg-emerald-50"
                                              : "cursor-pointer hover:bg-amber-50"
                                        }`}
                                        style={{ borderColor: voidDisabled ? undefined : isVoided ? "#10b981" : "#f59e0b" }}
                                      >
                                        {isVoided ? (
                                          <IoReloadOutline style={{ fontSize: "16px", color: "#10b981" }} />
                                        ) : (
                                          <IoCloseOutline style={{ fontSize: "16px", color: "#f59e0b" }} />
                                        )}
                                      </button>
                                    </Tooltip>
                                  );
                                })()}
                              </div>
                            </td>
                          ) : null}
                        </tr>
                          );
                        })()
                      ))
                    )}
                  </tbody>
                </table>
                </div>
            </TableCard>
            ) : null}
            </Tabs>

            </div>
          </main>
        </div>
      </div>

      {!isHeadViewOnly ? <AddDockingModal
        open={showAddModal || !!editingDocking}
        boats={boats}
        fees={fees}
        onClose={closeDockingModal}
        onSubmit={handleSaveDocking}
        saving={saving}
        prefillDate={prefillDate}
        initialDocking={editingDocking}
        serverErrors={serverErrors}
        fiscalYear={fiscalYear}
        isLookupsLoading={isLookupsLoading}
      /> : null}
      <CalendarDockingsDrawer
        open={!!selectedCalendarDate && !selectedDocking}
        dateLabel={selectedCalendarDateLabel}
        dockings={selectedCalendarDockings}
        onClose={() => setSelectedCalendarDate(null)}
        onSelectDocking={(docking) => {
          setSelectedDocking(docking);
        }}
      />
      <DockingDrawer
        open={!!selectedDocking}
        docking={selectedDocking}
        onClose={() => {
          setSelectedDocking(null);
          setSelectedCalendarDate(null);
        }}
        onBack={selectedCalendarDate ? () => setSelectedDocking(null) : null}
      />
      {!isHeadViewOnly ? <VoidDockingModal
        open={Boolean(pendingVoidDocking)}
        docking={pendingVoidDocking}
        selectedReason={voidReasonOption}
        customReason={voidReasonCustom}
        error={voidReasonError}
        saving={voidingDockingId === pendingVoidDocking?.docking_id}
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
          if (voidingDockingId) return;
          setPendingVoidDocking(null);
          setVoidReasonOption("");
          setVoidReasonCustom("");
          setVoidReasonError("");
        }}
        onConfirm={() => {
          if (!pendingVoidDocking || voidingDockingId) return;

          if (!voidReasonOption) {
            setVoidReasonError("Void reason is required.");
            return;
          }

          const resolvedReason = voidReasonOption === "others"
            ? voidReasonCustom.trim()
            : VOID_REASON_OPTIONS.find((option) => option.value === voidReasonOption)?.label ?? "";

          if (!resolvedReason) {
            setVoidReasonError(
              voidReasonOption === "others"
                ? "Please enter the specific void reason."
                : "Void reason is required."
            );
            return;
          }

          voidDockingMutation.mutate({
            dockingId: pendingVoidDocking.docking_id,
            void_reason: resolvedReason,
            });
          }}
      /> : null}
    </ConfigProvider>
  );
};

export default SuperDocking;






