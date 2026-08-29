import React, { useEffect, useMemo, useRef, useState } from "react";
import { ConfigProvider, Tooltip } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { DayPicker } from "react-day-picker";
import "typeface-montserrat";
import "react-day-picker/dist/style.css";
import {
  IoAddOutline,
  IoBoatOutline,
  IoCalendarOutline,
  IoCashOutline,
  IoChevronDownOutline,
  IoCheckmarkOutline,
  IoCloseOutline,
  IoCreateOutline,
  IoDocumentTextOutline,
  IoAlertCircleOutline,
  IoLayersOutline,
  IoPersonOutline,
  IoReceiptOutline,
  IoSearchOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import StatusPill from "../../components/StatusPill";
import FilterSelect from "../../components/FilterSelect";
import FilterButton from "../../components/FilterButton";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Legend from "../../components/Legend";
import DatePicker from "../../components/DatePicker";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import BreakdownBillModal from "../../components/BreakdownBillModal";
import BreakdownBanyeraModal from "../../components/BreakdownBanyeraModal";
import DetailDrawer, { DrawerInfoCard, DrawerSection } from "../../components/Drawer";
import { useSidebar } from "../../store/sidebarStore";
import { showAddedToast, showBottomToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import api from "../../api/axios";
import { useBillingBoatsQuery, useBillingDataQuery, useBillingFormLookupsQuery, useBillingPaymentsQuery } from "../../hooks/useBillingDataQuery";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePaymentFormLookupsQuery, usePaymentsDataQuery } from "../../hooks/usePaymentsDataQuery";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import { isHeadRole } from "../../utils/transactionLock";
import { cacheTab, getCachedTab } from "../../utils/tabSession";
import { buildBillingStatementPdf } from "../../lib/pdfDocumentBill";
import { getEcho } from "../../lib/realtime";
import Spinner from "../../components/Spinner";
import NoDataFound from "../../components/NoDataFound";
import { adjustTodayCollection, invalidateTodayCollection } from "../../utils/remittanceCollectionCache";

const FONT = "'Montserrat', sans-serif";
const PAGE_SIZE = 10;
const BILLING_MODAL_WIDTH = "1040px";
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
  { value: "/billing", label: "Billing", icon: IoReceiptOutline },
  { value: "/billing-payments", label: "Payments", icon: IoCashOutline },
];
const BILLING_TAB_PATHS = {
  records: "/billing",
  payments: "/billing-payments",
};
const BILLING_PATH_TABS = {
  "/billing": "records",
  "/billing-payments": "payments",
};
const BILLING_TABS = new Set(["records", "payments"]);
const BILLING_TAB_KEYS = Array.from(BILLING_TABS);
const BILLING_TAB_STORAGE_KEY = "opol:billing:active-tab";
const getBillingTabPath = (tab) => BILLING_PATH_TABS[tab] ? tab : BILLING_TAB_PATHS[tab] ?? BILLING_TAB_PATHS.records;
const getBillingTabFromLocation = ({ pathname, search }) => {
  const tab = new URLSearchParams(search).get("tab");
  if (BILLING_TABS.has(tab)) return getBillingTabPath(tab);

  if (BILLING_PATH_TABS[pathname]) {
    if (pathname === BILLING_TAB_PATHS.records) {
      const cachedTab = getCachedTab(BILLING_TAB_STORAGE_KEY, BILLING_TAB_KEYS, "records");
      return getBillingTabPath(cachedTab);
    }
    return pathname;
  }

  return BILLING_TAB_PATHS.records;
};

const PERIOD_FILTER_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

const PAYMENT_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
];

const PAYMENT_STATUS_LEGEND = [
  { key: "paid", label: "Paid", color: "#16a34a" },
  { key: "partial", label: "Partial", color: "#f59e0b" },
];

const BILLING_FILTER_DROPDOWN_PROPS = {
  getPopupContainer: (triggerNode) => (typeof document !== "undefined" ? document.body : triggerNode.parentElement),
  placement: "bottomLeft",
  dropdownAlign: { overflow: { adjustX: false, adjustY: false } },
};

const TRANSACTION_TYPE_OPTIONS = [
  { value: "docking", label: "Docking" },
  { value: "banyera", label: "Banyera" },
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

const getInitialBillingItem = () => ({
  transaction_type: "",
  record_id: "",
  amount: "",
});

const generateReferencePreview = () =>
  String(Math.floor(100000 + Math.random() * 900000));

const getInitialBillingForm = () => ({
  bill_reference_no: "",
  reference_number: generateReferencePreview(),
  boat_id: "",
  date_from: "",
  date_from_month: "",
  date_from_day: "",
  date_from_year: "",
  date_to: "",
  date_to_month: "",
  date_to_day: "",
  date_to_year: "",
  items: [getInitialBillingItem()],
});

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatReferenceNumber = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-6).padStart(6, "0");
};

const getBillingStatementFilename = (bill) => {
  const reference = formatReferenceNumber(bill?.bill_reference_no);
  const safeReference = (reference || "billing-statement")
    .replace(/[<>:"/\\|?*]+/g, "")
    .trim();

  return `${safeReference}.pdf`;
};

const getBillingHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Bills" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("bill-") ? rawId.slice("bill-".length) : "";
};

const getPaymentHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Payments" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("payment-") ? rawId.slice("payment-".length) : "";
};

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

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const parts = getDatePartsFromValue(value);
  if (!parts) return String(value).slice(0, 10);
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatShortDisplayDate = (value) => {
  if (!value) return "-";
  const parts = getDatePartsFromValue(value);
  if (!parts) return String(value).slice(0, 10);
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatLongDisplayDate = (value) => {
  if (!value) return "";
  const parts = getDatePartsFromValue(value);
  if (!parts) return String(value).slice(0, 10);
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatAccountingMoney = (value) => {
  const amount = Number(value || 0);
  const formatted = formatMoney(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
};

const getBillItemDisplayType = (transactionType) =>
  transactionType === "docking"
    ? "Docking"
    : transactionType === "banyera"
      ? "Banyera"
      : "Transaction";

const getBillItemDisplayDate = (item, fallbackDate = "") => {
  const transactionType = String(item?.transaction_type || "").toLowerCase();

  if (transactionType === "docking")
    return (
      item?.transaction_date ||
      item?.docking_date ||
      item?.docking?.docking_date ||
      fallbackDate
    );
  if (transactionType === "banyera")
    return (
      item?.transaction_date ||
      item?.banyera_transaction?.transaction_date ||
      item?.banyeraTransaction?.transaction_date ||
      item?.banyera_date ||
      fallbackDate
    );
  return fallbackDate;
};

const TH = ({ children }) => (
  <th
    className="whitespace-nowrap bg-white px-4 py-3 text-left text-[13px] font-semibold"
    style={{
      color: "#1a1f36",
      backgroundColor: "#ffffff",
      borderBottom: "2px solid #e5e7eb",
    }}
  >
    {children}
  </th>
);


const InputShell = ({ label, required = false, children }) => (
  <div>
    <p
      className="m-0 mb-2 text-[11px] font-semibold uppercase"
      style={{ color: "#6F6F82", fontFamily: FONT }}
    >
      {label}
      {required ? <span className="ml-0.5 text-red-500">*</span> : ""}
    </p>
    {children}
  </div>
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

const ErrorMessage = ({ children }) => (
  <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-red-100 bg-red-50 px-3 py-2">
    <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
    <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>
      {children}
    </p>
  </div>
);

const Input = React.forwardRef(
  ({ icon: Icon, readOnly = false, readOnlyPlain = false, error = false, tabIndex, inputClassName = "", inputStyle = {}, wrapperClassName = "", ...props }, ref) => (
    <div
      className={`flex items-center gap-2.5 border px-3.5 transition-all ${readOnly && !readOnlyPlain ? "border-slate-200 bg-slate-100" : error ? "border-red-300 bg-white" : "border-slate-200 bg-white focus-within:border-[#4096ff]"} ${wrapperClassName}`.trim()}
      style={{ height: 46, borderRadius: 10 }}
    >
      {Icon ? (
        <Icon className="flex-shrink-0 text-[15px] text-slate-400" />
      ) : null}
      <input
        ref={ref}
        readOnly={readOnly}
        tabIndex={readOnly ? -1 : tabIndex}
        {...props}
        className={`h-full w-full border-none bg-transparent text-[13px] font-medium outline-none ${readOnly && !readOnlyPlain ? "cursor-default text-slate-500" : "text-[#0d1117]"} ${readOnly ? "cursor-default" : ""} ${inputClassName}`.trim()}
        style={{ fontFamily: FONT, ...inputStyle }}
      />
    </div>
  ),
);

Input.displayName = "Input";

const SelectField = ({ value, onChange, placeholder, options = [], error = false }) => (
  <FilterSelect
    className={`billing-ant-select ${error ? "billing-ant-select-error" : ""}`}
    showSearch
    allowClear
    placeholder={placeholder}
    optionFilterProp="label"
    getPopupContainer={(triggerNode) => (typeof document !== "undefined" ? document.body : triggerNode.parentElement)}
    placement="bottomLeft"
    dropdownAlign={{ overflow: { adjustX: false, adjustY: false } }}
    style={{ width: "100%", height: 46, fontFamily: FONT }}
    height={46}
    value={value}
    onChange={onChange}
    options={options}
    filterOption={(input, option) =>
      (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
    }
  />
);

const getPickerDate = (value) => {
  const parts = getDatePartsFromValue(value);
  if (!parts) return undefined;
  return new Date(parts.year, parts.month - 1, parts.day);
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
          className="flex h-[46px] w-full items-center gap-2.5 rounded-[10px] border border-slate-200 bg-white px-3.5 text-left transition-all hover:border-[#4096ff] hover:shadow-[0_0_0_2px_rgba(64,150,255,0.08)]"
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
              className="fixed z-[9999] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.18)]"
              style={{
                top: popupPosition.top,
                left: popupPosition.left,
                fontFamily: FONT,
              }}
            >
              <DayPicker
                mode="single"
                selected={selectedDate}
                month={selectedDate}
                onSelect={(date) => {
                  if (!date) {
                    onChange("");
                    setOpen(false);
                    return;
                  }

                  const nextValue = `${date.getFullYear()}-${String(
                    date.getMonth() + 1,
                  ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

const BillingStatementModal = ({
  bill,
  open,
  pdfFile,
  loading,
  onClose,
}) => {
  if (!open) return null;

  const reference = formatReferenceNumber(bill.bill_reference_no) || "-";

  return (
    <Modal
      title="Billing Statement"
      onClose={onClose}
      closeOnBackdrop
      maxWidth="920px"
      showFooter={false}
      bodyClassName="h-[68vh] max-h-[68vh] !overflow-hidden !p-0"
      contentClassName="h-full !gap-0"
    >
      <div className="relative h-full overflow-hidden bg-white">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-[13px] text-slate-500">
            Generating PDF preview...
          </div>
        ) : pdfFile?.url ? (
          <iframe
            src={pdfFile.url}
            title={`Billing Statement ${reference}`}
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-[13px] text-slate-500">
            Generating PDF preview...
          </div>
        )}
      </div>
    </Modal>
  );

};

const EditBillingModal = ({
  open,
  bill,
  form,
  boatOptions,
  previewBoat,
  fieldErrors,
  formError,
  availableRecordsByType,
  saving,
  totalAmount,
  onClose,
  onBoatChange,
  onDateRangeChange,
  onShowAll,
  onSave,
}) => {
  if (!open || !bill) return null;

  const modalItems = useMemo(() => {
    const derivedItems = (form?.items ?? []).filter((item) => item?.transaction_type || item?.record_id || item?.amount);
    if (derivedItems.length > 0) {
      return derivedItems;
    }

    const selectedBoatId = String(form?.boat_id || bill?.boat_id || "");
    const fallbackItems = [];
    const seenKeys = new Set();

    const addItem = (item) => {
      if (!item?.record_id || !item?.transaction_type) return;
      const key = `${item.transaction_type}:${item.record_id}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      fallbackItems.push(item);
    };

    (availableRecordsByType?.docking ?? []).forEach((record) => {
      if (String(record.boatId ?? "") !== selectedBoatId) return;
      if (!isDateWithinRange(record.sortDate, form?.date_from, form?.date_to)) return;
      addItem({
        transaction_type: "docking",
        record_id: String(record.value ?? ""),
        amount: String(record.amount ?? ""),
        sortDate: String(record.sortDate ?? ""),
      });
    });

    (availableRecordsByType?.banyera ?? []).forEach((record) => {
      if (String(record.boatId ?? "") !== selectedBoatId) return;
      if (!isDateWithinRange(record.sortDate, form?.date_from, form?.date_to)) return;
      addItem({
        transaction_type: "banyera",
        record_id: String(record.value ?? ""),
        amount: String(record.amount ?? ""),
        sortDate: String(record.sortDate ?? ""),
      });
    });

    if (fallbackItems.length > 0) {
      return fallbackItems.sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")));
    }

    return (bill?.items ?? []).map((item) => ({
      transaction_type: item?.transaction_type,
      record_id: item?.transaction_type === "docking"
        ? String(item?.docking_id ?? "")
        : String(item?.banyera_id ?? ""),
      amount: String(item?.amount ?? ""),
      sortDate: getBillItemRawDate(item, bill?.created_at),
    }));
  }, [availableRecordsByType, bill, form?.boat_id, form?.date_from, form?.date_to, form?.items]);

  return (
    <Modal
      title="Edit Billing"
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      saveLabel="Save"
      savingLabel=""
      saveButtonWidth="140px"
      closeButtonWidth="140px"
      maxWidth="920px"
      minimumSavingMs={0}
      footerLeftContent={
        <div>
          <p
            className="m-0 text-[11px] font-semibold uppercase"
            style={{ color: "#6F6F82", fontFamily: FONT }}
          >
            Total Billing
          </p>
          <p
            className="m-0 text-[28px] font-bold leading-tight text-[#1a1f36]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {Number(totalAmount || 0).toLocaleString("en-PH", {
              style: "currency",
              currency: "PHP",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label>Billing Reference No.</Label>
          <Input value={formatReferenceNumber(bill.bill_reference_no) || ""} readOnly />
        </div>
        <div>
          <Label>Boat Name</Label>
          <Input value={previewBoat?.boat_name || ""} readOnly />
          {fieldErrors.boat_id ? <ErrorMessage>{fieldErrors.boat_id}</ErrorMessage> : null}
        </div>
        <div>
          <Label>Boat Type</Label>
          <Input
            value={
              previewBoat?.boat_type?.type_name ||
              previewBoat?.boatType?.type_name ||
              ""
            }
            readOnly
          />
        </div>
        <div>
          <Label>Boat Owner</Label>
          <Input value={previewBoat?.owner?.full_name || ""} readOnly />
        </div>
        <div>
          <div className="mb-2 flex min-h-[20px] items-center justify-between gap-3">
            <p
              className="m-0 text-[11px] font-semibold uppercase"
              style={{ color: "#6F6F82", fontFamily: FONT }}
            >
              From Date
            </p>
            <span className="block h-[18px] w-[52px]" aria-hidden="true" />
          </div>
          <DatePicker
            value={form.date_from || undefined}
            onChange={(_, currentDateString) => onDateRangeChange("date_from", currentDateString)}
            placeholder="Select a date to filter"
            options={{ useFiscalYearDefault: false }}
            containerClassName="w-full"
            inputClassName="rounded-[10px] border-slate-200 bg-white text-[13px] text-[#1a1f36] focus:border-[#4096ff] focus:ring-0"
          />
        </div>
        <div>
          <div className="mb-2 flex min-h-[20px] items-center justify-between gap-3">
            <p
              className="m-0 text-[11px] font-semibold uppercase"
              style={{ color: "#6F6F82", fontFamily: FONT }}
            >
              To Date
            </p>
            <button
              type="button"
              onClick={onShowAll}
              className="border-none bg-transparent p-0 text-[12px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
              style={{ fontFamily: FONT }}
            >
              Show All
            </button>
          </div>
          <DatePicker
            value={form.date_to || undefined}
            onChange={(_, currentDateString) => onDateRangeChange("date_to", currentDateString)}
            placeholder="Select a date to filter"
            options={{ useFiscalYearDefault: false }}
            containerClassName="w-full"
            inputClassName="rounded-[10px] border-slate-200 bg-white text-[13px] text-[#1a1f36] focus:border-[#4096ff] focus:ring-0"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p
            className="m-0 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "#6F6F82", fontFamily: FONT }}
          >
            UNBILLED TRANSACTIONS
          </p>
        </div>
        {modalItems.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
            No unbilled transactions found for the selected boat and date range.
          </div>
        ) : (
          <div className="rounded-[10px] border border-slate-200 bg-slate-50/60 p-3">
            <div
              className="mb-2 grid gap-2 px-1 pr-3"
              style={{
                gridTemplateColumns:
                  "minmax(150px,1fr) minmax(150px,0.9fr) minmax(130px,0.8fr)",
              }}
            >
              {["Type", "Date", "Amount (₱)"].map((label) => (
                <p
                  key={label}
                  className="m-0 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "#6F6F82", fontFamily: FONT }}
                >
                  {label}
                </p>
              ))}
            </div>
            <div
              className="max-h-[240px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}
            >
              {modalItems.map((item, index) => {
                const records = (availableRecordsByType[item.transaction_type] ?? []).filter((record) =>
                  form.boat_id ? record.boatId === form.boat_id : true,
                );
                const typeLabel =
                  TRANSACTION_TYPE_OPTIONS.find((option) => option.value === item.transaction_type)?.label || "";
                const originalBillItem = (bill?.items ?? []).find((candidate) => {
                  if (candidate?.transaction_type !== item.transaction_type) return false;
                  if (item.transaction_type === "docking") {
                    return String(candidate?.docking_id ?? "") === String(item.record_id);
                  }
                  return String(candidate?.banyera_id ?? "") === String(item.record_id);
                });
                const recordDateValue =
                  item.sortDate ||
                  records.find((record) => String(record.value) === String(item.record_id))?.sortDate ||
                  getBillItemRawDate(originalBillItem, bill?.created_at);
                const recordDate = formatLongDisplayDate(recordDateValue) || "";

                return (
                  <div
                    key={`${item.transaction_type}-${item.record_id || index}`}
                    className="mb-2 grid items-start gap-2 pr-3 last:mb-0"
                    style={{
                      gridTemplateColumns:
                        "minmax(150px,1fr) minmax(150px,0.9fr) minmax(130px,0.8fr)",
                    }}
                  >
                    <Input value={typeLabel} readOnly readOnlyPlain />
                    <Input value={recordDate} readOnly readOnlyPlain />
                    <Input value={item.amount} readOnly readOnlyPlain />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {formError ? <ErrorMessage>{formError}</ErrorMessage> : null}
      </div>
    </Modal>
  );
};

const RecordPaymentModal = ({
  open,
  bill,
  form,
  paymentScope,
  paymentableBills,
  fieldErrors,
  formError,
  saving,
  onClose,
  onChange,
  onScopeChange,
  onBillChange,
  onBoatChange,
  onBillToggle,
  onSelectAllBills,
  onShowAllBills,
  onDateFilterChange,
  onSave,
}) => {
  if (!open || !bill) return null;

  const billOptions = paymentableBills.map((record) => ({
    value: String(record.bill_id),
    label: `${record.bill_reference || formatReferenceNumber(record.bill_reference_no)} - ${record.boat_name || "-"}`,
  }));
  const selectedBill = paymentableBills.find((record) => String(record.bill_id) === String(form.bill_id));
  const groupedBoats = new Map();

  paymentableBills.forEach((record) => {
    const key = String(record.boat_id ?? "");
    if (!key) return;
    if (!groupedBoats.has(key)) {
      groupedBoats.set(key, {
        value: key,
        label: record.boat_name || "-",
        boat_name: record.boat_name || "-",
        owner_name: record.owner_name || "-",
        transaction_summary: [],
        amount_due: 0,
        total_paid: 0,
        balance: 0,
        bill_count: 0,
        bills: [],
      });
    }

    const current = groupedBoats.get(key);
    current.bill_count += 1;
    current.amount_due += Number(record.amount_due ?? record.total_amount ?? 0);
    current.total_paid += Number(record.total_paid ?? 0);
    current.balance += Number(record.balance ?? record.total_amount ?? 0);
    current.bills.push(record);
    current.payment_transactions_history = [
      ...(current.payment_transactions_history || []),
      ...(Array.isArray(record.payment_transactions_history)
        ? record.payment_transactions_history.map((payment) => ({
            ...payment,
            bill_reference: record.bill_reference || formatReferenceNumber(record.bill_reference_no),
          }))
        : []),
    ];
    if (record.transaction_summary) {
      current.transaction_summary.push(
        ...String(record.transaction_summary)
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      );
    }
  });

  const boatOptions = Array.from(groupedBoats.values()).map((boat) => ({
    ...boat,
    transaction_summary: [...new Set(boat.transaction_summary)].join(", ") || "-",
    label: `${boat.boat_name} - ${boat.bill_count} bill${boat.bill_count === 1 ? "" : "s"}`,
  }));
  const selectedBoat = boatOptions.find((boat) => String(boat.value) === String(form.boat_id));
  const filteredBoatBills = (selectedBoat?.bills ?? []).filter((record) => {
    const dateValue = String(record.bill_date || record.billing_date || record.created_at || "").slice(0, 10);
    if (form.date_from && dateValue && dateValue < form.date_from) return false;
    if (form.date_to && dateValue && dateValue > form.date_to) return false;
    return true;
  });
  const selectedBills = filteredBoatBills.filter((record) => form.bill_ids.includes(String(record.bill_id)));
  const selectedBillsSummary = selectedBills.length > 0
    ? {
        boat_name: selectedBills[0]?.boat_name || selectedBoat?.boat_name || "-",
        owner_name: selectedBills[0]?.owner_name || selectedBoat?.owner_name || "-",
        transaction_summary: [...new Set(selectedBills.flatMap((record) =>
          String(record.transaction_summary || "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
        ))].join(", ") || "-",
        amount_due: selectedBills.reduce((sum, record) => sum + Number(record.amount_due ?? record.total_amount ?? 0), 0),
        total_paid: selectedBills.reduce((sum, record) => sum + Number(record.total_paid ?? 0), 0),
        balance: selectedBills.reduce((sum, record) => sum + Number(record.balance ?? record.total_amount ?? 0), 0),
        bill_count: selectedBills.length,
        payment_transactions_history: selectedBills.flatMap((record) =>
          Array.isArray(record.payment_transactions_history)
            ? record.payment_transactions_history.map((payment) => ({
                ...payment,
                bill_reference: record.bill_reference || formatReferenceNumber(record.bill_reference_no),
              }))
            : [],
        ),
      }
    : null;
  const paymentSummary = paymentScope === "single_bill" ? selectedBill : selectedBillsSummary;
  const paymentTransactionsHistorySource =
    paymentScope === "selected_bills" ? selectedBoat : paymentSummary;
  const hasPaymentTransactionsHistoryContext = Boolean(paymentTransactionsHistorySource);
  const paymentTransactionsHistoryRows = (Array.isArray(paymentTransactionsHistorySource?.payment_transactions_history)
    ? paymentTransactionsHistorySource.payment_transactions_history
    : [])
    .map((payment, index) => ({
      key: payment.payment_id ?? payment.id ?? `${payment.payment_reference || payment.reference || "payment"}-${index}`,
      reference:
        payment.payment_reference ||
        payment.payment_reference_no ||
        payment.reference_no ||
        payment.reference ||
        "-",
      bill_reference: payment.bill_reference || payment.bill_reference_no || "",
      date: payment.payment_date || payment.date || payment.created_at,
      amount: payment.amount_paid ?? payment.amount ?? payment.total_amount ?? 0,
    }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const allFilteredBillsSelected =
    filteredBoatBills.length > 0 &&
    filteredBoatBills.every((record) => form.bill_ids.includes(String(record.bill_id)));
  const totalAmountToPay = Number(form.amount_paid || 0);

  return (
    <Modal
      title="Payments"
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      saveLabel="Save"
      saveButtonWidth="170px"
      closeButtonWidth="170px"
      maxWidth={BILLING_MODAL_WIDTH}
      minimumSavingMs={0}
      closeOnBackdrop
      bodyClassName="!max-h-[64vh]"
      footerLeftContent={
        <div>
          <p
            className="m-0 text-[11px] font-semibold uppercase"
            style={{ color: "#6F6F82", fontFamily: FONT }}
          >
            Total Amount to Pay
          </p>
          <p
            className="m-0 text-[28px] font-bold leading-tight text-[#1a1f36]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            ₱{totalAmountToPay.toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
      }
    >
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)]">
        <div className="min-w-0 space-y-6">
        <Card icon={IoBoatOutline} title="BILLING DETAILS" subtitle="Select one bill or selected bills for a boat.">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="xl:col-span-2">
              <div className="mb-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => onScopeChange("single_bill")} className={`w-full rounded-[10px] px-4 py-2 text-[13px] font-semibold uppercase transition-colors ${paymentScope === "single_bill" ? "bg-[#1a1f36] text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`} style={{ fontFamily: FONT }}>
                  1 Bill
                </button>
                <button type="button" onClick={() => onScopeChange("selected_bills")} className={`w-full rounded-[10px] px-4 py-2 text-[13px] font-semibold uppercase transition-colors ${paymentScope === "selected_bills" ? "bg-[#1a1f36] text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`} style={{ fontFamily: FONT }}>
                  Select Multiple Bills
                </button>
              </div>

              {paymentScope === "single_bill" ? (
                <>
                  <div>
                    <Label required>Bill Reference</Label>
                    <SelectField value={form.bill_id || undefined} onChange={onBillChange} placeholder="Select or type bill reference" error={Boolean(fieldErrors.bill_id?.[0])} options={billOptions} />
                    {fieldErrors.bill_id?.[0] ? <ErrorMessage>{fieldErrors.bill_id[0]}</ErrorMessage> : null}
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <Label>Boat Name</Label>
                      <Input value={paymentSummary?.boat_name || bill?.boat_name || ""} readOnly />
                    </div>
                    <div>
                      <Label>Boat Owner</Label>
                      <Input value={paymentSummary?.owner_name || bill?.payer_name || ""} readOnly />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label required>Boat Name</Label>
                    <SelectField value={form.boat_id || undefined} onChange={onBoatChange} placeholder="Select boat name" error={Boolean(fieldErrors.boat_id?.[0])} options={boatOptions} />
                    {fieldErrors.boat_id?.[0] ? <ErrorMessage>{fieldErrors.boat_id[0]}</ErrorMessage> : null}
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <Label>Boat Name</Label>
                      <Input value={(paymentSummary?.boat_name || selectedBoat?.boat_name) || ""} readOnly />
                    </div>
                    <div>
                      <Label>Boat Owner</Label>
                      <Input value={(paymentSummary?.owner_name || selectedBoat?.owner_name) || ""} readOnly />
                    </div>
                  </div>

                  {form.boat_id ? (
                    <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6F6F82", fontFamily: FONT }}>Filter by Date Range</p>
                        <button type="button" onClick={() => onShowAllBills(filteredBoatBills)} className="border-none bg-transparent p-0 text-[12px] font-semibold text-blue-600 transition-colors hover:text-blue-700" style={{ fontFamily: FONT }}>Show All</button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <Label>From Date</Label>
                          <DatePicker value={form.date_from || undefined} onChange={(_, dateString) => onDateFilterChange("date_from", dateString)} placeholder="Select a date to filter" options={{ useFiscalYearDefault: false }} containerClassName="w-full" inputClassName="rounded-[10px] border-slate-200 bg-white text-[13px] text-[#1a1f36] focus:border-[#4096ff] focus:ring-0" />
                        </div>
                        <div>
                          <Label>To Date</Label>
                          <DatePicker value={form.date_to || undefined} onChange={(_, dateString) => onDateFilterChange("date_to", dateString)} placeholder="Select a date to filter" options={{ useFiscalYearDefault: false }} containerClassName="w-full" inputClassName="rounded-[10px] border-slate-200 bg-white text-[13px] text-[#1a1f36] focus:border-[#4096ff] focus:ring-0" />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {form.boat_id ? (
                    <div className={`mt-4 rounded-[10px] border bg-slate-50/70 p-4 ${fieldErrors.bill_ids?.[0] ? "border-red-300" : "border-slate-200"}`}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6F6F82", fontFamily: FONT }}>Select Bills</p>
                        <div className="flex items-center gap-3">
                          {selectedBillsSummary ? <p className="m-0 text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>{selectedBillsSummary.bill_count} selected</p> : null}
                          {filteredBoatBills.length > 0 ? (
                            <button type="button" onClick={() => onSelectAllBills(filteredBoatBills, allFilteredBillsSelected)} className="border-none bg-transparent p-0 text-[12px] font-semibold text-blue-600 transition-colors hover:text-blue-700" style={{ fontFamily: FONT }}>
                              {allFilteredBillsSelected ? "Clear All" : "Select All"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="max-h-[268px] space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300" style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}>
                        {filteredBoatBills.length > 0 ? (
                          filteredBoatBills.map((record) => {
                            const isChecked = form.bill_ids.includes(String(record.bill_id));
                            const billDate = String(record.bill_date || record.billing_date || record.created_at || "").slice(0, 10);

                            return (
                              <label key={record.bill_id} className={`flex cursor-pointer items-center justify-between gap-4 rounded-[10px] border px-4 py-3 transition-colors ${isChecked ? "border-[#1a1f36] bg-white" : "border-slate-200 bg-white/90 hover:bg-white"}`}>
                                <div className="flex items-center gap-3">
                                  <input type="checkbox" checked={isChecked} onChange={() => onBillToggle(record.bill_id, filteredBoatBills)} className="h-4 w-4 rounded border-blue-300 text-blue-500 accent-blue-500 focus:ring-blue-500" />
                                  <div>
                                    <p className="m-0 text-[13px] font-semibold text-[#1a1f36]">{record.bill_reference || formatReferenceNumber(record.bill_reference_no)}</p>
                                    <p className="m-0 text-[11px] text-slate-500">{formatDisplayDate(billDate)}</p>
                                  </div>
                                </div>
                                <p className="m-0 text-right text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(record.balance ?? record.total_amount)}</p>
                              </label>
                            );
                          })
                        ) : (
                          <p className="m-0 rounded-[10px] border border-dashed border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-500">No bills found for this boat.</p>
                        )}
                      </div>
                      {fieldErrors.bill_ids?.[0] ? <ErrorMessage>{fieldErrors.bill_ids[0]}</ErrorMessage> : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {paymentSummary ? (
              <div className="xl:col-span-2 rounded-[10px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="space-y-3">
                  {[
                    ["Transactions", paymentSummary.transaction_summary || "-"],
                    ["Total Billed", formatMoney(paymentSummary.amount_due ?? paymentSummary.total_amount)],
                    ["Previously Paid", formatMoney(paymentSummary.total_paid)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-4">
                      <p className="m-0 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6F6F82", fontFamily: FONT }}>{label}</p>
                      <p className="m-0 text-right text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
                    </div>
                  ))}
                  <div className="border-t border-slate-200 pt-3">
                    <div className="flex items-start justify-between gap-4">
                      <p className="m-0 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6F6F82", fontFamily: FONT }}>Balance Due</p>
                      <p className="m-0 text-right text-[16px] font-bold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(paymentSummary.balance ?? paymentSummary.total_amount)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        <Card
          icon={IoDocumentTextOutline}
          title="PAYMENT TRANSACTIONS HISTORY"
          subtitle="Check previous payment references already recorded for this selection."
        >
          {!hasPaymentTransactionsHistoryContext ? (
            <div className="flex min-h-[228px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
              {paymentScope === "selected_bills"
                ? "Select a boat to view payment transaction history."
                : "Select a bill to view payment transaction history."}
            </div>
          ) : paymentTransactionsHistoryRows.length === 0 ? (
            <div className="flex min-h-[228px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
              No payment transactions found for this selection.
            </div>
          ) : (
            <div className="rounded-[10px] border border-slate-200 bg-slate-50/60 p-3">
              <div
                className="mb-2 grid gap-2 px-1 pr-3"
                style={{
                  gridTemplateColumns:
                    "minmax(0,1.1fr) minmax(0,0.9fr) minmax(0,0.8fr)",
                }}
              >
                {["Reference", "Date", "Amount (PHP)"].map((label) => (
                  <p key={label} className="m-0 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#6F6F82", fontFamily: FONT }}>
                    {label}
                  </p>
                ))}
              </div>
              <div className="max-h-[268px] space-y-2 overflow-y-auto pr-1">
                {paymentTransactionsHistoryRows.map((row) => (
                  <div
                    key={row.key}
                    className="grid items-start gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2.5"
                    style={{
                      gridTemplateColumns:
                        "minmax(0,1.1fr) minmax(0,0.9fr) minmax(0,0.8fr)",
                    }}
                  >
                    <p className="m-0 min-w-0 truncate text-[13px] font-semibold text-[#1a1f36]">{row.reference}</p>
                    <p className="m-0 min-w-0 truncate text-[13px] font-medium text-[#1a1f36]">{formatShortDisplayDate(row.date)}</p>
                    <p className="m-0 min-w-0 truncate text-left text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(row.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
        </div>

        <Card icon={IoCashOutline} title="PAYMENT DETAILS" subtitle="Create a payment entry for the selected bill." className="min-w-0 xl:min-h-[520px]">
          <div className="space-y-4">
            <div>
              <Label required>Payment Method</Label>
              <Input value="Cash" readOnly />
            </div>
            <div>
              <Label required>Official Receipt No.</Label>
              <Input value={form.official_receipt_no} onChange={(event) => onChange({ official_receipt_no: normalizeOfficialReceiptNo(event.target.value) })} placeholder="Enter official receipt number" error={Boolean(fieldErrors.official_receipt_no?.[0])} />
              {fieldErrors.official_receipt_no?.[0] ? <ErrorMessage>{fieldErrors.official_receipt_no[0]}</ErrorMessage> : null}
            </div>
            <div>
              <Label required>Amount (₱)</Label>
              <Input value={form.amount_paid} onChange={(event) => onChange({ amount_paid: event.target.value })} placeholder="0.00" error={Boolean(fieldErrors.amount_paid?.[0])} />
              {fieldErrors.amount_paid?.[0] ? <ErrorMessage>{fieldErrors.amount_paid[0]}</ErrorMessage> : null}
            </div>
            <div>
              <Label>Remarks</Label>
              <textarea value={form.remarks} onChange={(event) => onChange({ remarks: event.target.value })} placeholder="Add payment remarks" className="min-h-[96px] w-full resize-none rounded-[10px] border border-slate-200 px-3.5 py-3 text-[13px] outline-none focus:border-[#4096ff]" style={{ fontFamily: FONT, color: "#0d1117" }} />
            </div>
            {formError ? <p className="m-0 text-[12px] font-normal text-red-500">{formError}</p> : null}
          </div>
        </Card>
      </div>
    </Modal>
  );
};

const PayBillPromptModal = ({ open, saving, onClose, onYes, onNo }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(10,13,28,0.55)", backdropFilter: "blur(6px)" }}
      onMouseDown={(event) => {
        if (!saving && event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className="relative bg-white w-full overflow-hidden"
        style={{
          maxWidth: 400,
          borderRadius: 20,
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          fontFamily: FONT,
          animation: "modalPop 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <style>{`@keyframes modalPop{from{opacity:0;transform:scale(0.92) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border-none bg-transparent text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Close"
        >
          <IoCloseOutline className="text-[22px]" />
        </button>
        <div className="px-6 pt-8 pb-5 flex flex-col items-center text-center">
          <div className="mb-5 flex items-center justify-center" style={{ width: 68, height: 68, borderRadius: 18, backgroundColor: "#eff6ff" }}>
            <IoCashOutline style={{ fontSize: 36, color: "#2563eb" }} />
          </div>
          <p className="m-0 text-[18px] font-bold mb-2" style={{ color: "#0d1117" }}>
            Do you want to pay this bill?
          </p>
          <p className="m-0 text-[15px] leading-relaxed" style={{ color: "#64748b" }}>
            Choose Yes to continue to payment after saving, or No to generate the bill only.
          </p>
        </div>
        <div className="px-6 pb-8 flex gap-3">
          <button
            onClick={onNo}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] font-semibold cursor-pointer hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-70"
            style={{ fontFamily: FONT, color: "#1a1f36" }}
          >
            <IoCloseOutline className="text-[16px]" />
            No
          </button>
          <button
            onClick={onYes}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            style={{
              fontFamily: FONT,
              backgroundColor: saving ? "#1a1f36" : "#1a1f36",
              border: "none",
              opacity: saving ? 0.7 : 1,
            }}
            onMouseEnter={(event) => {
              if (!saving) event.currentTarget.style.backgroundColor = "#2d3561";
            }}
            onMouseLeave={(event) => {
              if (!saving) event.currentTarget.style.backgroundColor = "#1a1f36";
            }}
          >
            {saving ? <Spinner size={4} /> : (
              <>
                <IoCheckmarkOutline className="text-[16px]" />
                Yes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const EditPaymentModal = ({ open, payment, form, errors, saving, onClose, onChange, onSave }) => {
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
          {errors.official_receipt_no ? <ErrorMessage>{errors.official_receipt_no}</ErrorMessage> : null}
        </div>
        <div>
          <Label>Remarks</Label>
          <textarea
            value={form.remarks}
            onChange={(event) => onChange({ remarks: event.target.value })}
            placeholder="Add payment remarks"
            className="min-h-[120px] w-full resize-none rounded-[10px] border border-slate-200 px-4 py-3 text-[14px] outline-none focus:border-[#4096ff]"
            style={{ fontFamily: FONT, color: "#0d1117" }}
          />
        </div>
      </div>
    </Modal>
  );
};

const PaymentDetailsDrawer = ({ payment, open, onClose }) => {
  if (!payment) return null;

  const statusLabel = payment.status
    ? String(payment.status).charAt(0).toUpperCase() + String(payment.status).slice(1)
    : "-";
  const paymentTransactionsHistoryRows = (
    Array.isArray(payment.payment_transactions_history)
      ? payment.payment_transactions_history
      : Array.isArray(payment.payment_history)
        ? payment.payment_history
        : Array.isArray(payment.transactions_history)
          ? payment.transactions_history
          : []
  )
    .map((row, index) => ({
      key: row.payment_id ?? row.id ?? `${row.payment_reference || row.reference || "payment"}-${index}`,
      reference:
        row.payment_reference ||
        row.payment_reference_no ||
        row.reference_no ||
        row.reference ||
        "-",
      date: row.payment_date || row.date || row.created_at,
      amount: row.amount_paid ?? row.amount ?? row.total_amount ?? 0,
    }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

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
          <DrawerInfoCard label="Payment Reference No." value={payment.payment_reference || "-"} />
          <DrawerInfoCard
            label="Status"
            value={statusLabel}
            indicatorColor={payment.status === "paid" ? "#16a34a" : "#f59e0b"}
          />
          <DrawerInfoCard label="Official Receipt No." value={payment.official_receipt_no || "-"} />
          <DrawerInfoCard label="Payment Method" value={payment.payment_method_label || payment.payment_method || "-"} />
          <DrawerInfoCard label="Payment Date" value={formatDisplayDate(payment.payment_date)} />
          <DrawerInfoCard label="Remarks" value={payment.remarks || "-"} />
          <DrawerInfoCard label="Total Amount" value={formatMoney(payment.total_amount)} className="sm:col-span-2" />
          <DrawerInfoCard label="Amount Paid" value={formatMoney(payment.amount_paid)} />
          <DrawerInfoCard label="Balance Due" value={formatMoney(payment.balance)} />
        </div>
      </DrawerSection>

      <DrawerSection
        icon={IoBoatOutline}
        title="Billing Details"
        subtitle="Boat and bill context."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DrawerInfoCard label="Bill Reference No." value={payment.bill_reference || "-"} />
          <DrawerInfoCard label="Boat Name" value={payment.boat_name || "-"} />
          <DrawerInfoCard label="Boat Type" value={payment.boat_type || "-"} />
          <DrawerInfoCard label="Boat Owner" value={payment.owner_name || "-"} />
        </div>
      </DrawerSection>

      <DrawerSection
        icon={IoDocumentTextOutline}
        title="PAYMENT TRANSACTIONS HISTORY"
        subtitle="Previous payment references for this bill."
      >
        {paymentTransactionsHistoryRows.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
            No payment transactions found for this bill.
          </div>
        ) : (
          <div className="rounded-[10px] border border-slate-200 bg-slate-50/60 p-3">
            <div
              className="mb-2 grid gap-2 px-1 pr-3"
              style={{ gridTemplateColumns: "minmax(140px,1fr) minmax(130px,0.9fr) minmax(110px,0.8fr)" }}
            >
              {["Reference", "Date", "Amount (\u20B1)"].map((label) => (
                <p key={label} className="m-0 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#6F6F82", fontFamily: FONT }}>
                  {label}
                </p>
              ))}
            </div>
            <div className="space-y-2 pr-1">
              {paymentTransactionsHistoryRows.map((row) => (
                <div
                  key={row.key}
                  className="grid items-start gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2.5"
                  style={{ gridTemplateColumns: "minmax(140px,1fr) minmax(130px,0.9fr) minmax(110px,0.8fr)" }}
                >
                  <p className="m-0 text-[13px] font-semibold text-[#1a1f36]">{row.reference}</p>
                  <p className="m-0 text-[13px] font-medium text-[#1a1f36]">{formatShortDisplayDate(row.date)}</p>
                  <p className="m-0 text-left text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {Number(row.amount || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
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

const buildBillPayload = (form) => ({
  boat_id: Number(form.boat_id),
  items: form.items
    .filter((item) => item.record_id)
    .map((item) => {
      const payload = {
        transaction_type: item.transaction_type,
        amount: Number(item.amount || 0),
      };

      if (item.transaction_type === "docking")
        payload.docking_id = Number(item.record_id);
      if (item.transaction_type === "banyera")
        payload.banyera_id = Number(item.record_id);

      return payload;
    }),
});

const normalizeBillPayloadForComparison = (payload) =>
  JSON.stringify({
    boat_id: Number(payload?.boat_id || 0),
    items: [...(payload?.items ?? [])]
      .map((item) => ({
        transaction_type: item.transaction_type,
        amount: Number(item.amount || 0),
        docking_id: item.docking_id ? Number(item.docking_id) : null,
        banyera_id: item.banyera_id ? Number(item.banyera_id) : null,
      }))
      .sort((a, b) =>
        `${a.transaction_type}-${a.docking_id ?? ""}-${a.banyera_id ?? ""}-${a.amount}`.localeCompare(
          `${b.transaction_type}-${b.docking_id ?? ""}-${b.banyera_id ?? ""}-${b.amount}`,
        ),
      ),
  });

const getRequestErrorMessage = (error, fallbackMessage) => {
  const responseData = error?.response?.data;
  const fieldErrors = responseData?.errors;

  if (fieldErrors && typeof fieldErrors === "object") {
    const firstError = Object.values(fieldErrors).flat()[0];
    if (firstError) return firstError;
  }

  return responseData?.message || fallbackMessage;
};

const buildDateFromParts = (year, month, day) => {
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
};

const getTodayManilaDate = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
};

const bumpBillingTodayPaymentStats = (queryClient, paymentDate, paymentCount = 1) => {
  if (paymentDate !== getTodayManilaDate() || paymentCount <= 0) return;

  queryClient.setQueriesData({ queryKey: ["billing-data"] }, (current) => {
    if (!current?.stats) return current;

    return {
      ...current,
      stats: {
        ...current.stats,
        today_payments: Number(current.stats.today_payments ?? 0) + paymentCount,
      },
    };
  });
};

const patchBillingRecordInCache = (queryClient, nextBill) => {
  if (!nextBill?.bill_id) return;

  queryClient.setQueriesData({ queryKey: ["billing-data"] }, (current) => {
    if (!current?.bills) return current;

    const nextBillId = String(nextBill.bill_id);
    const hasBill = current.bills.some((bill) => String(bill.bill_id) === nextBillId);
    const bills = hasBill
      ? current.bills.map((bill) =>
          String(bill.bill_id) === nextBillId
            ? { ...bill, ...nextBill }
            : bill,
        )
      : [nextBill, ...current.bills];

    return {
      ...current,
      bills,
    };
  });
};

const getInitialPaymentModalForm = (bill = null) => ({
  bill_id: bill?.bill_id ? String(bill.bill_id) : "",
  boat_id: bill?.boat_id ? String(bill.boat_id) : "",
  bill_ids: bill?.bill_id ? [String(bill.bill_id)] : [],
  payment_method: "cash",
  official_receipt_no: "",
  payment_date: getTodayManilaDate(),
  amount_paid: bill ? String(Number(bill.balance ?? bill.total_amount ?? 0).toFixed(2)) : "",
  remarks: "",
  date_from: "",
  date_to: "",
});

const normalizeOfficialReceiptNo = (value) =>
  String(value ?? "").replace(/\D/g, "").slice(0, 7);

const validateOfficialReceiptNo = (value) => {
  const normalized = normalizeOfficialReceiptNo(value);
  if (!normalized) return "Official Receipt No. is required.";
  if (normalized.length !== 7) return "Official Receipt No. must be exactly 7 digits.";
  return "";
};

const normalizeDateValue = (value) => {
  const parts = getDatePartsFromValue(value);
  if (!parts) return "";

  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  ) {
    return "";
  }

  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
};

const buildDateFieldPatch = (prefix, value) => {
  const normalizedValue = normalizeDateValue(value);

  if (!normalizedValue) {
    return {
      [prefix]: "",
      [`${prefix}_month`]: "",
      [`${prefix}_day`]: "",
      [`${prefix}_year`]: "",
    };
  }

  const [year = "", month = "", day = ""] = normalizedValue
    .slice(0, 10)
    .split("-");

  return {
    [prefix]: `${year}-${month}-${day}`,
    [`${prefix}_month`]: month,
    [`${prefix}_day`]: day,
    [`${prefix}_year`]: year,
  };
};

const getDateParts = (value) => {
  if (!value) return { year: "", month: "", day: "" };

  return {
    year: String(value).slice(0, 4),
    month: String(value).slice(5, 7),
    day: String(value).slice(8, 10),
  };
};

const getBillItemRawDate = (item, fallbackDate = "") =>
  String(getBillItemDisplayDate(item, fallbackDate) || "").slice(0, 10);

const buildFormFromBill = (bill) => {
  return {
    bill_reference_no: String(bill?.bill_reference_no ?? ""),
    reference_number: formatReferenceNumber(bill?.bill_reference_no),
    boat_id: String(bill?.boat_id ?? ""),
    ...buildDateFieldPatch("date_from", ""),
    ...buildDateFieldPatch("date_to", ""),
    items:
      bill?.items?.length > 0
        ? bill.items.map((item) => ({
            transaction_type: item.transaction_type,
            record_id: String(
              item.transaction_type === "docking"
                ? (item.docking_id ?? "")
                : (item.banyera_id ?? ""),
            ),
            amount:
              item.amount !== undefined && item.amount !== null
                ? String(item.amount)
                : "",
            sortDate: getBillItemRawDate(item, bill?.created_at),
          }))
        : [getInitialBillingItem()],
  };
};

const getBoatLabel = (boat) => {
  if (!boat) return "Unknown boat";
  const ownerName = boat.owner?.full_name ? ` - ${boat.owner.full_name}` : "";
  return `${boat.boat_name}${ownerName}`;
};

const isDateWithinRange = (value, dateFrom, dateTo) => {
  const normalizedValue = normalizeDateValue(value);
  if (!normalizedValue) return false;

  const hasStartDate = Boolean(dateFrom);
  const hasEndDate = Boolean(dateTo);

  if (!hasStartDate && !hasEndDate) return true;
  if (hasStartDate && normalizedValue < dateFrom) return false;
  if (hasEndDate && normalizedValue > dateTo) return false;
  return true;
};

const filterBillsByPeriod = (records, period) => {
  if (period === "all") return records;

  const todayStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
  const now = new Date(`${todayStr}T00:00:00`);

  if (period === "today") {
    return records.filter(
      (record) => String(record.created_at || "").slice(0, 10) === todayStr,
    );
  }

  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return records.filter((record) => {
      const date = new Date(record.created_at);
      return !Number.isNaN(date.getTime()) && date >= start && date <= now;
    });
  }

  if (period === "month") {
    return records.filter((record) => {
      const date = new Date(record.created_at);
      return (
        !Number.isNaN(date.getTime()) &&
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      );
    });
  }

  if (period === "year") {
    return records.filter((record) => {
      const date = new Date(record.created_at);
      return (
        !Number.isNaN(date.getTime()) &&
        date.getFullYear() === now.getFullYear()
      );
    });
  }

  return records;
};

const printPdfFile = (fileUrl) => {
  if (!fileUrl) return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  iframe.src = fileUrl;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };
};

const printPreloadedPdfFrame = (iframe) => {
  if (!iframe?.contentWindow) return false;

  try {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    return true;
  } catch (error) {
    console.error("Failed to print preloaded billing statement PDF", error);
    return false;
  }
};

const downloadPdfFile = (fileUrl, filename) => {
  if (!fileUrl) return;

  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const TailDropdown = ({ value, onChange, options, height = 42, width = 160 }) => (
  <FilterButton
    {...BILLING_FILTER_DROPDOWN_PROPS}
    value={value}
    onChange={onChange}
    options={options}
    height={height}
    width={width}
  />
);

const SuperBilling = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const queryClient = useQueryClient();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } =
    useSidebar();
  const [contentMargin, setContentMargin] = useState(() =>
    window.innerWidth >= 1024 ? 256 : 0,
  );
  const [activeItem, setActiveItem] = useState("Bills");
  const activeTab = getBillingTabFromLocation({ pathname: location.pathname, search: location.search });
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [requestedPage, setRequestedPage] = useState(1);
  const currentPage = useDebouncedValue(requestedPage, 150);
  const [periodFilter, setPeriodFilter] = useState("all");
  const [paymentSearch, setPaymentSearch] = useState("");
  const debouncedPaymentSearch = useDebouncedValue(paymentSearch, 350);
  const [paymentRequestedPage, setPaymentRequestedPage] = useState(1);
  const currentPaymentPage = useDebouncedValue(paymentRequestedPage, 150);
  const [paymentPeriodFilter, setPaymentPeriodFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [billingForm, setBillingForm] = useState(getInitialBillingForm);
  const pendingCreateBillingScrollRef = useRef(null);
  const unbilledTransactionsRef = useRef(null);
  const billedTransactionsHistoryRef = useRef(null);
  const prevBoatIdRef = useRef(null);
  const selectedBillId = searchParams.get("bill") ?? "";
  const rawHighlightedBillId = getBillingHighlightId({ highlightedSearchResult, search: location.search });
  const rawHighlightedPaymentId = getPaymentHighlightId({ highlightedSearchResult, search: location.search });
  const highlightToken = rawHighlightedBillId
    ? `${rawHighlightedBillId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : rawHighlightedPaymentId
      ? `${rawHighlightedPaymentId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedBillId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedBillId;
  const highlightedPaymentId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedPaymentId;
  const [selectedBillPdfLoading, setSelectedBillPdfLoading] = useState(false);
  const [selectedBillPdfFile, setSelectedBillPdfFile] = useState(null);
  const [selectedBillPdfReady, setSelectedBillPdfReady] = useState(false);
  const selectedBillPrintFrameRef = useRef(null);
  const [selectedBillSnapshot, setSelectedBillSnapshot] = useState(null);
  const [editingBillId, setEditingBillId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitMode, setSubmitMode] = useState(null);
  const [formError, setFormError] = useState("");
  const [paymentModalBill, setPaymentModalBill] = useState(null);
  const [paymentModalForm, setPaymentModalForm] = useState(getInitialPaymentModalForm);
  const [paymentModalScope, setPaymentModalScope] = useState("single_bill");
  const [paymentModalFieldErrors, setPaymentModalFieldErrors] = useState({});
  const [paymentModalFormError, setPaymentModalFormError] = useState("");
  const [showCreateBillingModal, setShowCreateBillingModal] = useState(false);
  const [breakdownBill, setBreakdownBill] = useState(null);
  const [breakdownBanyera, setBreakdownBanyera] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [detailPayment, setDetailPayment] = useState(null);
  const [editPaymentForm, setEditPaymentForm] = useState({ official_receipt_no: "", remarks: "" });
  const [editPaymentErrors, setEditPaymentErrors] = useState({});
  const [showPayBillPrompt, setShowPayBillPrompt] = useState(false);

  const navigateBillingTab = React.useCallback((nextTab, options = {}) => {
    const nextPath = getBillingTabPath(nextTab);
    cacheTab(BILLING_TAB_STORAGE_KEY, BILLING_PATH_TABS[nextPath] ?? nextTab, BILLING_TAB_KEYS);

    if (location.pathname !== nextPath || location.search) {
      navigate(nextPath, {
        replace: options.replace ?? location.pathname === nextPath,
        state: options.state ?? null,
      });
    }
  }, [location.pathname, location.search, navigate]);
  const activeTabKey = BILLING_PATH_TABS[activeTab] ?? "records";
  useEffect(() => {
    cacheTab(BILLING_TAB_STORAGE_KEY, activeTabKey, BILLING_TAB_KEYS);

    if (location.pathname === BILLING_TAB_PATHS.records && activeTab !== location.pathname) {
      navigate(activeTab, { replace: true, state: location.state });
    }
  }, [activeTab, activeTabKey, location.pathname, location.state, navigate]);
  const isRecordsTab = activeTabKey === "records";
  const isPaymentsTab = activeTabKey === "payments";
  const isCreateBillingActive = showCreateBillingModal;
  const isEditBillingActive = Boolean(editingBillId);
  const isBillingFormActive = isCreateBillingActive || isEditBillingActive;
  const breadcrumbLabel = isPaymentsTab ? "Payments" : "Billing";
  const selectedBillingBoatId = String(billingForm.boat_id || "");
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const isHeadViewOnly = isHeadRole();

  const { data, isLoading, isFetching, isError, refetch } = useBillingDataQuery({
    page: currentPage,
    perPage: PAGE_SIZE,
    search: debouncedSearch,
    status: "all",
    period: periodFilter,
    highlightBillId: highlightedBillId,
    paginated: true,
    includeBoats: false,
  }, {
    enabled: isRecordsTab || Boolean(selectedBillId) || Boolean(highlightedBillId),
  });
  const boatsQuery = useBillingBoatsQuery();
  const formLookupsQuery = useBillingFormLookupsQuery(
    { boatId: selectedBillingBoatId },
    {
      enabled: !isHeadViewOnly && isBillingFormActive && Boolean(selectedBillingBoatId),
      placeholderData: undefined,
    },
  );
  const createFormBillsQuery = useBillingDataQuery({
    status: "all",
    period: "all",
    boat: selectedBillingBoatId || "all",
    sort: "created_at_desc",
    paginated: false,
    includeBoats: false,
  }, {
    enabled: !isHeadViewOnly && isBillingFormActive && Boolean(selectedBillingBoatId),
    placeholderData: undefined,
  });
  const paymentsQuery = useBillingPaymentsQuery(
    { billId: selectedBillId },
    {
      enabled: Boolean(selectedBillId),
    },
  );
  const paymentRecordsQuery = usePaymentsDataQuery(
    {
      page: currentPaymentPage,
      perPage: PAGE_SIZE,
      search: debouncedPaymentSearch,
      period: paymentPeriodFilter,
      status: paymentStatusFilter,
      paginated: true,
      includePayments: true,
      includeFormData: false,
      highlightPaymentId: highlightedPaymentId,
    },
    {
      enabled: isPaymentsTab,
    },
  );
  const paymentFormLookupsQuery = usePaymentFormLookupsQuery({
    enabled: !isHeadViewOnly && Boolean(paymentModalBill),
  });

  const bills = data?.bills ?? [];
  const billsMeta = data?.billsMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const boats = boatsQuery.data ?? [];
  const dockings = formLookupsQuery.data?.dockings ?? [];
  const banyeraTransactions = formLookupsQuery.data?.banyeraTransactions ?? [];
  const payments = paymentsQuery.data ?? [];
  const paymentRecordsData = paymentRecordsQuery.data;
  const paymentRecords = paymentRecordsData?.payments ?? [];
  const paymentRecordsMeta = paymentRecordsData?.paymentsMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const defaultBillingStats = { total_records: 0, total_payment_records: 0, today_records: 0, today_payments: 0 };
  const billingStats = (
    isPaymentsTab
      ? paymentRecordsData?.stats
      : data?.stats
  ) ?? paymentRecordsData?.stats ?? data?.stats ?? defaultBillingStats;
  const billedHistoryBills = createFormBillsQuery.data?.bills ?? [];
  const paymentableBills = useMemo(() => {
    const records = paymentFormLookupsQuery.data?.paymentableBills ?? [];
    if (!paymentModalBill?.bill_id) return records;

    const hasModalBill = records.some((bill) => String(bill.bill_id) === String(paymentModalBill.bill_id));
    if (hasModalBill) return records;

    return [
      {
        ...paymentModalBill,
        bill_reference: formatReferenceNumber(paymentModalBill.bill_reference_no),
        amount_due: Number(paymentModalBill.total_amount || 0),
        total_paid: 0,
        balance: Number(paymentModalBill.balance ?? paymentModalBill.total_amount ?? 0),
        transaction_summary: paymentModalBill.transaction_summary || "-",
      },
      ...records,
    ];
  }, [paymentFormLookupsQuery.data?.paymentableBills, paymentModalBill]);
  const isBoatBillingDataLoading =
    Boolean(selectedBillingBoatId) &&
    ((!formLookupsQuery.data && formLookupsQuery.isFetching) ||
      (!createFormBillsQuery.data && createFormBillsQuery.isFetching));

  useEffect(() => {
    setActiveItem("Bills");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryTab = params.get("tab");
    const queryTabPath = BILLING_TAB_PATHS[queryTab];

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

  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) {
      setContentMargin(sidebarCollapsed ? 72 : 256);
    } else if (window.innerWidth < 1024) {
      setContentMargin(0);
    }
  }, [sidebarCollapsed, sidebarOpen]);

  useEffect(() => {
    setRequestedPage(1);
  }, [debouncedSearch, periodFilter]);

  useEffect(() => {
    if (!selectedBillId) return;
    if (!isRecordsTab || location.pathname !== getBillingTabPath("records")) {
      navigateBillingTab("records", { replace: true, state: location.state });
    }
  }, [isRecordsTab, location.pathname, location.state, navigateBillingTab, selectedBillId]);

  const openBillingStatement = (bill) => {
    const billId = typeof bill === "object" ? bill?.bill_id : bill;
    if (typeof bill === "object" && bill) {
      setSelectedBillSnapshot(bill);
    }

    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.set("bill", String(billId));
      return nextParams;
    });
  };

  const closeBillingDetails = () => {
    setSelectedBillSnapshot(null);
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.delete("bill");
      return nextParams;
    });
  };

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

  const clearBillingStatement = () => {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.delete("bill");
      return nextParams;
    });
  };

  const openPaymentModalForBill = (bill) => {
    if (isHeadViewOnly) return;
    if (!bill?.bill_id) return;
    const sourceBill = {
      ...bill,
      balance: Number(bill.balance ?? bill.total_amount ?? 0),
      boat_name: bill.boat_name || boatMap[String(bill.boat_id)]?.boat_name || "",
      payer_name: bill.payer_name || boatMap[String(bill.boat_id)]?.owner?.full_name || "",
    };
    setPaymentModalBill(sourceBill);
    setPaymentModalForm(getInitialPaymentModalForm(sourceBill));
    setPaymentModalScope("single_bill");
    setPaymentModalFieldErrors({});
    setPaymentModalFormError("");
  };

  const openRecordPaymentModal = () => {
    if (isHeadViewOnly) return;

    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    setPaymentModalBill({});
    setPaymentModalForm(getInitialPaymentModalForm());
    setPaymentModalScope("single_bill");
    setPaymentModalFieldErrors({});
    setPaymentModalFormError("");
  };

  const openCreateBillingModal = () => {
    if (isHeadViewOnly) return;

    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    setBillingForm(getInitialBillingForm());
    setFieldErrors({});
    setEditingBillId(null);
    setFormError("");
    setSubmitMode(null);
    setBreakdownBill(null);
    setBreakdownBanyera(null);
    setShowCreateBillingModal(true);
  };

  const closeCreateBillingModal = () => {
    if (isSaving) return;

    setShowCreateBillingModal(false);
    setBillingForm(getInitialBillingForm());
    setFieldErrors({});
    setEditingBillId(null);
    setFormError("");
    setSubmitMode(null);
    setBreakdownBill(null);
    setBreakdownBanyera(null);
  };

  const boatMap = useMemo(
    () =>
      boats.reduce((acc, boat) => {
        acc[String(boat.boat_id)] = boat;
        return acc;
      }, {}),
    [boats],
  );

  const overviewCards = useMemo(() => {
    return [
      {
        title: "Total Billing Records",
        value: billingStats.total_records,
        icon: IoReceiptOutline,
        tone: "navy",
      },
      {
        title: "Total Payment Records",
        value: billingStats.total_payment_records,
        icon: IoCashOutline,
        tone: "green",
      },
      {
        title: "Today's Bill",
        value: billingStats.today_records,
        icon: IoCalendarOutline,
        tone: "amber",
      },
      {
        title: "Today's Payment",
        value: billingStats.today_payments,
        icon: IoCashOutline,
        tone: "green",
      },
    ];
  }, [billingStats]);

  const billHasPayments = (bill) =>
    Boolean(bill?.has_payments) || Number(bill?.payments_count ?? 0) > 0;

  const totalPages = Math.max(1, Number(billsMeta.last_page || 1));
  const safePage = Math.min(requestedPage, totalPages);
  const paginatedRecords = bills;
  const billsTotal = Number(billsMeta.total ?? 0);
  const hasBillsResponse = Boolean(data?.billsMeta);
  const paymentRecordsTotalPages = Math.max(1, Number(paymentRecordsMeta.last_page || 1));
  const safePaymentPage = Math.min(paymentRequestedPage, paymentRecordsTotalPages);
  const paymentRecordsTotal = Number(paymentRecordsMeta.total ?? 0);
  const hasPaymentRecordsResponse = Boolean(paymentRecordsData?.paymentsMeta);
  const showInitialSkeleton = !isError && isLoading && !data;
  const showPaymentRecordsSkeleton = !paymentRecordsQuery.isError && paymentRecordsQuery.isLoading && !paymentRecordsData;
  const showBillsEmptyState = hasBillsResponse && billsTotal === 0;
  const showPaymentRecordsEmptyState = hasPaymentRecordsResponse && paymentRecordsTotal === 0;
  const isActiveTabLoading = isPaymentsTab ? showPaymentRecordsSkeleton : showInitialSkeleton;
  const hasOverviewStats = Boolean(data?.stats || paymentRecordsData?.stats);
  const showPageShellSkeleton = isActiveTabLoading && !hasOverviewStats;
  const hasActiveTableFilters =
    debouncedSearch || periodFilter !== "all";
  const hasActivePaymentTableFilters =
    debouncedPaymentSearch || paymentPeriodFilter !== "all" || paymentStatusFilter !== "all";

  const requestBillingPage = (pageOrUpdater) => {
    clearUniversalHighlight();

    setRequestedPage((page) => {
      const nextPage = typeof pageOrUpdater === "function" ? pageOrUpdater(page) : pageOrUpdater;
      const boundedPage = Math.min(Math.max(1, Number(nextPage) || 1), totalPages);

      if (boundedPage !== page) {
        void queryClient.cancelQueries({ queryKey: ["billing-data"], type: "active" });
      }

      return boundedPage;
    });
  };

  useEffect(() => {
    if (requestedPage > totalPages) setRequestedPage(totalPages);
  }, [requestedPage, totalPages]);

  useEffect(() => {
    const resolvedPage = Number(paymentRecordsMeta.current_page || 0);
    if (highlightedPaymentId && resolvedPage && resolvedPage !== paymentRequestedPage) {
      setPaymentRequestedPage(resolvedPage);
    }
  }, [highlightedPaymentId, paymentRecordsMeta.current_page, paymentRequestedPage]);

  useEffect(() => {
    if (paymentRequestedPage > paymentRecordsTotalPages) setPaymentRequestedPage(paymentRecordsTotalPages);
  }, [paymentRequestedPage, paymentRecordsTotalPages]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("highlight")?.startsWith("bill-")) {
      setRequestedPage(1);
    }
  }, [location.search]);

  useEffect(() => {
    if (!highlightedBillId) return;
    const resolvedPage = Number(billsMeta.current_page || 0);
    if (resolvedPage > 0 && resolvedPage !== requestedPage) {
      setRequestedPage(resolvedPage);
    }
  }, [billsMeta.current_page, highlightedBillId, requestedPage]);

  const editingBillRecord = useMemo(
    () =>
      editingBillId
        ? bills.find((bill) => String(bill.bill_id) === String(editingBillId)) ??
          null
        : null,
    [bills, editingBillId],
  );

  useEffect(() => {
    if (!editingBillId) return undefined;

    const echo = getEcho();
    if (!echo) return undefined;

    let cancelled = false;
    const channel = echo.channel("transactions");

    const syncEditedBillingRecord = async (payload) => {
      if (payload?.type !== "billing") return;

      const eventRecord = payload.record ?? {};
      if (String(eventRecord.bill_id ?? "") !== String(editingBillId)) return;

      try {
        const nextBill = Array.isArray(eventRecord.items)
          ? eventRecord
          : (await api.get(`/bills/${editingBillId}`)).data;

        if (cancelled || !nextBill?.bill_id) return;

        patchBillingRecordInCache(queryClient, nextBill);
        setBillingForm(buildFormFromBill(nextBill));
        setFieldErrors({});
        setFormError("");
      } catch (error) {
        console.error("Failed to sync edited billing record from Pusher:", error);
      }
    };

    channel.listen(".updated", syncEditedBillingRecord);

    return () => {
      cancelled = true;
      channel.stopListening(".updated", syncEditedBillingRecord);
    };
  }, [editingBillId, queryClient]);

  const isActiveBillingLookupRecord = (record) => {
    const status = String(record?.status ?? "").toLowerCase();
    const isVoided = Boolean(record?.is_voided || record?.voided_at || status === "voided");
    return !isVoided;
  };

  const availableRecordsByType = useMemo(
    () => ({
      docking: (dockings ?? [])
        .filter(isActiveBillingLookupRecord)
        .map((record) => ({
          value: String(record.docking_id),
          label: `${record.boat?.boat_name ?? "Unknown boat"} - ${formatDisplayDate(record.docking_date)}`,
          amount: Number(record.docking_fee || 0),
          boatId: String(record.boat_id ?? ""),
          sortDate: String(record.docking_date || ""),
          isBilled: Boolean(record.is_billed),
          record,
        })),
      banyera: (banyeraTransactions ?? [])
        .filter(isActiveBillingLookupRecord)
        .map((record) => ({
          value: String(record.banyera_id),
          label: `${record.boat?.boat_name ?? "Unknown boat"} - ${formatDisplayDate(record.transaction_date)}`,
          amount: Number(record.total_fee || 0),
          boatId: String(record.boat_id ?? ""),
          sortDate: String(record.transaction_date || ""),
          isBilled: Boolean(record.is_billed),
          record,
        })),
    }),
    [banyeraTransactions, dockings],
  );

  const buildLookupRecordsByType = (lookups = {}) => ({
    docking: (lookups.dockings ?? [])
      .filter(isActiveBillingLookupRecord)
      .map((record) => ({
        value: String(record.docking_id),
        label: `${record.boat?.boat_name ?? "Unknown boat"} - ${formatDisplayDate(record.docking_date)}`,
        amount: Number(record.docking_fee || 0),
        boatId: String(record.boat_id ?? ""),
        sortDate: String(record.docking_date || ""),
        isBilled: Boolean(record.is_billed),
        record,
      })),
    banyera: (lookups.banyeraTransactions ?? [])
      .filter(isActiveBillingLookupRecord)
      .map((record) => ({
        value: String(record.banyera_id),
        label: `${record.boat?.boat_name ?? "Unknown boat"} - ${formatDisplayDate(record.transaction_date)}`,
        amount: Number(record.total_fee || 0),
        boatId: String(record.boat_id ?? ""),
        sortDate: String(record.transaction_date || ""),
        isBilled: Boolean(record.is_billed),
        record,
      })),
  });

  const buildBilledRecordIds = (recordsByType = {}, activeEditingBillRecord = null) => {
    const editingIds = (activeEditingBillRecord?.items ?? []).reduce(
      (acc, item) => {
        if (item.docking_id) acc.docking.add(String(item.docking_id));
        if (item.banyera_id) acc.banyera.add(String(item.banyera_id));

        return acc;
      },
      {
        docking: new Set(),
        banyera: new Set(),
      },
    );

    return {
      docking: new Set(
        (recordsByType.docking ?? [])
          .filter((record) => record.isBilled && !editingIds.docking.has(String(record.value)))
          .map((record) => String(record.value)),
      ),
      banyera: new Set(
        (recordsByType.banyera ?? [])
          .filter((record) => record.isBilled && !editingIds.banyera.has(String(record.value)))
          .map((record) => String(record.value)),
      ),
    };
  };

  const billedRecordIds = useMemo(() => buildBilledRecordIds(availableRecordsByType, editingBillRecord), [availableRecordsByType, editingBillRecord]);

  const buildBoatBillingItems = (
    boatId,
    dateFrom = "",
    dateTo = "",
    options = {},
  ) => {
    try {
      const normalizedBoatId = String(boatId ?? "");
      if (!normalizedBoatId) return [getInitialBillingItem()];

      const {
        preserveCurrentSelection = false,
        selectedRecordIds = [],
        recordsByType = availableRecordsByType,
        billedIds = billedRecordIds,
      } = options;
      const selectedRecordIdSet = new Set(
        selectedRecordIds.map((recordId) => String(recordId)).filter(Boolean),
      );

      const shouldIncludeRecord = (record, recordType) => {
        const recordValue = String(record.value);
        if (preserveCurrentSelection && selectedRecordIdSet.has(recordValue)) {
          return true;
        }
        return !((recordType === "docking" ? billedIds.docking : billedIds.banyera).has(recordValue));
      };

      const dockingItems = (recordsByType.docking ?? [])
        .filter((record) => shouldIncludeRecord(record, "docking"))
        .filter((record) => record.boatId === normalizedBoatId)
        .filter((record) => isDateWithinRange(record.sortDate, dateFrom, dateTo))
        .map((record) => ({
          transaction_type: "docking",
          record_id: record.value,
          amount: String(record.amount ?? ""),
          sortDate: record.sortDate,
        }));

      const banyeraItems = (recordsByType.banyera ?? [])
        .filter((record) => shouldIncludeRecord(record, "banyera"))
        .filter((record) => record.boatId === normalizedBoatId)
        .filter((record) => isDateWithinRange(record.sortDate, dateFrom, dateTo))
        .map((record) => ({
          transaction_type: "banyera",
          record_id: record.value,
          amount: String(record.amount ?? ""),
          sortDate: record.sortDate,
        }));

      const combined = [...dockingItems, ...banyeraItems].sort((a, b) =>
        String(b.sortDate || "").localeCompare(String(a.sortDate || "")),
      );

      return combined.length > 0
        ? combined.map(({ sortDate, ...item }) => item)
        : [getInitialBillingItem()];
    } catch (error) {
      console.error("Error in buildBoatBillingItems:", error);
      return [getInitialBillingItem()];
    }
  };

  const getBoatUnbilledDateBounds = (boatId) => {
    const normalizedBoatId = String(boatId ?? "");
    if (!normalizedBoatId) return null;

    const sortDates = [
      ...(availableRecordsByType.docking ?? [])
        .filter((record) => !billedRecordIds.docking.has(String(record.value)))
        .filter((record) => record.boatId === normalizedBoatId)
        .map((record) => normalizeDateValue(record.sortDate)),
      ...(availableRecordsByType.banyera ?? [])
        .filter((record) => !billedRecordIds.banyera.has(String(record.value)))
        .filter((record) => record.boatId === normalizedBoatId)
        .map((record) => normalizeDateValue(record.sortDate)),
    ].filter(Boolean);

    if (sortDates.length === 0) return null;

    const sortedDates = [...sortDates].sort((a, b) => a.localeCompare(b));
    return {
      from: sortedDates[0],
      to: sortedDates[sortedDates.length - 1],
    };
  };

  const getBoatAllTransactionsDateBounds = (boatId) => {
    const normalizedBoatId = String(boatId ?? "");
    if (!normalizedBoatId) return null;

    const sortDates = [
      ...(availableRecordsByType.docking ?? [])
        .filter((record) => record.boatId === normalizedBoatId)
        .map((record) => normalizeDateValue(record.sortDate)),
      ...(availableRecordsByType.banyera ?? [])
        .filter((record) => record.boatId === normalizedBoatId)
        .map((record) => normalizeDateValue(record.sortDate)),
    ].filter(Boolean);

    if (sortDates.length === 0) return null;

    const sortedDates = [...sortDates].sort((a, b) => a.localeCompare(b));
    return {
      from: sortedDates[0],
      to: sortedDates[sortedDates.length - 1],
    };
  };

  const createMutation = useMutation({
    mutationFn: async ({ payload }) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.post("/bills", payload, {
        params: { minimal: 1 },
      });
      return response.data;
    },
    onSuccess: async (createdBill, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["billing-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billing-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billing-form-lookups"] });

      if (variables?.proceedToPayment && createdBill?.bill_id) {
        const modalBill = {
          ...createdBill,
          boat_name: boatMap[String(createdBill.boat_id)]?.boat_name || "",
          payer_name: boatMap[String(createdBill.boat_id)]?.owner?.full_name || "",
        };
        setBillingForm(getInitialBillingForm());
        setFieldErrors({});
        setEditingBillId(null);
        setFormError("");
        setSubmitMode(null);
        setShowCreateBillingModal(false);
        openPaymentModalForBill(modalBill);
        return;
      }

      showAddedToast("Billing", "billing record");
      setBillingForm(getInitialBillingForm());
      setFieldErrors({});
      setEditingBillId(null);
      setFormError("");
      setSubmitMode(null);
      setShowCreateBillingModal(false);
      navigateBillingTab("records", { replace: true });
    },
    onError: (error) => {
      const message = getRequestErrorMessage(
        error,
        "Unable to save the billing record.",
      );
      setFormError(message);
      setSubmitMode(null);
      showBottomToast(
        "error",
        message.includes("Bill already exists")
          ? "Bill Already Exists"
          : "Save Failed",
        message,
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      const response = await api.put(`/bills/${id}`, payload, {
        params: { minimal: 1 },
      });
      return response.data;
    },
    onSuccess: async (updatedBill, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["billing-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billing-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billing-form-lookups"] });

      if (variables?.proceedToPayment) {
        const modalBill = {
          ...updatedBill,
          bill_id: updatedBill?.bill_id ?? variables.id,
          boat_name: boatMap[String(updatedBill?.boat_id ?? variables.payload?.boat_id)]?.boat_name || "",
          payer_name: boatMap[String(updatedBill?.boat_id ?? variables.payload?.boat_id)]?.owner?.full_name || "",
        };
        setBillingForm(getInitialBillingForm());
        setFieldErrors({});
        setEditingBillId(null);
        setFormError("");
        setSubmitMode(null);
        openPaymentModalForBill(modalBill);
        return;
      }

      showUpdatedToast("Billing", "billing record");
      setBillingForm(getInitialBillingForm());
      setFieldErrors({});
      setEditingBillId(null);
      setFormError("");
      setSubmitMode(null);
      navigateBillingTab("records", { replace: true });
    },
    onError: (error) => {
      const message = getRequestErrorMessage(
        error,
        "Unable to update the billing record.",
      );
      setFormError(message);
      setSubmitMode(null);
      showBottomToast(
        "error",
        message.includes("Bill already exists")
          ? "Bill Already Exists"
          : "Update Failed",
        message,
      );
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (payload) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }
      const response = await api.post("/payments", payload, {
        params: { minimal: 1 },
      });
      return response.data;
    },
    onSuccess: (response, variables) => {
      const createdPaymentCount = Array.isArray(response?.payments) ? response.payments.length : 1;
      const createdPaymentTotal = Array.isArray(response?.payments)
        ? response.payments.reduce((sum, payment) => sum + Number(payment?.amount_paid || payment?.amount || 0), 0)
        : Number(response?.payment?.amount_paid || response?.amount_paid || variables?.amount_paid || 0);
      bumpBillingTodayPaymentStats(queryClient, variables?.payment_date, createdPaymentCount);
      adjustTodayCollection(queryClient, variables?.payment_date, createdPaymentTotal);
      showAddedToast("Payment", "payment record");
      setPaymentModalBill(null);
      setPaymentModalForm(getInitialPaymentModalForm());
      setPaymentModalFieldErrors({});
      setPaymentModalFormError("");
      void queryClient.invalidateQueries({ queryKey: ["billing-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billing-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billing-payments"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["payments-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["payments-form-lookups"], refetchType: "active" });
      invalidateTodayCollection(queryClient, variables?.payment_date);
      navigateBillingTab("payments", { replace: true });
    },
    onError: (error) => {
      const message = getRequestErrorMessage(error, "Unable to save the payment record.");
      const responseErrors = error?.response?.data?.errors ?? {};
      const nextFieldErrors = { ...responseErrors };
      const amountPaidError = nextFieldErrors.amount_paid?.[0] || "";

      if (nextFieldErrors.official_receipt_no?.[0] === "Official Receipt No. already exists.") {
        delete nextFieldErrors.official_receipt_no;
      }

      setPaymentModalFieldErrors(nextFieldErrors);
      setPaymentModalFormError(amountPaidError ? "" : message === "Official Receipt No. already exists." ? "" : message);
      showBottomToast("error", "Save Failed", amountPaidError || message);
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      if (isHeadViewOnly) {
        throw new Error("Head accounts are view-only.");
      }
      if (isTransactionLocked) {
        throw new Error(transactionLockMessage);
      }

      const response = await api.put(`/payments/${id}`, payload, {
        params: { minimal: 1 },
      });
      return response.data;
    },
    onSuccess: () => {
      showUpdatedToast("Payment", "payment record");
      setEditingPayment(null);
      setEditPaymentForm({ official_receipt_no: "", remarks: "" });
      setEditPaymentErrors({});
      void queryClient.invalidateQueries({ queryKey: ["payments-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billing-payments"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billing-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billing-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["revenue-report"], refetchType: "active" });
    },
    onError: (error) => {
      const responseErrors = error?.response?.data?.errors ?? {};
      const nextErrors = {};

      if (responseErrors.official_receipt_no?.[0]) {
        nextErrors.official_receipt_no = responseErrors.official_receipt_no[0];
      }

      setEditPaymentErrors(nextErrors);
      showBottomToast("error", "Save Failed", getRequestErrorMessage(error, "Unable to save the payment record."));
    },
  });

  const closePaymentModal = () => {
    if (createPaymentMutation.isPending) return;
    setPaymentModalBill(null);
    setPaymentModalForm(getInitialPaymentModalForm());
    setPaymentModalScope("single_bill");
    setPaymentModalFieldErrors({});
    setPaymentModalFormError("");
  };

  const requestPaymentPage = (pageOrUpdater) => {
    clearUniversalHighlight();

    setPaymentRequestedPage((page) => {
      const nextPage = typeof pageOrUpdater === "function" ? pageOrUpdater(page) : pageOrUpdater;
      return Math.min(Math.max(1, Number(nextPage) || 1), paymentRecordsTotalPages);
    });
  };

  const openEditPayment = (payment) => {
    if (isHeadViewOnly) return;

    setEditingPayment(payment);
    setEditPaymentForm({
      official_receipt_no: normalizeOfficialReceiptNo(payment?.official_receipt_no || ""),
      remarks: payment?.remarks || "",
    });
    setEditPaymentErrors({});
  };

  const closeEditPayment = () => {
    if (updatePaymentMutation.isPending) return;
    setEditingPayment(null);
    setEditPaymentForm({ official_receipt_no: "", remarks: "" });
    setEditPaymentErrors({});
  };

  const updateEditPaymentForm = (patch) => {
    setEditPaymentForm((current) => ({ ...current, ...patch }));
    setEditPaymentErrors((current) => {
      const next = { ...current };
      Object.keys(patch).forEach((key) => {
        delete next[key];
      });
      return next;
    });
  };

  const handleSavePaymentEdit = () => {
    if (isHeadViewOnly) return;

    if (!editingPayment?.payment_id) return;

    const officialReceiptNo = normalizeOfficialReceiptNo(editPaymentForm.official_receipt_no);
    const officialReceiptError = validateOfficialReceiptNo(officialReceiptNo);

    if (officialReceiptError) {
      setEditPaymentErrors({ official_receipt_no: officialReceiptError });
      return;
    }

    const payload = {
      official_receipt_no: officialReceiptNo,
      remarks: editPaymentForm.remarks || "",
    };
    const original = {
      official_receipt_no: normalizeOfficialReceiptNo(editingPayment.official_receipt_no || ""),
      remarks: editingPayment.remarks || "",
    };

    if (JSON.stringify(payload) === JSON.stringify(original)) {
      showNoChangesToast();
      return;
    }

    updatePaymentMutation.mutate({ id: editingPayment.payment_id, payload });
  };

  const updatePaymentModalForm = (patch) => {
    setPaymentModalForm((current) => ({ ...current, ...patch }));
    setPaymentModalFormError("");
    setPaymentModalFieldErrors((current) => {
      const next = { ...current };
      Object.keys(patch).forEach((key) => {
        delete next[key];
      });
      return next;
    });
  };

  const getPaymentableBillDate = (bill) =>
    String(bill?.bill_date || bill?.billing_date || bill?.created_at || "").slice(0, 10);

  const handlePaymentModalScopeChange = (scope) => {
    setPaymentModalScope(scope);
    setPaymentModalFieldErrors({});
    setPaymentModalFormError("");

    if (scope === "single_bill") {
      const selectedBill =
        paymentableBills.find((bill) => String(bill.bill_id) === String(paymentModalForm.bill_id)) ||
        paymentableBills.find((bill) => String(bill.bill_id) === String(paymentModalBill?.bill_id));
      setPaymentModalForm((current) => ({
        ...current,
        bill_id: selectedBill ? String(selectedBill.bill_id) : "",
        boat_id: selectedBill ? String(selectedBill.boat_id ?? "") : "",
        bill_ids: [],
        amount_paid: selectedBill ? String(Number(selectedBill.balance ?? selectedBill.total_amount ?? 0).toFixed(2)) : "",
        date_from: "",
        date_to: "",
      }));
      return;
    }

    const boatId = String(paymentModalForm.boat_id || paymentModalBill?.boat_id || "");
    const selectedBillsForBoat = paymentableBills.filter((bill) => String(bill.boat_id ?? "") === boatId);
    const selectedBillIds = paymentModalBill?.bill_id ? [String(paymentModalBill.bill_id)] : [];
    const selectedBalance = selectedBillsForBoat
      .filter((bill) => selectedBillIds.includes(String(bill.bill_id)))
      .reduce((sum, bill) => sum + Number(bill.balance ?? bill.total_amount ?? 0), 0);

    setPaymentModalForm((current) => ({
      ...current,
      bill_id: "",
      boat_id: boatId,
      bill_ids: selectedBillIds,
      amount_paid: selectedBalance > 0 ? String(selectedBalance.toFixed(2)) : "",
      date_from: "",
      date_to: "",
    }));
  };

  const handlePaymentModalBillChange = (billId) => {
    const selectedBill = paymentableBills.find((bill) => String(bill.bill_id) === String(billId));
    setPaymentModalForm((current) => ({
      ...current,
      bill_id: billId ?? "",
      boat_id: selectedBill ? String(selectedBill.boat_id ?? "") : "",
      bill_ids: [],
      amount_paid: selectedBill ? String(Number(selectedBill.balance ?? selectedBill.total_amount ?? 0).toFixed(2)) : "",
    }));
    setPaymentModalFormError("");
    setPaymentModalFieldErrors((current) => ({ ...current, bill_id: undefined, amount_paid: undefined }));
  };

  const handlePaymentModalBoatChange = (boatId) => {
    setPaymentModalForm((current) => ({
      ...current,
      boat_id: boatId ?? "",
      bill_id: "",
      bill_ids: [],
      amount_paid: "",
      date_from: "",
      date_to: "",
    }));
    setPaymentModalFormError("");
    setPaymentModalFieldErrors((current) => ({ ...current, boat_id: undefined, bill_ids: undefined, amount_paid: undefined }));
  };

  const handlePaymentModalBillToggle = (billId, visibleBills = []) => {
    const nextBillId = String(billId);
    setPaymentModalForm((current) => {
      const nextBillIds = current.bill_ids.includes(nextBillId)
        ? current.bill_ids.filter((id) => id !== nextBillId)
        : [...current.bill_ids, nextBillId];
      const nextSelectedBills = visibleBills.filter((bill) => nextBillIds.includes(String(bill.bill_id)));
      const nextAmount = nextSelectedBills.reduce((sum, bill) => sum + Number(bill.balance ?? bill.total_amount ?? 0), 0);

      return {
        ...current,
        bill_ids: nextBillIds,
        amount_paid: nextBillIds.length > 0 ? String(nextAmount.toFixed(2)) : "",
      };
    });
    setPaymentModalFormError("");
    setPaymentModalFieldErrors((current) => ({ ...current, bill_ids: undefined, amount_paid: undefined }));
  };

  const handlePaymentModalSelectAllBills = (visibleBills = [], allSelected = false) => {
    const nextBillIds = allSelected ? [] : visibleBills.map((bill) => String(bill.bill_id));
    const nextAmount = visibleBills
      .filter((bill) => nextBillIds.includes(String(bill.bill_id)))
      .reduce((sum, bill) => sum + Number(bill.balance ?? bill.total_amount ?? 0), 0);

    setPaymentModalForm((current) => ({
      ...current,
      bill_ids: nextBillIds,
      amount_paid: nextBillIds.length > 0 ? String(nextAmount.toFixed(2)) : "",
    }));
    setPaymentModalFormError("");
    setPaymentModalFieldErrors((current) => ({ ...current, bill_ids: undefined, amount_paid: undefined }));
  };

  const handlePaymentModalShowAllBills = (visibleBills = []) => {
    const dateValues = visibleBills.map(getPaymentableBillDate).filter(Boolean).sort();
    setPaymentModalForm((current) => ({
      ...current,
      date_from: dateValues[0] ?? "",
      date_to: dateValues[dateValues.length - 1] ?? "",
    }));
  };

  const handlePaymentModalDateFilterChange = (field, value) => {
    setPaymentModalForm((current) => ({
      ...current,
      [field]: normalizeDateValue(value),
      bill_ids: [],
      amount_paid: "",
    }));
    setPaymentModalFieldErrors((current) => ({ ...current, bill_ids: undefined, amount_paid: undefined }));
  };

  const handleCreatePaymentFromModal = () => {
    if (isHeadViewOnly) return;

    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    const nextErrors = {};
    const officialReceiptError = validateOfficialReceiptNo(paymentModalForm.official_receipt_no);
    const amountPaid = Number(paymentModalForm.amount_paid);
    const selectedPaymentBill = paymentableBills.find((bill) => String(bill.bill_id) === String(paymentModalForm.bill_id));
    const selectedPaymentBills = paymentableBills.filter((bill) => paymentModalForm.bill_ids.includes(String(bill.bill_id)));
    const billBalance = paymentModalScope === "selected_bills"
      ? selectedPaymentBills.reduce((sum, bill) => sum + Number(bill.balance ?? bill.total_amount ?? 0), 0)
      : Number(selectedPaymentBill?.balance ?? paymentModalBill?.balance ?? paymentModalBill?.total_amount ?? 0);

    if (paymentModalScope === "single_bill") {
      if (!selectedPaymentBill) nextErrors.bill_id = ["Bill reference is required."];
    } else {
      if (!paymentModalForm.boat_id) nextErrors.boat_id = ["Boat name is required."];
      if (paymentModalForm.bill_ids.length === 0) nextErrors.bill_ids = ["Select at least one bill."];
    }
    if (officialReceiptError) nextErrors.official_receipt_no = [officialReceiptError];
    if (!paymentModalForm.payment_date) {
      nextErrors.payment_date = ["Payment date is required."];
    } else if (paymentModalForm.payment_date > getTodayManilaDate()) {
      nextErrors.payment_date = ["Payment date cannot be in the future."];
    }
    if (!paymentModalForm.amount_paid) {
      nextErrors.amount_paid = ["Amount is required."];
    } else if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      nextErrors.amount_paid = ["Amount must be greater than zero."];
    } else if (billBalance > 0 && amountPaid - billBalance > 0.009) {
      nextErrors.amount_paid = ["Amount paid cannot exceed the bill balance."];
    }

    if (Object.keys(nextErrors).length > 0) {
      setPaymentModalFieldErrors(nextErrors);
      setPaymentModalFormError("");
      return;
    }

    setPaymentModalFieldErrors({});
    setPaymentModalFormError("");
    createPaymentMutation.mutate({
      payment_scope: paymentModalScope,
      bill_id: paymentModalScope === "single_bill" ? Number(paymentModalForm.bill_id) : undefined,
      bill_ids: paymentModalScope === "selected_bills" ? paymentModalForm.bill_ids.map((billId) => Number(billId)) : undefined,
      payment_method: paymentModalForm.payment_method || "cash",
      official_receipt_no: normalizeOfficialReceiptNo(paymentModalForm.official_receipt_no),
      payment_date: paymentModalForm.payment_date,
      amount_paid: amountPaid,
      remarks: paymentModalForm.remarks || null,
    });
  };

  const previewBoat = boatMap[billingForm.boat_id];
  const billedTransactionsHistory = useMemo(() => {
    if (!billingForm.boat_id) return [];

    return billedHistoryBills
      .filter(
        (bill) => String(bill.boat_id ?? "") === String(billingForm.boat_id),
      )
        .map((bill) => ({
          id: bill.bill_id,
          bill,
          referenceNumber: formatReferenceNumber(bill.bill_reference_no),
          date: formatDisplayDate(bill.billing_date || bill.created_at),
          amount: Number(bill.total_amount || 0),
          sortDate: String(bill.billing_date || bill.created_at || ""),
        }))
      .sort((a, b) =>
        String(b.sortDate || "").localeCompare(String(a.sortDate || "")),
      );
  }, [billedHistoryBills, billingForm.boat_id]);

  const currentSelectedBillRecord = useMemo(
    () =>
      bills.find((bill) => String(bill.bill_id) === String(selectedBillId)) ??
      null,
    [bills, selectedBillId],
  );
  const selectedBillRecord =
    currentSelectedBillRecord ??
    (String(selectedBillSnapshot?.bill_id ?? "") === String(selectedBillId)
      ? selectedBillSnapshot
      : null);

  useEffect(() => {
    if (!selectedBillId) {
      setSelectedBillSnapshot(null);
      return;
    }

    if (currentSelectedBillRecord) {
      setSelectedBillSnapshot(currentSelectedBillRecord);
    }
  }, [currentSelectedBillRecord, selectedBillId]);
  const selectedBillPayments = useMemo(
    () =>
      payments.filter(
        (payment) =>
          String(payment.bill_id ?? "") === String(selectedBillId ?? ""),
      ),
    [payments, selectedBillId],
  );
  const selectedBillChargeItems = useMemo(() => {
    if (!selectedBillRecord) return [];

    return (selectedBillRecord.items ?? [])
      .map((item, index) => {
        const transactionType = String(
          item.transaction_type || "",
        ).toLowerCase();
        const feeLabel = getBillItemDisplayType(transactionType);

        return {
          charge_key: `charge-${selectedBillRecord.bill_id}-${transactionType}-${index}`,
          date: getBillItemDisplayDate(item),
          type: feeLabel,
          description: `${feeLabel} Fee`,
          amount: Number(item.amount || 0),
        };
      })
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  }, [selectedBillRecord]);
  const selectedBillPeriod = useMemo(() => {
    if (!selectedBillChargeItems.length) return "-";
    const dates = selectedBillChargeItems
      .map((charge) => String(charge.date || "").slice(0, 10))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    if (!dates.length) return "-";
    if (dates[0] === dates[dates.length - 1])
      return formatDisplayDate(dates[0]);
    return `${formatDisplayDate(dates[0])} - ${formatDisplayDate(dates[dates.length - 1])}`;
  }, [selectedBillChargeItems]);
  const selectedBillTotalPaid = useMemo(
    () =>
      selectedBillPayments.reduce(
        (sum, payment) => sum + Number(payment.amount_paid || 0),
        0,
      ),
    [selectedBillPayments],
  );
  const selectedBillBalanceDue = useMemo(
    () =>
      Math.max(
        Number(selectedBillRecord?.total_amount || 0) - selectedBillTotalPaid,
        0,
      ),
    [selectedBillRecord, selectedBillTotalPaid],
  );
  const selectedBillStatus = useMemo(() => {
    if (!selectedBillRecord) return { value: "unpaid", label: "Unpaid" };
    if (
      selectedBillBalanceDue <= 0 &&
      Number(selectedBillRecord.total_amount || 0) > 0
    ) {
      return { value: "paid", label: "Paid" };
    }
    if (selectedBillTotalPaid > 0) {
      return { value: "partial", label: "Partial" };
    }
    return { value: "unpaid", label: "Unpaid" };
  }, [selectedBillBalanceDue, selectedBillRecord, selectedBillTotalPaid]);

  useEffect(() => {
    if (!selectedBillRecord || !isRecordsTab) {
      setSelectedBillPdfFile((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return null;
      });
      setSelectedBillPdfReady(false);
      setSelectedBillPdfLoading(false);
      return undefined;
    }

    let isActive = true;
    let nextUrl = "";

    setSelectedBillPdfFile((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
    setSelectedBillPdfReady(false);

    const preloadBillingStatement = async () => {
      setSelectedBillPdfLoading(true);
      try {
        const pdfBytes = await buildBillingStatementPdf({
          bill: selectedBillRecord,
          chargeItems: selectedBillChargeItems,
          billPeriod: selectedBillPeriod,
          statusLabel: selectedBillStatus.label,
        });

        if (!isActive) return;

        const nextData =
          pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
        const filename = getBillingStatementFilename(selectedBillRecord);
        const pdfFile = new File([nextData], filename, {
          type: "application/pdf",
        });

        nextUrl = URL.createObjectURL(pdfFile);
        setSelectedBillPdfFile({
          url: nextUrl,
          filename,
        });
      } catch (error) {
        console.error("Failed to preload billing statement PDF", error);
        if (isActive) setSelectedBillPdfFile(null);
      } finally {
        if (isActive) setSelectedBillPdfLoading(false);
      }
    };

    preloadBillingStatement();

    return () => {
      isActive = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [
    isRecordsTab,
    selectedBillChargeItems,
    selectedBillPeriod,
    selectedBillRecord,
    selectedBillStatus.label,
  ]);

  const previewTotal = useMemo(
    () =>
      billingForm.items.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0,
      ),
    [billingForm.items],
  );

  const updateBillingItem = (index, patch) => {
    setBillingForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  const handleTypeChange = (index, transactionType) => {
    updateBillingItem(index, {
      transaction_type: transactionType,
      record_id: "",
      amount: "",
    });
  };

  const showCreateBillingSection = (sectionRef) => {
    window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  const showUnbilledTransactions = () => {
    showCreateBillingSection(unbilledTransactionsRef);
  };

  const showBilledTransactionsHistory = () => {
    showCreateBillingSection(billedTransactionsHistoryRef);
  };

  const updateBillingBoat = (boatId, { scrollToUnbilled = false } = {}) => {
    const nextBoatId = boatId ?? "";
    pendingCreateBillingScrollRef.current =
      scrollToUnbilled && nextBoatId ? unbilledTransactionsRef : null;
    setBillingForm((current) => ({
      ...current,
      boat_id: nextBoatId,
      items: [getInitialBillingItem()],
    }));
    setFieldErrors((current) => ({ ...current, boat_id: "" }));
    setFormError("");
  };

  const handleBoatChange = (boatId) => {
    updateBillingBoat(boatId, { scrollToUnbilled: true });
  };

  const handleEditBoatChange = (boatId) => {
    updateBillingBoat(boatId);
  };

  useEffect(() => {
    if (!isCreateBillingActive || !billingForm.boat_id) return;

    const sectionRef = pendingCreateBillingScrollRef.current;
    if (!sectionRef) return;

    pendingCreateBillingScrollRef.current = null;
    showCreateBillingSection(sectionRef);
  }, [isCreateBillingActive, billingForm.boat_id]);

  const handleDateRangeChange = (field, value) => {
    showUnbilledTransactions();
    updateBillingDateRange(field, value);
  };

  const updateBillingDateRange = (field, value) => {
    setBillingForm((current) => {
      const next = {
        ...current,
        ...buildDateFieldPatch(field, value),
      };

      next.items = isBoatBillingDataLoading
        ? [getInitialBillingItem()]
        : buildBoatBillingItems(
            next.boat_id,
            next.date_from,
            next.date_to,
            {
              preserveCurrentSelection: Boolean(editingBillId),
              selectedRecordIds: current.items
                .filter((item) => item.record_id)
                .map((item) => String(item.record_id)),
            },
          );
      return next;
    });
    setFormError("");
  };

  const handleEditDateRangeChange = (field, value) => {
    showUnbilledTransactions();
    updateBillingDateRange(field, value);
  };

  useEffect(() => {
    if (!isCreateBillingActive || editingBillId || !billingForm.boat_id) return;

    const boatIdChanged = prevBoatIdRef.current !== billingForm.boat_id;
    prevBoatIdRef.current = billingForm.boat_id;

    if (isBoatBillingDataLoading) return;

    try {
      setBillingForm((current) => {
        const nextItems = buildBoatBillingItems(
          current.boat_id,
          current.date_from,
          current.date_to,
          {
            preserveCurrentSelection: Boolean(editingBillId),
            selectedRecordIds: current.items
              .filter((item) => item.record_id)
              .map((item) => String(item.record_id)),
          },
        );
        const hasSameItems =
          current.items.length === nextItems.length &&
          current.items.every(
            (item, index) =>
              item.transaction_type === nextItems[index]?.transaction_type &&
              item.record_id === nextItems[index]?.record_id &&
              item.amount === nextItems[index]?.amount,
          );

        if (hasSameItems && !boatIdChanged) return current;

        return {
          ...current,
          items: nextItems,
        };
      });
    } catch (error) {
      console.error("Error updating billing form items:", error);
    }
  }, [
    isCreateBillingActive,
    billingForm.boat_id,
    billingForm.date_from,
    billingForm.date_to,
    availableRecordsByType,
    billedRecordIds,
    isBoatBillingDataLoading,
    editingBillId,
  ]);

  const handlePayAll = () => {
    if (!billingForm.boat_id) {
      setFieldErrors((current) => ({ ...current, boat_id: "Please select a boat." }));
      showBottomToast("error", "Missing Boat", "Please select a boat.");
      return;
    }

    setBillingForm((current) => {
      const dateBounds = getBoatUnbilledDateBounds(current.boat_id);
      const nextDateFrom = dateBounds?.from ?? current.date_from;
      const nextDateTo = dateBounds?.to ?? current.date_to;

      return {
        ...current,
        ...buildDateFieldPatch("date_from", nextDateFrom),
        ...buildDateFieldPatch("date_to", nextDateTo),
        items: buildBoatBillingItems(current.boat_id, nextDateFrom, nextDateTo, {
          preserveCurrentSelection: Boolean(editingBillId),
          selectedRecordIds: current.items
            .filter((item) => item.record_id)
            .map((item) => String(item.record_id)),
        }),
      };
    });
    setFormError("");
  };

  const handleShowAll = () => {
    showUnbilledTransactions();
    if (!billingForm.boat_id) {
      setFieldErrors((current) => ({ ...current, boat_id: "Please select a boat." }));
      showBottomToast("error", "Missing Boat", "Please select a boat.");
      return;
    }

    setBillingForm((current) => {
      return {
        ...current,
        ...buildDateFieldPatch("date_from", ""),
        ...buildDateFieldPatch("date_to", ""),
        items: buildBoatBillingItems(current.boat_id, "", "", {
          preserveCurrentSelection: Boolean(editingBillId),
          selectedRecordIds: current.items
            .filter((item) => item.record_id)
            .map((item) => String(item.record_id)),
        }),
      };
    });
    setFormError("");
  };

  const handleRecordChange = (index, recordId) => {
    const item = billingForm.items[index];
    const selected = (availableRecordsByType[item.transaction_type] ?? []).find(
      (record) => record.value === recordId,
    );

    updateBillingItem(index, {
      record_id: recordId,
      amount: selected ? String(selected.amount) : "",
    });
  };

  const handleAddItem = () => {
    setBillingForm((current) => ({
      ...current,
      items: [...current.items, getInitialBillingItem()],
    }));
  };

  const handleRemoveItem = (index) => {
    setBillingForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleEditBill = (bill) => {
    if (isHeadViewOnly) return;

    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    setEditingBillId(bill.bill_id);
    setBillingForm(buildFormFromBill(bill));
    setFieldErrors({});
    setFormError("");
  };

  const closeEditBilling = () => {
    if (isSaving) return;
    setEditingBillId(null);
    setBillingForm(getInitialBillingForm());
    setFieldErrors({});
    setFormError("");
    setSubmitMode(null);
  };

  const buildSelectedBillingStatementFile = async () => {
    if (!selectedBillRecord) return null;

    setSelectedBillPdfLoading(true);
    try {
      const pdfBytes = await buildBillingStatementPdf({
        bill: selectedBillRecord,
        chargeItems: selectedBillChargeItems,
        billPeriod: selectedBillPeriod,
        statusLabel: selectedBillStatus.label,
      });
      const nextData =
        pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
      const filename = getBillingStatementFilename(selectedBillRecord);
      const pdfFile = new File([nextData], filename, {
        type: "application/pdf",
      });

      return {
        url: URL.createObjectURL(pdfFile),
        filename,
      };
    } catch (error) {
      console.error("Failed to generate billing statement PDF", error);
      showBottomToast(
        "error",
        "PDF Error",
        "Unable to generate the billing statement.",
      );
      return null;
    } finally {
      setSelectedBillPdfLoading(false);
    }
  };

  const handlePrintBillingStatement = async () => {
    const pdfFile = selectedBillPdfFile ?? await buildSelectedBillingStatementFile();
    if (!pdfFile) return;

    const printedFromPreloadedFrame =
      selectedBillPdfFile &&
      selectedBillPdfReady &&
      printPreloadedPdfFrame(selectedBillPrintFrameRef.current);

    if (!printedFromPreloadedFrame) {
      printPdfFile(pdfFile.url);
    }

    if (!selectedBillPdfFile) {
      window.setTimeout(() => URL.revokeObjectURL(pdfFile.url), 30000);
    }
  };

  const handleDownloadBillingStatement = async () => {
    const pdfFile = selectedBillPdfFile ?? await buildSelectedBillingStatementFile();
    if (!pdfFile) return;

    downloadPdfFile(pdfFile.url, pdfFile.filename);
    if (!selectedBillPdfFile) {
      URL.revokeObjectURL(pdfFile.url);
    }
  };

  const submitBill = (proceedToPayment = false) => {
    if (isHeadViewOnly) return;

    if (isTransactionLocked) {
      setSubmitMode(null);
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    const payload = buildBillPayload(billingForm);

    if (!payload.boat_id) {
      setSubmitMode(null);
      setFieldErrors((current) => ({ ...current, boat_id: "Please select a boat." }));
      return;
    }

    if (payload.items.length === 0) {
      const emptyMessage = "Please add at least one billing item.";
      setSubmitMode(null);
      setFormError(emptyMessage);
      return;
    }

    setFormError("");
    setSubmitMode(proceedToPayment ? "payment" : "generate");

    if (editingBillId) {
      const originalPayload = editingBillRecord
        ? buildBillPayload(buildFormFromBill(editingBillRecord))
        : null;

      if (
        !proceedToPayment &&
        originalPayload &&
        normalizeBillPayloadForComparison(originalPayload) ===
          normalizeBillPayloadForComparison(payload)
      ) {
        setSubmitMode(null);
        setBillingForm(getInitialBillingForm());
        setFieldErrors({});
        setEditingBillId(null);
        setFormError("");
        navigateBillingTab("records", { replace: true });
        showNoChangesToast();
        return;
      }

      updateMutation.mutate({ id: editingBillId, payload, proceedToPayment });
      return;
    }

    createMutation.mutate({ payload, proceedToPayment });
  };

  const handleSaveBill = () => {
    if (isHeadViewOnly) return;

    setShowPayBillPrompt(true);
  };

  const handleGenerateBillOnly = () => {
    setShowPayBillPrompt(false);
    submitBill(false);
  };

  const handleGenerateBillAndPay = () => {
    setShowPayBillPrompt(false);
    submitBill(true);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isGeneratingBill = isSaving && submitMode === "generate";

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
          font-weight: 400 !important;
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

        .billing-ant-select-dropdown {
          border-radius: 12px !important;
          overflow: hidden !important;
          border: 1px solid #e5e7eb !important;
          box-shadow: 0 4px 24px rgba(0,0,0,0.13) !important;
          padding: 4px !important;
          z-index: 11000 !important;
        }

        .billing-ant-select-dropdown .ant-select-item {
          border-radius: 8px !important;
          padding: 8px 12px !important;
          font-family: ${FONT} !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          color: #1a1f36 !important;
        }

        .billing-ant-select-dropdown .ant-select-item-option-selected {
          background-color: #1a1f36 !important;
          color: #ffffff !important;
          font-weight: 400 !important;
        }

        .billing-ant-select-dropdown .ant-select-item-option-active:not(.ant-select-item-option-selected) {
          background-color: #f8fafc !important;
        }

        .universal-filter-select.billing-ant-select-error .ant-select-selector {
          border-color: #fca5a5 !important;
        }

        .universal-filter-select.billing-ant-select-error.ant-select-focused .ant-select-selector,
        .universal-filter-select.billing-ant-select-error.ant-select-open .ant-select-selector,
        .universal-filter-select.billing-ant-select-error .ant-select-selector:hover {
          border-color: #fca5a5 !important;
          box-shadow: none !important;
        }

        .billing-ant-select.ant-select-disabled .ant-select-selector {
          background-color: #f8fafc !important;
          border-color: #e2e8f0 !important;
          color: #1a1f36 !important;
          opacity: 1 !important;
          box-shadow: none !important;
        }

        .billing-ant-select.ant-select-disabled .ant-select-selection-item,
        .billing-ant-select.ant-select-disabled .ant-select-selection-placeholder {
          color: #1a1f36 !important;
          -webkit-text-fill-color: #1a1f36 !important;
          font-weight: 500 !important;
          opacity: 1 !important;
        }

        .billing-ant-select.ant-select-disabled .ant-select-arrow {
          color: #64748b !important;
          opacity: 1 !important;
        }

        .billing-ant-select-readonly .ant-select-selector {
          background-color: #f8fafc !important;
          border-color: #e2e8f0 !important;
          box-shadow: none !important;
        }

        .billing-ant-select-readonly .ant-select-selection-item,
        .billing-ant-select-readonly .ant-select-selection-placeholder {
          color: #1a1f36 !important;
          -webkit-text-fill-color: #1a1f36 !important;
          font-weight: 500 !important;
        }

        .billing-ant-select-readonly .ant-select-arrow {
          color: #64748b !important;
          opacity: 1 !important;
        }

        .billing-ant-select-readonly .ant-select-selection-search {
          display: none !important;
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
          appearance: none !important;
          -webkit-appearance: none !important;
        }

        .rdp-root .rdp-dropdown select:focus,
        .rdp-root .rdp-dropdown_root select:focus,
        .rdp-caption_dropdowns select:focus,
        .rdp-root .rdp-dropdown select:focus-visible,
        .rdp-root .rdp-dropdown_root select:focus-visible,
        .rdp-caption_dropdowns select:focus-visible {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }

        .rdp-root .rdp-caption_label,
        .rdp-root .rdp-month_caption,
        .rdp-root .rdp-nav button,
        .rdp-root .rdp-button_next,
        .rdp-root .rdp-button_previous {
          font-weight: 400 !important;
          box-shadow: none !important;
          outline: none !important;
        }

        .rdp-root button:focus,
        .rdp-root button:focus-visible {
          outline: none !important;
          box-shadow: none !important;
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

        <div
          className="flex flex-1 flex-col overflow-hidden"
          style={{
            marginLeft:
              sidebarOpen && window.innerWidth >= 1024
                ? `${contentMargin}px`
                : "0px",
          }}
        >
          <Topbar
            sidebarOpen={sidebarOpen}
            sidebarCollapsed={sidebarCollapsed}
            onMenuToggle={toggleSidebar}
          />

          <main className="flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">
              <div className="mb-5 flex items-center justify-between">
                <TitlePage title="Billing" subtitle="Manage billing records and create billing entries." loading={showPageShellSkeleton} />
                <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: breadcrumbLabel }]} fontFamily={FONT} loading={showPageShellSkeleton} />
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {overviewCards.map((card) => (
                  <OverviewCard
                    key={card.title}
                    title={card.title}
                    value={card.value}
                    icon={card.icon}
                    tone={card.tone}
                    loading={showPageShellSkeleton}
                  />
                ))}
              </div>
              
              <Tabs
                tabs={TABS.map((tab) => ({ key: tab.value, label: tab.label, icon: tab.icon }))}
                activeKey={activeTab}
                onTabChange={navigateBillingTab}
                fontFamily={FONT}
                className="mb-5"
                loading={showPageShellSkeleton}
                rightContent={isPaymentsTab ? (
                  <Legend items={PAYMENT_STATUS_LEGEND} loading={showPageShellSkeleton} />
                ) : null}
              >

              {isRecordsTab ? (
                <>
                    <TableCard
                      title="Billing Records"
                      subtitle="All billing records in the system."
                      loading={showInitialSkeleton}
                      headerActionsSkeletonCount={isHeadViewOnly ? 2 : 3}
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
                            <IoSearchOutline
                              className="flex-shrink-0 text-[17px]"
                              style={{ color: "#1a1f36" }}
                            />
                            <input
                              value={search}
                              onChange={(event) => {
                                clearUniversalHighlight();
                                setSearch(event.target.value);
                              }}
                              placeholder="Search for reference number, boat name, boat type, date, amount"
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
                            options={PERIOD_FILTER_OPTIONS}
                          />
                          {!isHeadViewOnly ? (
                            <button
                              type="button"
                              onClick={openCreateBillingModal}
                              disabled={isTransactionLocked}
                              className="flex h-[42px] items-center justify-center gap-2 rounded-[10px] border-none bg-[#1a1f36] px-4 text-[13px] font-semibold text-white cursor-pointer transition-colors hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:hover:bg-[#1a1f36]"
                              style={{ fontFamily: FONT, opacity: isTransactionLocked ? 0.55 : 1 }}
                            >
                              <IoAddOutline className="text-[16px]" />
                              <span>Create Billing</span>
                            </button>
                          ) : null}
                        </>
                      }
                      pagination={{
                        meta: billsMeta,
                        totalPages,
                        currentPage: safePage,
                        requestedPage,
                        isLoading: showInitialSkeleton,
                        onPageChange: requestBillingPage,
                      }}
                    >
                      <div className="relative overflow-x-auto">
                        <table
                          className="w-full border-collapse"
                          style={{ minWidth: 980 }}
                        >
                        <thead>
                          <tr>
                            <TH>Reference Number</TH>
                            <TH>Boat Name</TH>
                            <TH>Boat Owner</TH>
                            <TH>Boat Type</TH>
                            <TH>Transactions</TH>
                            <TH>Billing Date</TH>
                            <TH>
                              <div className="text-right">Amount (₱)</div>
                            </TH>
                            {!isHeadViewOnly ? <TH>Action</TH> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {showInitialSkeleton ? (
                            Array.from({ length: PAGE_SIZE }).map((_, index) => (
                              <tr
                                key={index}
                                className="animate-pulse"
                                style={{ borderBottom: "1px solid #f1f5f9" }}
                              >
                                {Array.from({ length: isHeadViewOnly ? 7 : 8 }).map((__, column) => (
                                  <td key={column} className="px-4 py-3">
                                    {!isHeadViewOnly && column === 7 ? (
                                      <div className="h-8 w-8 rounded-[10px] bg-slate-100" />
                                    ) : (
                                      <div
                                        className="h-3 rounded bg-slate-100"
                                        style={{ width: column === 0 ? 120 : 90 }}
                                      />
                                    )}
                                   </td>
                                ))}
                               </tr>
                            ))
                          ) : isError ? (
                            <tr>
                              <td colSpan={isHeadViewOnly ? 7 : 8} className="px-4 py-8 text-center">
                                <p className="m-0 text-[13px] text-red-500">
                                  Unable to load billing records.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => refetch()}
                                  className="mt-3 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#1a1f36]"
                                >
                                  Retry
                                </button>
                               </td>
                              </tr>
                          ) : showBillsEmptyState ? (
                            <tr>
                              <td colSpan={isHeadViewOnly ? 7 : 8}>
                                <NoDataFound title={hasActiveTableFilters ? "No results found" : "No Data Found"} />
                               </td>
                              </tr>
                          ) : (
                            paginatedRecords.map((record, index) => {
                              const hasPayments = billHasPayments(record);
                              const isHighlighted =
                                highlightedBillId &&
                                String(highlightedBillId) === String(record.bill_id);
                              return (
                              <tr
                                key={record.bill_id}
                                onClick={() =>
                                  openBillingStatement(record)
                                }
                                className={`cursor-pointer transition-colors ${highlightedBillId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${isHighlighted ? "universal-search-highlight" : ""}`.trim()}
                                style={{
                                  borderBottom: "1px solid #f1f5f9",
                                }}
                              >
                               <td className="px-4 py-3">
  <Tooltip title="Click Me">
    <div className="flex w-fit items-center gap-2">
      <span className="text-[13px] font-semibold text-[#1a1f36]">
        {formatReferenceNumber(
          record.bill_reference_no,
        ) || "-"}
      </span>
    </div>
  </Tooltip>
</td>
                                <td className="px-4 py-3 text-[13px] text-[#1a1f36]">
                                  {record.boat_name || "-"}
                                 </td>
                                <td className="px-4 py-3 text-[13px] text-slate-700">
                                  {record.boat?.owner?.full_name || "-"}
                                 </td>
                                <td className="px-4 py-3 text-[13px] text-slate-700">
                                  {record.boat?.boat_type?.type_name ||
                                    record.boat?.boatType?.type_name ||
                                    "-"}
                                 </td>
                                <td className="px-4 py-3 text-[13px] text-slate-700">
                                  {[
                                    ...new Set(record.transaction_labels || []),
                                  ].join(", ") || "-"}
                                 </td>
                                <td className="px-4 py-3 text-[13px] text-slate-700">
                                  {formatDisplayDate(record.created_at)}
                                 </td>
                                <td className="px-4 py-3 text-right">
                                  <span
                                    className="inline-block min-w-[88px] text-right text-[13px] font-semibold text-[#1a1f36]"
                                    style={{
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {Number(
                                      record.total_amount || 0,
                                    ).toLocaleString("en-PH", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                 </td>
                                {!isHeadViewOnly ? (
                                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-2">
                                      <Tooltip title={isTransactionLocked ? transactionLockMessage : hasPayments ? "Cannot edit - this billing record has payments" : "Edit"}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!hasPayments && !isTransactionLocked) handleEditBill(record);
                                          }}
                                          disabled={hasPayments || isTransactionLocked}
                                          className={`flex h-8 w-8 items-center justify-center rounded-[10px] border bg-white transition-colors ${
                                            hasPayments || isTransactionLocked
                                              ? "cursor-not-allowed border-slate-200"
                                              : "cursor-pointer hover:bg-blue-50"
                                          }`}
                                          style={{ borderColor: hasPayments || isTransactionLocked ? undefined : "#1a1f36" }}
                                        >
                                          <IoCreateOutline
                                            style={{
                                              fontSize: "15px",
                                              color: hasPayments || isTransactionLocked ? "#94a3b8" : "#1a1f36",
                                            }}
                                          />
                                        </button>
                                      </Tooltip>
                                    </div>
                                   </td>
                                ) : null}
                                </tr>
                            )})
                                                        
                          )}
                        </tbody>
                       </table>
                      </div>

                    </TableCard>
                  </>
              ) : isPaymentsTab ? (
                <TableCard
                  title="Payment History"
                  subtitle="All payment history from the billing."
                  loading={showPaymentRecordsSkeleton}
                  headerActionsSkeletonCount={isHeadViewOnly ? 3 : 4}
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
                        <IoSearchOutline
                          className="flex-shrink-0 text-[17px]"
                          style={{ color: "#1a1f36" }}
                        />
                        <input
                          value={paymentSearch}
                          onChange={(event) => {
                            clearUniversalHighlight();
                            setPaymentSearch(event.target.value);
                            setPaymentRequestedPage(1);
                          }}
                          placeholder="Search for payment reference no., boat name, date, amount"
                          className="w-full border-none bg-transparent text-[13px] outline-none"
                          style={{ fontFamily: FONT, color: "#1a1f36" }}
                        />
                      </div>
                      <TailDropdown
                        value={paymentPeriodFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setPaymentPeriodFilter(value);
                          setPaymentRequestedPage(1);
                        }}
                        options={PERIOD_FILTER_OPTIONS}
                      />
                      <TailDropdown
                        value={paymentStatusFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setPaymentStatusFilter(value);
                          setPaymentRequestedPage(1);
                        }}
                        options={PAYMENT_STATUS_FILTER_OPTIONS}
                      />
                      {!isHeadViewOnly ? (
                        <button
                          type="button"
                          onClick={openRecordPaymentModal}
                          disabled={isTransactionLocked}
                          className="flex h-[42px] items-center justify-center gap-2 rounded-[10px] border-none bg-[#1a1f36] px-4 text-[13px] font-semibold text-white cursor-pointer transition-colors hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:opacity-70"
                          style={{ fontFamily: FONT }}
                        >
                          <IoAddOutline className="text-[16px]" />
                          <span>Create Payments</span>
                        </button>
                      ) : null}
                    </>
                  }
                  pagination={{
                    meta: paymentRecordsMeta,
                    totalPages: paymentRecordsTotalPages,
                    currentPage: safePaymentPage,
                    requestedPage: paymentRequestedPage,
                    isLoading: showPaymentRecordsSkeleton,
                    onPageChange: requestPaymentPage,
                  }}
                >
                  <div className="relative overflow-x-auto">
                    <table
                      className="w-full border-collapse"
                      style={{ minWidth: 940 }}
                    >
                      <thead>
                        <tr>
                          <TH>Payment Reference No.</TH>
                          <TH>Bill Reference No.</TH>
                          <TH>Boat Name</TH>
                          <TH>Date</TH>
                          <TH><div className="text-right">Total Amount(₱)</div></TH>
                          <TH><div className="text-right">Amount Paid(₱)</div></TH>
                          <TH>
                            <div className="text-right">Balance Due(₱)</div>
                          </TH>
                          <TH><div className="min-w-[220px]">Remarks</div></TH>
                          {!isHeadViewOnly ? <TH>Action</TH> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {showPaymentRecordsSkeleton ? (
                          Array.from({ length: PAGE_SIZE }).map((_, index) => (
                            <tr
                              key={index}
                              className="animate-pulse"
                              style={{ borderBottom: "1px solid #f1f5f9" }}
                            >
                              {Array.from({ length: isHeadViewOnly ? 8 : 9 }).map((__, column) => (
                                <td key={column} className="px-4 py-3">
                                  {!isHeadViewOnly && column === 8 ? (
                                    <div className="h-8 w-8 rounded-[10px] bg-slate-100" />
                                  ) : (
                                    <div
                                      className="h-3 rounded bg-slate-100"
                                      style={{ width: column <= 2 ? 120 : 90 }}
                                    />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : paymentRecordsQuery.isError ? (
                          <tr>
                            <td colSpan={isHeadViewOnly ? 8 : 9} className="px-4 py-10 text-center">
                              <div className="flex flex-col items-center gap-3">
                                <IoAlertCircleOutline className="text-[32px] text-red-400" />
                                <p className="m-0 text-[13px] font-normal text-red-500">
                                  Unable to load payment records.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => paymentRecordsQuery.refetch()}
                                  className="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-[#1a1f36] hover:bg-gray-50"
                                  style={{ fontFamily: FONT }}
                                >
                                  Retry
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : showPaymentRecordsEmptyState ? (
                          <tr>
                            <td colSpan={isHeadViewOnly ? 8 : 9}>
                              <NoDataFound title={hasActivePaymentTableFilters ? "No results found" : "No Data Found"} />
                            </td>
                          </tr>
                        ) : (
                          paymentRecords.map((record, index) => {
                            const isHighlighted =
                              highlightedPaymentId &&
                              String(highlightedPaymentId) === String(record.payment_id);

                            return (
                              <tr
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
                                {!isHeadViewOnly ? (
                                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                                    <div className="flex items-center gap-2">
                                      <Tooltip title={isTransactionLocked ? transactionLockMessage : "Edit"}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!isTransactionLocked) openEditPayment(record);
                                          }}
                                          disabled={isTransactionLocked}
                                          className={`flex h-8 w-8 items-center justify-center rounded-[10px] border bg-white transition-colors ${
                                            isTransactionLocked
                                              ? "cursor-not-allowed border-slate-200"
                                              : "cursor-pointer hover:bg-blue-50"
                                          }`}
                                          style={{ borderColor: isTransactionLocked ? undefined : "#1a1f36" }}
                                        >
                                          <IoCreateOutline
                                            style={{
                                              fontSize: "15px",
                                              color: isTransactionLocked ? "#94a3b8" : "#1a1f36",
                                            }}
                                          />
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
              ) : null}
              </Tabs>
            </div>
          </main>
        </div>
      </div>
      <BillingStatementModal
        bill={selectedBillRecord}
        pdfFile={selectedBillPdfFile}
        loading={selectedBillPdfLoading}
        open={Boolean(selectedBillId) && Boolean(selectedBillRecord) && isRecordsTab}
        onClose={closeBillingDetails}
      />
      {!isHeadViewOnly && showCreateBillingModal ? (
        <Modal
          title="Create Billing"
          onClose={closeCreateBillingModal}
          onCancel={closeCreateBillingModal}
          onSave={handleSaveBill}
          saving={isSaving}
          saveDisabled={isSaving || isTransactionLocked}
          saveLabel="Save"
          saveButtonWidth="170px"
          closeButtonWidth="170px"
          maxWidth={BILLING_MODAL_WIDTH}
          minimumSavingMs={0}
          closeOnBackdrop
          bodyClassName="max-h-[64vh] overflow-y-auto !p-5"
          footerLeftContent={
            <div>
              <p
                className="m-0 text-[11px] font-semibold uppercase"
                style={{ color: "#6F6F82", fontFamily: FONT }}
              >
                Total Billing
              </p>
              <p
                className="m-0 text-[28px] font-bold leading-tight text-[#1a1f36]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {Number(previewTotal || 0).toLocaleString("en-PH", {
                  style: "currency",
                  currency: "PHP",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-stretch">
              <Card
                className="flex h-full flex-col"
                bodyClassName="flex-1"
                icon={IoBoatOutline}
                title="BOAT INFORMATION"
                subtitle="Choose the boat and billing period for this entry."
                loading={false}
              >
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="xl:col-span-2">
                    <Label required>Boat Name</Label>
                    <SelectField
                      value={billingForm.boat_id || undefined}
                      onChange={handleBoatChange}
                      placeholder="Select boat name"
                      error={Boolean(fieldErrors.boat_id)}
                      options={boats.map((boat) => ({
                        value: String(boat.boat_id),
                        label: `${boat.boat_name}`,
                      }))}
                    />
                    {fieldErrors.boat_id ? <ErrorMessage>{fieldErrors.boat_id}</ErrorMessage> : null}
                  </div>

                  <div>
                    <Label>Boat Type</Label>
                    <Input
                      value={
                        previewBoat?.boat_type?.type_name ||
                        previewBoat?.boatType?.type_name ||
                        ""
                      }
                      readOnly
                    />
                  </div>

                  <div>
                    <Label>Boat Owner</Label>
                    <Input value={previewBoat?.owner?.full_name || ""} readOnly />
                  </div>

                  <div>
                    <div className="mb-2 flex min-h-[20px] items-center justify-between gap-3">
                      <p
                        className="m-0 text-[11px] font-semibold uppercase"
                        style={{ color: "#6F6F82", fontFamily: FONT }}
                      >
                        From Date
                      </p>
                      <span className="block h-[18px] w-[52px]" aria-hidden="true" />
                    </div>
                    <DatePicker
                      value={billingForm.date_from || undefined}
                      onChange={(_, currentDateString) =>
                        handleDateRangeChange("date_from", currentDateString)
                      }
                      placeholder="Select a date to filter"
                      options={{ useFiscalYearDefault: false }}
                      containerClassName="w-full"
                      inputClassName="rounded-[10px] border-slate-200 bg-white text-[13px] text-[#1a1f36] focus:border-[#4096ff] focus:ring-0"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex min-h-[20px] items-center justify-between gap-3">
                      <p
                        className="m-0 text-[11px] font-semibold uppercase"
                        style={{ color: "#6F6F82", fontFamily: FONT }}
                      >
                        To Date
                      </p>
                      <button
                        type="button"
                        onClick={handleShowAll}
                        className="border-none bg-transparent p-0 text-[12px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
                        style={{ fontFamily: FONT }}
                      >
                        Show All
                      </button>
                    </div>
                    <DatePicker
                      value={billingForm.date_to || undefined}
                      onChange={(_, currentDateString) =>
                        handleDateRangeChange("date_to", currentDateString)
                      }
                      placeholder="Select a date to filter"
                      options={{ useFiscalYearDefault: false }}
                      containerClassName="w-full"
                      inputClassName="rounded-[10px] border-slate-200 bg-white text-[13px] text-[#1a1f36] focus:border-[#4096ff] focus:ring-0"
                    />
                  </div>
                </div>
              </Card>

              <div ref={unbilledTransactionsRef}>
                <Card
                  className="flex h-full flex-col"
                  bodyClassName="flex-1"
                  icon={IoReceiptOutline}
                  title="UNBILLED TRANSACTIONS"
                  subtitle="Review all unpaid transactions."
                  loading={Boolean(billingForm.boat_id && isBoatBillingDataLoading)}
                  loadingBodyOnly={Boolean(billingForm.boat_id && isBoatBillingDataLoading)}
                  skeletonLayout={[{ type: "table", columns: 3, rows: 4 }]}
                >
                  {!billingForm.boat_id ? (
                    <div className="flex min-h-[228px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
                      Select a boat to view unbilled transactions.
                    </div>
                  ) : billingForm.items.every((item) => !item.record_id) ? (
                    <div className="flex min-h-[228px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
                      No unbilled transactions found for the selected boat and date range.
                    </div>
                  ) : (
                    <div className="rounded-[10px] border border-slate-200 bg-slate-50/60 p-2">
                      <div
                        className="mb-2 grid gap-1 px-1 pr-1"
                        style={{
                          gridTemplateColumns:
                            "minmax(0,0.72fr) minmax(0,1fr) minmax(96px,0.72fr)",
                        }}
                      >
                        {["Type", "Date", "Amount (₱)"].map((label) => (
                          <p
                            key={label}
                            className="m-0 truncate text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: "#6F6F82", fontFamily: FONT }}
                          >
                            {label}
                          </p>
                        ))}
                      </div>
                      <div
                        className="max-h-[220px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
                        style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}
                      >
                        {billingForm.items.map((item, index) => {
                          const records = (availableRecordsByType[item.transaction_type] ?? []).filter((record) => {
                            if (!billingForm.boat_id) return true;
                            return record.boatId === billingForm.boat_id;
                          });
                          const typeLabel = TRANSACTION_TYPE_OPTIONS.find((option) => option.value === item.transaction_type)?.label || "";
                          const selectedRecord = records.find((record) => String(record.value) === String(item.record_id));
                          const recordDate = formatLongDisplayDate(
                            selectedRecord?.sortDate,
                          ) || "";
                          const canShowBanyeraBreakdown = item.transaction_type === "banyera" && selectedRecord?.record;

                          return (
                            <div
                              key={`${item.transaction_type}-${index}`}
                              className="mb-2 grid items-start gap-1 pr-1 last:mb-0"
                              style={{
                                gridTemplateColumns:
                                  "minmax(0,0.72fr) minmax(0,1fr) minmax(96px,0.72fr)",
                              }}
                            >
                              {canShowBanyeraBreakdown ? (
                                <Tooltip title="Click me">
                                  <button
                                    type="button"
                                    onClick={() => setBreakdownBanyera(selectedRecord.record)}
                                    className="flex h-[46px] w-full min-w-0 cursor-pointer items-center rounded-[10px] border border-slate-200 bg-white px-3.5 text-left text-[12px] font-semibold text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-50"
                                    style={{ fontFamily: FONT }}
                                  >
                                    <span className="truncate">{typeLabel}</span>
                                  </button>
                                </Tooltip>
                              ) : (
                                <Input value={typeLabel} readOnly readOnlyPlain wrapperClassName="min-w-0" inputClassName="truncate text-[12px]" />
                              )}
                              <Input value={recordDate} readOnly readOnlyPlain wrapperClassName="min-w-0" inputClassName="truncate text-[12px]" />
                              <Input value={item.amount} readOnly readOnlyPlain wrapperClassName="min-w-0" inputClassName="text-[12px]" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {formError ? <ErrorMessage>{formError}</ErrorMessage> : null}
                </Card>
              </div>
            </div>

            <div ref={billedTransactionsHistoryRef}>
              <Card
                className="flex h-full flex-col"
                bodyClassName="flex-1"
                icon={IoDocumentTextOutline}
                title="BILLED TRANSACTIONS HISTORY"
                subtitle="Check previous billing references already recorded for this boat."
                loading={Boolean(billingForm.boat_id && isBoatBillingDataLoading)}
                loadingBodyOnly={Boolean(billingForm.boat_id && isBoatBillingDataLoading)}
                skeletonLayout={[{ type: "table", columns: 3, rows: 4 }]}
              >
                {!billingForm.boat_id ? (
                  <div className="flex min-h-[228px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
                    Select a boat to view billed transaction history.
                  </div>
                ) : billedTransactionsHistory.length === 0 ? (
                  <div className="flex min-h-[228px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
                    No billed transactions found for this boat.
                  </div>
                ) : (
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50/60 p-3">
                    <div
                      className="mb-2 grid gap-2 px-1 pr-3"
                      style={{
                        gridTemplateColumns:
                          "minmax(160px,1fr) minmax(160px,0.9fr) minmax(140px,0.8fr)",
                      }}
                    >
                      {["Reference", "Date", "Amount (₱)"].map((label) => (
                        <p
                          key={label}
                          className="m-0 text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: "#6F6F82", fontFamily: FONT }}
                        >
                          {label}
                        </p>
                      ))}
                    </div>
                    <div
                      className="max-h-[220px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
                      style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}
                    >
                      {billedTransactionsHistory.map((transaction) => (
                        <div
                          key={transaction.id}
                          className="mb-2 grid items-start gap-2 pr-3 last:mb-0"
                          style={{
                            gridTemplateColumns:
                              "minmax(160px,1fr) minmax(160px,0.9fr) minmax(140px,0.8fr)",
                          }}
                        >
                          <Tooltip title="Click me">
                            <button
                              type="button"
                              onClick={() => setBreakdownBill(transaction.bill)}
                              className="flex h-[46px] w-full cursor-pointer items-center rounded-[10px] border border-slate-200 bg-white px-3.5 text-left text-[13px] font-semibold text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-50"
                              style={{ fontFamily: FONT }}
                            >
                              <span className="truncate">{transaction.referenceNumber || "-"}</span>
                            </button>
                          </Tooltip>
                          <Input value={transaction.date} readOnly readOnlyPlain />
                          <Input
                            value={Number(transaction.amount || 0).toLocaleString("en-PH", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                            readOnly
                            readOnlyPlain
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </Modal>
      ) : null}
      <BreakdownBillModal
        open={Boolean(breakdownBill)}
        bill={breakdownBill}
        onClose={() => setBreakdownBill(null)}
      />
      <BreakdownBanyeraModal
        open={Boolean(breakdownBanyera)}
        transaction={breakdownBanyera}
        onClose={() => setBreakdownBanyera(null)}
      />
      {!isHeadViewOnly ? <RecordPaymentModal
        open={Boolean(paymentModalBill)}
        bill={paymentModalBill}
        form={paymentModalForm}
        paymentScope={paymentModalScope}
        paymentableBills={paymentableBills}
        fieldErrors={paymentModalFieldErrors}
        formError={paymentModalFormError}
        saving={createPaymentMutation.isPending}
        onClose={closePaymentModal}
        onChange={updatePaymentModalForm}
        onScopeChange={handlePaymentModalScopeChange}
        onBillChange={handlePaymentModalBillChange}
        onBoatChange={handlePaymentModalBoatChange}
        onBillToggle={handlePaymentModalBillToggle}
        onSelectAllBills={handlePaymentModalSelectAllBills}
        onShowAllBills={handlePaymentModalShowAllBills}
        onDateFilterChange={handlePaymentModalDateFilterChange}
        onSave={handleCreatePaymentFromModal}
      /> : null}
      {!isHeadViewOnly ? <EditPaymentModal
        open={Boolean(editingPayment)}
        payment={editingPayment}
        form={editPaymentForm}
        errors={editPaymentErrors}
        saving={updatePaymentMutation.isPending}
        onClose={closeEditPayment}
        onChange={updateEditPaymentForm}
        onSave={handleSavePaymentEdit}
      /> : null}
      <PaymentDetailsDrawer
        open={Boolean(detailPayment)}
        payment={detailPayment}
        onClose={() => setDetailPayment(null)}
      />
      {!isHeadViewOnly ? <PayBillPromptModal
        open={showPayBillPrompt}
        saving={isSaving}
        onClose={() => {
          if (isSaving) return;
          setShowPayBillPrompt(false);
        }}
        onYes={handleGenerateBillAndPay}
        onNo={handleGenerateBillOnly}
      /> : null}
      {selectedBillPdfFile ? (
        <iframe
          key={selectedBillPdfFile.url}
          ref={selectedBillPrintFrameRef}
          src={selectedBillPdfFile.url}
          title="Billing Statement Print Preload"
          aria-hidden="true"
          onLoad={() => setSelectedBillPdfReady(true)}
          className="fixed bottom-0 right-0 h-0 w-0 border-0"
        />
      ) : null}
      {!isHeadViewOnly ? <EditBillingModal
        open={Boolean(editingBillId) && isRecordsTab}
        bill={editingBillRecord}
        form={billingForm}
        boatOptions={boats.map((boat) => ({
          value: String(boat.boat_id),
          label: `${boat.boat_name}`,
        }))}
        previewBoat={previewBoat}
        fieldErrors={fieldErrors}
        formError={formError}
        availableRecordsByType={availableRecordsByType}
        saving={isSaving}
        totalAmount={previewTotal}
        onClose={closeEditBilling}
        onBoatChange={handleEditBoatChange}
        onDateRangeChange={handleEditDateRangeChange}
        onShowAll={handleShowAll}
        onSave={handleGenerateBillOnly}
      /> : null}
    </ConfigProvider>
  );
};

export default SuperBilling;
