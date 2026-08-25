import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ConfigProvider, Drawer, Select, Tooltip } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import "typeface-montserrat";
import {
  IoAddOutline, IoFishOutline, IoBoatOutline,
  IoSearchOutline, IoCloudDownloadOutline,
  IoEllipsisHorizontalOutline, IoCloseOutline,
  IoChevronDownOutline, IoCalendarOutline,
  IoDocumentTextOutline, IoCheckmarkCircleOutline,
  IoTrashOutline,
  IoArchiveOutline,
  IoCreateOutline,
  IoListOutline, IoPersonOutline,
  IoWarningOutline, IoCashOutline,
  IoLayersOutline, IoReloadOutline,
  IoEyeOutline, IoAlertCircleOutline,
  IoCloseCircleOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import StatusPill from "../../components/StatusPill";
import OverviewCard from "../../components/Overview";
import DatePicker from "../../components/DatePicker";
import TimePicker from "../../components/TimePicker";
import FilterSelect from "../../components/FilterSelect";
import FilterButton from "../../components/FilterButton";
import IncreaseDecreaseInput from "../../components/IncreaseDecreaseInput";
import Modal from "../../components/Modal";
import TableCard from "../../components/TableCard";
import Tabs from "../../components/Tabs";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import DetailDrawer, { DrawerInfoCard, DrawerSection } from "../../components/Drawer";
import NoDataFound from "../../components/NoDataFound";
import Spinner from "../../components/Spinner";
import Legend from "../../components/Legend";
import ArchiveModal from "../../components/ArchiveModal";
import { useSidebar } from "../../store/sidebarStore";
import { showAddedToast, showBottomToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import api from "../../api/axios";
import { useBanyeraDataQuery, useBanyeraLookupsQuery, useFishClassificationsDataQuery } from "../../hooks/useBanyeraDataQuery";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import { isHeadRole } from "../../utils/transactionLock";
import { cacheTab, getCachedTab } from "../../utils/tabSession";
import {
  removeBanyeraFishClassificationFromCache,
  updateBanyeraStatsInCache,
  upsertBanyeraFishClassificationInCache,
  upsertBanyeraTransactionInDataCache,
} from "../../utils/banyeraCache";
import {
  removeArchiveItemFromDataCache,
  upsertArchiveItemInDataCache,
} from "../../utils/archiveCache";

// Constants
const FONT      = "'Montserrat', sans-serif";
const PAGE_SIZE = 10;
const BANYERA_TRANSACTIONS_QUERY_KEY = ["banyera-data", "transactions"];
const BANYERA_LOOKUPS_QUERY_KEY = ["banyera-data", "lookups"];
const PESO = "\u20B1";

const BANYERA_TABS = [
  { key: "transactions",     label: "Banyera Transactions", icon: IoFishOutline    },
  { key: "classifications",  label: "Fish Classifications",  icon: IoListOutline   },
];
const BANYERA_TAB_STORAGE_KEY = "opol:banyera:active-tab";
const BANYERA_TAB_KEYS = BANYERA_TABS.map((tab) => tab.key);

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

const PERIOD_OPTIONS = [
  { value: "all",    label: "All Time"  },
  { value: "today",  label: "Today"    },
  { value: "week",   label: "This Week" },
  { value: "month",  label: "This Month"},
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "voided", label: "Voided" },
];

const BANYERA_STATUS_LEGEND = [
  { key: "active", label: "Active", color: "#16a34a" },
  { key: "voided", label: "Voided", color: "#f59e0b" },
];

const VOID_REASON_OPTIONS = [
  { value: "duplicate-entry", label: "Entered by mistake" },
  { value: "wrong-boat", label: "Wrong boat selected" },
  { value: "wrong-date", label: "Wrong date or time" },
  { value: "others", label: "Others" },
];

const FISH_STATUS_OPTIONS = [
  { value: "all", label: "All Fish" },
  { value: "used", label: "Used" },
  { value: "unused", label: "Unused" },
];

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

// API helpers
const getManilaDateString = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const getManilaTimeString = () =>
  new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const getTimePartsFromTwentyFourHourValue = (value) => {
  const [hourRaw = "00", minuteRaw = "00"] = String(value || "00:00").split(":");
  let hour24 = Number(hourRaw);
  if (!Number.isFinite(hour24)) hour24 = 0;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return {
    hour: String(hour12).padStart(2, "0"),
    minute: String(Number(minuteRaw) || 0).padStart(2, "0"),
    meridiem,
  };
};

const buildTwentyFourHourTime = (hour, minute, meridiem) => {
  if (!hour || !minute || !meridiem) return "";
  let parsedHour = Number(hour);
  const parsedMinute = Number(minute);
  if (!Number.isFinite(parsedHour) || !Number.isFinite(parsedMinute)) return "";
  if (String(meridiem).toUpperCase() === "PM" && parsedHour !== 12) parsedHour += 12;
  if (String(meridiem).toUpperCase() === "AM" && parsedHour === 12) parsedHour = 0;
  return `${String(parsedHour).padStart(2, "0")}:${String(parsedMinute).padStart(2, "0")}:00`;
};

const getTimeValueFromParts = (hour, minute, meridiem) => {
  const builtTime = buildTwentyFourHourTime(hour, minute, meridiem);
  return builtTime ? builtTime.slice(0, 5) : "";
};

const applyTimeValueToBanyeraForm = (current, timeValue) => {
  if (!timeValue) {
    return {
      ...current,
      banyera_time_hour: "",
      banyera_time_minute: "",
      banyera_time_meridiem: "",
    };
  }

  const timeParts = getTimePartsFromTwentyFourHourValue(timeValue);
  return {
    ...current,
    banyera_time_hour: timeParts.hour,
    banyera_time_minute: timeParts.minute,
    banyera_time_meridiem: timeParts.meridiem,
  };
};

// Data shape helpers
const getBoatName  = (tx) => tx?.boat?.boat_name  || "-";
const getOwnerName = (tx) => tx?.boat?.owner?.full_name || tx?.boat?.owner_name || "-";
const getCreatedBy = (tx) => {
  const createdByName = String(tx?.created_by_name || "").trim();
  if (createdByName) {
    return createdByName;
  }

  const createdBy = tx?.createdBy || tx?.created_by || null;
  if (!createdBy) return "-";

  const fullName = String(createdBy?.full_name || "").trim();
  if (fullName) {
    return fullName;
  }

  const firstLastName = [createdBy?.first_name, createdBy?.last_name].filter(Boolean).join(" ").trim();
  return firstLastName || createdBy?.email || "-";
};

const getVoidedBy = (tx) => {
  const voidedByName = String(tx?.voided_by_name || "").trim();
  if (voidedByName) {
    return voidedByName;
  }

  const voidedBy = tx?.voidedBy || tx?.voided_by || null;
  if (!voidedBy) {
    return "-";
  }

  const fullName = String(voidedBy?.full_name || "").trim();
  if (fullName) {
    return fullName;
  }

  const firstLastName = [voidedBy?.first_name, voidedBy?.last_name].filter(Boolean).join(" ").trim();
  return firstLastName || voidedBy?.email || "-";
};
const getBoatImageSrc = (boat) =>
  boat?.image_path
    ? `${api.defaults.baseURL.replace("/api", "")}/storage/${boat.image_path}`
    : null;

const getClassificationName = (item) =>
  item?.classification?.classification_name ||
  item?.classification_name ||
  "-";

const getBoatTypeId = (boat) =>
  String(
    boat?.boat_type_id ??
    boat?.boat_type?.boat_type_id ??
    boat?.boatType?.boat_type_id ??
    ""
  );

const getFeeName = (item) =>
  item?.fee?.fee_type_name ||
  item?.fee?.fee_type?.fee_name ||
  item?.fee?.feeType?.fee_name  ||
  item?.fee?.fee_name           ||
  "-";

const getFeeAmount = (fee) =>
  fee?.amount ?? 0;

const isBanyeraFee = (fee) => {
  const feeName =
    fee?.fee_type_name ||
    fee?.fee_type?.fee_name ||
    fee?.feeType?.fee_name ||
    fee?.fee_name ||
    "";

  return String(feeName).toLowerCase() === "banyera";
};

const isFeeActive = (fee) => {
  const today = getManilaDateString();
  const effectiveFrom = String(fee?.effective_from || "").slice(0, 10);
  const effectiveTo = String(fee?.effective_to || "").slice(0, 10);
  if (effectiveFrom && effectiveFrom > today) return false;
  if (effectiveTo && effectiveTo <= today) return false;
  return true;
};

const getItemsSubtotalTotal = (items = []) =>
  items.reduce((sum, item) => sum + Number(item?.subtotal ?? 0), 0);

const getItemsDaugTotal = (items = []) =>
  items.reduce((sum, item) => sum + getDaugAmount(item), 0);

const getTransactionTotalFee = (tx) => {
  const items = Array.isArray(tx?.items) ? tx.items : [];
  if (items.length > 0) return getItemsSubtotalTotal(items);

  return Number(tx?.total_fee ?? 0);
};

const getTransactionFeePerBanyera = (tx) => {
  const firstItem = tx?.items?.[0];
  const explicitFeeAmount = Number(firstItem?.fee?.amount ?? firstItem?.fee_amount ?? 0);
  if (explicitFeeAmount > 0) return explicitFeeAmount;

  const qty = Number(firstItem?.quantity ?? 0);
  const subtotal = Number(firstItem?.subtotal ?? 0);
  if (qty > 0 && subtotal > 0) return subtotal / qty;

  const totalQty = (tx?.items ?? []).reduce((sum, item) => sum + Number(item?.quantity ?? 0), 0);
  const totalFee = getTransactionTotalFee(tx);
  return totalQty > 0 ? totalFee / totalQty : 0;
};

const getDaugAmount = (item) => Number(item?.daug ?? item?.daug_php ?? 0);

const sortClassificationsByCreatedAt = (items = []) => {
  const normalizedItems = Array.isArray(items) ? items : [];

  return [...normalizedItems].sort((left, right) => {
    const leftTime = Date.parse(left?.created_at || left?.createdAt || left?.date_added || "");
    const rightTime = Date.parse(right?.created_at || right?.createdAt || right?.date_added || "");
    const leftHasTime = Number.isFinite(leftTime);
    const rightHasTime = Number.isFinite(rightTime);

    if (leftHasTime && rightHasTime) {
      return rightTime - leftTime;
    }

    if (leftHasTime !== rightHasTime) {
      return leftHasTime ? -1 : 1;
    }

    return String(left?.classification_id ?? "").localeCompare(String(right?.classification_id ?? ""));
  });
};

const isBanyeraVoided = (tx) =>
  Boolean(
    tx?.is_voided ||
    tx?.voided_at ||
    String(tx?.status ?? "").toLowerCase() === "voided"
  );

const formatAmount = (value) =>
  Number(value ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getDatePartsFromValue = (value) => {
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

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
    return {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second),
    };
  }

  const fallback = new Date(value);
  if (Number.isNaN(fallback.getTime())) return null;
  return {
    year: fallback.getFullYear(),
    month: fallback.getMonth() + 1,
    day: fallback.getDate(),
    hour: fallback.getHours(),
    minute: fallback.getMinutes(),
    second: fallback.getSeconds(),
  };
};

const buildBanyeraFormState = (tx) => {
  const txParts = getDatePartsFromValue(tx?.transaction_date);
  const sourceDate = txParts
    ? `${String(txParts.year).padStart(4, "0")}-${String(txParts.month).padStart(2, "0")}-${String(txParts.day).padStart(2, "0")}`
    : getManilaDateString();
  const sourceTimeParts = txParts
    ? getTimePartsFromTwentyFourHourValue(`${String(txParts.hour).padStart(2, "0")}:${String(txParts.minute).padStart(2, "0")}`)
    : getTimePartsFromTwentyFourHourValue(getManilaTimeString());

  return {
    boat_id: tx?.boat_id ? String(tx.boat_id) : "",
    fee_id: tx?.items?.[0]?.fee_id ? String(tx.items[0].fee_id) : "",
    banyera_date: sourceDate,
    banyera_date_month: sourceDate.slice(5, 7),
    banyera_date_day: sourceDate.slice(8, 10),
    banyera_date_year: sourceDate.slice(0, 4),
    banyera_time_hour: sourceTimeParts.hour,
    banyera_time_minute: sourceTimeParts.minute,
    banyera_time_meridiem: sourceTimeParts.meridiem,
  };
};

const normalizeBanyeraPayloadForComparison = (payload) =>
  JSON.stringify({
    boat_id: Number(payload?.boat_id || 0),
    transaction_date: String(payload?.transaction_date || "").slice(0, 16),
    items: Array.isArray(payload?.items)
      ? payload.items.map((item) => ({
          classification_id: Number(item?.classification_id || 0),
          quantity: Number(item?.quantity || 0),
          fee_id: Number(item?.fee_id || 0),
          subtotal: Number(item?.subtotal || 0),
          daug:
            item?.daug === "" || item?.daug === null || item?.daug === undefined
              ? null
              : Number(item.daug),
        }))
      : [],
  });

const normalizeDaugOnlyState = (items) =>
  JSON.stringify(
    (Array.isArray(items) ? items : []).map((item) => ({
      item_id: Number(item?.item_id || 0),
      daug:
        item?.daug === "" || item?.daug === null || item?.daug === undefined
          ? null
          : Number(item.daug),
    }))
  );

const formatMoney = (value) => {
  if (value === null || value === undefined || value === "") return `${PESO}0.00`;
  return `${PESO}${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const isFutureBanyeraDate = (dateString) => {
  if (!dateString) return false;
  return dateString > getManilaDateString();
};

const formatDate = (value) => {
  if (!value) return "-";
  const parts = getDatePartsFromValue(value);
  if (!parts) return "-";
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });
};

const formatTime = (value) => {
  const parts = getDatePartsFromValue(value);
  if (!parts) return "-";
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  }).replace(/\b(am|pm)\b/i, (value) => value.toUpperCase());
};

const formatDateTime = (value) => {
  const dateText = formatDate(value);
  const timeText = formatTime(value);
  if (dateText === "-") return "-";
  return timeText === "-" ? dateText : `${dateText} at ${timeText}`;
};

const getManilaDateFromValue = (value) => {
  const parts = getDatePartsFromValue(value);
  if (!parts) return "";
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

const getDateOnlyValue = (value) => {
  const parts = getDatePartsFromValue(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
};

const getBanyeraHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Banyera" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;
  const match = rawId.match(/^banyera-(\d+)$/);

  return match ? match[1] : "";
};

const getFishClassificationHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Fish Classifications" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;
  const match = rawId.match(/^fish-classification-(\d+)$/);

  return match ? match[1] : "";
};

const filterByPeriod = (txs, period) => {
  const todayStr = getManilaDateString();
  const now      = new Date(todayStr);

  if (period === "today") {
    return txs.filter((t) => getManilaDateFromValue(t.transaction_date) === todayStr);
  }
  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return txs.filter((t) => {
      const d = getDateOnlyValue(t.transaction_date);
      return d >= start && d <= now;
    });
  }
  if (period === "month") {
    return txs.filter((t) => {
      const d = getDateOnlyValue(t.transaction_date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }
  if (period === "yearly") {
    return txs.filter((t) => {
      const d = getDateOnlyValue(t.transaction_date);
      return d && d.getFullYear() === now.getFullYear();
    });
  }
  return txs; // all
};

// Spinner
// TailDropdown
const TailDropdown = ({ value, onChange, options, height = 38 }) => (
  <FilterButton value={value} onChange={onChange} options={options} height={height} width={160} />
);

// RowMenu
const RowMenu = ({ onView }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-md border border-gray-200 bg-transparent cursor-pointer flex items-center justify-center text-gray-400 hover:bg-gray-50"
      >
        <IoEllipsisHorizontalOutline className="text-[15px]" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+4px)] bg-white rounded-xl shadow-lg border border-gray-100 z-50"
          style={{ width: 148 }}
        >
          <button
            onClick={() => { onView(); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 border-none bg-none cursor-pointer hover:bg-gray-50"
            style={{ fontFamily: FONT }}
          >
            View Details
          </button>
        </div>
      )}
    </div>
  );
};

// Field
const Field = ({ label, required, children, error, hint, labelClassName = "" }) => (
  <div>
    <label className={`mb-1.5 block text-[11px] font-semibold uppercase ${labelClassName}`.trim()} style={{ color: "#6F6F82", fontFamily: FONT }}>
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

const ModalInput = ({ label, required, error, icon: Icon, inputStyle, wrapperClassName = "", labelClassName = "", ...props }) => {
  const visibleError = error;
  const inputBorderClass = visibleError ? "border-red-300" : "border-slate-200";
  const isMuted = props.readOnly || props.disabled;

  return (
  <Field label={label} required={required} error={visibleError} labelClassName={labelClassName}>
    <div className={`modal-input-shell flex h-[46px] items-center gap-3 rounded-[10px] border ${inputBorderClass} px-4 transition-all ${isMuted ? "bg-slate-50" : "bg-white focus-within:border-[#4096ff]"} ${wrapperClassName}`}>
      <input
        {...props}
        className={`w-full border-none bg-transparent text-[14px] font-medium outline-none placeholder:font-normal placeholder:text-slate-400 ${isMuted ? "cursor-not-allowed text-slate-500" : "text-[#0d1117]"}`}
        style={{ fontFamily: FONT, ...(inputStyle || {}) }}
      />
    </div>
  </Field>
  );
};

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

const VoidBanyeraModal = ({
  open,
  tx,
  selectedReason,
  customReason,
  error,
  saving,
  showSavingSpinner = false,
  onReasonChange,
  onCustomReasonChange,
  onClose,
  onConfirm,
}) => {
  if (!open || !tx) return null;

  return (
    <Modal
      title="Void Banyera"
      onClose={onClose}
      onSave={onConfirm}
      saving={saving}
      showSavingSpinner={showSavingSpinner}
      saveLabel="Save"
      closeLabel="Cancel"
      closeOnBackdrop
      maxWidth="560px"
    >
     
      <div className="flex flex-col gap-5">
        <ModalInput
          label="Boat Name"
          icon={IoBoatOutline}
          value={getBoatName(tx)}
          readOnly
          disabled
          wrapperClassName="!bg-slate-100"
          inputStyle={{ color: "#475569" }}
        />
        <ModalInput
          label="Banyera Date & Time"
          icon={IoCalendarOutline}
          value={formatDateTime(tx.transaction_date)}
          readOnly
          disabled
          wrapperClassName="!bg-slate-100"
          inputStyle={{ color: "#475569" }}
        />
        <ModalInput
          label="Total Fee"
          icon={IoCashOutline}
          value={`${PESO}${formatAmount(getTransactionTotalFee(tx))}`}
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


// AddBanyeraModal
const AddBanyeraModal = ({ open, onClose, onSave, saving, boats = [], fees = [], classifications = [], isLookupsLoading = false }) => {
  const todayStr = getManilaDateString();
  const hasManualTimeRef = useRef(false);
  const buildInitialFormState = useCallback(() => {
    const sourceDate = getManilaDateString();
    const sourceTimeParts = getTimePartsFromTwentyFourHourValue(getManilaTimeString());

    return {
      boat_id: "",
      fee_id: "",
      banyera_date: sourceDate,
      banyera_date_month: sourceDate.slice(5, 7),
      banyera_date_day: sourceDate.slice(8, 10),
      banyera_date_year: sourceDate.slice(0, 4),
      banyera_time_hour: sourceTimeParts.hour,
      banyera_time_minute: sourceTimeParts.minute,
      banyera_time_meridiem: sourceTimeParts.meridiem,
    };
  }, []);
  const activeBoats = Array.isArray(boats)
    ? boats.filter((boat) => String(boat?.status ?? "").toLowerCase() === "active")
    : [];
  const [form, setForm] = useState(() => {
    const sourceDate = todayStr;
    const sourceTimeParts = getTimePartsFromTwentyFourHourValue(getManilaTimeString());
    return {
      boat_id: "",
      fee_id: "",
      banyera_date: sourceDate,
      banyera_date_month: sourceDate.slice(5, 7),
      banyera_date_day: sourceDate.slice(8, 10),
      banyera_date_year: sourceDate.slice(0, 4),
      banyera_time_hour: sourceTimeParts.hour,
      banyera_time_minute: sourceTimeParts.minute,
      banyera_time_meridiem: sourceTimeParts.meridiem,
    };
  });
  const [items, setItems]   = useState([{ classification_id: "", quantity: "", daug: "" }]);
  const [errors, setErrors] = useState({});
  const selectedBoat        = activeBoats.find((b) => String(b.boat_id) === String(form.boat_id));
  const safeFees = Array.isArray(fees) ? fees : [];

  const selectedBoatTypeId = selectedBoat ? getBoatTypeId(selectedBoat) : "";
  const banyeraFees = useMemo(() => safeFees.filter((fee) => {
    if (!isBanyeraFee(fee)) return false;
    if (!isFeeActive(fee)) return false;
    if (!selectedBoat) return false;
    return String(fee.boat_type_id || "") === selectedBoatTypeId;
  }), [safeFees, selectedBoat, selectedBoatTypeId]);
  const selectedApplicableFee = banyeraFees.find((fee) => String(fee.fee_id) === String(form.fee_id));
  const safeClassifications = Array.isArray(classifications) ? classifications : [];

  useEffect(() => {
    if (!open) return;
    hasManualTimeRef.current = false;
    setForm(buildInitialFormState());
    setItems([{ classification_id: "", quantity: "", daug: "" }]);
    setErrors({});
  }, [open, buildInitialFormState]);

  useEffect(() => {
    if (!open) return undefined;

    const syncCurrentTime = () => {
      if (hasManualTimeRef.current) return;
      const currentTime = getTimePartsFromTwentyFourHourValue(getManilaTimeString());
      setForm((current) => {
        if (
          current.banyera_time_hour === currentTime.hour &&
          current.banyera_time_minute === currentTime.minute &&
          current.banyera_time_meridiem === currentTime.meridiem
        ) {
          return current;
        }

        return {
          ...current,
          banyera_time_hour: currentTime.hour,
          banyera_time_minute: currentTime.minute,
          banyera_time_meridiem: currentTime.meridiem,
        };
      });
    };

    syncCurrentTime();
    const intervalId = window.setInterval(syncCurrentTime, 1000);
    return () => window.clearInterval(intervalId);
  }, [open]);

  useEffect(() => {
    if (!selectedBoat) {
      if (!form.fee_id) return;
      setForm((current) => ({ ...current, fee_id: "" }));
      return;
    }

    if (banyeraFees.length === 0) {
      if (!form.fee_id) return;
      setForm((current) => ({ ...current, fee_id: "" }));
      return;
    }

    const matchingFee = banyeraFees[0];
    const nextFeeId = String(matchingFee.fee_id);
    if (String(form.fee_id || "") === nextFeeId) return;

    setForm((current) => ({
      ...current,
      fee_id: nextFeeId,
    }));
  }, [selectedBoat, banyeraFees, form.fee_id]);

  const totalFee = items.reduce((sum, it) => {
    const qty = parseInt(it.quantity) || 0;
    return sum + (selectedApplicableFee ? getFeeAmount(selectedApplicableFee) * qty : 0);
  }, 0);

  const addItem    = () =>
    setItems((p) => [
      ...p,
      { classification_id: "", quantity: "", daug: "" },
    ]);
  const removeItem = (i) =>
    setItems((p) =>
      p.length === 1
        ? [{ classification_id: "", quantity: "", daug: "" }]
        : p.filter((_, idx) => idx !== i)
    );
  const setItem    = (i, key, val) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, [key]: val } : it));

  const validate = () => {
    const e = {};
    const builtDate = `${form.banyera_date_year}-${form.banyera_date_month}-${form.banyera_date_day}`;
    if (!form.boat_id)          e.boat_id          = "Please select a boat";
    if (!form.fee_id)           e.fee_id           = "Fee is required";
    if (!form.banyera_date_month || !form.banyera_date_day || !form.banyera_date_year) {
      e.banyera_date = "Banyera date is required";
    } else if (isFutureBanyeraDate(builtDate)) {
      e.banyera_date = "Banyera date cannot be in the future";
    }
    const builtTime = buildTwentyFourHourTime(form.banyera_time_hour, form.banyera_time_minute, form.banyera_time_meridiem);
    if (!builtTime) {
      e.banyera_time = "Banyera time is required";
    }
    if (items.some((it) => !it.classification_id || !it.quantity || parseInt(it.quantity, 10) < 1)) {
      e.fish_items = "Please select a fish and put 1 or more quantity";
    } else {
      const selectedClassificationIds = items.map((it) => String(it.classification_id || ""));
      const uniqueClassificationIds = new Set(selectedClassificationIds);
      if (uniqueClassificationIds.size !== selectedClassificationIds.length) {
        e.fish_items = "Fish classification cannot be duplicated";
      }
    }
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    const newItems = items.map((it) => {
      const qty = parseInt(it.quantity);
      return {
        classification_id: parseInt(it.classification_id),
        quantity:           qty,
        fee_id:             parseInt(form.fee_id),
        subtotal:           getFeeAmount(selectedApplicableFee) * qty,
        daug:               it.daug === "" ? null : Number(it.daug),
      };
    });

    const builtDate = `${form.banyera_date_year}-${form.banyera_date_month}-${form.banyera_date_day}`;
    const builtTime = buildTwentyFourHourTime(form.banyera_time_hour, form.banyera_time_minute, form.banyera_time_meridiem);
    const builtDateTime = `${builtDate} ${builtTime}`;

    onSave({
      payload: {
        boat_id: parseInt(form.boat_id),
        transaction_date: builtDateTime,
        items: newItems,
      },
    });
  };

  if (!open) return null;

  return (
    <Modal
      title="Add Banyera"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      saveLabel="Add"
      maxWidth="680px"
      closeOnBackdrop
      showSavingSpinner
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Boat Name" required error={errors.boat_id}>
            <FilterSelect
              width="100%"
              height={46}
              showSearch
              loading={isLookupsLoading}
              placeholder="Select boat name"
              optionFilterProp="label"
              optionLabelProp="label"
              getPopupContainer={() => document.body}
              placement="bottomLeft"
              value={form.boat_id || undefined}
              onChange={(value) => {
                setForm((f) => ({ ...f, boat_id: value ?? "", fee_id: "" }));
                setErrors((current) => ({ ...current, boat_id: "", fee_id: "" }));
              }}
              options={activeBoats.map((boat) => ({
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
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ModalInput
            label="Boat Owner"
            icon={IoPersonOutline}
            readOnly
            value={selectedBoat?.owner?.full_name || selectedBoat?.owner_name || ""}
            placeholder="Auto-filled after selecting a boat"
            wrapperClassName="!bg-slate-100"
          />

          <ModalInput
            label="Applicable Fee"
            icon={IoCashOutline}
            required
            readOnly
            value={selectedApplicableFee ? formatMoney(getFeeAmount(selectedApplicableFee)) : ""}
            placeholder={selectedBoat ? "No matching banyera fee" : "₱0.00"}
            error={errors.fee_id}
            wrapperClassName="!bg-slate-100"
            inputStyle={{ color: selectedApplicableFee ? "#0d1117" : "#94a3b8" }}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Banyera Date" required error={errors.banyera_date}>
            <DatePicker
              value={`${form.banyera_date_year}-${form.banyera_date_month}-${form.banyera_date_day}`}
              onChange={(_, currentDateString) => {
                const [year = "", month = "", day = ""] = String(currentDateString || "").split("-");
                setForm((current) => ({
                  ...current,
                  banyera_date_year: year,
                  banyera_date_month: month,
                  banyera_date_day: day,
                }));
                setErrors((current) => ({ ...current, banyera_date: "" }));
              }}
              placeholder="Select banyera date"
              containerClassName="w-full"
              inputClassName={`rounded-[10px] bg-white text-[13px] text-[#1a1f36] ${errors.banyera_date ? "border-red-300" : "border-slate-200"}`}
              options={{ maxDate: "today" }}
            />
          </Field>
          <Field label="Banyera Time" required error={errors.banyera_time}>
            <TimePicker
              value={getTimeValueFromParts(form.banyera_time_hour, form.banyera_time_minute, form.banyera_time_meridiem)}
              onChange={(_, timeValue) => {
                hasManualTimeRef.current = true;
                setForm((current) => applyTimeValueToBanyeraForm(current, timeValue));
                setErrors((current) => ({ ...current, banyera_time: "" }));
              }}
              placeholder="Select banyera time"
              getPopupContainer={() => document.body}
              className={errors.banyera_time ? "!border-red-300" : "!border-slate-200"}
              popupClassName="banyera-ant-time-picker-dropdown"
            />
          </Field>
        </div>

        <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>
                Fish Items <span className="text-red-500">*</span>
              </label>
              <button
                onClick={addItem}
                className="flex items-center gap-1 text-[12px] font-semibold text-blue-600 border-none bg-transparent cursor-pointer hover:text-blue-800"
              >
                <IoAddOutline className="text-[15px]" /> Add Item
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <div
                className="mb-2 grid gap-1 px-1"
                style={{ gridTemplateColumns: "minmax(0,2.4fr) minmax(100px,0.75fr) minmax(116px,1fr) minmax(116px,1fr) 40px" }}
              >
                <p className="m-0 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>Fish Classification</p>
                <p className="m-0 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>Qty</p>
                <p className="m-0 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>Subtotal</p>
                <p className="m-0 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>Daug</p>
                <p className="m-0" />
              </div>

            {items.map((it, i) => {
              const qty = parseInt(it.quantity) || 0;
              const sub = selectedApplicableFee ? getFeeAmount(selectedApplicableFee) * qty : 0;
              const selectedClassificationIds = new Set(
                items
                  .filter((_, idx) => idx !== i)
                  .map((item) => String(item.classification_id || ""))
                  .filter(Boolean)
              );
              const availableClassifications = safeClassifications.filter(
                (classification) => !selectedClassificationIds.has(String(classification.classification_id))
              );
              return (
                <div
                  key={i}
                  className="mb-3 last:mb-0"
                >
                  <p className="mb-1 mt-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500" style={{ fontFamily: FONT }}>
                    Item {i + 1}
                  </p>
                  <div
                    className="grid gap-1 items-center"
                    style={{ gridTemplateColumns: "minmax(0,2.4fr) minmax(100px,0.75fr) minmax(116px,1fr) minmax(116px,1fr) 40px" }}
                  >
                    <div>
                    <FilterSelect
                      width="100%"
                      height={46}
                      showSearch
                      placeholder="Select fish classification"
                      optionFilterProp="label"
                      optionLabelProp="label"
                      getPopupContainer={() => document.body}
                      placement="bottomLeft"
                      value={it.classification_id || undefined}
                      onChange={(value) => {
                        setItem(i, "classification_id", value ?? "");
                        setErrors((current) => ({ ...current, fish_items: "" }));
                      }}
                      options={availableClassifications.map((c) => ({
                        value: String(c.classification_id),
                        label: c.classification_name,
                      }))}
                    />
                    </div>

                    <div>
                      <IncreaseDecreaseInput
                        value={it.quantity}
                        onChange={(value) => {
                          setItem(i, "quantity", value);
                          setErrors((current) => ({ ...current, fish_items: "" }));
                        }}
                        placeholder="0"
                        ariaLabel={`Quantity for item ${i + 1}`}
                      />
                    </div>

                    <div>
                    <input
                      type="text"
                      readOnly
                      value={sub > 0 ? `${PESO}${Number(sub).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
                      placeholder={`${PESO}0.00`}
                      className="w-full h-[46px] rounded-[10px] border border-slate-200 bg-slate-100 px-3 text-[12px] font-medium outline-none"
                      style={{ color: sub > 0 ? "#0d1117" : "#94a3b8", fontFamily: FONT }}
                    />
                    </div>

                    <div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={it.daug ? `${PESO}${it.daug}` : ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.]/g, "");
                        setItem(i, "daug", value);
                      }}
                      placeholder={`${PESO}0.00`}
                      className="w-full h-[46px] rounded-[10px] border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-[#4096ff]"
                      style={{ fontFamily: FONT }}
                    />
                    </div>

                    <div className="flex h-[46px] items-center justify-center">
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="text-red-500 transition-colors hover:text-red-600"
                      aria-label="Remove fish item"
                    >
                      <IoTrashOutline className="text-[22px]" />
                    </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
          {errors.fish_items && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
              <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
              <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>
                {errors.fish_items}
              </p>
            </div>
          )}
        </div>

        <ModalInput
          label="Total Fee"
          icon={IoCashOutline}
          readOnly
          value={formatMoney(totalFee)}
          placeholder={`${PESO}0.00`}
          wrapperClassName="!bg-slate-100"
          inputStyle={{ color: totalFee > 0 ? "#0d1117" : "#94a3b8" }}
        />
      </div>
    </Modal>
  );
};

// BanyeraDetailModal
const AddFishModal = ({ open, onClose, onSave, saving, value, onChange, error, isEditing = false }) => {
  if (!open) return null;

  return (
    <Modal
      title={isEditing ? "Edit Fish" : "Add Fish"}
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      saveLabel={isEditing ? "Save" : "Add"}
      closeOnBackdrop
      maxWidth="520px"
      showSavingSpinner
    >
      <ModalInput
        label="Fish Name"
        icon={IoFishOutline}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter fish name"
        error={error}
      />
    </Modal>
  );
};

const BanyeraDetailModal = ({ tx, onClose }) => {
  if (!tx) return null;

  const totalQty = (tx.items ?? []).reduce((s, it) => s + it.quantity, 0);
  const totalFee = getTransactionTotalFee(tx);
  const totalDaug = getItemsDaugTotal(tx.items ?? []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full mx-4 overflow-hidden flex flex-col"
        style={{ maxWidth: 520, maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1a1f36] flex-shrink-0">
          <div className="flex items-center gap-3">
            <IoFishOutline className="text-white text-xl" />
            <div>
              <p className="m-0 text-[14px] font-bold text-white">{getBoatName(tx)}</p>
              <p className="m-0 text-[11px] text-white/55">
                {getOwnerName(tx)} ? BNY-{String(tx.banyera_id).padStart(4, "0")}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white border-none bg-transparent cursor-pointer">
            <IoCloseOutline className="text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5">
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { icon: IoDocumentTextOutline, label: "Transaction ID", value: `BNY-${String(tx.banyera_id).padStart(4, "0")}` },
              { icon: IoBoatOutline,         label: "Boat",           value: getBoatName(tx) },
              { icon: IoPersonOutline,       label: "Inspector",      value: getCreatedBy(tx) },
              { icon: IoCalendarOutline,     label: "Date",           value: formatDate(tx.transaction_date) },
              { icon: IoCalendarOutline,     label: "Time",           value: formatTime(tx.transaction_date) },
              { icon: IoFishOutline,         label: "Total Items",    value: `${(tx.items ?? []).length} classification${(tx.items ?? []).length !== 1 ? "s" : ""}` },
              { icon: IoCashOutline,         label: "Total Banyera",  value: `${totalQty} banyera` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="text-blue-500 text-sm" />
                </div>
                <div>
                  <p className="m-0 text-[10px] text-slate-400">{label}</p>
                  <p className="m-0 text-[12px] font-semibold text-slate-800">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Fish Items</p>
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#1a1f36]">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Classification</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Qty</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Fee Type</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Subtotal</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Daug</th>
                </tr>
              </thead>
              <tbody>
                {(tx.items ?? []).map((it, i) => (
                  <tr key={it.item_id ?? i} className={`border-b border-gray-200 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <td className="px-3 py-2.5 text-[12px] text-slate-700">{getClassificationName(it)}</td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-600 text-center font-medium">{it.quantity}</td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-500">{getFeeName(it)}</td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-700 font-semibold text-right">{formatMoney(it.subtotal)}</td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-700 font-semibold text-right">{formatMoney(getDaugAmount(it))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-gray-200">
                  <td colSpan={3} className="px-3 py-3 text-[12px] font-bold text-slate-600">Total</td>
                  <td className="px-3 py-3 text-[14px] font-bold text-[#1a1f36] text-right">{formatMoney(totalFee)}</td>
                  <td className="px-3 py-3" />
                </tr>
                <tr className="bg-slate-50 border-t border-gray-200">
                  <td colSpan={4} className="px-3 py-3 text-[12px] font-bold text-slate-600">Daug Total</td>
                  <td className="px-3 py-3 text-[14px] font-bold text-[#1a1f36] text-right">{formatMoney(totalDaug)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#1a1f36] text-white text-[13px] font-semibold hover:bg-[#2d3561] cursor-pointer border-none"
            style={{ fontFamily: FONT }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Main Page
const SuperBanyera = () => {
  const navigate     = useNavigate();
  const location     = useLocation();
  const queryClient  = useQueryClient();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();

  // Tab derived from URL
  const queryParams = new URLSearchParams(location.search);
  const queryTab  = queryParams.get("tab");
  const requestedQuery = queryParams.get("q") ?? "";
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const rawHighlightedBanyeraId = getBanyeraHighlightId({ highlightedSearchResult, search: location.search });
  const rawHighlightedClassificationId = getFishClassificationHighlightId({ highlightedSearchResult, search: location.search });
  const banyeraHighlightToken = rawHighlightedBanyeraId
    ? `${rawHighlightedBanyeraId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const classificationHighlightToken = rawHighlightedClassificationId
    ? `${rawHighlightedClassificationId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedBanyeraHighlightToken, setDismissedBanyeraHighlightToken] = useState("");
  const [dismissedClassificationHighlightToken, setDismissedClassificationHighlightToken] = useState("");
  const highlightedBanyeraId = dismissedBanyeraHighlightToken === banyeraHighlightToken ? "" : rawHighlightedBanyeraId;
  const highlightedClassificationId =
    dismissedClassificationHighlightToken === classificationHighlightToken ? "" : rawHighlightedClassificationId;
  const activeTab = location.pathname === "/fish-classification" || queryTab === "classifications"
    ? "classifications"
    : location.pathname === "/banyera"
      ? getCachedTab(BANYERA_TAB_STORAGE_KEY, BANYERA_TAB_KEYS, "transactions")
      : "transactions";
  const getBanyeraTabPath = (key) => (key === "classifications" ? "/fish-classification" : "/banyera");
  const getBanyeraBreadcrumbLabel = (tab) => (tab === "classifications" ? "Fish Classifications" : "Banyera");
  const clearUniversalHighlight = useCallback(() => {
    const params = new URLSearchParams(location.search);
    const hadHighlight = params.delete("highlight");

    if (!highlightedSearchResult && !hadHighlight) return;

    if (banyeraHighlightToken) {
      setDismissedBanyeraHighlightToken(banyeraHighlightToken);
    }
    if (classificationHighlightToken) {
      setDismissedClassificationHighlightToken(classificationHighlightToken);
    }

    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true, state: null }
    );
  }, [banyeraHighlightToken, classificationHighlightToken, highlightedSearchResult, location.pathname, location.search, navigate]);
  useEffect(() => {
    setDismissedBanyeraHighlightToken("");
    setDismissedClassificationHighlightToken("");
  }, [location.key]);

  useEffect(() => {
    if (queryTab === "classifications") {
      const params = new URLSearchParams(location.search);
      params.delete("tab");
      const search = params.toString();
      navigate({ pathname: "/fish-classification", search: search ? `?${search}` : "" }, { replace: true, state: location.state });
      return;
    }

    if (queryTab === "transactions") {
      const params = new URLSearchParams(location.search);
      params.delete("tab");
      const search = params.toString();
      navigate({ pathname: "/banyera", search: search ? `?${search}` : "" }, { replace: true, state: location.state });
    }
  }, [location.search, location.state, navigate, queryTab]);

  useEffect(() => {
    cacheTab(BANYERA_TAB_STORAGE_KEY, activeTab, BANYERA_TAB_KEYS);

    if (location.pathname === "/banyera" && activeTab === "classifications") {
      navigate(
        { pathname: "/fish-classification", search: location.search },
        { replace: true, state: location.state }
      );
    }
  }, [activeTab, location.pathname, location.search, location.state, navigate]);

  const [activeItem, setActiveItem]   = useState("Banyera");
  const [contentMargin, setContentMargin] = useState(() => (window.innerWidth >= 1024 ? 256 : 0));
  const [showAddModal, setShowAddModal]   = useState(false);
  const [showAddFishModal, setShowAddFishModal] = useState(false);
  const [detailTx, setDetailTx]           = useState(null);
  const [editingTx, setEditingTx]         = useState(null);
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState("all");
  const [fishStatusFilter, setFishStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter]   = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRows, setSelectedRows]   = useState([]);
  const [fishName, setFishName]           = useState("");
  const [fishNameError, setFishNameError] = useState("");
  const [editingFish, setEditingFish]     = useState(null);
  const [selectedFishClassification, setSelectedFishClassification] = useState(null);
  const [deletingFish, setDeletingFish]   = useState(null);
  const [deletingFishId, setDeletingFishId] = useState(null);
  const [savingTx, setSavingTx]           = useState(false);
  const [voidingTxId, setVoidingTxId]     = useState(null);
  const [pendingVoidTx, setPendingVoidTx] = useState(null);
  const [voidReasonOption, setVoidReasonOption] = useState("");
  const [voidReasonCustom, setVoidReasonCustom] = useState("");
  const [voidReasonError, setVoidReasonError] = useState("");
  const didRunTransactionFilterResetRef = useRef(false);
  const { transactionLock, isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const isHeadViewOnly = isHeadRole();
  const debouncedSearch = useDebouncedValue(search, 350);
  const debouncedPage = useDebouncedValue(currentPage, 180);

  const isDateLocked = useCallback(
    (value) => {
      if (!transactionLock?.date) return false;
      return getManilaDateFromValue(value) === transactionLock.date;
    },
    [transactionLock?.date],
  );

  // Sync sidebar margin
  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) {
      setContentMargin(sidebarCollapsed ? 72 : 256);
    } else if (window.innerWidth < 1024) {
      setContentMargin(0);
    }
  }, [sidebarCollapsed, sidebarOpen]);

  // Keep the sidebar highlight on the Banyera route and reset list state on tab change
  useEffect(() => {
    setActiveItem("Banyera");
    setCurrentPage(1);
    setSearch("");
    setStatusFilter("all");
    setFishStatusFilter("all");
  }, [activeTab]);

  // Data query for transactions (only enabled on transactions tab)
  const { data, isLoading, isFetching, isError, refetch } = useBanyeraDataQuery({
    page: debouncedPage,
    perPage: PAGE_SIZE,
    search: debouncedSearch,
    status: statusFilter,
    period: periodFilter,
    fishType: "all",
    filters: { period: periodFilter, status: statusFilter },
    sort: "transaction_date_desc",
    highlightBanyeraId: highlightedBanyeraId,
    paginated: true,
    includeLookups: false,
  }, {
    enabled: activeTab === "transactions",
  });

  const {
    data: classificationsData,
    isLoading: isClassificationsLoading,
    isFetching: isClassificationsFetching,
    isError: isClassificationsError,
    refetch: refetchClassifications,
  } = useFishClassificationsDataQuery({
    page: debouncedPage,
    perPage: PAGE_SIZE,
    search: debouncedSearch,
    status: fishStatusFilter,
    highlightClassificationId: highlightedClassificationId,
  }, {
    enabled: activeTab === "classifications",
  });

  const { data: lookupData, isLoading: isLookupsLoading } = useBanyeraLookupsQuery({ enabled: !isHeadViewOnly && (showAddModal || Boolean(editingTx)) });

  const transactions    = data?.transactions    ?? [];
  const transactionsMeta = data?.transactionsMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const transactionStats = data?.stats ?? {
    total_records: 0,
    today_count: 0,
    today_total_fee: 0,
  };
  const classifications = sortClassificationsByCreatedAt(
    Array.isArray(lookupData?.classifications)
      ? lookupData.classifications
      : Array.isArray(classificationsData?.classifications)
        ? classificationsData.classifications
        : Array.isArray(data?.classifications)
          ? data.classifications
          : []
  );
  const tableClassifications = sortClassificationsByCreatedAt(
    Array.isArray(classificationsData?.classifications)
      ? classificationsData.classifications
      : []
  );
  const classificationsMeta = classificationsData?.classificationsMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const boats = Array.isArray(lookupData?.boats)
    ? lookupData.boats
    : Array.isArray(data?.boats)
      ? data.boats
      : [];
  const fees = Array.isArray(lookupData?.fees)
    ? lookupData.fees
    : Array.isArray(data?.fees)
      ? data.fees
      : [];


  // Create mutation
  const createMutation = useMutation({
    mutationFn: async ({ payload }) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      if (isTransactionLocked || isDateLocked(payload?.transaction_date ?? getManilaDateString())) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.post("/banyera-transactions", payload);
      return response.data;
    },
    onSuccess: (createdTransaction) => {
      if (createdTransaction?.banyera_id) {
        upsertBanyeraTransactionInDataCache(queryClient, createdTransaction, { insertIfMissing: true });
        updateBanyeraStatsInCache(queryClient, createdTransaction, "add");
        upsertTransactionInCache(createdTransaction);
      }
      setShowAddModal(false);
      showAddedToast("Banyera Transaction", "banyera transaction");
      void queryClient.invalidateQueries({ queryKey: ["banyera-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["banyera-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["bfar-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
    },
    onError: (error) => {
      showBottomToast("error", "Save Failed", error.response?.data?.message ?? "Unable to save the transaction.");
    },
  });

  const updateTransaction = async ({ payload }) => {
    if (isHeadViewOnly) return;
    if (!editingTx?.banyera_id) return;
    if (isTransactionLocked || isDateLocked(payload?.transaction_date ?? editingTx?.transaction_date)) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    const currentPayload = {
      boat_id: editingTx?.boat_id ?? editingTx?.boat?.boat_id ?? null,
      transaction_date: editingTx?.transaction_date ?? "",
      items: Array.isArray(editingTx?.items)
        ? editingTx.items.map((item) => ({
            item_id: item?.item_id ?? null,
            classification_id: item?.classification_id ?? item?.classification?.classification_id ?? null,
            quantity: item?.quantity ?? 0,
            fee_id: item?.fee_id ?? editingTx?.fee_id ?? 0,
            subtotal: item?.subtotal ?? 0,
            daug: item?.daug ?? item?.daug_php ?? null,
          }))
        : [],
    };

    if (
      !payload?.daug_only &&
      !payload?.editable_only &&
      normalizeBanyeraPayloadForComparison(currentPayload) ===
      normalizeBanyeraPayloadForComparison(payload)
    ) {
      setEditingTx(null);
      showNoChangesToast();
      return;
    }

    setSavingTx(true);
    try {
      const response = await api.put(`/banyera-transactions/${editingTx.banyera_id}`, payload);
      const savedTransaction = response?.data ?? null;

      upsertBanyeraTransactionInDataCache(queryClient, savedTransaction ?? { ...editingTx, ...payload }, { insertIfMissing: true });

      void queryClient.invalidateQueries({ queryKey: ["banyera-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["banyera-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["bfar-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
      setEditingTx(null);
      showUpdatedToast("Banyera Transaction", "banyera transaction");
    } catch (error) {
      showBottomToast("error", "Update Failed", error.response?.data?.message ?? "Unable to update the transaction.");
    } finally {
      setSavingTx(false);
    }
  };

  const upsertTransactionInCache = useCallback((nextTransaction) => {
    if (!nextTransaction?.banyera_id) return;

    upsertBanyeraTransactionInDataCache(queryClient, nextTransaction, { insertIfMissing: true });

    setDetailTx((current) =>
      String(current?.banyera_id ?? "") === String(nextTransaction.banyera_id)
        ? nextTransaction
        : current
    );

    setEditingTx((current) =>
      String(current?.banyera_id ?? "") === String(nextTransaction.banyera_id)
        ? nextTransaction
        : current
    );
  }, [queryClient]);

  const voidTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, void_reason }) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.patch(`/banyera-transactions/${transactionId}/void`, { void_reason });
      return response.data;
    },
    onMutate: ({ transactionId }) => setVoidingTxId(transactionId),
    onSuccess: (response) => {
      const nextTransaction = response?.transaction ?? null;
      if (nextTransaction) {
        upsertTransactionInCache(nextTransaction);
        updateBanyeraStatsInCache(queryClient, nextTransaction, "void");
      }
      void queryClient.invalidateQueries({ queryKey: ["banyera-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["banyera-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["bfar-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
      setPendingVoidTx(null);
      setVoidReasonOption("");
      setVoidReasonCustom("");
      setVoidReasonError("");
      showBottomToast("success", "Transaction Voided", response?.message ?? "The banyera transaction was voided successfully.");
    },
    onError: (error) => {
      showBottomToast("error", "Void Failed", error.response?.data?.message ?? "Unable to void the banyera transaction.");
    },
    onSettled: () => setVoidingTxId(null),
  });

  const restoreTransactionMutation = useMutation({
    mutationFn: async (transactionId) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.patch(`/banyera-transactions/${transactionId}/restore`);
      return response.data;
    },
    onMutate: (transactionId) => setVoidingTxId(transactionId),
    onSuccess: (response) => {
      const nextTransaction = response?.transaction ?? null;
      if (nextTransaction) {
        upsertTransactionInCache(nextTransaction);
        updateBanyeraStatsInCache(queryClient, nextTransaction, "restore");
      }
      void queryClient.invalidateQueries({ queryKey: ["banyera-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["banyera-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["bfar-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
      showBottomToast("success", "Transaction Restored", response?.message ?? "The banyera transaction was restored successfully.");
    },
    onError: (error) => {
      showBottomToast("error", "Restore Failed", error.response?.data?.message ?? "Unable to restore the banyera transaction.");
    },
    onSettled: () => setVoidingTxId(null),
  });

  const addFishMutation = useMutation({
    mutationFn: (payload) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      return api.post("/fish-classifications", payload);
    },
    onSuccess: (response) => {
      upsertBanyeraFishClassificationInCache(queryClient, response?.data);
      setShowAddFishModal(false);
      setFishName("");
      setFishNameError("");
      showAddedToast("Fish Classification", "fish classification");
      void queryClient.invalidateQueries({ queryKey: ["banyera-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["bfar-report"], refetchType: "active" });
    },
    onError: (error) => {
      setFishNameError(
        error.response?.data?.errors?.classification_name?.[0] ||
        error.response?.data?.message ||
        "Unable to save the fish classification."
      );
    },
  });

  const updateFishMutation = useMutation({
    mutationFn: ({ id, payload }) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      return api.put(`/fish-classifications/${id}`, payload);
    },
    onSuccess: (response) => {
      upsertBanyeraFishClassificationInCache(queryClient, response?.data);
      setShowAddFishModal(false);
      setEditingFish(null);
      setFishName("");
      setFishNameError("");
      showUpdatedToast("Fish Classification", "fish classification");
      void queryClient.invalidateQueries({ queryKey: ["banyera-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["bfar-report"], refetchType: "active" });
    },
    onError: (error) => {
      setFishNameError(
        error.response?.data?.errors?.classification_name?.[0] ||
        error.response?.data?.message ||
        "Unable to update the fish classification."
      );
    },
  });

  const deleteFishMutation = useMutation({
    mutationFn: (id) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      return api.delete(`/fish-classifications/${id}`);
    },
    onMutate: (id) => setDeletingFishId(id),
    onSuccess: (_response, id) => {
      removeBanyeraFishClassificationFromCache(queryClient, id);
      upsertArchiveItemInDataCache(queryClient, { classification_id: id }, "fishClassifications");
      showBottomToast("success", "Fish Deleted", "The fish classification was archived successfully.");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["banyera-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["bfar-report"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["archives-data"], refetchType: "active" }),
      ]);
    },
    onError: (error) => {
      showBottomToast("error", "Delete Failed", error.response?.data?.message ?? "Unable to delete the fish classification.");
    },
    onSettled: () => setDeletingFishId(null),
  });

  // Stats - computed based on active tab
  const todayStr = getManilaDateString();
  
  // Tab-specific stats computation
  const isClassificationsTab = activeTab === "classifications";
  
  // Overview stats always come from the persistent overview stats query
  const totalBanyeraRecords = transactionStats.total_records ?? 0;
  const totalFishClassifications = isClassificationsTab
    ? classificationsMeta.total ?? classifications.length ?? 0
    : classifications.length ?? 0;
  const totalBanyeraToday = transactionStats.today_count ?? 0;
  const totalFeeToday = Number(transactionStats.today_total_fee ?? 0);

  const summaryClassifications = classificationsData?.summary ?? {
    total: 0,
    used: 0,
    unused: 0,
  };
  const totalFishRecords = summaryClassifications.total;
  const totalFishUsed = summaryClassifications.used;
  const totalFishUnused = summaryClassifications.unused;
  
  // Keep the page skeleton tied to the main transactions/classifications data, not to the modal lookup fetches.
  const isOverviewLoading = isClassificationsTab
    ? (isClassificationsLoading || !classificationsData)
    : !data && (isLoading || isLookupsLoading);

  useEffect(() => {
    setSearch(highlightedSearchResult ? "" : requestedQuery);
  }, [highlightedSearchResult, requestedQuery]);

  const filtered = transactions;
  const totalPages = Math.max(1, Number(transactionsMeta.last_page || 1));
  const safePage   = Math.min(currentPage, totalPages);
  const paginated  = transactions;
  const transactionTotal = Number(transactionsMeta.total ?? 0);
  const hasTransactionRows = paginated.length > 0;
  const hasTransactionsOnServer = transactionTotal > 0;
  const hasTransactionResponse = Boolean(data?.transactionsMeta);
  const showTransactionSkeleton =
    !isError && isLoading && !data;
  const showTransactionEmptyState =
    hasTransactionResponse && !isFetching && !isError && !hasTransactionRows && !hasTransactionsOnServer;
  const cancelBanyeraTableQueries = useCallback(() => {
    void queryClient.cancelQueries({ queryKey: BANYERA_TRANSACTIONS_QUERY_KEY });
  }, [queryClient]);
  const requestTransactionPage = useCallback((nextPageOrUpdater) => {
    cancelBanyeraTableQueries();
    setCurrentPage((page) => {
      const nextPage =
        typeof nextPageOrUpdater === "function"
          ? nextPageOrUpdater(page)
          : nextPageOrUpdater;
      const parsedPage = Number(nextPage);
      if (!Number.isFinite(parsedPage)) return page;
      return Math.max(1, Math.min(totalPages, parsedPage));
    });
  }, [cancelBanyeraTableQueries, totalPages]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("highlight")?.startsWith("banyera-")) {
      setCurrentPage(1);
    }
  }, [location.search]);

  useEffect(() => {
    if (!highlightedBanyeraId) return;
    const resolvedPage = Number(transactionsMeta.current_page || 0);
    if (resolvedPage > 0 && resolvedPage !== currentPage) {
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, highlightedBanyeraId, transactionsMeta.current_page]);

  useEffect(() => {
    if (!highlightedClassificationId) return;
    const resolvedPage = Number(classificationsMeta.current_page || 0);
    if (resolvedPage > 0 && resolvedPage !== currentPage) {
      setCurrentPage(resolvedPage);
    }
  }, [classificationsMeta.current_page, currentPage, highlightedClassificationId]);

  useEffect(() => {
    if (!didRunTransactionFilterResetRef.current) {
      didRunTransactionFilterResetRef.current = true;
      return;
    }

    setCurrentPage(1);
  }, [search, periodFilter, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const openVoidTransaction = (tx) => {
    if (isHeadViewOnly) return;

    if (isDateLocked(tx?.transaction_date)) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    if (getManilaDateFromValue(tx?.transaction_date) !== todayStr) {
      showBottomToast("error", "Void Disabled", "Only today's banyera records can be voided.");
      return;
    }

    if (tx?.is_billed) {
      showBottomToast("error", "Void Disabled", "This banyera record has been billed and can no longer be voided.");
      return;
    }

    if (isBanyeraVoided(tx)) return;
    setPendingVoidTx(tx);
    setVoidReasonOption("");
    setVoidReasonCustom("");
    setVoidReasonError("");
  };

  // Classifications tab
  const clsTotalPages = Math.max(1, Number(classificationsMeta.last_page || 1));
  const safeClsPage   = Math.min(currentPage, clsTotalPages);
  const paginatedCls  = tableClassifications;
  const classificationsTotal = Number(classificationsMeta.total ?? 0);
  const hasClassificationsResponse = Boolean(classificationsData?.classificationsMeta);
  const hasClassificationRows = paginatedCls.length > 0;
  const hasClassificationsOnServer = classificationsTotal > 0;
  const showClassificationSkeleton =
    activeTab === "classifications" && (isClassificationsLoading || !classificationsData);
  const showClassificationEmptyState =
    hasClassificationsResponse &&
    !isClassificationsFetching &&
    !isClassificationsError &&
    !hasClassificationRows &&
    !hasClassificationsOnServer;
  const isActiveTabLoading =
    activeTab === "transactions"
      ? showTransactionSkeleton
      : showClassificationSkeleton;
  // Row selection helpers
  const toggleRow = (id) => setSelectedRows((p) => p.includes(id) ? p.filter((r) => r !== id) : [...p, id]);
  const toggleAll = () => setSelectedRows(selectedRows.length === paginated.length ? [] : paginated.map((t) => t.banyera_id));

  // Shared TH
  const TH = ({ children }) => (
    <th
      className="whitespace-nowrap bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase"
      style={{ color: "#8C8CA0", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}
    >
      {children}
    </th>
  );

  // Skeleton rows
  const SkeletonRows = ({ cols }) =>
    Array.from({ length: PAGE_SIZE }).map((_, i) => (
      <tr key={i} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
        {Array.from({ length: cols }).map((_, j) => (
          <td key={j} className="px-4 py-3">
            <div className="h-3 rounded bg-slate-100" style={{ width: j === 0 ? 32 : j === 1 ? 140 : 100 }} />
          </td>
        ))}
      </tr>
    ));

  const handleAddFish = () => {
    if (isHeadViewOnly) return;

    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    const trimmedFishName = fishName.trim();

    if (!trimmedFishName) {
      setFishNameError("Fish name is required.");
      return;
    }

    if (editingFish) {
      const currentFishName = String(
        editingFish.classification_name ?? editingFish.fish_name ?? ""
      ).trim();

      if (currentFishName === trimmedFishName) {
        setShowAddFishModal(false);
        setEditingFish(null);
        setFishName("");
        setFishNameError("");
        showNoChangesToast();
        return;
      }

      updateFishMutation.mutate({
        id: editingFish.classification_id,
        payload: { classification_name: trimmedFishName },
      });
      return;
    }

    addFishMutation.mutate({ classification_name: trimmedFishName });
  };

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

      <>
      <style>{`* { font-family: ${FONT} !important; }`}</style>
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
          <Topbar
            sidebarOpen={sidebarOpen}
            sidebarCollapsed={sidebarCollapsed}
            onMenuToggle={toggleSidebar}
          />

          <main className="flex-1 px-6 py-6 xl:px-8 overflow-y-auto bg-white">
            <div className="mx-auto w-full max-w-[1440px]">

              {/* Page Header */}
              <div className="mb-5 flex items-center justify-between">
                <TitlePage title="Banyera" subtitle="Track live banyera activities." loading={isOverviewLoading} />
                <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: getBanyeraBreadcrumbLabel(activeTab) }]} fontFamily={FONT} loading={isOverviewLoading} />
              </div>

              {/* Overview */}
              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {activeTab === "transactions" ? (
                  <>
                    <OverviewCard title="Total Banyera Records" value={totalBanyeraRecords} icon={IoFishOutline} tone="slate" loading={isOverviewLoading} />
                    <OverviewCard title="Today's Banyera" value={totalBanyeraToday} icon={IoCalendarOutline} tone="blue" loading={isOverviewLoading} />
                    <OverviewCard title="Today's Total Banyera" value={formatMoney(totalFeeToday)} icon={IoCashOutline} tone="green" loading={isOverviewLoading} />
                  </>
                ) : (
                  <>
                    <OverviewCard title="Total Fish Classifications" value={totalFishRecords} icon={IoListOutline} tone="slate" loading={isOverviewLoading} />
                    <OverviewCard title="Fish Classifications in Use" value={totalFishUsed} icon={IoCheckmarkCircleOutline} tone="green" loading={isOverviewLoading} />
                    <OverviewCard title="Fish Classifications Not in Use" value={totalFishUnused} icon={IoCloseCircleOutline} tone="amber" loading={isOverviewLoading} />
                  </>
                )}
              </div>

              <Tabs
                key={activeTab}
                tabs={BANYERA_TABS}
                activeKey={activeTab}
                onTabChange={(key) => {
                  cacheTab(BANYERA_TAB_STORAGE_KEY, key, BANYERA_TAB_KEYS);
                  navigate(getBanyeraTabPath(key));
                  setCurrentPage(1);
                  setSearch("");
                }}
                fontFamily={FONT}
                className="mb-5"
                loading={isOverviewLoading}
                rightContent={activeTab === "transactions" ? <Legend items={BANYERA_STATUS_LEGEND} className="gap-3" itemClassName="gap-2" loading={isOverviewLoading} skeletonCount={2} /> : null}
              >

              {/* Transactions Tab */}
              {activeTab === "transactions" && (
                <TableCard
                  title="Banyera Records"
                  subtitle="All banyera records in the system"
                  loading={showTransactionSkeleton}
                  headerActionsSkeletonCount={isHeadViewOnly ? 3 : 4}
                  bodyClassName="overflow-x-auto"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
                  actions={
                    <>
                      <div
                        className="flex items-center gap-2.5 px-4 rounded-lg border border-gray-200 bg-white transition-all"
                        style={{ height: 42, width: 280 }}
                        onFocus={(event) => {
                          event.currentTarget.style.borderColor = "#4096ff";
                          event.currentTarget.style.boxShadow = "none";
                        }}
                        onBlur={(event) => {
                          event.currentTarget.style.borderColor = "#e5e7eb";
                          event.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <IoSearchOutline className="text-gray-400 text-[17px] flex-shrink-0" />
                        <input
                          type="text"
                          placeholder="Search for boat name, boat type, date, total"
                          value={search}
                          onChange={(e) => {
                            clearUniversalHighlight();
                            setCurrentPage(1);
                            setSearch(e.target.value);
                          }}
                          className="bg-transparent border-none outline-none text-[13px] text-gray-600 w-full"
                          style={{ fontFamily: FONT }}
                        />
                      </div>
                      <TailDropdown
                        value={periodFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setCurrentPage(1);
                          setPeriodFilter(value);
                        }}
                        options={PERIOD_OPTIONS}
                        height={42}
                      />
                      <TailDropdown
                        value={statusFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setCurrentPage(1);
                          setStatusFilter(value);
                        }}
                        options={STATUS_OPTIONS}
                        height={42}
                      />
                      {!isHeadViewOnly ? (
                        <button
                          onClick={() => { if (!isTransactionLocked) setShowAddModal(true); }}
                          disabled={isTransactionLocked}
                          className="flex h-[42px] items-center gap-2 rounded-xl border-none px-5 text-[13px] font-semibold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                          style={{ fontFamily: FONT, backgroundColor: "#1a1f36" }}
                        >
                          <IoAddOutline className="text-[16px]" /> Add Banyera
                        </button>
                      ) : null}
                    </>
                  }
                  pagination={{
                    meta: transactionsMeta,
                    total: transactionTotal,
                    totalPages,
                    currentPage: safePage,
                    requestedPage: safePage,
                    isLoading: showTransactionSkeleton,
                    onPageChange: requestTransactionPage,
                    beforePageChange: clearUniversalHighlight,
                  }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: 1240 }}>
                      <thead>
                        <tr style={{ backgroundColor: "#ffffff" }}>
                          <TH>Boat Name</TH>
                          <TH>Boat Type</TH>
                          <TH>Fish Items</TH>
                          <TH>Banyera Date</TH>
                          <TH>Banyera Time</TH>
                          <TH>Total Quantity</TH>
                          <TH><div className="text-right">Total(₱)</div></TH>
                          <TH>Voided Reason</TH>
                          {!isHeadViewOnly ? <TH>Action</TH> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {showTransactionSkeleton ? (
                          Array.from({ length: PAGE_SIZE }).map((_, index) => (
                            <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td className="px-4 py-3"><div className="h-11 w-11 rounded-xl bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="h-3 w-28 rounded bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="h-3 w-24 rounded bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="h-8 w-24 rounded-xl bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="h-3 w-24 rounded bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="h-3 w-16 rounded bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-slate-100" /></td>
                              {!isHeadViewOnly ? <td className="px-4 py-3"><div className="flex gap-2"><div className="h-8 w-8 rounded-lg bg-slate-100" /><div className="h-8 w-8 rounded-lg bg-slate-100" /></div></td> : null}
                            </tr>
                          ))
                        ) : isError ? (
                          <tr>
                            <td colSpan={isHeadViewOnly ? 8 : 9} className="px-4 py-10 text-center">
                              <div className="flex flex-col items-center gap-3">
                                <IoWarningOutline className="text-[32px] text-red-400" />
                                <p className="m-0 text-[13px] font-normal text-red-500">Unable to load banyera transactions.</p>
                                <button
                                  onClick={() => refetch()}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
                                  style={{ fontFamily: FONT }}
                                >
                                  <IoReloadOutline /> Retry
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : showTransactionEmptyState ? (
                          <tr>
                            <td colSpan={isHeadViewOnly ? 8 : 9}>
                              <NoDataFound title={search ? "No results found" : "No Data Found"} />
                            </td>
                          </tr>
                        ) : (
                          paginated.map((tx, index) => {
                            const totalQty = (tx.items ?? []).reduce((s, it) => s + it.quantity, 0);
                            const primaryFishItem = (tx.items ?? []).length > 0 ? getClassificationName(tx.items[0]) : "-";
                            const moreFishCount = Math.max((tx.items ?? []).length - 1, 0);
                            const otherFishItems = (tx.items ?? []).slice(1).map((item) => getClassificationName(item));
                            const isVoided = isBanyeraVoided(tx);
                            const isLocked = isDateLocked(tx.transaction_date);
                            const isBusy = voidingTxId === tx.banyera_id;
                            const isTodayRecord = getManilaDateFromValue(tx.transaction_date) === todayStr;
                            const voidDisabled = isVoided
                              ? (isBusy || isTransactionLocked || isLocked || tx.is_billed || !isTodayRecord)
                              : (isBusy || isTransactionLocked || isLocked || tx.is_billed || !isTodayRecord);
                            const voidTooltip = isTransactionLocked || isLocked
                              ? transactionLockMessage
                              : tx.is_billed
                                ? (isVoided ? "Cannot restore - this banyera record has been billed" : "Cannot void - this banyera record has been billed")
                                : !isTodayRecord
                                  ? (isVoided ? "Only today's banyera records can be restored" : "Only today's banyera records can be voided")
                                  : isVoided
                                    ? "Restore"
                                    : "Void";
                            return (
                              <tr
                                key={tx.banyera_id}
                                className={`cursor-pointer transition-colors ${highlightedBanyeraId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${String(highlightedBanyeraId) === String(tx.banyera_id) ? "universal-search-highlight" : ""}`.trim()}
                                onClick={() => setDetailTx(tx)}
                                style={{
                                  borderBottom: "1px solid #f1f5f9",
                                }}
                              >
                                <td className="px-4 py-3">
                                  <button onClick={(e) => { e.stopPropagation(); setDetailTx(tx); }} className="border-none bg-transparent p-0 text-left cursor-pointer">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                        style={{ backgroundColor: isVoided ? "#f59e0b" : "#16a34a" }}
                                      />
                                      <p className="m-0 text-[13px] font-medium text-[#1a1f36]">{getBoatName(tx)}</p>
                                    </div>
                                  </button>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-[13px]" style={{ color: "#1a1f36" }}>
                                    {tx?.boat?.boat_type?.type_name || tx?.boat?.boatType?.type_name || "-"}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div>
                                    <span className="text-[13px]" style={{ color: "#1a1f36" }}>{primaryFishItem}</span>
                                    {moreFishCount > 0 && (
                                      <Tooltip
                                        title={
                                          <div className="space-y-1">
                                            {otherFishItems.map((fishName, fishIndex) => (
                                              <p key={`${tx.banyera_id}-${fishIndex}`} className="m-0 text-[13px]" style={{ color: "#ffffff", fontFamily: FONT }}>
                                                {fishName}
                                              </p>
                                            ))}
                                          </div>
                                        }
                                        placement="top"
                                      >
                                        <p className="m-0 mt-0.5 block cursor-help text-[13px] font-medium text-slate-500">
                                          +{moreFishCount} more
                                        </p>
                                      </Tooltip>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-[13px]" style={{ color: "#1a1f36" }}>{formatDate(tx.transaction_date)}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-[13px]" style={{ color: "#1a1f36" }}>{formatTime(tx.transaction_date)}</span>
                                </td>
                                <td className="px-4 py-3 text-[13px] font-semibold whitespace-nowrap" style={{ color: "#1a1f36" }}>
                                  {totalQty}
                                </td>
                                <td
                                  className="px-4 py-3 text-right text-[13px] font-semibold whitespace-nowrap"
                                  style={{ color: "#1a1f36", fontVariantNumeric: "tabular-nums" }}
                                >
                                  {formatAmount(getTransactionTotalFee(tx))}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-[13px]" style={{ color: "#1a1f36" }}>
                                    {tx?.void_reason || "-"}
                                  </span>
                                </td>
                                {!isHeadViewOnly ? (
                                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-2">
                                      {!isVoided ? (
                                        <Tooltip title={isTransactionLocked || isLocked ? transactionLockMessage : "Edit"}>
                                          <button
                                            onClick={() => {
                                              if (!isTransactionLocked && !isLocked) setEditingTx(tx);
                                            }}
                                            disabled={isTransactionLocked || isLocked}
                                            className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors ${
                                              isTransactionLocked || isLocked
                                                ? "cursor-not-allowed border-slate-200"
                                                : "cursor-pointer hover:bg-blue-50"
                                            }`}
                                            style={{ borderColor: isTransactionLocked || isLocked ? undefined : "#1a1f36" }}
                                          >
                                            <IoCreateOutline style={{ fontSize: "15px", color: isTransactionLocked || isLocked ? "#94a3b8" : "#1a1f36" }} />
                                          </button>
                                        </Tooltip>
                                      ) : null}
                                      <Tooltip title={voidTooltip}>
                                        <button
                                          onClick={() => {
                                            if (voidDisabled) return;
                                            if (isVoided) {
                                              restoreTransactionMutation.mutate(tx.banyera_id);
                                              return;
                                            }
                                            openVoidTransaction(tx);
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
                                    </div>
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                </TableCard>
              )}

              {/* Classifications Tab */}
              {activeTab === "classifications" && (
                <TableCard
                  title="Fish Classifications"
                  subtitle="Manage fish names and monitor where they are used."
                  loading={showClassificationSkeleton}
                  headerActionsSkeletonCount={isHeadViewOnly ? 2 : 3}
                  bodyClassName="overflow-x-auto"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
                  actions={
                    <>
                      <div
                        className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-4 transition-all"
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
                          type="text"
                          placeholder="Search for fish name"
                          value={search}
                          onChange={(e) => {
                            clearUniversalHighlight();
                            setSearch(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full border-none bg-transparent text-[13px] outline-none"
                          style={{ fontFamily: FONT, color: "#1a1f36" }}
                        />
                      </div>
                      <TailDropdown
                        value={fishStatusFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setFishStatusFilter(value);
                          setCurrentPage(1);
                        }}
                        options={FISH_STATUS_OPTIONS}
                        height={42}
                      />
                      {!isHeadViewOnly ? (
                        <button
                          onClick={() => {
                            if (isTransactionLocked) return;
                            setEditingFish(null);
                            setFishName("");
                            setFishNameError("");
                            setShowAddFishModal(true);
                          }}
                          disabled={isTransactionLocked}
                          className="flex h-[42px] items-center justify-center gap-2 rounded-xl border-none bg-[#1a1f36] px-5 text-[13px] font-semibold text-white cursor-pointer hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:opacity-70"
                          style={{ fontFamily: FONT }}
                        >
                          <IoAddOutline className="text-[16px]" /> Add Fish
                        </button>
                      ) : null}
                    </>
                  }
                  pagination={{
                    meta: classificationsMeta,
                    total: classificationsTotal,
                    totalPages: clsTotalPages,
                    currentPage: safeClsPage,
                    requestedPage: safeClsPage,
                    isLoading: showClassificationSkeleton,
                    onPageChange: setCurrentPage,
                    beforePageChange: clearUniversalHighlight,
                  }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: isHeadViewOnly ? 440 : 540 }}>
                      <colgroup>
                        <col style={{ width: isHeadViewOnly ? "68%" : "56%" }} />
                        <col style={{ width: isHeadViewOnly ? "32%" : "24%" }} />
                        {!isHeadViewOnly ? <col style={{ width: "20%" }} /> : null}
                      </colgroup>
                      <thead>
                        <tr style={{ backgroundColor: "#ffffff" }}>
                          <TH>Fish Name</TH>
                          <TH><div className="text-center">Usage Count</div></TH>
                          {!isHeadViewOnly ? <TH>Action</TH> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {showClassificationSkeleton ? (
                          Array.from({ length: PAGE_SIZE }).map((_, index) => (
                            <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td className="px-4 py-3"><div className="h-3 w-32 rounded bg-slate-100" /></td>
                              <td className="px-4 py-3"><div className="mx-auto h-6 w-20 rounded-full bg-slate-100" /></td>
                              {!isHeadViewOnly ? <td className="px-4 py-3"><div className="flex gap-2"><div className="h-8 w-8 rounded-lg bg-slate-100" /><div className="h-8 w-8 rounded-lg bg-slate-100" /></div></td> : null}
                            </tr>
                          ))
                        ) : isClassificationsError ? (
                          <tr>
                            <td colSpan={isHeadViewOnly ? 2 : 3} className="px-4 py-10 text-center">
                              <div className="flex flex-col items-center gap-3">
                                <IoWarningOutline className="text-[32px] text-red-400" />
                                <p className="m-0 text-[13px] font-normal text-red-500">Unable to load classifications.</p>
                                <button
                                  onClick={() => refetchClassifications()}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
                                  style={{ fontFamily: FONT }}
                                >
                                  <IoReloadOutline /> Retry
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : showClassificationEmptyState ? (
                          <tr>
                            <td colSpan={isHeadViewOnly ? 2 : 3}>
                              <NoDataFound title={search || fishStatusFilter !== "all" ? "No results found" : "No Data Found"} />
                            </td>
                          </tr>
                        ) : (
                          paginatedCls.map((cls, index) => (
                            <tr
                              key={cls.classification_id}
                              onClick={() => setSelectedFishClassification(cls)}
                              className={`cursor-pointer transition-colors ${highlightedClassificationId ? "table-row-plain" : ""} ${String(highlightedClassificationId) === String(cls.classification_id) ? "universal-search-highlight" : ""}`.trim()}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: highlightedClassificationId ? "#ffffff" : index % 2 === 0 ? "#ffffff" : "#ededed",
                              }}
                            >
                              <td className="px-4 py-3 text-[13px] font-normal text-slate-800">{cls.classification_name}</td>
                              <td className="px-4 py-3 text-center">
                                <StatusPill
                                  status={(cls.fish_using_count ?? 0) > 0 ? "enabled" : "disabled"}
                                  label={`${cls.fish_using_count ?? 0} ${(cls.fish_using_count ?? 0) <= 1 ? "count" : "counts"}`}
                                  className="text-[13px]"
                                />
                              </td>
                              {!isHeadViewOnly ? (
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <Tooltip title={isTransactionLocked ? transactionLockMessage : "Edit"}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isTransactionLocked) return;
                                          setEditingFish(cls);
                                          setFishName(cls.classification_name ?? "");
                                          setFishNameError("");
                                          setShowAddFishModal(true);
                                        }}
                                        disabled={isTransactionLocked}
                                        className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors ${isTransactionLocked ? "cursor-not-allowed border-slate-200" : "hover:bg-blue-50"}`}
                                        style={{ borderColor: isTransactionLocked ? undefined : "#1a1f36" }}
                                        >
                                          <IoCreateOutline style={{ fontSize: "15px", color: isTransactionLocked ? "#94a3b8" : "#1a1f36" }} />
                                        </button>
                                    </Tooltip>
                                    <Tooltip title={isTransactionLocked ? transactionLockMessage : "Archive"}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isTransactionLocked) return;
                                          setDeletingFish(cls);
                                        }}
                                        disabled={isTransactionLocked || deletingFishId === cls.classification_id}
                                        className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors ${
                                          isTransactionLocked || deletingFishId === cls.classification_id
                                            ? "cursor-not-allowed border-slate-200"
                                            : "cursor-pointer hover:bg-red-50"
                                        }`}
                                        style={{ borderColor: isTransactionLocked || deletingFishId === cls.classification_id ? undefined : "#ef4444" }}
                                      >
                                        <IoArchiveOutline style={{ fontSize: "15px", color: isTransactionLocked ? "#94a3b8" : "#ef4444" }} />
                                      </button>
                                    </Tooltip>
                                  </div>
                                </td>
                              ) : null}
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

      {/* Modals */}
      {!isHeadViewOnly ? <AddBanyeraModal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          refetch();
        }}
        onSave={(payload) => createMutation.mutate(payload)}
        saving={createMutation.isPending}
        boats={boats}
        fees={fees}
        classifications={classifications}
        isLookupsLoading={isLookupsLoading}
      /> : null}
        {!isHeadViewOnly ? <AddFishModal
          open={showAddFishModal}
          onClose={() => {
            if (addFishMutation.isPending || updateFishMutation.isPending) return;
            setShowAddFishModal(false);
            setEditingFish(null);
          }}
          onSave={handleAddFish}
          saving={addFishMutation.isPending || updateFishMutation.isPending}
          value={fishName}
          onChange={(value) => {
            setFishName(value);
            setFishNameError("");
          }}
          error={fishNameError}
          isEditing={Boolean(editingFish)}
        /> : null}
      {!isHeadViewOnly ? <EditBanyeraDrawer
        open={!!editingTx}
        tx={editingTx}
        boats={boats}
        fees={fees}
        classifications={classifications}
        onClose={() => setEditingTx(null)}
        onSubmit={updateTransaction}
        saving={savingTx}
      /> : null}
      <BanyeraDetailDrawer
        open={!!detailTx}
        tx={detailTx}
        onClose={() => setDetailTx(null)}
      />
      <FishClassificationDetailsDrawer
        classification={selectedFishClassification}
        open={Boolean(selectedFishClassification)}
        onClose={() => setSelectedFishClassification(null)}
      />
      {!isHeadViewOnly ? <VoidBanyeraModal
        open={Boolean(pendingVoidTx)}
        tx={pendingVoidTx}
        selectedReason={voidReasonOption}
        customReason={voidReasonCustom}
        error={voidReasonError}
        saving={voidingTxId === pendingVoidTx?.banyera_id}
        showSavingSpinner={voidingTxId === pendingVoidTx?.banyera_id}
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
          if (voidingTxId) return;
          setPendingVoidTx(null);
          setVoidReasonOption("");
          setVoidReasonCustom("");
          setVoidReasonError("");
        }}
        onConfirm={() => {
          if (!pendingVoidTx || voidingTxId) return;
          if (!voidReasonOption) {
            setVoidReasonError("Void reason is required.");
            return;
          }

          const selectedReasonLabel = VOID_REASON_OPTIONS.find(
            (option) => option.value === voidReasonOption
          )?.label;
          const trimmedCustomReason = voidReasonCustom.trim();
          const trimmedReason = voidReasonOption === "others"
            ? trimmedCustomReason
            : selectedReasonLabel;

          if (!trimmedReason) {
            setVoidReasonError(
              voidReasonOption === "others"
                ? "Please provide the specific void reason."
                : "Void reason is required."
            );
            return;
          }

          voidTransactionMutation.mutate({
            transactionId: pendingVoidTx.banyera_id,
            void_reason: trimmedReason,
          });
        }}
      /> : null}
      {!isHeadViewOnly ? <ArchiveModal
        open={!!deletingFish}
        title="Archive Fish Classification"
        itemName={deletingFish?.classification_name || "this record"}
        saving={deletingFishId === deletingFish?.classification_id}
        onClose={() => {
          if (deletingFishId) return;
          setDeletingFish(null);
        }}
        onConfirm={() => {
          if (!deletingFish || deletingFishId) return;
          deleteFishMutation.mutate(deletingFish.classification_id, {
            onSettled: () => setDeletingFish(null),
          });
        }}
      /> : null}
      </>
    </ConfigProvider>
  );
};

const EditBanyeraDrawer = ({ tx, open, boats, fees, classifications, onClose, onSubmit, saving }) => {
  const [form, setForm] = useState(() => buildBanyeraFormState(tx));
  const [items, setItems] = useState([{ classification_id: "", quantity: "", daug: "" }]);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(buildBanyeraFormState(tx));
    setItems(
      (tx?.items ?? []).length > 0
        ? tx.items.map((item) => ({
            item_id: item.item_id ?? null,
            classification_id: String(item.classification_id ?? ""),
            quantity: String(item.quantity ?? ""),
            fee_id: item.fee_id ?? tx?.fee_id ?? null,
            subtotal: item.subtotal ?? 0,
            daug:
              item?.daug === null || item?.daug === undefined
                ? ""
                : String(item.daug),
          }))
        : [{ classification_id: "", quantity: "", daug: "" }]
    );
    setErrors({});
  }, [open, tx]);

  const selectedBoat = boats.find((boat) => String(boat.boat_id) === String(form.boat_id));
  const activeBoats = boats.filter((boat) => String(boat?.status ?? "").toLowerCase() === "active");
  const activeBoatOptions = activeBoats.map((boat) => ({
    value: String(boat.boat_id),
    label: boat.boat_name,
  }));
  const boatOptions = selectedBoat && !activeBoats.some((boat) => String(boat.boat_id) === String(selectedBoat.boat_id))
    ? [
        {
          value: String(selectedBoat.boat_id),
          label: `${selectedBoat.boat_name} (Inactive)`,
        },
        ...activeBoatOptions,
      ]
    : activeBoatOptions;
  const banyeraFees = fees.filter((fee) => {
    if (!isBanyeraFee(fee)) return false;
    if (!selectedBoat) return false;
    return String(fee.boat_type_id || "") === getBoatTypeId(selectedBoat);
  });
  const transactionFee = fees.find((fee) => String(fee.fee_id) === String(tx?.items?.[0]?.fee_id));
  const feeOptions = transactionFee && !banyeraFees.some((fee) => String(fee.fee_id) === String(transactionFee.fee_id))
    ? [transactionFee, ...banyeraFees]
    : banyeraFees;
  const selectedApplicableFee = feeOptions.find((fee) => String(fee.fee_id) === String(form.fee_id));
  const totalFee = items.reduce((sum, item) => sum + ((parseInt(item.quantity, 10) || 0) * getFeeAmount(selectedApplicableFee)), 0);

  useEffect(() => {
    if (!selectedBoat) return;
    if (form.fee_id && feeOptions.some((fee) => String(fee.fee_id) === String(form.fee_id))) return;
    if (feeOptions.length === 0) {
      if (!form.fee_id) return;
      setForm((current) => ({ ...current, fee_id: "" }));
      return;
    }

    const matchingFee = feeOptions[0];
    setForm((current) => ({
      ...current,
      fee_id: String(matchingFee.fee_id),
    }));
  }, [selectedBoat, feeOptions, form.fee_id]);

  if (!tx) return null;

  const handleSave = () => {
    const nextErrors = {};
    const builtDate = `${form.banyera_date_year}-${form.banyera_date_month}-${form.banyera_date_day}`;
    const builtTime = buildTwentyFourHourTime(form.banyera_time_hour, form.banyera_time_minute, form.banyera_time_meridiem);
    const builtDateTime = `${builtDate} ${builtTime || "00:00:00"}`;
    if (!form.boat_id) nextErrors.boat_id = "Please select a boat";
    if (!form.fee_id) nextErrors.fee_id = "Please select a fee";
    if (!form.banyera_date_month || !form.banyera_date_day || !form.banyera_date_year) nextErrors.banyera_date = "Banyera date is required";
    else if (isFutureBanyeraDate(builtDate)) nextErrors.banyera_date = "Banyera date cannot be in the future";
    items.forEach((item, index) => {
      if (!item.classification_id) nextErrors[`cls_${index}`] = "Required";
      if (!item.quantity || parseInt(item.quantity, 10) < 1) nextErrors[`qty_${index}`] = "Required";
    });
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }

    const payload = {
      boat_id: parseInt(form.boat_id, 10),
      transaction_date: builtDateTime,
      items: items.map((item) => {
        const quantity = parseInt(item.quantity, 10);
        return {
          item_id: item.item_id ?? null,
          classification_id: parseInt(item.classification_id, 10),
          quantity,
          fee_id: parseInt(item.fee_id ?? form.fee_id, 10),
          subtotal: getFeeAmount(selectedApplicableFee) * quantity,
          daug: item.daug === "" ? null : Number(item.daug),
        };
      }),
    };

    const currentDaugState = normalizeDaugOnlyState(tx?.items ?? []);
    const nextDaugState = normalizeDaugOnlyState(payload.items);
    const canPatchEditableFields =
      currentDaugState !== nextDaugState &&
      payload.items.every((item) => item.item_id);

    onSubmit({
      payload: canPatchEditableFields
        ? {
            editable_only: true,
            items: payload.items.map((item) => ({
              item_id: item.item_id,
              daug: item.daug,
            })),
          }
        : payload,
    });
  };

  return (
    <Modal
      title="Edit Banyera"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      saveLabel="Save"
      savingLabel=""
      saveButtonWidth="132px"
      maxWidth="620px"
      showSavingSpinner
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="space-y-4">
            <ModalInput label="Boat Name" readOnly value={getBoatName(tx)} placeholder="-" wrapperClassName="!bg-slate-100" inputStyle={{ color: "#475569" }} />
            <ModalInput label="Banyera Date & Time" icon={IoCalendarOutline} readOnly value={formatDateTime(tx?.transaction_date)} placeholder="-" wrapperClassName="!bg-slate-100" inputStyle={{ color: "#475569" }} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
          <div>
            <div
              className="mb-2 grid gap-1 px-1"
              style={{ gridTemplateColumns: "minmax(0,2.4fr) minmax(100px,0.75fr) minmax(116px,1fr) minmax(116px,1fr)" }}
            >
              <p className="m-0 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>FISH CLASSIFICATION</p>
              <p className="m-0 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>QTY</p>
              <p className="m-0 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>SUBTOTAL</p>
              <p className="m-0 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>DAUG</p>
            </div>
            {(items ?? []).map((item, index) => {
              const subtotal = (parseInt(item.quantity, 10) || 0) * getFeeAmount(selectedApplicableFee);
              return (
                <div key={index} className="mb-3 last:mb-0">
                  <p className="mb-1 mt-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500" style={{ fontFamily: FONT }}>
                    Item {index + 1}
                  </p>
                  <div
                    className="grid gap-1 items-center"
                    style={{ gridTemplateColumns: "minmax(0,2.4fr) minmax(100px,0.75fr) minmax(116px,1fr) minmax(116px,1fr)" }}
                  >
                    <input
                      type="text"
                      readOnly
                      value={classifications.find((classification) => String(classification.classification_id) === String(item.classification_id))?.classification_name || ""}
                      placeholder="-"
                      className="w-full h-[46px] rounded-[10px] border border-slate-200 bg-slate-100 px-3 text-[12px] font-medium outline-none"
                      style={{ color: "#475569", fontFamily: FONT }}
                    />
                    <input
                      type="text"
                      readOnly
                      value={item.quantity || ""}
                      placeholder="0"
                      className="w-full h-[46px] rounded-[10px] border border-slate-200 bg-slate-100 px-3 text-center text-[12px] font-medium outline-none"
                      style={{ color: "#475569", fontFamily: FONT }}
                    />
                    <input
                      type="text"
                      readOnly
                      value={subtotal > 0 ? `${PESO}${formatAmount(subtotal)}` : ""}
                      placeholder={`${PESO}0.00`}
                      className="w-full h-[46px] rounded-[10px] border border-slate-200 bg-slate-100 px-3 text-[12px] font-medium outline-none"
                      style={{ color: "#475569", fontFamily: FONT }}
                    />
                    <input
                      type="text"
                      value={item.daug ? `${PESO}${item.daug}` : ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.]/g, "");
                        setItems((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, daug: value } : entry
                          )
                        );
                      }}
                      placeholder={`${PESO}0.00`}
                      className="w-full h-[46px] rounded-[10px] border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-[#4096ff] focus:shadow-[0_0_0_1px_rgba(64,150,255,0.18)]"
                      style={{ color: "#475569", fontFamily: FONT }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <ModalInput label="Total Fee" icon={IoCashOutline} readOnly value={`${PESO}${formatAmount(totalFee)}`} placeholder={`${PESO}0.00`} wrapperClassName="!bg-slate-100" inputStyle={{ color: "#475569" }} />
          </div>
        </div>
      </div>
    </Modal>
  );
};

const FishClassificationDetailsDrawer = ({ classification, open, onClose }) => {
  if (!open || !classification) return null;
  const createdByName = getCreatedBy(classification);

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={460}
      fontFamily={FONT}
      title="Fish Classification Details"
      subtitle="Review the selected fish classification record."
      icon={IoFishOutline}
    >
      <DrawerSection
        icon={IoFishOutline}
        title="FISH Info"
        subtitle="Details for this fish classification"
        fontFamily={FONT}
      >
        <div className="grid grid-cols-1 gap-3">
          <DrawerInfoCard label="Fish Name" value={classification.classification_name ?? "-"} />
          <DrawerInfoCard
            label="Usage Count"
            value={`${classification.fish_using_count ?? 0} ${(classification.fish_using_count ?? 0) === 1 ? "count" : "counts"}`}
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
          <DrawerInfoCard label="Date Added" value={formatDate(classification.created_at)} />
        </div>
      </DrawerSection>
    </DetailDrawer> 
  );
};

const BanyeraDetailDrawer = ({ tx, open, onClose }) => {
  if (!open || !tx) return null;
  const totalQty = (tx.items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const feePerBanyera = getTransactionFeePerBanyera(tx);
  const banyeraStatus = isBanyeraVoided(tx) ? "voided" : "active";
  const detailPairs = [
    { label: "Boat Name", value: getBoatName(tx) },
    {
      label: "Status",
      value: banyeraStatus === "voided" ? "Voided" : "Active",
      indicatorColor: BANYERA_STATUS_LEGEND.find((item) => item.key === banyeraStatus)?.color,
    },
    { label: "Boat Type", value: tx?.boat?.boat_type?.type_name || tx?.boat?.boatType?.type_name || "-" },
    { label: "Boat Owner", value: getOwnerName(tx) },
    { label: "Banyera Date", value: formatDate(tx.transaction_date) },
    { label: "Banyera Time", value: formatTime(tx.transaction_date) },
    { label: "Total Quantity", value: String(totalQty) },
    { label: "Total Fee", value: `${PESO}${formatAmount(getTransactionTotalFee(tx)).replace(PESO, "")}` },
    { label: "Inspector", value: getCreatedBy(tx), className: "col-span-2" },
  ];

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={460}
      fontFamily={FONT}
      title="Banyera Details"
      subtitle="Review the selected banyera record."
      icon={IoFishOutline}
    >
      <DrawerSection
        icon={IoDocumentTextOutline}
        title="Transaction Information"
        subtitle="Recorded details for this banyera entry"
        fontFamily={FONT}
      >
        <div className="grid grid-cols-2 gap-3">
          {detailPairs.map(({ label, value, className, indicatorColor }) => (
            <DrawerInfoCard key={label} label={label} value={value} className={className} indicatorColor={indicatorColor} />
          ))}
        </div>
      </DrawerSection>

      <DrawerSection
        icon={IoFishOutline}
        title="Fish Items"
        subtitle="Classifications included in this transaction"
        fontFamily={FONT}
      >
        <div className="rounded-xl overflow-hidden border border-gray-200">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#1a1f36]">
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase" style={{ color: "#FFFFFF" }}>Classification</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase" style={{ color: "#FFFFFF" }}>Qty</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase" style={{ color: "#FFFFFF" }}>Subtotal</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase" style={{ color: "#FFFFFF" }}>Daug</th>
              </tr>
            </thead>
            <tbody>
              {(tx.items ?? []).map((item, index) => (
                <tr
                  key={item.item_id ?? index}
                  className={`${index < (tx.items ?? []).length - 1 ? "border-b border-gray-200" : ""} ${index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                >
                  <td className="px-3 py-2.5 text-[12px] text-slate-700">{getClassificationName(item)}</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-600 text-center font-medium">{item.quantity}</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-700 font-semibold text-center">{`${PESO}${formatAmount(item.subtotal)}`}</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-700 font-semibold text-center">{`${PESO}${formatAmount(getDaugAmount(item))}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DrawerSection>

      {isBanyeraVoided(tx) ? (
        <DrawerSection
          icon={IoAlertCircleOutline}
          title="Void Details"
          subtitle="Reason and personnel for this voided banyera record"
          fontFamily={FONT}
        >
          <div className="grid grid-cols-2 gap-3">
            <DrawerInfoCard label="Void Reason" value={tx?.void_reason || "-"} className="col-span-2" />
            <DrawerInfoCard label="Voided By" value={getVoidedBy(tx)} className="col-span-2" />
          </div>
        </DrawerSection>
      ) : null}
    </DetailDrawer>
  );
};

export default SuperBanyera;
