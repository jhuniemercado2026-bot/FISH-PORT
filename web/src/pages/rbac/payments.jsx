import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfigProvider, Tooltip  } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import "typeface-montserrat";
import { DayPicker } from "react-day-picker";
import {
  IoAddOutline,
  IoAlertCircleOutline,
  IoBoatOutline,
  IoCalendarOutline,
  IoCashOutline,
  IoCloseOutline,
  IoCreateOutline,
  IoChevronDownOutline,
  IoDocumentTextOutline,
  IoLayersOutline,
  IoPersonOutline,
  IoReceiptOutline,
  IoSearchOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import FilterSelect from "../../components/FilterSelect";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Legend from "../../components/Legend";
import DatePicker from "../../components/DatePicker";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import DetailDrawer, { DrawerInfoCard, DrawerSection } from "../../components/Drawer";
import NoDataFound from "../../components/NoDataFound";
import { useSidebar } from "../../store/sidebarStore";
import { showAddedToast, showBottomToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import api from "../../api/axios";
import { usePaymentFormLookupsQuery, usePaymentsDataQuery } from "../../hooks/usePaymentsDataQuery";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import Spinner from "../../components/Spinner";

const FONT = "'Montserrat', sans-serif";
const PAGE_SIZE = 10;

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

const TABS = [
  { value: "/payments", label: "Payments", icon: IoReceiptOutline },
  { value: "/record-payment", label: "Record Payment", icon: IoAddOutline },
];
const PAYMENTS_TAB_PATHS = {
  records: "/payments",
  create: "/record-payment",
};
const PAYMENTS_PATH_TABS = {
  "/payments": "records",
  "/record-payment": "create",
};
const PAYMENTS_TABS = new Set(["records", "create"]);
const getPaymentsTabPath = (tab) => PAYMENTS_PATH_TABS[tab] ? tab : PAYMENTS_TAB_PATHS[tab] ?? PAYMENTS_TAB_PATHS.records;
const getPaymentsTabFromLocation = ({ pathname, search }) => {
  const tab = new URLSearchParams(search).get("tab");
  if (PAYMENTS_TABS.has(tab)) return getPaymentsTabPath(tab);

  return PAYMENTS_PATH_TABS[pathname] ? pathname : PAYMENTS_TAB_PATHS.records;
};

const PAYMENT_STATUS_LEGEND = [
  { key: "paid", label: "Paid", color: "#16a34a" },
  { key: "partial", label: "Partial", color: "#f59e0b" },
];

const PERIOD_FILTER_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
];

const PAYMENTS_FILTER_DROPDOWN_PROPS = {
  getPopupContainer: (triggerNode) => (typeof document !== "undefined" ? document.body : triggerNode.parentElement),
  placement: "bottomLeft",
  dropdownAlign: { overflow: { adjustX: false, adjustY: false } },
};

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
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

const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => {
  const day = String(index + 1).padStart(2, "0");
  return { value: day, label: day };
});

const YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => {
  const year = new Date().getFullYear() - 2 + index;
  return { value: String(year), label: String(year) };
});

const getTodayManilaDate = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
};

const getInitialPaymentForm = () => {
  const today = getTodayManilaDate();
  const [year = "", month = "", day = ""] = today.split("-");

  return {
    bill_id: "",
    boat_id: "",
    bill_ids: [],
    payment_method: "cash",
    official_receipt_no: "",
    payment_date: today,
    payment_date_month: month,
    payment_date_day: day,
    payment_date_year: year,
    amount_paid: "",
    remarks: "",
    date_from: "",
    date_from_month: "",
    date_from_day: "",
    date_from_year: "",
    date_to: "",
    date_to_month: "",
    date_to_day: "",
    date_to_year: "",
  };
};

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatAmountValue = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatLongDisplayDate = (value) => {
  if (!value) return "";
  const parts = splitDateParts(value);
  if (!parts?.year || !parts?.month || !parts?.day) return String(value).slice(0, 10);
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day)).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatShortDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getBillDateValue = (bill) => {
  const rawValue = bill?.bill_date || bill?.billing_date || bill?.created_at || "";
  return String(rawValue).slice(0, 10);
};

const getPaymentHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Payments" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("payment-") ? rawId.slice("payment-".length) : "";
};

const normalizeOfficialReceiptNo = (value) => String(value ?? "").replace(/\D/g, "").slice(0, 6);

const validateOfficialReceiptNo = (value) => {
  const normalized = normalizeOfficialReceiptNo(value);
  if (!normalized) return "Official Receipt No. is required.";
  if (!/^\d{6}$/.test(normalized)) return "Official Receipt No. must be a 6-digit number.";
  return "";
};

const buildDateFromParts = (year, month, day) => {
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
};

const splitDateParts = (value) => {
  const normalized = String(value || "").slice(0, 10);
  const [year = "", month = "", day = ""] = normalized.split("-");
  return { value: normalized, year, month, day };
};

const filterRecordsByPeriod = (records, period, dateField) => {
  if (period === "all") return records;

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const now = new Date(`${todayStr}T23:59:59`);

  return records.filter((record) => {
    const value = new Date(record[dateField]);
    if (Number.isNaN(value.getTime())) return false;

    if (period === "today") {
      return String(record[dateField] || "").slice(0, 10) === todayStr;
    }

    if (period === "week") {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      return value >= weekStart && value <= now;
    }

    if (period === "month") {
      return value.getMonth() === now.getMonth() && value.getFullYear() === now.getFullYear();
    }

    if (period === "year") {
      return value.getFullYear() === now.getFullYear();
    }

    return true;
  });
};

const getRequestErrorMessage = (error, fallbackMessage) => {
  const responseData = error?.response?.data;
  const fieldErrors = responseData?.errors;

  if (fieldErrors && typeof fieldErrors === "object") {
    const firstError = Object.values(fieldErrors).flat()[0];
    if (firstError) return firstError;
  }

  return responseData?.message || fallbackMessage;
};


const TH = ({ children }) => (
  <th
    className="whitespace-nowrap bg-white px-4 py-3 text-left text-[13px] font-semibold"
    style={{ color: "#1a1f36", borderBottom: "2px solid #e5e7eb" }}
  >
    {children}
  </th>
);


const Label = ({ children, required = false }) => (
  <label
    className="mb-1.5 block text-[11px] font-semibold uppercase"
    style={{ color: "#6F6F82", fontFamily: FONT }}
  >
    {children}
    {required ? <span className="ml-0.5 text-red-500">*</span> : null}
  </label>
);

const InlineFieldError = ({ message }) =>
  message ? (
    <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-red-100 bg-red-50 px-3 py-2">
      <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
      <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>{message}</p>
    </div>
  ) : null;

const Input = ({ icon: Icon, readOnly = false, readOnlyWhite = false, height = 46, error = false, ...props }) => (
  <div
    className={`flex items-center gap-2.5 border px-3.5 ${readOnly && !readOnlyWhite ? "bg-slate-50" : "bg-white"} ${error && !readOnly ? "border-red-300" : "border-slate-200 focus-within:border-[#4096ff]"}`}
    style={{ height, borderRadius: 10 }}
  >
    {Icon ? <Icon className="flex-shrink-0 text-[15px] text-slate-400" /> : null}
    <input
      readOnly={readOnly}
      {...props}
      className={`h-full w-full border-none bg-transparent text-[13px] font-medium outline-none ${readOnly ? "cursor-default text-slate-500" : "text-[#0d1117]"}`}
      style={{ fontFamily: FONT }}
    />
  </div>
);

const SelectField = ({ value, onChange, placeholder, options = [], error = false }) => (
  <FilterSelect
    className={`payments-ant-select ${error ? "payments-ant-select-error" : ""}`}
    showSearch
    allowClear
    placeholder={placeholder}
    optionFilterProp="label"
    placement="bottomLeft"
    getPopupContainer={() => document.body}
    style={{ width: "100%", height: 46, fontFamily: FONT }}
    height={46}
    value={value}
    onChange={onChange}
    options={options}
    filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
    notFoundContent={<div className="py-3 text-center text-[12px] text-slate-400">No data found</div>}
  />
);

const getPickerDate = (value) => {
  const parts = splitDateParts(value);
  if (!parts?.year || !parts?.month || !parts?.day) return undefined;
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
};

const DateFilterField = ({
  value,
  onChange,
  placeholder = "Select a date to filter",
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const popupRef = useRef(null);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const selectedDate = useMemo(() => getPickerDate(value), [value]);

  const updatePopupPosition = () => {
    const triggerRect = containerRef.current?.getBoundingClientRect();
    if (!triggerRect) return;

    setPopupPosition({
      top: triggerRect.bottom + 8,
      left: triggerRect.left,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePopupPosition();

    const handleClickOutside = (event) => {
      if (containerRef.current?.contains(event.target)) return;
      if (popupRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    const handleViewportChange = () => updatePopupPosition();

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-[46px] w-full items-center gap-2.5 rounded-[10px] border border-slate-200 bg-white px-3.5 text-left transition-all focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 active:outline-none"
      >
        <IoCalendarOutline className="flex-shrink-0 text-[15px] text-slate-400" />
        <span
          className={`flex-1 text-[13px] font-medium ${selectedDate ? "text-[#0d1117]" : "text-slate-400"}`}
          style={{ fontFamily: FONT }}
        >
          {selectedDate ? formatLongDisplayDate(value) : placeholder}
        </span>
        <IoChevronDownOutline className={`flex-shrink-0 text-[14px] text-slate-400 transition-transform ${open ? "rotate-180" : "rotate-0"}`} />
      </button>

      {open
        ? createPortal(
            <div
              ref={popupRef}
              className="fixed z-[9999] rounded-[10px] border border-slate-200 bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.18)]"
              style={{
                top: popupPosition.top,
                left: popupPosition.left,
                fontFamily: FONT,
              }}
            >
              <DayPicker
                mode="single"
                selected={selectedDate}
                defaultMonth={selectedDate ?? new Date()}
                onSelect={(date) => {
                  if (!date) {
                    onChange("");
                    setOpen(false);
                    return;
                  }

                  const nextValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                  onChange(nextValue);
                  setOpen(false);
                }}
                captionLayout="dropdown"
                startMonth={new Date(new Date().getFullYear() - 5, 0)}
                endMonth={new Date(new Date().getFullYear() + 5, 11)}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};

const TailDropdown = ({ value, onChange, options }) => (
  <FilterSelect value={value} onChange={onChange} options={options} height={42} width={160} />
);

const EditPaymentModal = ({ open, payment, form, errors, onClose, onChange, onSave, saving }) => {
  if (!open || !payment) return null;

  return (
    <Modal
      title="Edit Payment"
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      saveLabel="Save"
      savingLabel=""
      saveButtonWidth="140px"
      maxWidth="620px"
      minimumSavingMs={0}
    >
      <div className="flex flex-col gap-4">
       
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Payment Reference No.</Label>
            <Input value={payment.payment_reference || ""} readOnly />
          </div>
          <div>
            <Label>Bill Reference No.</Label>
            <Input value={payment.bill_reference || ""} readOnly />
          </div>
        </div>
        <div>
          <Label required>Official Receipt No.</Label>
          <Input
            value={form.official_receipt_no}
            onChange={(event) => onChange({ official_receipt_no: normalizeOfficialReceiptNo(event.target.value) })}
            placeholder="Enter official receipt number"
            error={Boolean(errors.official_receipt_no)}
          />
          <InlineFieldError message={errors.official_receipt_no} />
        </div>
        <div>
          <Label>Remarks</Label>
          <textarea
            value={form.remarks}
            onChange={(event) => onChange({ remarks: event.target.value })}
            placeholder="Add payment remarks"
            className="min-h-[120px] w-full resize-none rounded-[10px] border border-slate-200 px-4 py-3 text-[14px] outline-none"
            style={{ fontFamily: FONT, color: "#0d1117" }}
          />
        </div>
      </div>
    </Modal>
  );
};

const PaymentDetailsDrawer = ({ payment, open, onClose }) => {
  if (!payment) return null;

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="Payment Details"
      subtitle="Review the selected payment record."
      icon={IoReceiptOutline}
      width={500}
    >
      <DrawerSection
        icon={IoReceiptOutline}
        title="Payment Details"
        subtitle="Reference and receipt information."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DrawerInfoCard label="Payment Reference No." value={payment.payment_reference || "-"} className="sm:col-span-2" />
          <DrawerInfoCard label="Bill Reference No." value={payment.bill_reference || "-"} />
          <DrawerInfoCard label="Official Receipt No." value={payment.official_receipt_no || "-"} />
          <DrawerInfoCard label="Payment Method" value={payment.payment_method_label || "-"} />
          <DrawerInfoCard label="Payment Date" value={formatDisplayDate(payment.payment_date)} />
          <DrawerInfoCard label="Paid Amount" value={formatMoney(payment.amount_paid)} />
          <DrawerInfoCard label="Balance" value={formatMoney(payment.balance)} />
          <DrawerInfoCard label="Status" value={payment.status ? payment.status.charAt(0).toUpperCase() + payment.status.slice(1) : "-"} />
          <DrawerInfoCard label="Remarks" value={payment.remarks || "-"} />
        </div>
      </DrawerSection>

      <DrawerSection
        icon={IoBoatOutline}
        title="Billing Details"
        subtitle="Boat and bill context."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DrawerInfoCard label="Boat Name" value={payment.boat_name || "-"} />
          <DrawerInfoCard label="Boat Type" value={payment.boat_type || "-"} />
          <DrawerInfoCard label="Boat Owner" value={payment.owner_name || "-"} />
          <DrawerInfoCard label="Total/Remaining Balance" value={formatMoney(payment.total_amount)} />
        </div>
      </DrawerSection>

      <DrawerSection
        icon={IoPersonOutline}
        title="Received By"
        subtitle="Payment receiving information."
      >
        <div className="grid grid-cols-1 gap-3">
          <DrawerInfoCard label="Received By" value={payment.received_by_name || "-"} />
        </div>
      </DrawerSection>
    </DetailDrawer>
  );
};

const SuperPayments = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const highlightedRowRef = useRef(null);
  const didRunTableFilterResetRef = useRef(false);
  const queryClient = useQueryClient();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const [activeItem, setActiveItem] = useState("Payments");
  const [contentMargin, setContentMargin] = useState(() => (window.innerWidth >= 1024 ? 256 : 0));
  const activeTab = getPaymentsTabFromLocation({ pathname: location.pathname, search: location.search });
  const activeTabKey = PAYMENTS_PATH_TABS[activeTab] ?? "records";
  const isRecordsTab = activeTabKey === "records";
  const breadcrumbLabel = isRecordsTab ? "Payments" : "Record Payment";
  const [searchInput, setSearchInput] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [requestedPage, setRequestedPage] = useState(1);
  const [paymentForm, setPaymentForm] = useState(getInitialPaymentForm());
  const [paymentScope, setPaymentScope] = useState("single_bill");
  const [formMessage, setFormMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [editingPayment, setEditingPayment] = useState(null);
  const [detailPayment, setDetailPayment] = useState(null);
  const [editForm, setEditForm] = useState({ official_receipt_no: "", remarks: "" });
  const [editErrors, setEditErrors] = useState({});
  const [editSaveLoading, setEditSaveLoading] = useState(false);
  const preselectedBillId = searchParams.get("bill_id") ?? "";
  const requestedQuery = searchParams.get("q") ?? "";
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350);
  const currentPage = requestedPage;
  const rawHighlightedPaymentId = getPaymentHighlightId({ highlightedSearchResult, search: location.search });
  const highlightToken = rawHighlightedPaymentId
    ? `${rawHighlightedPaymentId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedPaymentId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedPaymentId;
  const navigatePaymentsTab = React.useCallback((nextTab, options = {}) => {
    const nextPath = getPaymentsTabPath(nextTab);

    if (location.pathname !== nextPath || location.search) {
      navigate(nextPath, {
        replace: options.replace ?? location.pathname === nextPath,
        state: options.state ?? null,
      });
    }
  }, [location.pathname, location.search, navigate]);
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

  const {
    data: paymentsData,
    isLoading: isPaymentsLoading,
    isFetching: isPaymentsFetching,
    isError: isPaymentsError,
    refetch: refetchPayments,
  } = usePaymentsDataQuery(
    {
      page: currentPage,
      perPage: PAGE_SIZE,
      search: debouncedSearch,
      period: periodFilter,
      status: statusFilter,
      paginated: true,
      includePayments: true,
      includeFormData: false,
      highlightPaymentId: highlightedPaymentId,
    },
    {
      enabled: isRecordsTab,
    }
  );

  const {
    data: paymentFormData,
    isError: isPaymentFormDataError,
    refetch: refetchPaymentFormData,
  } = usePaymentFormLookupsQuery({
    enabled: !isRecordsTab,
  });

  const payments = paymentsData?.payments ?? [];
  const paymentsMeta = paymentsData?.paymentsMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const paymentStats = paymentsData?.stats ?? {
    paid_count: 0,
    partial_count: 0,
    today_payments_count: 0,
    today_cash_received: 0,
    today_receivables: 0,
  };
  const paymentableBills = paymentFormData?.paymentableBills ?? [];

  const getPaymentRecordsFromResponse = (responseData) => {
    if (Array.isArray(responseData?.payments)) return responseData.payments;
    if (responseData?.payment_id) return [responseData];
    return [];
  };

  const upsertPaymentsInCache = (nextPayments) => {
    const records = Array.isArray(nextPayments) ? nextPayments.filter((payment) => payment?.payment_id) : [];
    if (records.length === 0) return;

    queryClient.setQueriesData({ queryKey: ["payments-data"] }, (previous) => {
      if (!previous?.payments) return previous;

      return {
        ...previous,
        payments: previous.payments.map((payment) => {
          const nextPayment = records.find((record) => String(record.payment_id) === String(payment?.payment_id));
          return nextPayment ? { ...payment, ...nextPayment } : payment;
        }),
      };
    });
  };
  useEffect(() => {
    setActiveItem("Payments");
  }, []);

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) {
      setContentMargin(sidebarCollapsed ? 72 : 256);
    } else if (window.innerWidth < 1024) {
      setContentMargin(0);
    }
  }, [sidebarCollapsed, sidebarOpen]);

  useEffect(() => {
    if (!didRunTableFilterResetRef.current) {
      didRunTableFilterResetRef.current = true;
      return;
    }

    setRequestedPage(1);
  }, [periodFilter, debouncedSearch, statusFilter]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryTab = params.get("tab");
    const queryTabPath = PAYMENTS_TAB_PATHS[queryTab];

    if (!queryTabPath) return;

    params.delete("tab");
    const nextSearch = params.toString();
    navigate(
      {
        pathname: queryTabPath,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true, state: location.state }
    );
  }, [location.search, location.state, navigate]);

  useEffect(() => {
    setSearchInput(highlightedSearchResult ? "" : requestedQuery);
  }, [highlightedSearchResult, requestedQuery]);

  useEffect(() => {
    if (!highlightedRowRef.current) return;
    highlightedRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightedPaymentId, currentPage]);

  const queuePaymentPage = (pageOrUpdater) => {
    clearUniversalHighlight();
    setRequestedPage((page) => {
      const nextPage = typeof pageOrUpdater === "function" ? pageOrUpdater(page) : pageOrUpdater;
      return Math.max(1, Number(nextPage) || 1);
    });
  };

  const billOptions = useMemo(
    () =>
      paymentableBills.map((bill) => ({
        value: String(bill.bill_id),
        label: `${bill.bill_reference} - ${bill.boat_name}`,
      })),
    [paymentableBills]
  );

  const selectedBill = useMemo(
    () => paymentableBills.find((bill) => String(bill.bill_id) === String(paymentForm.bill_id)),
    [paymentForm.bill_id, paymentableBills]
  );
  
  const boatPaymentOptions = useMemo(() => {
    const grouped = new Map();

    paymentableBills.forEach((bill) => {
      const key = String(bill.boat_id ?? "");
      if (!key) return;

      if (!grouped.has(key)) {
        grouped.set(key, {
          value: key,
          label: bill.boat_name || "-",
          boat_name: bill.boat_name || "-",
          owner_name: bill.owner_name || "-",
          boat_type: bill.boat_type || "-",
          transaction_summary: [],
          amount_due: 0,
          total_paid: 0,
          balance: 0,
          bill_count: 0,
          bills: [],
        });
      }

      const current = grouped.get(key);
      current.bill_count += 1;
      current.amount_due += Number(bill.amount_due || 0);
      current.total_paid += Number(bill.total_paid || 0);
      current.balance += Number(bill.balance || 0);
      current.bills.push(bill);
      if (bill.transaction_summary) {
        current.transaction_summary.push(
          ...String(bill.transaction_summary)
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        );
      }
    });

    return Array.from(grouped.values()).map((boat) => ({
      ...boat,
      transaction_summary: [...new Set(boat.transaction_summary)].join(", ") || "-",
      label: `${boat.boat_name} - ${boat.bill_count} bill${boat.bill_count === 1 ? "" : "s"}`,
    }));
  }, [paymentableBills]);

  const selectedBoatPayment = useMemo(
    () => boatPaymentOptions.find((boat) => String(boat.value) === String(paymentForm.boat_id)),
    [boatPaymentOptions, paymentForm.boat_id]
  );

  const filteredBoatBills = useMemo(() => {
    if (!selectedBoatPayment) return [];
    
    let filtered = [...selectedBoatPayment.bills];
    
    if (paymentForm.date_from) {
      filtered = filtered.filter((bill) => {
        const billDate = getBillDateValue(bill);
        return billDate && billDate >= paymentForm.date_from;
      });
    }
    
    if (paymentForm.date_to) {
      filtered = filtered.filter((bill) => {
        const billDate = getBillDateValue(bill);
        return billDate && billDate <= paymentForm.date_to;
      });
    }
    
    return filtered;
  }, [selectedBoatPayment, paymentForm.date_from, paymentForm.date_to]);

  const selectedBillsPayment = useMemo(() => {
    if (paymentForm.bill_ids.length === 0) return null;

    const selectedBills = filteredBoatBills.filter((bill) => paymentForm.bill_ids.includes(String(bill.bill_id)));

    if (selectedBills.length === 0) return null;

    const transactionSummary = [
      ...new Set(
        selectedBills.flatMap((bill) =>
          String(bill.transaction_summary || "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        )
      ),
    ].join(", ");

    return {
      boat_id: paymentForm.boat_id,
      boat_name: selectedBills[0]?.boat_name || selectedBoatPayment?.boat_name || "-",
      owner_name: selectedBills[0]?.owner_name || selectedBoatPayment?.owner_name || "-",
      boat_type: selectedBills[0]?.boat_type || selectedBoatPayment?.boat_type || "-",
      transaction_summary: transactionSummary || "-",
      amount_due: selectedBills.reduce((sum, bill) => sum + Number(bill.amount_due || 0), 0),
      total_paid: selectedBills.reduce((sum, bill) => sum + Number(bill.total_paid || 0), 0),
      balance: selectedBills.reduce((sum, bill) => sum + Number(bill.balance || 0), 0),
      bill_count: selectedBills.length,
    };
  }, [paymentForm.bill_ids, paymentForm.boat_id, filteredBoatBills, selectedBoatPayment]);

  const areAllFilteredBillsSelected = useMemo(() => {
    if (filteredBoatBills.length === 0) return false;
    return filteredBoatBills.every((bill) => paymentForm.bill_ids.includes(String(bill.bill_id)));
  }, [filteredBoatBills, paymentForm.bill_ids]);

  const paymentSummary = paymentScope === "single_bill" ? selectedBill : paymentScope === "selected_bills" ? selectedBillsPayment : selectedBoatPayment;

  useEffect(() => {
    if (!preselectedBillId || paymentableBills.length === 0) return;

    const nextBill = paymentableBills.find((bill) => String(bill.bill_id) === String(preselectedBillId));
    if (!nextBill) return;

    setPaymentScope("single_bill");
    setPaymentForm((current) => {
      if (String(current.bill_id) === String(nextBill.bill_id)) {
        return current;
      }

      return {
        ...current,
        bill_id: String(nextBill.bill_id),
        boat_id: String(nextBill.boat_id ?? ""),
        bill_ids: [],
        amount_paid: String(Number(nextBill.balance || 0).toFixed(2)),
      };
    });
    setFieldErrors((current) => ({ ...current, bill_id: undefined }));
    setFormMessage("");
  }, [paymentableBills, preselectedBillId]);

  const handleDatePartsChange = (prefix, part, value) => {
    setPaymentForm((current) => {
      const next = {
        ...current,
        [`${prefix}_${part}`]: value ?? "",
      };

      next[prefix] = buildDateFromParts(
        next[`${prefix}_year`],
        next[`${prefix}_month`],
        next[`${prefix}_day`],
      );

      if (prefix === "date_from" || prefix === "date_to") {
        next.bill_ids = [];
      }

      return next;
    });
    setFormMessage("");
  };

  const filteredPayments = payments;
  const totalPages = Math.max(1, Number(paymentsMeta.last_page || 1));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPayments = filteredPayments;
  const paymentsTotal = Number(paymentsMeta.total ?? 0);
  const hasPaymentsResponse = Boolean(paymentsData?.paymentsMeta);
  const showInitialSkeleton = !isPaymentsError && isPaymentsLoading && !paymentsData;
  const showPaymentsEmptyState = hasPaymentsResponse && paymentsTotal === 0;
  const isCreateTabLoading = showInitialSkeleton;
  useEffect(() => {
    if (requestedPage > totalPages) setRequestedPage(totalPages);
  }, [requestedPage, totalPages]);

  useEffect(() => {
    if (!highlightedPaymentId) return;
    const resolvedPage = Number(paymentsMeta.current_page || 0);
    if (resolvedPage > 0 && resolvedPage !== requestedPage) {
      setRequestedPage(resolvedPage);
    }
  }, [highlightedPaymentId, paymentsMeta.current_page, requestedPage]);

  useEffect(() => {
    if (highlightedPaymentId) return;
    if (!hasPaymentsResponse || isPaymentsLoading || isPaymentsError) return;
    if (paginatedPayments.length > 0 || paymentsTotal === 0 || currentPage === 1) return;
    setRequestedPage(1);
  }, [currentPage, hasPaymentsResponse, highlightedPaymentId, isPaymentsError, isPaymentsLoading, paginatedPayments.length, paymentsTotal]);

  const overviewCards = useMemo(() => {
    const fullyPaidBills = paymentStats.paid_count ?? 0;
    const partialBills = paymentStats.partial_count ?? 0;
    const paymentsToday = Number(paymentStats.today_payments_count ?? 0);
    const todaysCashReceive = Number(paymentStats.today_cash_received ?? 0);
    const todaysReceivables = Number(paymentStats.today_receivables ?? 0);

      return [
        { title: "Fully Paid Bills", value: fullyPaidBills, icon: IoReceiptOutline, tone: "navy" },
        { title: "Partial Bills", value: partialBills, icon: IoLayersOutline, tone: "blue" },
        { title: "Payments Today", value: paymentsToday, icon: IoCalendarOutline, tone: "blue" },
        { title: "Today's Cash Receive", value: formatMoney(todaysCashReceive), icon: IoDocumentTextOutline, tone: "green" },
        { title: "Today's Receivables", value: formatMoney(todaysReceivables), icon: IoCashOutline, tone: "navy" },
      ];
    }, [paymentStats]);

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.post("/payments", payload, {
        params: { minimal: 1 },
      });
      return response.data;
    },
    onSuccess: (responseData) => {
      upsertPaymentsInCache(getPaymentRecordsFromResponse(responseData));
      showAddedToast("Payment", "payment record");
      setPaymentScope("single_bill");
      setPaymentForm(getInitialPaymentForm());
      setFormMessage("");
      setFieldErrors({});
      navigatePaymentsTab("records", { replace: true });
      void queryClient.invalidateQueries({ queryKey: ["payments-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["payments-form-lookups"], refetchType: "active" });
    },
      onError: (error) => {
        const message = getRequestErrorMessage(error, "Unable to save the payment record.");
        const responseErrors = error?.response?.data?.errors ?? {};
        const nextFieldErrors = { ...responseErrors };
        if (nextFieldErrors.official_receipt_no?.[0] === "Official Receipt No. already exists.") {
          delete nextFieldErrors.official_receipt_no;
        }
        setFormMessage(message === "Official Receipt No. already exists." ? "" : message);
        setFieldErrors(nextFieldErrors);
        showBottomToast("error", "Save Failed", message);
      },
    });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.put(`/payments/${id}`, payload, {
        params: { minimal: 1 },
      });
      return response.data;
    },
    onSuccess: (updatedPayment) => {
      upsertPaymentsInCache(getPaymentRecordsFromResponse(updatedPayment));
      setEditSaveLoading(false);
      showUpdatedToast("Payment", "payment record");
      setEditingPayment(null);
      setEditForm({ official_receipt_no: "", remarks: "" });
      setEditErrors({});
      void queryClient.invalidateQueries({ queryKey: ["payments-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["payments-form-lookups"], refetchType: "active" });
    },
      onError: (error) => {
        setEditSaveLoading(false);
        const responseErrors = error?.response?.data?.errors ?? {};
        const officialReceiptError = responseErrors.official_receipt_no?.[0] || "";
        setEditErrors({
          official_receipt_no:
            officialReceiptError === "Official Receipt No. already exists." ? "" : officialReceiptError,
        });
        showBottomToast("error", "Update Failed", getRequestErrorMessage(error, "Unable to update the payment record."));
      },
  });

  const updatePaymentForm = (patch) => {
    setPaymentForm((current) => ({ ...current, ...patch }));
  };

  const handleBillChange = (billId) => {
    const nextBill = paymentableBills.find((bill) => String(bill.bill_id) === String(billId));
    updatePaymentForm({
      bill_id: billId ?? "",
      boat_id: nextBill ? String(nextBill.boat_id ?? "") : "",
      bill_ids: [],
      amount_paid: nextBill ? String(Number(nextBill.balance || 0).toFixed(2)) : "",
    });
    setFormMessage("");
    setFieldErrors((current) => ({ ...current, bill_id: undefined }));
  };

  const handleBoatChange = (boatId) => {
    const nextBoat = boatPaymentOptions.find((boat) => String(boat.value) === String(boatId));
    updatePaymentForm({
      boat_id: boatId ?? "",
      bill_id: "",
      bill_ids: [],
      amount_paid: paymentScope === "all_bills_per_boat" && nextBoat
        ? String(Number(nextBoat.balance || 0).toFixed(2))
        : "",
      date_from: "",
      date_from_month: "",
      date_from_day: "",
      date_from_year: "",
      date_to: "",
      date_to_month: "",
      date_to_day: "",
      date_to_year: "",
    });
    setFormMessage("");
    setFieldErrors((current) => ({ ...current, boat_id: undefined, bill_ids: undefined }));
  };

  const handleSelectedBillToggle = (billId) => {
    const nextBillId = String(billId);

    setPaymentForm((current) => {
      const nextBillIds = current.bill_ids.includes(nextBillId)
        ? current.bill_ids.filter((id) => id !== nextBillId)
        : [...current.bill_ids, nextBillId];

      const nextSelectedBills = filteredBoatBills.filter((bill) => nextBillIds.includes(String(bill.bill_id)));
      const nextAmount = nextSelectedBills.reduce((sum, bill) => sum + Number(bill.balance || 0), 0);

      return {
        ...current,
        bill_ids: nextBillIds,
        amount_paid: nextBillIds.length > 0 ? String(nextAmount.toFixed(2)) : "",
      };
    });

    setFormMessage("");
    setFieldErrors((current) => ({ ...current, bill_ids: undefined, amount_paid: undefined }));
  };

  const handleSelectAllBills = () => {
    setPaymentForm((current) => {
      const nextBillIds = areAllFilteredBillsSelected
        ? []
        : filteredBoatBills.map((bill) => String(bill.bill_id));
      const nextAmount = filteredBoatBills
        .filter((bill) => nextBillIds.includes(String(bill.bill_id)))
        .reduce((sum, bill) => sum + Number(bill.balance || 0), 0);

      return {
        ...current,
        bill_ids: nextBillIds,
        amount_paid: nextBillIds.length > 0 ? String(nextAmount.toFixed(2)) : "",
      };
    });

    setFormMessage("");
    setFieldErrors((current) => ({ ...current, bill_ids: undefined, amount_paid: undefined }));
  };

  const handleShowAllBills = () => {
    const availableBillDates = (selectedBoatPayment?.bills ?? [])
      .map((bill) => getBillDateValue(bill))
      .filter(Boolean)
      .sort();

    const earliestDate = availableBillDates[0] ?? "";
    const latestDate = availableBillDates[availableBillDates.length - 1] ?? "";
    const fromParts = splitDateParts(earliestDate);
    const toParts = splitDateParts(latestDate);

    setPaymentForm((current) => ({
      ...current,
      date_from: fromParts.value,
      date_from_month: fromParts.month,
      date_from_day: fromParts.day,
      date_from_year: fromParts.year,
      date_to: toParts.value,
      date_to_month: toParts.month,
      date_to_day: toParts.day,
      date_to_year: toParts.year,
    }));
  };

  const handlePaymentScopeChange = (scope) => {
    setPaymentScope(scope);
    setPaymentForm((current) => ({
      ...current,
      bill_id: "",
      boat_id: "",
      bill_ids: [],
      amount_paid: "",
      date_from: "",
      date_from_month: "",
      date_from_day: "",
      date_from_year: "",
      date_to: "",
      date_to_month: "",
      date_to_day: "",
      date_to_year: "",
    }));
    setFormMessage("");
    setFieldErrors({});
  };

  const handlePaymentDatePartChange = (part, value) => {
    setPaymentForm((current) => {
      const next = {
        ...current,
        [`payment_date_${part}`]: value ?? "",
      };

      next.payment_date = buildDateFromParts(next.payment_date_year, next.payment_date_month, next.payment_date_day);
      return next;
    });
    setFormMessage("");
    setFieldErrors((current) => ({ ...current, payment_date: undefined }));
  };

  const handlePaymentDateChange = (value) => {
    const parts = splitDateParts(value);
    setPaymentForm((current) => ({
      ...current,
      payment_date: parts.value,
      payment_date_month: parts.month,
      payment_date_day: parts.day,
      payment_date_year: parts.year,
    }));
    setFormMessage("");
    setFieldErrors((current) => ({ ...current, payment_date: undefined }));
  };

  const handleDateFilterChange = (prefix, value) => {
    const parts = splitDateParts(value);
    setPaymentForm((current) => ({
      ...current,
      [prefix]: parts.value,
      [`${prefix}_month`]: parts.month,
      [`${prefix}_day`]: parts.day,
      [`${prefix}_year`]: parts.year,
    }));
  };

  const handleCreatePayment = () => {
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    const nextErrors = {};

    if (paymentScope === "single_bill") {
      if (!selectedBill) nextErrors.bill_id = ["Bill reference is required."];
    } else if (paymentScope === "selected_bills") {
      if (!paymentForm.boat_id) nextErrors.boat_id = ["Boat name is required."];
      if (paymentForm.bill_ids.length === 0) nextErrors.bill_ids = ["Select at least one bill."];
    } else if (!selectedBoatPayment) {
      nextErrors.boat_id = ["Boat name is required."];
    }
    const officialReceiptError = validateOfficialReceiptNo(paymentForm.official_receipt_no);
    if (officialReceiptError) nextErrors.official_receipt_no = [officialReceiptError];
    if (!paymentForm.payment_method) nextErrors.payment_method = ["Payment method is required."];
    if (!paymentForm.payment_date) nextErrors.payment_date = ["Payment date is required."];
    if (!paymentForm.amount_paid) nextErrors.amount_paid = ["Amount is required."];

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setFormMessage("");
      return;
    }

    setFormMessage("");
    setFieldErrors({});
    createMutation.mutate({
      payment_scope: paymentScope,
      bill_id: paymentScope === "single_bill" ? Number(paymentForm.bill_id) : undefined,
      bill_ids: paymentScope === "selected_bills" ? paymentForm.bill_ids.map((billId) => Number(billId)) : undefined,
      boat_id: paymentScope === "selected_bills" || paymentScope === "all_bills_per_boat" ? Number(paymentForm.boat_id) : undefined,
      payment_method: paymentForm.payment_method,
      official_receipt_no: normalizeOfficialReceiptNo(paymentForm.official_receipt_no),
      payment_date: paymentForm.payment_date,
      amount_paid: Number(paymentForm.amount_paid),
      remarks: paymentForm.remarks || null,
    });
  };

  const openEditPayment = (payment) => {
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    setEditingPayment(payment);
    setEditForm({
      official_receipt_no: payment.official_receipt_no || "",
      remarks: payment.remarks || "",
    });
    setEditErrors({});
  };

  const handleSavePaymentEdit = () => {
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    setEditSaveLoading(true);
    const nextErrors = {};

    const officialReceiptError = validateOfficialReceiptNo(editForm.official_receipt_no);
    if (officialReceiptError) nextErrors.official_receipt_no = officialReceiptError;

    if (Object.keys(nextErrors).length > 0) {
      setEditSaveLoading(false);
      setEditErrors(nextErrors);
      return;
    }

    const normalizedCurrentOfficialReceiptNo = normalizeOfficialReceiptNo(editForm.official_receipt_no);
    const normalizedOriginalOfficialReceiptNo = normalizeOfficialReceiptNo(editingPayment?.official_receipt_no);
    const normalizedCurrentRemarks = editForm.remarks.trim();
    const normalizedOriginalRemarks = String(editingPayment?.remarks ?? "").trim();

    if (
      normalizedCurrentOfficialReceiptNo === normalizedOriginalOfficialReceiptNo &&
      normalizedCurrentRemarks === normalizedOriginalRemarks
    ) {
      setEditSaveLoading(false);
      setEditingPayment(null);
      setEditForm({ official_receipt_no: "", remarks: "" });
      setEditErrors({});
      showNoChangesToast();
      return;
    }

    updateMutation.mutate({
      id: editingPayment.payment_id,
      payload: {
         official_receipt_no: normalizedCurrentOfficialReceiptNo,
        remarks: normalizedCurrentRemarks || null,
      },
    });
  };

  return (
    <ConfigProvider theme={antTheme}>
      <style>{`
        .payments-ant-select .ant-select-selector {
          border-radius: 12px !important;
          border: 1px solid #e2e8f0 !important;
          box-shadow: none !important;
          background: white !important;
          font-family: ${FONT} !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          color: #0d1117 !important;
          height: 42px !important;
          padding: 0 14px !important;
          display: flex !important;
          align-items: center !important;
        }
        .payments-ant-select .ant-select-selection-placeholder,
        .payments-ant-select .ant-select-selection-item {
          line-height: 40px !important;
        }

        .universal-filter-select.payments-ant-select-error .ant-select-selector {
          border-color: #fca5a5 !important;
        }

        .universal-filter-select.payments-ant-select-error.ant-select-focused .ant-select-selector,
        .universal-filter-select.payments-ant-select-error.ant-select-open .ant-select-selector,
        .universal-filter-select.payments-ant-select-error .ant-select-selector:hover {
          border-color: #fca5a5 !important;
          box-shadow: none !important;
        }

        .rdp-root .rdp-dropdown,
        .rdp-root .rdp-dropdown_root,
        .rdp-root .rdp-dropdowns,
        .rdp-root .rdp-caption_dropdowns {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }

        .rdp-root .rdp-dropdown select,
        .rdp-root .rdp-dropdown_root select,
        .rdp-caption_dropdowns select {
          font-family: ${FONT} !important;
          font-size: 13px !important;
          font-weight: 400 !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          background: transparent !important;
          color: #0d1117 !important;
          -webkit-appearance: none !important;
          appearance: none !important;
        }

        .rdp-root .rdp-dropdown select::-ms-expand,
        .rdp-root .rdp-dropdown_root select::-ms-expand,
        .rdp-caption_dropdowns select::-ms-expand {
          display: none !important;
        }

        .rdp-root .rdp-dropdown select:focus,
        .rdp-root .rdp-dropdown_root select:focus,
        .rdp-caption_dropdowns select:focus,
        .rdp-root .rdp-dropdown select:hover,
        .rdp-root .rdp-dropdown_root select:hover,
        .rdp-caption_dropdowns select:hover,
        .rdp-root .rdp-dropdown select:active,
        .rdp-root .rdp-dropdown_root select:active,
        .rdp-caption_dropdowns select:active,
        .rdp-root .rdp-dropdown select:focus-visible,
        .rdp-root .rdp-dropdown_root select:focus-visible,
        .rdp-caption_dropdowns select:focus-visible {
          outline: none !important;
          box-shadow: none !important;
          border: none !important;
          background: transparent !important;
        }

        .rdp-root .rdp-caption_label,
        .rdp-root .rdp-month_caption,
        .rdp-root .rdp-nav button,
        .rdp-root .rdp-button_next,
        .rdp-root .rdp-button_previous {
          font-weight: 400 !important;
          box-shadow: none !important;
          outline: none !important;
          border: none !important;
        }

        .rdp-root button:focus,
        .rdp-root button:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }

        .rdp-root select:focus,
        .rdp-root select:focus-visible,
        .rdp-root select:hover,
        .rdp-root select:active,
        .rdp-root button:focus,
        .rdp-root button:focus-visible {
          outline: none !important;
          box-shadow: none !important;
          border-color: transparent !important;
        }

        .rdp-root {
          --rdp-day-width: 32px;
          --rdp-day-height: 32px;
          --rdp-day_button-width: 32px;
          --rdp-day_button-height: 32px;
          --rdp-nav-height: 32px;
          --rdp-months-gap: 8px;
        }

        .rdp-root .rdp-month_caption,
        .rdp-root .rdp-caption_label,
        .rdp-root .rdp-weekday,
        .rdp-root .rdp-day_button {
          font-size: 12px !important;
        }
      `}</style>
      <div className="flex h-screen overflow-hidden bg-white">
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onWidthChange={setContentMargin} />
        <div
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px",
          }}
        >
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />
          <main className="flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">
              <div className="mb-5 flex items-center justify-between">
                <TitlePage title="Payments" subtitle="Manage payment records and create payment entries." loading={showInitialSkeleton} />
                <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: breadcrumbLabel }]} fontFamily={FONT} loading={showInitialSkeleton} />
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                {overviewCards.map((card) => <OverviewCard key={card.title} {...card} loading={!paymentsData && isPaymentsLoading} />)}
              </div>

              <Tabs
                tabs={TABS.map((tab) => ({ key: tab.value, label: tab.label, icon: tab.icon }))}
                activeKey={activeTab}
                onTabChange={navigatePaymentsTab}
                fontFamily={FONT}
                className="mb-5"
                loading={!paymentsData && isPaymentsLoading}
                rightContent={isRecordsTab ? <Legend items={PAYMENT_STATUS_LEGEND} loading={!paymentsData && isPaymentsLoading} /> : null}
              >
              {isRecordsTab ? (
                  <TableCard
                    title="Payment Records"
                    subtitle="All payment records in the system."
                    loading={showInitialSkeleton}
                    headerActionsSkeletonCount={4}
                    className=""
                    bodyClassName="overflow-x-auto"
                    footerClassName="flex items-center justify-between"
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
                            value={searchInput}
                            onChange={(event) => {
                              clearUniversalHighlight();
                              setSearchInput(event.target.value);
                              setRequestedPage(1);
                            }}
                            placeholder="Search for payment reference no., boat name, date, amount"
                            className="w-full border-none bg-transparent text-[13px] outline-none"
                            style={{ fontFamily: FONT, color: "#1a1f36" }}
                          />
                        </div>
                        <FilterSelect
                          {...PAYMENTS_FILTER_DROPDOWN_PROPS}
                          value={periodFilter}
                          onChange={(value) => {
                            clearUniversalHighlight();
                            setPeriodFilter(value);
                            setRequestedPage(1);
                          }}
                          width={150}
                          height={42}
                          options={PERIOD_FILTER_OPTIONS}
                        />
                        <FilterSelect
                          {...PAYMENTS_FILTER_DROPDOWN_PROPS}
                          value={statusFilter}
                          onChange={(value) => {
                            clearUniversalHighlight();
                            setStatusFilter(value);
                            setRequestedPage(1);
                          }}
                          width={140}
                          height={42}
                          options={STATUS_FILTER_OPTIONS}
                        />
                      </>
                    }
                    pagination={{
                      meta: paymentsMeta,
                      totalPages,
                      currentPage: safePage,
                      requestedPage: currentPage,
                      isLoading: showInitialSkeleton,
                      onPageChange: queuePaymentPage,
                    }}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse" style={{ minWidth: 940 }}>
                        <thead>
                          <tr>
                            <TH>Payment Reference No.</TH>
                            <TH>Bill Reference No.</TH>
                            <TH>Boat Name</TH>
                            <TH>Date</TH>
                            <TH><div className="text-right">Total/Remaining Balance(₱)</div></TH>
                            <TH><div className="text-right">PAID AMOUNT(₱)</div></TH>
                            <TH><div className="text-right">Balance(₱)</div></TH>
                            <TH><div className="min-w-[220px]">Remarks</div></TH>
                            <TH>Action</TH>
                          </tr>
                        </thead>
                        <tbody>
                          {showInitialSkeleton ? (
                            Array.from({ length: PAGE_SIZE }).map((_, index) => (
                              <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                {Array.from({ length: 9 }).map((__, column) => (
                                  <td key={column} className="px-4 py-3">
                                    {column === 8 ? (
                                      <div className="h-8 w-8 rounded-[10px] bg-slate-100" />
                                    ) : (
                                      <div className="h-3 rounded bg-slate-100" style={{ width: column <= 2 ? 120 : 90 }} />
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : isPaymentsError ? (
                            <tr>
                              <td colSpan={9} className="px-4 py-10 text-center">
                                <div className="flex flex-col items-center gap-3">
                                  <IoAlertCircleOutline className="text-[32px] text-red-400" />
                                  <p className="m-0 text-[13px] font-normal text-red-500">
                                    Unable to load payments.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => refetchPayments()}
                                    className="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-[#1a1f36] hover:bg-gray-50"
                                    style={{ fontFamily: FONT }}
                                  >
                                    Retry
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : showPaymentsEmptyState ? (
                            <tr>
                              <td colSpan={10}>
                                <NoDataFound title={debouncedSearch || periodFilter !== "all" || statusFilter !== "all" ? "No results found" : "No Data Found"} />
                              </td>
                            </tr>
                          ) : (
                            paginatedPayments.map((record, index) => (
                              (() => {
                                const isHighlighted =
                                  highlightedPaymentId &&
                                  String(highlightedPaymentId) === String(record.payment_id);
                                return (
                              <tr
                                ref={isHighlighted ? highlightedRowRef : null}
                                key={record.payment_id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setDetailPayment(record)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setDetailPayment(record);
                                  }
                                }}
                                className={`cursor-pointer transition-colors ${highlightedPaymentId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${isHighlighted ? "universal-search-highlight" : ""}`.trim()}
                                style={{
                                  borderBottom: "1px solid #f1f5f9",
                                }}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                      style={{
                                        backgroundColor:
                                          record.status === "paid"
                                            ? "#16a34a"
                                            : "#f59e0b",
                                        minWidth: 10,
                                        minHeight: 10,
                                      }}
                                    />
                                    <span className="text-[13px] font-semibold text-[#1a1f36]">
                                      {record.payment_reference}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-[13px] text-slate-700">{record.bill_reference}</td>
                                <td className="px-4 py-3 text-[13px] text-[#1a1f36]">{record.boat_name || "-"}</td>
                                <td className="px-4 py-3 text-[13px] text-slate-700">{formatDisplayDate(record.payment_date)}</td>
                                <td className="px-4 py-3 text-right">
                                  <span className="inline-block min-w-[96px] text-right text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                    {Number(record.total_amount || 0).toLocaleString("en-PH", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="inline-block min-w-[96px] text-right text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                    {Number(record.amount_paid || 0).toLocaleString("en-PH", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="inline-block min-w-[96px] text-right text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                    {Number(record.balance || 0).toLocaleString("en-PH", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </td>
                                <td className="min-w-[220px] px-4 py-3 text-[13px] text-slate-700">{record.remarks || "-"}</td>
                                <td className="px-4 py-3">
  <div className="flex items-center gap-2">
    <Tooltip title={isTransactionLocked ? transactionLockMessage : "Edit"}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openEditPayment(record);
        }}
        disabled={isTransactionLocked}
        className={`flex h-8 w-8 items-center justify-center rounded-[10px] border bg-white transition-colors ${isTransactionLocked ? "cursor-not-allowed border-slate-200" : "hover:bg-blue-50"}`}
        style={{ borderColor: isTransactionLocked ? undefined : "#1a1f36" }}
      >
        <IoCreateOutline style={{ fontSize: "15px", color: isTransactionLocked ? "#94a3b8" : "#1a1f36" }} />
      </button>
    </Tooltip>
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
              ) : (
                <div className="border border-slate-200 bg-white p-5">
                <div className="space-y-6">
                  <div className="grid items-start gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <Card
                      icon={IoBoatOutline}
                      title="BILLING DETAILS"
                      subtitle="Select one bill or selected bills for a boat."
                      className="xl:min-h-[520px]"
                      loading={isCreateTabLoading}
                      skeletonLayout={[
                        { type: "segmented", count: 2, columns: 2 },
                        { type: "fields", count: 3, columns: 2, spans: [2, 1, 1] },
                        { type: "fields", count: 2, columns: 2 },
                        { type: "table", columns: 3, rows: 4 },
                        { type: "summary", rows: 4 },
                      ]}
                    >
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="xl:col-span-2">
                          <div className="mb-5 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handlePaymentScopeChange("single_bill")}
                              className={`w-full rounded-[10px] px-4 py-2 text-[13px] font-semibold uppercase transition-colors ${
                                paymentScope === "single_bill"
                                  ? "bg-[#1a1f36] text-white"
                                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                              style={{ fontFamily: FONT }}
                            >
                              1 Bill
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePaymentScopeChange("selected_bills")}
                              className={`w-full rounded-[10px] px-4 py-2 text-[13px] font-semibold uppercase transition-colors ${
                                paymentScope === "selected_bills"
                                  ? "bg-[#1a1f36] text-white"
                                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                              style={{ fontFamily: FONT }}
                            >
                              Select Multiple Bills
                            </button>
                          </div>
                          {paymentScope === "single_bill" ? (
                            <>
                              <div>
                                <Label required>Bill Reference</Label>
                                <SelectField
                                  value={paymentForm.bill_id || undefined}
                                  onChange={handleBillChange}
                                  placeholder="Select or type bill reference"
                                  error={Boolean(fieldErrors.bill_id?.[0])}
                                  options={billOptions}
                                />
                                <InlineFieldError message={fieldErrors.bill_id?.[0]} />
                              </div>
                              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <div>
                                  <Label>Boat Name</Label>
                                  <Input value={paymentSummary?.boat_name || ""} readOnly readOnlyWhite />
                                </div>
                                <div>
                                  <Label>Boat Owner</Label>
                                  <Input value={paymentSummary?.owner_name || ""} readOnly readOnlyWhite />
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <Label required>Boat Name</Label>
                                <SelectField
                                  value={paymentForm.boat_id || undefined}
                                  onChange={handleBoatChange}
                                  placeholder="Select boat name"
                                  error={Boolean(fieldErrors.boat_id?.[0])}
                                  options={boatPaymentOptions}
                                />
                                <InlineFieldError message={fieldErrors.boat_id?.[0]} />
                              </div>
                              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <div>
                                  <Label>Boat Name</Label>
                                  <Input value={(paymentSummary?.boat_name || selectedBoatPayment?.boat_name) || ""} readOnly readOnlyWhite />
                                </div>
                                <div>
                                  <Label>Boat Owner</Label>
                                  <Input value={(paymentSummary?.owner_name || selectedBoatPayment?.owner_name) || ""} readOnly readOnlyWhite />
                                </div>
                              </div>
                              
                                {/* Date Range Filter Section */}
                                {paymentForm.boat_id && (
                                  <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50/70 p-4">
                                    <div className="mb-3 flex items-center justify-between">
                                      <p
                                        className="m-0 text-[11px] font-semibold uppercase tracking-wide"
                                        style={{ color: "#6F6F82", fontFamily: FONT }}
                                      >
                                        Filter by Date Range
                                      </p>
                                      <button
                                        type="button"
                                        onClick={handleShowAllBills}
                                        className="border-none bg-transparent p-0 text-[12px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
                                        style={{ fontFamily: FONT }}
                                      >
                                        Show All
                                      </button>
                                    </div>
                                  
                                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                      <Label>From Date</Label>
                                      <DatePicker
                                        value={paymentForm.date_from || undefined}
                                        onChange={(_, currentDateString) =>
                                          handleDateFilterChange("date_from", currentDateString)
                                        }
                                        placeholder="Select a date to filter"
                                        options={{ useFiscalYearDefault: false }}
                                        containerClassName="w-full"
                                        inputClassName="rounded-[10px] border-slate-200 bg-white text-[13px] text-[#1a1f36] focus:border-[#4096ff] focus:ring-0"
                                      />
                                    </div>

                                    <div>
                                      <Label>To Date</Label>
                                      <DatePicker
                                        value={paymentForm.date_to || undefined}
                                        onChange={(_, currentDateString) =>
                                          handleDateFilterChange("date_to", currentDateString)
                                        }
                                        placeholder="Select a date to filter"
                                        options={{ useFiscalYearDefault: false }}
                                        containerClassName="w-full"
                                        inputClassName="rounded-[10px] border-slate-200 bg-white text-[13px] text-[#1a1f36] focus:border-[#4096ff] focus:ring-0"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Select Bills Section - Only show when boat is selected */}
                              {paymentForm.boat_id && (
                                 <div className={`mt-4 rounded-[10px] border bg-slate-50/70 p-4 ${fieldErrors.bill_ids?.[0] ? "border-red-300" : "border-slate-200"}`}>
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <div>
                                        <p
                                          className="m-0 text-[11px] font-semibold uppercase tracking-wide"
                                          style={{ color: "#6F6F82", fontFamily: FONT }}
                                        >
                                          Select Bills
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        {selectedBillsPayment ? (
                                          <p className="m-0 text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                            {selectedBillsPayment.bill_count} selected
                                          </p>
                                        ) : null}
                                        {filteredBoatBills.length > 0 ? (
                                          <button
                                            type="button"
                                            onClick={handleSelectAllBills}
                                          className="border-none bg-transparent p-0 text-[12px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
                                            style={{ fontFamily: FONT }}
                                          >
                                            {areAllFilteredBillsSelected ? "Clear All" : "Select All"}
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="max-h-[268px] space-y-2 overflow-y-auto pr-1">
                                      {filteredBoatBills.length > 0 ? (
                                        filteredBoatBills.map((bill) => {
                                          const isChecked = paymentForm.bill_ids.includes(String(bill.bill_id));
                                          const billDate = getBillDateValue(bill);

                                          return (
                                            <label
                                            key={bill.bill_id}
                                            className={`flex cursor-pointer items-center justify-between gap-4 rounded-[10px] border px-4 py-3 transition-colors ${
                                              isChecked ? "border-[#1a1f36] bg-white" : "border-slate-200 bg-white/90 hover:bg-white"
                                            }`}
                                          >
                                              <div className="flex items-center gap-3">
                                                <input
                                                  type="checkbox"
                                                  checked={isChecked}
                                                  onChange={() => handleSelectedBillToggle(bill.bill_id)}
                                                className="h-4 w-4 rounded border-blue-300 text-blue-500 accent-blue-500 focus:ring-blue-500"
                                                />
                                                <div>
                                                  <p className="m-0 text-[13px] font-semibold text-[#1a1f36]">
                                                    {bill.bill_reference}
                                                  </p>
                                                  <p className="m-0 text-[11px] text-slate-500">
                                                    {formatDisplayDate(billDate)}
                                                  </p>
                                                </div>
                                              </div>
                                            <p className="m-0 text-right text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                              {formatMoney(bill.balance)}
                                            </p>
                                          </label>
                                        );
                                      })
                                    ) : (
                                       <p className="m-0 rounded-[10px] border border-dashed border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-500">
                                        No bills found for this boat.
                                      </p>
                                    )}
                                  </div>
                                  <InlineFieldError message={fieldErrors.bill_ids?.[0]} />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        {paymentSummary ? (
                          <div
                            className="xl:col-span-2 rounded-[10px] border border-slate-200 bg-slate-50/70 p-4"
                            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }}
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-4">
                                <p
                                  className="m-0 text-[11px] font-semibold uppercase tracking-wide"
                                  style={{ color: "#6F6F82", fontFamily: FONT }}
                                >
                                  Transactions
                                </p>
                                <p className="m-0 text-right text-[13px] font-medium text-[#1a1f36]">
                                  {paymentSummary?.transaction_summary || "-"}
                                </p>
                              </div>
                              <div className="flex items-start justify-between gap-4">
                                <p
                                  className="m-0 text-[11px] font-semibold uppercase tracking-wide"
                                  style={{ color: "#6F6F82", fontFamily: FONT }}
                                >
                                  Total Billed
                                </p>
                                <p className="m-0 text-right text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                  {formatMoney(paymentSummary?.amount_due)}
                                </p>
                              </div>
                              <div className="flex items-start justify-between gap-4">
                                <p
                                  className="m-0 text-[11px] font-semibold uppercase tracking-wide"
                                  style={{ color: "#6F6F82", fontFamily: FONT }}
                                >
                                  Previously Paid
                                </p>
                                <p className="m-0 text-right text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                  {formatMoney(paymentSummary?.total_paid)}
                                </p>
                              </div>
                              <div className="border-t border-slate-200 pt-3">
                                <div className="flex items-start justify-between gap-4">
                                  <p
                                    className="m-0 text-[11px] font-semibold uppercase tracking-wide"
                                    style={{ color: "#6F6F82", fontFamily: FONT }}
                                  >
                                    Balance Due
                                  </p>
                                  <p className="m-0 text-right text-[16px] font-bold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                    {formatMoney(paymentSummary?.balance)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </Card>

                    <Card
                      icon={IoCashOutline}
                      title="PAYMENT DETAILS"
                      subtitle="Create a payment entry for the selected bill."
                      className="xl:min-h-[520px]"
                      loading={isCreateTabLoading}
                      skeletonLayout={[
                        { type: "fields", count: 5, columns: 1, textareaIndexes: [4] },
                        { type: "button", width: "ml-auto w-44" },
                      ]}
                    >
                      <div className="space-y-4">
                        <div>
                          <Label required>Payment Method</Label>
                          <SelectField
                            value={paymentForm.payment_method || undefined}
                            onChange={(value) => {
                              updatePaymentForm({ payment_method: value ?? "" });
                              setFormMessage("");
                              setFieldErrors((current) => ({ ...current, payment_method: undefined }));
                            }}
                            placeholder="Cash"
                            error={Boolean(fieldErrors.payment_method?.[0])}
                            options={PAYMENT_METHOD_OPTIONS}
                          />
                          <InlineFieldError message={fieldErrors.payment_method?.[0]} />
                        </div>
                        <div>
                          <Label required>Official Receipt No.</Label>
                          <Input
                            value={paymentForm.official_receipt_no}
                            onChange={(event) => {
                              updatePaymentForm({ official_receipt_no: normalizeOfficialReceiptNo(event.target.value) });
                              setFormMessage("");
                              setFieldErrors((current) => ({ ...current, official_receipt_no: undefined }));
                            }}
                            placeholder="Enter official receipt number"
                            error={Boolean(fieldErrors.official_receipt_no?.[0])}
                          />
                          <InlineFieldError message={fieldErrors.official_receipt_no?.[0]} />
                          </div>
                          <div>
                            <Label required>Payment Date</Label>
                            <DatePicker
                              value={paymentForm.payment_date || undefined}
                              onChange={(_, currentDateString) => handlePaymentDateChange(currentDateString)}
                              placeholder="Select payment date"
                              containerClassName="w-full"
                              inputClassName={fieldErrors.payment_date?.[0] ? "border-red-300" : "border-slate-200"}
                            />
                            <InlineFieldError message={fieldErrors.payment_date?.[0]} />
                          </div>
                        <div>
                          <Label required>Amount (₱)</Label>
                            <Input
                              value={paymentForm.amount_paid}
                              onChange={(event) => {
                                updatePaymentForm({ amount_paid: event.target.value });
                              setFormMessage("");
                              setFieldErrors((current) => ({ ...current, amount_paid: undefined }));
                            }}
                            placeholder="0.00"
                            error={Boolean(fieldErrors.amount_paid?.[0])}
                          />
                          <InlineFieldError message={fieldErrors.amount_paid?.[0]} />
                        </div>
                        <div>
                          <Label>Remarks</Label>
                          <textarea
                            value={paymentForm.remarks}
                            onChange={(event) => {
                              updatePaymentForm({ remarks: event.target.value });
                              setFormMessage("");
                            }}
                            placeholder="Add payment remarks"
                            className="min-h-[96px] w-full resize-none rounded-[10px] border border-slate-200 px-3.5 py-3 text-[13px] outline-none focus:border-[#4096ff]"
                            style={{ fontFamily: FONT, color: "#0d1117" }}
                          />
                        </div>
                        {formMessage ? <p className="m-0 text-[12px] font-normal text-red-500">{formMessage}</p> : null}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleCreatePayment}
                            disabled={createMutation.isPending || isTransactionLocked}
                            className="flex min-w-[180px] cursor-pointer items-center justify-center rounded-[10px] border-none bg-[#1a1f36] px-7 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {createMutation.isPending ? <Spinner size={4} /> : "Create Payment"}
                          </button>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
                </div>
              )}
              </Tabs>

              {isPaymentFormDataError ? (
                <div className="mt-5 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                  Unable to load payment data right now.
                  <button type="button" onClick={() => refetchPaymentFormData()} className="ml-2 cursor-pointer border-none bg-transparent p-0 font-semibold text-red-700 underline">
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </div>
      <EditPaymentModal
        open={Boolean(editingPayment)}
        payment={editingPayment}
        form={editForm}
        errors={editErrors}
        saving={updateMutation.isPending || editSaveLoading}
        onClose={() => {
          if (updateMutation.isPending || editSaveLoading) return;
          setEditingPayment(null);
          setEditForm({ official_receipt_no: "", remarks: "" });
          setEditErrors({});
          setEditSaveLoading(false);
        }}
        onChange={(patch) => {
          setEditForm((current) => ({
            ...current,
            ...patch,
            ...(patch.official_receipt_no !== undefined
              ? { official_receipt_no: normalizeOfficialReceiptNo(patch.official_receipt_no) }
              : {}),
          }));
          if (patch.official_receipt_no !== undefined) {
            setEditErrors((current) => ({ ...current, official_receipt_no: "" }));
          }
        }}
        onSave={handleSavePaymentEdit}
      />
      <PaymentDetailsDrawer
        open={Boolean(detailPayment)}
        payment={detailPayment}
        onClose={() => setDetailPayment(null)}
      />
    </ConfigProvider>
  );
};

export default SuperPayments;
