import React, { useEffect, useMemo, useRef, useState } from "react";
import { ConfigProvider, Select, Tooltip } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import "typeface-montserrat";
import {
  IoAddOutline,
  IoAlertCircleOutline,
  IoChevronDownOutline,
  IoCashOutline,
  IoCheckmarkOutline,
  IoCloseOutline,
  IoCreateOutline,
  IoLayersOutline,
  IoPersonOutline,
  IoPricetagOutline,
  IoSearchOutline,
  IoTrashOutline,
  IoWarningOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import DatePicker from "../../components/DatePicker";
import FilterSelect from "../../components/FilterSelect";
import Legend from "../../components/Legend";
import Modal from "../../components/Modal";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import Spinner from "../../components/Spinner";
import NoDataFound from "../../components/NoDataFound";
import { showAddedToast, showBottomToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import { useSidebar } from "../../store/sidebarStore";
import { FEES_DATA_QUERY_KEY, sortFeesNewestFirst, useFeesDataQuery, useFeesLookupsQuery } from "../../hooks/useFeesDataQuery";
import api from "../../api/axios";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";

const FONT = "'Montserrat', sans-serif";
const PAGE_SIZE = 10;
const PAGE_DEBOUNCE_MS = 150;
const SEARCH_DEBOUNCE_MS = 300;
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
const YEAR_OPTIONS = Array.from({ length: 100 }, (_, idx) => {
  const year = String(new Date().getFullYear() - idx);
  return { value: year, label: year };
});
const FEE_STATUS_LEGEND = [
  { key: "active", label: "Active", meaning: "Currently in effect", color: "#16a34a" },
  { key: "pending", label: "Pending", meaning: "Starts on a future date", color: "#f59e0b" },
  { key: "expired", label: "Expired", meaning: "No longer in effect", color: "#ef4444" },
];

const PERIOD_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

const SET_FEES_TABS = [{ key: "fees", label: "Fees", icon: IoCashOutline }];

const antTheme = {
  token: { colorPrimary: "#4096ff", borderRadius: 12, fontFamily: FONT, controlHeight: 42, fontSize: 13 },
};

const TH = ({ children, className = "" }) => (
  <th
    className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold ${className}`.trim()}
    style={{ color: "#1a1f36", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}
  >
    {children}
  </th>
);

const formatMoneyValue = (value) => {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return "0.00";
  return numeric.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getFeeDisplayName = (fee) => fee?.fee_name || fee?.fee_type_name || "Fee";

const getFeeApplicableLabel = (fee) => fee?.boat_type?.type_name || fee?.vehicle_type?.type_name || "";

const formatDate = (value) => {
  if (!value) return "";
  const normalized = String(value).trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};


const TailDropdown = ({ value, onChange, options, height = 42, minWidth = 150 }) => (
  <FilterSelect value={value} onChange={onChange} options={options} height={height} width={minWidth} />
);

const Field = ({ label, required, error, children }) => (
  <div>
    <label className="mb-1.5 block text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>
      {label}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
    <div className={error ? "modal-field-control-error" : ""}>{children}</div>
    {error && (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
        <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
        <p className="m-0 text-[12px] font-normal text-red-600">{error}</p>
      </div>
    )}
  </div>
);

const ShellInput = ({ ...props }) => (
  <input {...props} className="h-[42px] w-full rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-medium text-[#0d1117] outline-none" style={{ fontFamily: FONT }} />
);

const ModalInput = ({ label, required, error, icon: Icon, readOnly, ...props }) => (
  <Field label={label} required={required} error={error}>
    <div className={`modal-input-shell flex h-[46px] items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-4 transition-all focus-within:border-[#4096ff] ${readOnly ? "fee-readonly-input" : ""}`.trim()}>
      <input
        {...props}
        readOnly={readOnly}
        className="w-full border-none bg-transparent text-[14px] font-medium text-[#0d1117] outline-none placeholder:font-normal placeholder:text-slate-400"
        style={{ fontFamily: FONT }}
      />
    </div>
  </Field>
);

const ModalShell = ({ open, title, subtitle, children, onClose, onSave, saving, saveLabel }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
      <style>{`
        .set-fees-modal-shell .modal-input-shell:focus-within {
          border-color: #4096ff !important;
          box-shadow: none !important;
        }
        .set-fees-modal-shell .ant-select-focused .ant-select-selector,
        .set-fees-modal-shell .ant-select-open .ant-select-selector,
        .set-fees-modal-shell .ant-picker-focused,
        .set-fees-modal-shell textarea:focus {
          border-color: #4096ff !important;
          box-shadow: none !important;
        }
        .set-fees-modal-shell .modal-field-control-error .modal-input-shell,
        .set-fees-modal-shell .modal-field-control-error textarea,
        .set-fees-modal-shell .modal-field-control-error input:not([type="hidden"]),
        .set-fees-modal-shell .modal-field-control-error .ant-picker,
        .set-fees-modal-shell .modal-field-control-error .ant-select-selector {
          border-color: #fca5a5 !important;
          box-shadow: none !important;
        }
        .set-fees-modal-shell .fee-applicable-type-select .ant-select-selector,
        .set-fees-modal-shell .fee-applicable-type-select.ant-select-disabled .ant-select-selector {
          background: #ffffff !important;
        }
        .set-fees-modal-shell .fee-readonly-select.ant-select-focused .ant-select-selector,
        .set-fees-modal-shell .fee-readonly-select.ant-select-open .ant-select-selector,
        .set-fees-modal-shell .fee-readonly-input:focus-within {
          border-color: #e2e8f0 !important;
          box-shadow: none !important;
        }
        .set-fees-modal-shell input::placeholder,
        .set-fees-modal-shell textarea::placeholder,
        .set-fees-modal-shell .ant-picker-input > input::placeholder,
        .set-fees-modal-shell .ant-select-selection-search-input::placeholder,
        .set-fees-modal-shell .ant-select-selection-placeholder {
          color: #94a3b8 !important;
          opacity: 1 !important;
          font-weight: 400 !important;
        }
      `}</style>
      <div className="w-full max-w-[560px] rounded-2xl bg-white shadow-2xl" style={{ fontFamily: FONT }}>
        <div className="set-fees-modal-shell">
        <div className="flex items-start justify-between px-8 pb-5 pt-7">
          <div>
            <h3 className="m-0 text-[20px] font-bold text-[#1a1f36]">{title}</h3>
            <p className="m-0 mt-1.5 text-[13px] text-slate-500">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[#1a1f36] transition-colors hover:bg-slate-200"
            style={{ border: "2px solid #1a1f36" }}
          >
            <IoCloseOutline className="text-[18px]" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-8 pb-5">{children}</div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-8 py-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer rounded-xl bg-white px-6 py-3 text-[14px] font-semibold text-[#1a1f36]"
            style={{ border: "2px solid #1a1f36", opacity: saving ? 0.5 : 1 }}
          >
            Close
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl border-none bg-[#1a1f36] px-6 py-3 text-[14px] font-semibold text-white cursor-pointer hover:bg-[#2d3561]"
            style={{ opacity: saving ? 0.7 : 1 }}
          >
            {saving ? <><Spinner />Saving...</> : saveLabel}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};

const getDateParts = (value) => {
  if (!value) return { month: "", day: "", year: "" };
  const [year = "", month = "", day = ""] = value.slice(0, 10).split("-");
  return { month, day, year };
};
const buildDateFromParts = (year, month, day) => {
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
};
const normalizeDateValue = (value) => String(value || "").slice(0, 10);
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const getTodayDateParts = () => getDateParts(getLocalDateString());

const getFeeStatus = (fee) => {
  const now = getLocalDateString();
  const effectiveFrom = normalizeDateValue(fee.effective_from);
  const effectiveTo = normalizeDateValue(fee.effective_to);
  if (effectiveTo && effectiveTo < now) return "expired";
  if (effectiveFrom && effectiveFrom > now) return "pending";
  return "active";
};

const upsertFeeRecord = (fees, nextFee) => {
  const currentFees = Array.isArray(fees) ? fees : [];
  const nextFeeId = String(nextFee?.fee_id ?? "");
  const existingIndex = currentFees.findIndex((item) => String(item?.fee_id ?? "") === nextFeeId);

  if (existingIndex === -1) return sortFeesNewestFirst([...currentFees, nextFee]);

  const updatedFees = [...currentFees];
  updatedFees[existingIndex] = nextFee;
  return sortFeesNewestFirst(updatedFees);
};

const BOAT_FEE_TYPE_NAMES = new Set(["docking"]);
const VEHICLE_FEE_TYPE_NAMES = new Set([
  "vehicle ticket daily",
  "vehicle ticket annual",
  "daily vehicle ticket",
  "annual vehicle ticket",
]);

const normalizeFeeTypeName = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  if (lower === "daily vehicle ticket" || lower === "vehicle ticket daily") {
    return "Vehicle Ticket Daily";
  }

  if (lower === "annual vehicle ticket" || lower === "vehicle ticket annual") {
    return "Vehicle Ticket Annual";
  }

  return normalized;
};

const getApplicableTypeKind = (feeTypeName) => {
  const value = normalizeFeeTypeName(feeTypeName).toLowerCase();
  if (value === "banyera") return "both";
  if (BOAT_FEE_TYPE_NAMES.has(value)) return "boat";
  if (VEHICLE_FEE_TYPE_NAMES.has(value)) return "vehicle";
  return "";
};

const getFeeHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Set Fees" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("fee-") ? rawId.slice("fee-".length) : "";
};

const SuperSetFees = () => {
  const location = useLocation();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();

  const [activeItem, setActiveItem] = useState("Set Fees");
  const [contentMargin, setContentMargin] = useState(() => (window.innerWidth >= 1024 ? 256 : 0));
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [requestedPage, setRequestedPage] = useState(1);
  const didRunTableFilterResetRef = useRef(false);
  const [feeIndicatorFilter, setFeeIndicatorFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [activeView, setActiveView] = useState("fees");
  const [showFeeModal, setShowFeeModal] = useState(false);
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const [editingFee, setEditingFee] = useState(null);
  const [saving, setSaving] = useState(false);
  const [archivingFee, setArchivingFee] = useState(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const rawHighlightedFeeId = getFeeHighlightId({ highlightedSearchResult, search: location.search });
  const highlightToken = rawHighlightedFeeId
    ? `${rawHighlightedFeeId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedFeeId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedFeeId;
  const feeQuerySearch = highlightedFeeId ? "" : search;
  const feeQueryStatus = highlightedFeeId ? "all" : feeIndicatorFilter;
  const feeQueryPeriod = highlightedFeeId ? "all" : periodFilter;
  const clearUniversalHighlight = React.useCallback(() => {
    const params = new URLSearchParams(location.search);
    const hadHighlight = params.delete("highlight");

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

  const { data, isLoading, isFetching, isError, isPlaceholderData } = useFeesDataQuery({
    page: currentPage,
    perPage: PAGE_SIZE,
    search: feeQuerySearch,
    status: feeQueryStatus,
    period: feeQueryPeriod,
    highlightFeeId: highlightedFeeId,
    paginated: true,
    includeLookups: false,
  });

  const { data: lookupData, isLoading: isLookupsLoading } = useFeesLookupsQuery({
    enabled: showFeeModal || Boolean(editingFee),
  });

  const [feeForm, setFeeForm] = useState({
    fee_type_name: undefined,
    boat_type_id: undefined,
    vehicle_type_id: undefined,
    amount: "",
    effective_from_month: "",
    effective_from_day: "",
    effective_from_year: "",
    effective_to_month: "",
    effective_to_day: "",
    effective_to_year: "",
  });
  const [feeErrors, setFeeErrors] = useState({});

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) setContentMargin(sidebarCollapsed ? 72 : 256);
    else if (window.innerWidth < 1024) setContentMargin(0);
  }, [sidebarCollapsed, sidebarOpen]);

  useEffect(() => {
    setDismissedHighlightToken("");
  }, [location.key]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextSearch = highlightedSearchResult ? "" : params.get("q") || "";

    setSearch(nextSearch);
    setActiveView("fees");
    if (params.get("highlight")?.startsWith("fee-")) {
      setFeeIndicatorFilter("all");
      setPeriodFilter("all");
    }
    setRequestedPage(1);
    setCurrentPage(1);
  }, [highlightedSearchResult, location.search]);

  const feeTypes = data?.feeTypes ?? [];
  const fees = data?.fees ?? [];
  const feesMeta = data?.feesMeta ?? {};
  const feeStats = data?.stats ?? {};
  const boatTypes = lookupData?.boatTypes ?? [];
  const vehicleTypes = lookupData?.vehicleTypes ?? [];
  const selectedApplicableTypeKind = getApplicableTypeKind(feeForm.fee_type_name);
  const feeApplicableTypeOptions = useMemo(() => {
    if (selectedApplicableTypeKind === "both") {
      return [
        ...boatTypes.map((item) => ({
          value: `boat:${item.boat_type_id}`,
          label: item.type_name,
        })),
        ...vehicleTypes.map((item) => ({
          value: `vehicle:${item.vehicle_type_id}`,
          label: item.type_name,
        })),
      ];
    }

    if (selectedApplicableTypeKind === "boat") {
      return boatTypes.map((item) => ({
        value: `boat:${item.boat_type_id}`,
        label: item.type_name,
      }));
    }

    if (selectedApplicableTypeKind === "vehicle") {
      return vehicleTypes.map((item) => ({
        value: `vehicle:${item.vehicle_type_id}`,
        label: item.type_name,
      }));
    }

    return [];
  }, [boatTypes, selectedApplicableTypeKind, vehicleTypes]);

  const feeIndicatorOptions = useMemo(
    () => [
      { value: "all", label: "All Status" },
      { value: "active", label: "Active" },
      { value: "pending", label: "Pending" },
      { value: "expired", label: "Expired" },
    ],
    []
  );

  const totalPages = Math.max(1, Number(feesMeta.last_page || 1));
  const resolvedHighlightedPage = highlightedFeeId
    ? Number(feesMeta.current_page || requestedPage)
    : requestedPage;
  const safePage = Math.min(resolvedHighlightedPage, totalPages);
  const paginationRequestedPage = highlightedFeeId ? safePage : requestedPage;
  const paginated = fees;
  const hasFeesResponse = Boolean(data?.feesMeta);
  const showInitialSkeleton = !isError && isLoading && !data;

  useEffect(() => {
    if (!didRunTableFilterResetRef.current) {
      didRunTableFilterResetRef.current = true;
      return;
    }
    setRequestedPage(1);
    setCurrentPage(1);
  }, [search, feeIndicatorFilter, periodFilter]);

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
    if (!highlightedFeeId) return;
    const resolvedPage = Number(feesMeta.current_page || 0);
    if (resolvedPage > 0 && (resolvedPage !== currentPage || resolvedPage !== requestedPage)) {
      setRequestedPage(resolvedPage);
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, feesMeta.current_page, highlightedFeeId, requestedPage]);

  const handlePageChange = (nextPage) => {
    if (highlightedFeeId) {
      clearUniversalHighlight();
    }

    setRequestedPage(nextPage);
  };

  const activeFees = feeStats.active_fees ?? 0;
  const totalRecords = feeStats.total_records ?? 0;

  const resetFeeModal = () => {
    const todayParts = getTodayDateParts();
    setEditingFee(null);
    setFeeForm({
      fee_type_name: undefined,
      boat_type_id: undefined,
      vehicle_type_id: undefined,
      amount: "",
      effective_from_month: todayParts.month,
      effective_from_day: todayParts.day,
      effective_from_year: todayParts.year,
      effective_to_month: "",
      effective_to_day: "",
      effective_to_year: "",
    });
    setFeeErrors({});
    setShowFeeModal(false);
  };

  const openFeeModal = (item = null) => {
    const todayParts = getTodayDateParts();
    const effectiveFromParts = item ? getDateParts(item?.effective_from) : todayParts;
    const effectiveToParts = getDateParts(item?.effective_to);
    setEditingFee(item);
    setFeeForm({
      fee_type_name: item?.fee_type_name ?? undefined,
      boat_type_id: item?.boat_type_id ?? undefined,
      vehicle_type_id: item?.vehicle_type_id ?? undefined,
      amount: item?.amount ?? "",
      effective_from_month: effectiveFromParts.month,
      effective_from_day: effectiveFromParts.day,
      effective_from_year: effectiveFromParts.year,
      effective_to_month: effectiveToParts.month,
      effective_to_day: effectiveToParts.day,
      effective_to_year: effectiveToParts.year,
    });
    setFeeErrors({});
    setShowFeeModal(true);
  };

  const handleFeeDatePartKeyDown = (field) => (event) => {
    if ((event.key === "Backspace" || event.key === "Delete") && feeForm[field]) {
      event.preventDefault();
      setFeeForm((current) => ({ ...current, [field]: "" }));
    }
  };

  const saveFee = async () => {
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }
    const effectiveFrom = buildDateFromParts(feeForm.effective_from_year, feeForm.effective_from_month, feeForm.effective_from_day);
    const effectiveTo = buildDateFromParts(feeForm.effective_to_year, feeForm.effective_to_month, feeForm.effective_to_day);
    const nextErrors = {};
    if (!feeForm.fee_type_name) nextErrors.fee_type_name = "Please select a fee type.";
    if (!feeForm.boat_type_id && !feeForm.vehicle_type_id) {
      nextErrors.boat_type_id =
        selectedApplicableTypeKind === "vehicle"
          ? "Please select a vehicle type."
          : "Please select a boat type.";
    }
    if (feeForm.amount === "" || Number(feeForm.amount) < 0) nextErrors.amount = "A valid amount is required.";
    if (!effectiveFrom) nextErrors.effective_from = "Effective from is required.";
    if (
      (feeForm.effective_to_year || feeForm.effective_to_month || feeForm.effective_to_day) &&
      !effectiveTo
    ) nextErrors.effective_to = "Complete the Effective to date or leave it blank.";
    if (effectiveTo && effectiveTo < effectiveFrom) nextErrors.effective_to = "Effective to must be after or equal to Effective from.";
    if (Object.keys(nextErrors).length) return setFeeErrors(nextErrors);

    setSaving(true);
    setFeeErrors({});
    try {
      const payload = {
        fee_type_name: normalizeFeeTypeName(feeForm.fee_type_name),
        boat_type_id: feeForm.boat_type_id || null,
        vehicle_type_id: feeForm.vehicle_type_id || null,
        amount: Number(feeForm.amount),
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
      };

      if (editingFee) {
        const originalPayload = {
          fee_type_name: normalizeFeeTypeName(editingFee.fee_type_name ?? editingFee.fee_name ?? null),
          boat_type_id: editingFee.boat_type_id ?? null,
          vehicle_type_id: editingFee.vehicle_type_id ?? null,
          amount: Number(editingFee.amount ?? 0),
          effective_from: normalizeDateValue(editingFee.effective_from),
          effective_to: normalizeDateValue(editingFee.effective_to) || null,
        };

        if (JSON.stringify(payload) === JSON.stringify(originalPayload)) {
          resetFeeModal();
          showNoChangesToast();
          return;
        }
      }

      const response = editingFee
        ? await api.put(`/fees/${editingFee.fee_id}`, payload)
        : await api.post("/fees", payload);
      const savedFee = response.data;

      queryClient.setQueryData(FEES_DATA_QUERY_KEY, (current) => {
        if (!current) return current;

        return {
          ...current,
          fees: upsertFeeRecord(current.fees, savedFee),
        };
      });
      queryClient.setQueryData(["dockings-data"], (current) => {
        if (!current) return current;

        return {
          ...current,
          fees: upsertFeeRecord(current.fees, savedFee),
        };
      });

      if (editingFee) {
        showUpdatedToast("Fee", "fee record");
      } else {
        showAddedToast("Fee", "fee record");
      }
      resetFeeModal();

      void queryClient.invalidateQueries({ queryKey: FEES_DATA_QUERY_KEY, refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" });
    } catch (error) {
      const backendErrors = error.response?.data?.errors;
      if (backendErrors) {
        const effectiveFromMessage = backendErrors.effective_from?.[0];
        const hideEffectiveFromError =
          effectiveFromMessage ===
          "A fee with the same type and applicable record is still within its effective period.";

        setFeeErrors({
          fee_type_name: backendErrors.fee_type_name?.[0],
          boat_type_id: backendErrors.boat_type_id?.[0] || backendErrors.vehicle_type_id?.[0],
          amount: backendErrors.amount?.[0],
          effective_from: hideEffectiveFromError ? undefined : effectiveFromMessage,
          effective_to: backendErrors.effective_to?.[0],
        });
      }
      showBottomToast("error", "Save Failed", error.response?.data?.message ?? "Unable to save fee record.");
    } finally {
      setSaving(false);
    }
  };

  const archiveFee = async () => {
    if (!archivingFee) return;
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    setArchiveSaving(true);

    try {
      await api.patch(`/fees/${archivingFee.fee_id}/archive`);
      showBottomToast("success", "Fee Archived", "The expired fee record was archived successfully.");
      setArchivingFee(null);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: FEES_DATA_QUERY_KEY, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["archives-data"], refetchType: "active" }),
      ]);
    } catch (error) {
      if ([404, 409].includes(error.response?.status)) {
        setArchivingFee(null);
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: FEES_DATA_QUERY_KEY, refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["archives-data"], refetchType: "active" }),
        ]);
      }
      showBottomToast("error", "Archive Failed", error.response?.data?.message ?? "Unable to archive fee record.");
    } finally {
      setArchiveSaving(false);
    }
  };

  return (
    <ConfigProvider theme={antTheme}>
      <style>{`
        * { font-family: ${FONT} !important; }
        .fee-ant-select .ant-select-selector {
          border-radius: 12px !important;
          border: 1px solid #e2e8f0 !important;
          box-shadow: none !important;
          font-family: ${FONT} !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          min-height: 46px !important;
          padding: 0 14px !important;
          align-items: center !important;
        }
        .fee-ant-select .ant-select-selection-wrap {
          align-items: center !important;
        }
        .fee-ant-select.ant-select-focused .ant-select-selector,
        .fee-ant-select.ant-select-open .ant-select-selector {
          border-color: #4096ff !important;
          box-shadow: none !important;
        }
        .fee-ant-select .ant-select-selection-item,
        .fee-ant-select .ant-select-selection-search-input,
        .fee-ant-select .ant-select-selection-placeholder {
          font-family: ${FONT} !important;
          font-size: 13px !important;
        }
        .fee-ant-select .ant-select-selection-item,
        .fee-ant-select .ant-select-selection-search-input {
          font-weight: 500 !important;
          color: #0d1117 !important;
        }
        .fee-ant-select .ant-select-selection-placeholder {
          font-weight: 400 !important;
          color: rgba(26,31,54,0.4) !important;
        }
        .fee-ant-select .ant-select-arrow {
          color: #9ca3af !important;
        }
        .fee-ant-select-dropdown {
          border-radius: 12px !important;
          overflow: hidden !important;
          border: 1px solid #e5e7eb !important;
          box-shadow: 0 8px 24px rgba(15,23,42,0.08) !important;
          padding: 4px !important;
          z-index: 11000 !important;
        }
        .fee-ant-select-dropdown .ant-select-item {
          font-family: ${FONT} !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          border-radius: 8px !important;
          margin: 2px 0 !important;
          padding: 8px 12px !important;
        }
        .fee-ant-select-dropdown .ant-select-item-option-selected {
          background-color: #1a1f36 !important;
          color: #ffffff !important;
          font-weight: 400 !important;
        }
        .fee-ant-select-dropdown .ant-select-item-option-active:not(.ant-select-item-option-selected) {
          background-color: #f8fafc !important;
        }
        .fee-modal-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .fee-date-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        @media (max-width: 767px) {
          .fee-modal-grid {
            grid-template-columns: minmax(0, 1fr);
          }
          .fee-date-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>

      <div className="flex h-screen overflow-hidden bg-white">
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onWidthChange={setContentMargin} />
        <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden" style={{ marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px", transition: "margin-left 0.3s ease" }}>
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />

          <main className="min-w-0 flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">
            <div className="mb-5 flex items-center justify-between">
              <TitlePage title="Set Fees" subtitle="Manage fees and effective fee rates in the system." loading={showInitialSkeleton} />
              <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: "Set Fees" }]} fontFamily={FONT} loading={showInitialSkeleton} />
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              <OverviewCard title="Total Fee Records" value={totalRecords} icon={IoCashOutline} tone="blue" loading={showInitialSkeleton} />
              <OverviewCard title="Active Fees" value={activeFees} icon={IoCheckmarkOutline} tone="green" loading={showInitialSkeleton} />
            </div>

            <Tabs
              tabs={SET_FEES_TABS}
              activeKey={activeView}
              onTabChange={setActiveView}
              fontFamily={FONT}
              className="mb-5"
              loading={!data && isLoading}
              rightContent={activeView === "fees" ? <Legend items={FEE_STATUS_LEGEND} loading={!data && isLoading} /> : null}
            >
              <TableCard
                title="Fee Records"
                subtitle="All fee records in the system"
                loading={showInitialSkeleton}
                headerActionsSkeletonCount={4}
                bodyClassName="overflow-x-auto"
                footerClassName="flex items-center justify-between"
                actions={
                  <>
                    <div className="flex items-center gap-2.5 rounded-[10px] border border-gray-200 bg-white px-4" style={{ height: 42, width: 300 }}>
                      <IoSearchOutline className="flex-shrink-0 text-[17px]" style={{ color: "#1a1f36" }} />
                      <input
                        value={search}
                        onChange={(e) => {
                          clearUniversalHighlight();
                          setSearch(e.target.value);
                          setRequestedPage(1);
                          setCurrentPage(1);
                        }}
                        placeholder="Search for fee type, boat/vehicle type, amount"
                        className="w-full border-none bg-transparent text-[13px] outline-none"
                        style={{ fontFamily: FONT, color: "#1a1f36" }}
                      />
                    </div>
                    <TailDropdown
                      value={periodFilter}
                      onChange={(value) => {
                        clearUniversalHighlight();
                        setPeriodFilter(value);
                      }}
                      options={PERIOD_OPTIONS}
                      height={42}
                      minWidth={150}
                    />
                    <TailDropdown
                      value={feeIndicatorFilter}
                      onChange={(value) => {
                        clearUniversalHighlight();
                        setFeeIndicatorFilter(value);
                      }}
                      options={feeIndicatorOptions}
                      height={42}
                      minWidth={150}
                    />
                    <button onClick={() => { if (!isTransactionLocked) { clearUniversalHighlight(); openFeeModal(); } else showBottomToast("error", "Transactions Locked", transactionLockMessage); }} disabled={isTransactionLocked} className="flex h-[42px] items-center justify-center gap-2 rounded-xl border-none bg-[#1a1f36] px-5 text-[13px] font-semibold text-white cursor-pointer hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:opacity-70">
                      <IoAddOutline className="text-[16px]" />
                      Add Fee
                    </button>
                  </>
                }
                pagination={{
                  meta: feesMeta,
                  totalPages,
                  currentPage: safePage,
                  requestedPage: paginationRequestedPage,
                  isLoading: showInitialSkeleton,
                  onPageChange: handlePageChange,
                }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <TH>Fee Type</TH>
                      <TH>Boat / Vehicle Type</TH>
                      <TH>Effectivity</TH>
                      <TH><div className="pr-4 text-right">Amount (₱)</div></TH>
                      <TH>Action</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {showInitialSkeleton ? (
                      Array.from({ length: PAGE_SIZE }).map((_, index) => (
                        <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td className="px-4 py-3"><div className="h-3 w-28 rounded bg-slate-100" /></td>
                          <td className="px-4 py-3"><div className="h-3 w-24 rounded bg-slate-100" /></td>
                          <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-slate-100" /></td>
                          <td className="px-4 py-3"><div className="h-3 w-32 rounded bg-slate-100" /></td>
                          <td className="px-4 py-3"><div className="flex gap-2"><div className="h-8 w-8 rounded-lg bg-slate-100" /><div className="h-8 w-8 rounded-lg bg-slate-100" /></div></td>
                        </tr>
                      ))
                    ) : isError ? (
                      <tr><td colSpan={5} className="px-5 py-8 text-center text-[13px] font-normal text-red-500">Unable to load fee data right now.</td></tr>
                    ) : paginated.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <NoDataFound title={search || feeIndicatorFilter !== "all" ? "No results found" : "No Data Found"} />
                        </td>
                      </tr>
                    ) : (
                      paginated.map((item, index) => (
                        <tr
                          key={item.fee_id}
                          className={`transition-colors ${highlightedFeeId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${highlightedFeeId && String(item?.fee_id ?? "") === highlightedFeeId ? "universal-search-highlight" : ""}`.trim()}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                          }}
                        >
                          {(() => {
                            const status = getFeeStatus(item);
                            const dotColor = status === "active" ? "#16a34a" : status === "pending" ? "#f59e0b" : "#ef4444";
                            return (
                              <>
                        <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: dotColor, minWidth: 10, minHeight: 10 }}
                                title={status.charAt(0).toUpperCase() + status.slice(1)}
                              />
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[13px] font-medium" style={{ color: "#1a1f36" }}>{getFeeDisplayName(item) || "?"}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
                            {getFeeApplicableLabel(item) || "General / Ticket Fee"}
                          </td>
                          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>
                            {formatDate(item.effective_from)}{item.effective_to ? ` - ${formatDate(item.effective_to)}` : " onward"}
                          </td>
                          <td
                            className="px-4 py-3 pr-8 text-right text-[13px] font-semibold whitespace-nowrap"
                            style={{ color: "#1a1f36", fontVariantNumeric: "tabular-nums" }}
                          >
                            {formatMoneyValue(item.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                                <Tooltip title={isTransactionLocked ? transactionLockMessage : "Edit"}>
                                  <button
                                    onClick={() => { if (!isTransactionLocked) openFeeModal(item); else showBottomToast("error", "Transactions Locked", transactionLockMessage); }}
                                    disabled={isTransactionLocked}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:opacity-60"
                                    style={{ borderColor: isTransactionLocked ? undefined : "#1a1f36" }}
                                  >
                                    <IoCreateOutline style={{ fontSize: "15px", color: isTransactionLocked ? "#94a3b8" : "#1a1f36" }} />
                                  </button>
                                </Tooltip>
                                <Tooltip
                                  title={
                                    isTransactionLocked
                                      ? transactionLockMessage
                                      : status !== "expired"
                                      ? "Only expired fee records can be archived"
                                      : "Archive"
                                  }
                                >
                                  <button
                                    onClick={() => {
                                      if (isTransactionLocked || status !== "expired") return;
                                      setArchivingFee(item);
                                    }}
                                    disabled={isTransactionLocked || status !== "expired"}
                                    className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors ${
                                      isTransactionLocked || status !== "expired"
                                        ? "cursor-not-allowed border-slate-200 opacity-60"
                                        : "hover:bg-red-50"
                                    }`}
                                    style={{ borderColor: isTransactionLocked || status !== "expired" ? undefined : "#ef4444" }}
                                  >
                                    <IoTrashOutline style={{ fontSize: "15px", color: isTransactionLocked || status !== "expired" ? "#94a3b8" : "#ef4444" }} />
                                  </button>
                                </Tooltip>
                            </div>
                          </td>
                              </>
                            );
                          })()}
                        </tr>
                      ))
                    )}
                  </tbody>
                  </table>
                </div>
              </TableCard>
            </Tabs>
            </div>
          </main>
        </div>
      </div>

      {showFeeModal ? (
      <Modal
        title={editingFee ? "Edit Fee" : "Add Fee"}
        onClose={resetFeeModal}
        onSave={saveFee}
        saving={saving}
        saveLabel={editingFee ? "Save" : "Add"}
        closeOnBackdrop
        maxWidth="560px"
      >
        <div className="flex flex-col gap-5">
          <Field label="Fee Type" required error={feeErrors.fee_type_name}>
            <FilterSelect
              width="100%"
              height={46}
              showSearch={!editingFee}
              placeholder="Select a fee type"
              optionFilterProp="label"
              optionLabelProp="label"
              open={editingFee ? false : undefined}
              className={editingFee ? "fee-readonly-select" : undefined}
              value={feeForm.fee_type_name}
              onChange={(value) => {
                if (editingFee) return;
                setFeeForm((current) => ({
                  ...current,
                  fee_type_name: value,
                  boat_type_id: undefined,
                  vehicle_type_id: undefined,
                }));
                setFeeErrors((current) => ({
                  ...current,
                  fee_type_name: undefined,
                  boat_type_id: undefined,
                }));
              }}
              options={feeTypes.map((item) => ({ value: item.value, label: item.label }))}
              getPopupContainer={() => document.body}
              placement="bottomLeft"
            />
          </Field>

          <Field label={selectedApplicableTypeKind === "both" ? "Boat Type / Vehicle Type" : selectedApplicableTypeKind === "vehicle" ? "Vehicle Type" : "Boat Type"} required error={feeErrors.boat_type_id}>
            <FilterSelect
              key={selectedApplicableTypeKind || "applicable-type"}
              width="100%"
              height={46}
              showSearch={!editingFee}
              allowClear={!editingFee}
              open={editingFee || !feeForm.fee_type_name ? false : undefined}
              className={["fee-applicable-type-select", editingFee ? "fee-readonly-select" : ""].filter(Boolean).join(" ")}
              placeholder={
                !feeForm.fee_type_name
                  ? "Select a fee type first"
                  : selectedApplicableTypeKind === "both"
                    ? "Select a boat type or vehicle type"
                  : selectedApplicableTypeKind === "vehicle"
                    ? "Select a vehicle type"
                    : "Select a boat type"
              }
              optionFilterProp="label"
              value={
                feeForm.vehicle_type_id
                  ? `vehicle:${feeForm.vehicle_type_id}`
                  : feeForm.boat_type_id
                    ? `boat:${feeForm.boat_type_id}`
                    : undefined
              }
              onChange={(value) => {
                if (editingFee) return;
                if (!value) {
                  setFeeForm((current) => ({ ...current, boat_type_id: undefined, vehicle_type_id: undefined }));
                } else if (String(value).startsWith("vehicle:")) {
                  setFeeForm((current) => ({
                    ...current,
                    boat_type_id: undefined,
                    vehicle_type_id: Number(String(value).split(":")[1]),
                  }));
                } else {
                  setFeeForm((current) => ({
                    ...current,
                    boat_type_id: Number(String(value).split(":")[1]),
                    vehicle_type_id: undefined,
                  }));
                }
                setFeeErrors((current) => ({ ...current, boat_type_id: undefined }));
              }}
              options={feeApplicableTypeOptions}
              getPopupContainer={() => document.body}
              placement="bottomLeft"
            />
          </Field>

          <ModalInput
            label="Amount (₱)"
            required
            error={feeErrors.amount}
            icon={IoCashOutline}
            type="text"
            readOnly={Boolean(editingFee)}
            value={feeForm.amount}
            onChange={(e) => {
              const sanitized = e.target.value.replace(/[^\d.]/g, "");
              setFeeForm((current) => ({ ...current, amount: sanitized }));
              setFeeErrors((current) => ({ ...current, amount: undefined }));
            }}
            placeholder="0.00"
          />

          <Field label="Effective From" required error={feeErrors.effective_from}>
            <DatePicker
              value={buildDateFromParts(feeForm.effective_from_year, feeForm.effective_from_month, feeForm.effective_from_day)}
              onChange={(_, currentDateString) => {
                const [year = "", month = "", day = ""] = String(currentDateString || "").split("-");
                setFeeForm((current) => ({
                  ...current,
                  effective_from_year: year,
                  effective_from_month: month,
                  effective_from_day: day,
                }));
                setFeeErrors((current) => ({ ...current, effective_from: undefined }));
              }}
              placeholder="Select effective from date"
              containerClassName="w-full"
              inputClassName={feeErrors.effective_from ? "!border-red-300" : editingFee ? "!border-blue-500" : "!border-slate-200"}
            />
          </Field>

          <Field label="Effective To" error={feeErrors.effective_to}>
            <DatePicker
              value={feeForm.effective_to_year || feeForm.effective_to_month || feeForm.effective_to_day ? buildDateFromParts(feeForm.effective_to_year, feeForm.effective_to_month, feeForm.effective_to_day) : undefined}
              onChange={(_, currentDateString) => {
                const [year = "", month = "", day = ""] = String(currentDateString || "").split("-");
                setFeeForm((current) => ({
                  ...current,
                  effective_to_year: year,
                  effective_to_month: month,
                  effective_to_day: day,
                }));
                setFeeErrors((current) => ({ ...current, effective_to: undefined }));
              }}
              placeholder="Select effective to date"
              options={{ useFiscalYearDefault: false, allowClear: true }}
              containerClassName="w-full"
              inputClassName={feeErrors.effective_to ? "!border-red-300" : editingFee ? "!border-blue-500" : "!border-slate-200"}
            />
          </Field>
        </div>
      </Modal>
      ) : null}

      {archivingFee ? (
        <FeeArchiveModal
          open={!!archivingFee}
          title="Archive Fee Record"
          itemName={getFeeDisplayName(archivingFee)}
          itemContext={{
            applicable: getFeeApplicableLabel(archivingFee),
            amount: formatMoneyValue(archivingFee.amount),
          }}
          onClose={() => { if (!archiveSaving) setArchivingFee(null); }}
          onConfirm={archiveFee}
          saving={archiveSaving}
          fontFamily={FONT}
        />
      ) : null}
    </ConfigProvider>
  );
};

const FeeArchiveModal = ({
  open,
  title,
  itemName,
  itemContext = null,
  onClose,
  onConfirm,
  saving,
  warningItems = [],
  fontFamily = FONT,
}) => {
  const [internalSaving, setInternalSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setInternalSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const archiving = typeof saving === "boolean" ? saving : internalSaving;

  const handleConfirm = async () => {
    if (typeof saving === "boolean") {
      onConfirm();
      return;
    }

    setInternalSaving(true);
    try {
      await onConfirm();
    } finally {
      setInternalSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(10,13,28,0.55)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full overflow-hidden bg-white"
        style={{
          maxWidth: 400,
          borderRadius: 20,
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          fontFamily,
          animation: "modalPop 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <style>{`@keyframes modalPop{from{opacity:0;transform:scale(0.92) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>

        <div className="flex flex-col items-center px-6 pb-5 pt-8 text-center">
          <div
            className="mb-5 flex items-center justify-center"
            style={{ width: 68, height: 68, borderRadius: 18, backgroundColor: "#fef2f2" }}
          >
            <IoWarningOutline style={{ fontSize: 36, color: "#dc2626" }} />
          </div>
          <p className="m-0 mb-2 text-[18px] font-bold" style={{ color: "#0d1117" }}>
            {title}
          </p>
          <p className="m-0 text-[15px] leading-relaxed" style={{ color: "#64748b" }}>
            {itemContext ? (
              <>
                Are you sure you want to archive{" "}
                <span className="font-bold" style={{ color: "#1a1f36" }}>
                  "{itemName}"
                </span>{" "}
                for{" "}
                <span className="font-bold" style={{ color: "#1a1f36" }}>
                  "{itemContext.applicable}"
                </span>{" "}
                with fee{" "}
                <span className="font-bold" style={{ color: "#1a1f36" }}>
                  "{itemContext.amount}"
                </span>
                ?
              </>
            ) : (
              <>
                Are you sure you want to archive{" "}
                <span className="font-bold" style={{ color: "#1a1f36" }}>
                  "{itemName}"
                </span>
                ?
              </>
            )}
          </p>
        </div>

        {warningItems.length > 0 ? (
          <div className="mx-6 mb-4 overflow-hidden rounded-xl border border-red-200 bg-red-50">
            <div className="flex flex-col gap-1.5 px-4 py-3">
              {warningItems.map((warning, index) => {
                const WarningIcon = warning.icon ?? IoAlertCircleOutline;
                return (
                  <div key={`${warning.text}-${index}`} className="flex items-center gap-2">
                    <WarningIcon className="text-[13px] text-[#dc2626] flex-shrink-0" />
                    <p className="m-0 text-[13px] leading-relaxed text-[#dc2626]">
                      {warning.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            disabled={archiving}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-[13px] font-semibold cursor-pointer transition-colors hover:bg-gray-50"
            style={{ fontFamily, color: "#1a1f36" }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={archiving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white cursor-pointer transition-colors"
            style={{
              fontFamily,
              backgroundColor: archiving ? "#fca5a5" : "#dc2626",
              border: "none",
            }}
            onMouseEnter={(e) => {
              if (!archiving) e.currentTarget.style.backgroundColor = "#b91c1c";
            }}
            onMouseLeave={(e) => {
              if (!archiving) e.currentTarget.style.backgroundColor = "#dc2626";
            }}
          >
            {archiving ? <Spinner size={4} /> : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuperSetFees;
