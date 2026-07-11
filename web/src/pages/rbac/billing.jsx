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
  IoCardOutline,
  IoCashOutline,
  IoChevronDownOutline,
  IoCreateOutline,
  IoDocumentTextOutline,
  IoAlertCircleOutline,
  IoLayersOutline,
  IoPersonOutline,
  IoReceiptOutline,
  IoRefreshOutline,
  IoSearchOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import StatusPill from "../../components/StatusPill";
import FilterSelect from "../../components/FilterSelect";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import DatePicker from "../../components/DatePicker";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { useSidebar } from "../../store/sidebarStore";
import { showAddedToast, showBottomToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import api from "../../api/axios";
import { useBillingBoatsQuery, useBillingDataQuery, useBillingFormLookupsQuery, useBillingPaymentsQuery } from "../../hooks/useBillingDataQuery";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { getPaymentFormLookupsQueryOptions } from "../../hooks/usePaymentsDataQuery";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import { buildBillingStatementPdf } from "../../lib/pdfDocumentBill";
import Spinner from "../../components/Spinner";
import NoDataFound from "../../components/NoDataFound";

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
  { value: "/billing", label: "Billing", icon: IoReceiptOutline },
  { value: "/create-billing", label: "Create Billing", icon: IoAddOutline },
];
const BILLING_TAB_PATHS = {
  records: "/billing",
  create: "/create-billing",
};
const BILLING_PATH_TABS = {
  "/billing": "records",
  "/create-billing": "create",
};
const BILLING_TABS = new Set(["records", "create"]);
const getBillingTabPath = (tab) => BILLING_PATH_TABS[tab] ? tab : BILLING_TAB_PATHS[tab] ?? BILLING_TAB_PATHS.records;
const getBillingTabFromLocation = ({ pathname, search }) => {
  const tab = new URLSearchParams(search).get("tab");
  if (BILLING_TABS.has(tab)) return getBillingTabPath(tab);

  return BILLING_PATH_TABS[pathname] ? pathname : BILLING_TAB_PATHS.records;
};

const PERIOD_FILTER_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
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

const getBillingHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Bills" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("bill-") ? rawId.slice("bill-".length) : "";
};

const getDatePartsFromValue = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
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
  if (item?.transaction_type === "docking")
    return item?.docking?.docking_date || fallbackDate;
  if (item?.transaction_type === "banyera")
    return (
      item?.banyera_transaction?.transaction_date ||
      item?.banyeraTransaction?.transaction_date ||
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
  ({ icon: Icon, readOnly = false, error = false, ...props }, ref) => (
    <div
      className={`flex items-center gap-2.5 border px-3.5 transition-all ${readOnly ? "bg-slate-50" : "bg-white"} ${error && !readOnly ? "border-red-300" : "border-slate-200 focus-within:border-[#4096ff]"}`}
      style={{ height: 46, borderRadius: 10 }}
    >
      {Icon ? (
        <Icon className="flex-shrink-0 text-[15px] text-slate-400" />
      ) : null}
      <input
        ref={ref}
        readOnly={readOnly}
        {...props}
        className={`h-full w-full border-none bg-transparent text-[13px] font-medium outline-none ${readOnly ? "cursor-default text-slate-500" : "text-[#0d1117]"}`}
        style={{ fontFamily: FONT }}
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
      maxWidth="920px"
      minimumSavingMs={0}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label>Billing Reference No.</Label>
          <Input value={formatReferenceNumber(bill.bill_reference_no) || ""} readOnly />
        </div>
        <div>
          <Label>Total Amount</Label>
          <Input value={formatAccountingMoney(totalAmount)} readOnly />
        </div>
        <div className="md:col-span-2">
          <Label>Boat Name</Label>
          <Input value={previewBoat?.boat_name || ""} readOnly />
          {fieldErrors.boat_id ? <ErrorMessage>{fieldErrors.boat_id}</ErrorMessage> : null}
        </div>
        <div>
          <Label>Boat Owner</Label>
          <Input value={previewBoat?.owner?.full_name || ""} readOnly />
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
                    <Input value={typeLabel} readOnly />
                    <Input value={recordDate} readOnly />
                    <Input value={item.amount} readOnly />
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
  <FilterSelect
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
  const [billingForm, setBillingForm] = useState(getInitialBillingForm);
  const pendingCreateBillingScrollRef = useRef(null);
  const unbilledTransactionsRef = useRef(null);
  const billedTransactionsHistoryRef = useRef(null);
  const prevBoatIdRef = useRef(null);
  const selectedBillId = searchParams.get("bill") ?? "";
  const rawHighlightedBillId = getBillingHighlightId({ highlightedSearchResult, search: location.search });
  const highlightToken = rawHighlightedBillId
    ? `${rawHighlightedBillId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedBillId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedBillId;
  const [selectedBillPdfUrl, setSelectedBillPdfUrl] = useState("");
  const [selectedBillPdfLoading, setSelectedBillPdfLoading] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitMode, setSubmitMode] = useState(null);
  const [formError, setFormError] = useState("");
  const [pageShellLoadedOnce, setPageShellLoadedOnce] = useState(false);
  const [isRefreshingUnbilledTransactions, setIsRefreshingUnbilledTransactions] = useState(false);

  const navigateBillingTab = React.useCallback((nextTab, options = {}) => {
    const nextPath = getBillingTabPath(nextTab);

    if (location.pathname !== nextPath || location.search) {
      navigate(nextPath, {
        replace: options.replace ?? location.pathname === nextPath,
        state: options.state ?? null,
      });
    }
  }, [location.pathname, location.search, navigate]);
  const activeTabKey = BILLING_PATH_TABS[activeTab] ?? "records";
  const isRecordsTab = activeTabKey === "records";
  const isCreateTab = activeTabKey === "create";
  const breadcrumbLabel = isCreateTab ? "Create Billing" : "Billing";
  const selectedBillingBoatId = String(billingForm.boat_id || "");

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
  const overviewQuery = useBillingDataQuery({
    page: 1,
    perPage: 1,
    search: "",
    status: "all",
    period: "all",
    boat: "all",
    sort: "created_at_desc",
    paginated: true,
    includeBoats: false,
  }, {
    enabled: isCreateTab,
  });
  const boatsQuery = useBillingBoatsQuery();
  const formLookupsQuery = useBillingFormLookupsQuery(
    { boatId: selectedBillingBoatId },
    {
      enabled: isCreateTab && Boolean(selectedBillingBoatId),
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
    compact: true,
  }, {
    enabled: isCreateTab && Boolean(selectedBillingBoatId),
    placeholderData: undefined,
  });
  const paymentsQuery = useBillingPaymentsQuery(
    { billId: selectedBillId },
    {
      enabled: Boolean(selectedBillId),
    },
  );
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();

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
  const overviewData = overviewQuery.data ?? data;
  const billingStats = overviewData?.stats ?? { total_records: 0, today_records: 0 };
  const billedHistoryBills = createFormBillsQuery.data?.bills ?? [];
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
    if (!isCreateTab) return;
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.delete("bill");
      return nextParams;
    });
  }, [isCreateTab, setSearchParams]);

  useEffect(() => {
    if (!selectedBillId) return;
    if (!isRecordsTab || location.pathname !== getBillingTabPath("records")) {
      navigateBillingTab("records", { replace: true, state: location.state });
    }
  }, [isRecordsTab, location.pathname, location.state, navigateBillingTab, selectedBillId]);

  const openBillingStatement = (billId) => {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.set("bill", String(billId));
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

  const warmPaymentsAndNavigate = (billId) => {
    const paymentsFormLookupOptions = getPaymentFormLookupsQueryOptions();

    queryClient.fetchQuery({
      ...paymentsFormLookupOptions,
      staleTime: 0,
    });

    navigate(
      `/record-payment?bill_id=${encodeURIComponent(billId)}`,
    );
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
        title: "Today's Bill",
        value: billingStats.today_records,
        icon: IoCalendarOutline,
        tone: "amber",
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
  const showInitialSkeleton = !isError && isLoading && !data;
  const showBillsEmptyState = hasBillsResponse && billsTotal === 0;
  const isCreateTabLoading = !overviewData && overviewQuery.isLoading;
  const pageShellHasData = Boolean(data || overviewData);
  const pageShellHasError = Boolean(isError || overviewQuery.isError);
  const showPageShellSkeleton = !pageShellLoadedOnce && (isRecordsTab ? showInitialSkeleton : isCreateTabLoading);
  const hasActiveTableFilters =
    debouncedSearch || periodFilter !== "all";

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
    if (pageShellHasData || pageShellHasError) {
      setPageShellLoadedOnce(true);
    }
  }, [pageShellHasData, pageShellHasError]);

  useEffect(() => {
    if (requestedPage > totalPages) setRequestedPage(totalPages);
  }, [requestedPage, totalPages]);

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

  const availableRecordsByType = useMemo(
    () => ({
      docking: (dockings ?? []).map((record) => ({
        value: String(record.docking_id),
        label: `${record.boat?.boat_name ?? "Unknown boat"} - ${formatDisplayDate(record.docking_date)}`,
        amount: Number(record.docking_fee || 0),
        boatId: String(record.boat_id ?? ""),
        sortDate: String(record.docking_date || ""),
        isBilled: Boolean(record.is_billed),
      })),
      banyera: (banyeraTransactions ?? []).map((record) => ({
        value: String(record.banyera_id),
        label: `${record.boat?.boat_name ?? "Unknown boat"} - ${formatDisplayDate(record.transaction_date)}`,
        amount: Number(record.total_fee || 0),
        boatId: String(record.boat_id ?? ""),
        sortDate: String(record.transaction_date || ""),
        isBilled: Boolean(record.is_billed),
      })),
    }),
    [banyeraTransactions, dockings],
  );

  const buildLookupRecordsByType = (lookups = {}) => ({
    docking: (lookups.dockings ?? []).map((record) => ({
      value: String(record.docking_id),
      label: `${record.boat?.boat_name ?? "Unknown boat"} - ${formatDisplayDate(record.docking_date)}`,
      amount: Number(record.docking_fee || 0),
      boatId: String(record.boat_id ?? ""),
      sortDate: String(record.docking_date || ""),
      isBilled: Boolean(record.is_billed),
    })),
    banyera: (lookups.banyeraTransactions ?? []).map((record) => ({
      value: String(record.banyera_id),
      label: `${record.boat?.boat_name ?? "Unknown boat"} - ${formatDisplayDate(record.transaction_date)}`,
      amount: Number(record.total_fee || 0),
      boatId: String(record.boat_id ?? ""),
      sortDate: String(record.transaction_date || ""),
      isBilled: Boolean(record.is_billed),
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
      void queryClient.invalidateQueries({ queryKey: ["billing-form-lookups"] });

      if (variables?.proceedToPayment && createdBill?.bill_id) {
        setBillingForm(getInitialBillingForm());
        setFieldErrors({});
        setEditingBillId(null);
        setFormError("");
        setSubmitMode(null);
        await warmPaymentsAndNavigate(createdBill.bill_id);
        return;
      }

      showAddedToast("Billing", "billing record");
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
      const response = await api.put(`/bills/${id}`, payload, {
        params: { minimal: 1 },
      });
      return response.data;
    },
    onSuccess: async (updatedBill, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["billing-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billing-form-lookups"] });

      if (variables?.proceedToPayment) {
        setBillingForm(getInitialBillingForm());
        setFieldErrors({});
        setEditingBillId(null);
        setFormError("");
        setSubmitMode(null);
        await warmPaymentsAndNavigate(updatedBill?.bill_id ?? variables.id);
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

  const previewBoat = boatMap[billingForm.boat_id];
  const billedTransactionsHistory = useMemo(() => {
    if (!billingForm.boat_id) return [];

    return billedHistoryBills
      .filter(
        (bill) => String(bill.boat_id ?? "") === String(billingForm.boat_id),
      )
        .map((bill) => ({
          id: bill.bill_id,
          referenceNumber: formatReferenceNumber(bill.bill_reference_no),
          date: formatDisplayDate(bill.billing_date || bill.created_at),
          amount: Number(bill.total_amount || 0),
          sortDate: String(bill.billing_date || bill.created_at || ""),
        }))
      .sort((a, b) =>
        String(b.sortDate || "").localeCompare(String(a.sortDate || "")),
      );
  }, [billedHistoryBills, billingForm.boat_id]);

  const selectedBillRecord = useMemo(
    () =>
      bills.find((bill) => String(bill.bill_id) === String(selectedBillId)) ??
      null,
    [bills, selectedBillId],
  );
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
          date: getBillItemDisplayDate(item, selectedBillRecord.created_at),
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
  const previewTotal = useMemo(
    () =>
      billingForm.items.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0,
      ),
    [billingForm.items],
  );

  useEffect(() => {
    if (!selectedBillRecord) {
      setSelectedBillPdfUrl("");
      setSelectedBillPdfLoading(false);
      return undefined;
    }

    let isActive = true;
    let nextUrl = "";

    const loadPdf = async () => {
      if (isActive) setSelectedBillPdfLoading(true);
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
        const reference =
          formatReferenceNumber(selectedBillRecord?.bill_reference_no) ||
          "billing-statement";
        const pdfFile = new File([nextData], `${reference}.pdf`, {
          type: "application/pdf",
        });
        nextUrl = URL.createObjectURL(pdfFile);
        setSelectedBillPdfUrl(nextUrl);
      } catch (error) {
        console.error("Failed to generate billing statement PDF", error);
        if (isActive) {
          setSelectedBillPdfUrl("");
        }
      } finally {
        if (isActive) setSelectedBillPdfLoading(false);
      }
    };

    loadPdf();

    return () => {
      isActive = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [
    selectedBillChargeItems,
    selectedBillPeriod,
    selectedBillRecord,
    selectedBillStatus.label,
  ]);

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

  const handleRefreshUnbilledTransactions = async () => {
    if (!isCreateTab) return;

    setIsRefreshingUnbilledTransactions(true);

    try {
      if (selectedBillingBoatId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["billing-form-lookups"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["billing-data"], refetchType: "active" }),
        ]);

        const freshLookups = await formLookupsQuery.refetch();
        const freshRecordsByType = buildLookupRecordsByType(freshLookups?.data ?? formLookupsQuery.data ?? {});
        const freshBilledRecordIds = buildBilledRecordIds(freshRecordsByType, editingBillRecord);

        setBillingForm((current) => ({
          ...current,
          items: buildBoatBillingItems(
            current.boat_id,
            current.date_from,
            current.date_to,
            {
              preserveCurrentSelection: Boolean(editingBillId),
              selectedRecordIds: current.items
                .filter((item) => item.record_id)
                .map((item) => String(item.record_id)),
              recordsByType: freshRecordsByType,
              billedIds: freshBilledRecordIds,
            },
          ),
        }));
        return;
      }

      setBillingForm((current) => ({
        ...current,
        items: buildBoatBillingItems(
          current.boat_id,
          current.date_from,
          current.date_to,
          {
            preserveCurrentSelection: Boolean(editingBillId),
            selectedRecordIds: current.items
              .filter((item) => item.record_id)
              .map((item) => String(item.record_id)),
          },
        ),
      }));
    } catch (error) {
      console.error("Error refreshing unbilled transactions", error);
    } finally {
      setIsRefreshingUnbilledTransactions(false);
    }
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
    if (!isCreateTab || !billingForm.boat_id) return;

    const sectionRef = pendingCreateBillingScrollRef.current;
    if (!sectionRef) return;

    pendingCreateBillingScrollRef.current = null;
    showCreateBillingSection(sectionRef);
  }, [isCreateTab, billingForm.boat_id]);

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
    if (!isCreateTab || editingBillId || !billingForm.boat_id) return;

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
    isCreateTab,
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

  const handlePrintBillingStatement = () => {
    printPdfFile(selectedBillPdfUrl);
  };

  const handleDownloadBillingStatement = () => {
    const reference = formatReferenceNumber(selectedBillRecord?.bill_reference_no) || "billing-statement";
    downloadPdfFile(selectedBillPdfUrl, `${reference}.pdf`);
  };

  const submitBill = (proceedToPayment = false) => {
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
    submitBill(false);
  };

  const handleProceedToPayment = () => {
    submitBill(true);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isProceedingToPayment = isSaving && submitMode === "payment";
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
              {!selectedBillRecord ? (
                <>
                  <div className="mb-5 flex items-center justify-between">
                    <TitlePage title="Billing" subtitle="Manage billing records and create billing entries." loading={showPageShellSkeleton} />
                    <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: breadcrumbLabel }]} fontFamily={FONT} loading={showPageShellSkeleton} />
                  </div>

                  <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
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

                </>
              ) : null}
              
              <Tabs
                tabs={TABS.map((tab) => ({ key: tab.value, label: tab.label, icon: tab.icon }))}
                activeKey={activeTab}
                onTabChange={navigateBillingTab}
                fontFamily={FONT}
                className={!selectedBillRecord ? "mb-5" : ""}
                loading={showPageShellSkeleton}
                rightContent={isCreateTab ? (
                  showPageShellSkeleton ? (
                    <div
                      aria-hidden="true"
                      className="h-[38px] w-[96px] animate-pulse rounded-[10px] border border-slate-200 bg-slate-100"
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label="Refresh"
                      onClick={handleRefreshUnbilledTransactions}
                      disabled={isRefreshingUnbilledTransactions}
                      className="flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] font-normal text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <IoRefreshOutline className="text-[15px]" />
                      <span>Refresh</span>
                    </button>
                  )
                ) : null}
              >

              {isRecordsTab ? (
                selectedBillRecord ? (
                  <div className="fixed inset-0 z-[1200] bg-white">
                    {selectedBillPdfLoading ? (
                      <div className="flex h-screen items-center justify-center px-6 text-center text-[13px] text-slate-500">
                        Generating PDF preview...
                      </div>
                    ) : (
                      <iframe
                        key={selectedBillPdfUrl}
                        src={selectedBillPdfUrl}
                        title="Billing Statement PDF"
                        className="block h-screen w-full border-0"
                        style={{ backgroundColor: "#f8fafc" }}
                      />
                    )}
                  </div>
                ) : (
                  <>
                    <TableCard
                      title="Billing Records"
                      subtitle="All billing records in the system."
                      loading={showInitialSkeleton}
                      headerActionsSkeletonCount={2}
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
                            <TH>Date</TH>
                            <TH>
                              <div className="text-right">Amount (₱)</div>
                            </TH>
                            <TH>Action</TH>
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
                                {Array.from({ length: 8 }).map((__, column) => (
                                  <td key={column} className="px-4 py-3">
                                    {column === 7 ? (
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
                              <td colSpan={8} className="px-4 py-8 text-center">
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
                              <td colSpan={8}>
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
                                  openBillingStatement(record.bill_id)
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
                                </tr>
                            )})
                                                        
                          )}
                        </tbody>
                       </table>
                      </div>

                    </TableCard>
                  </>
                )
              ) : (
                <div className="border border-slate-200 bg-white p-5">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-stretch">
                      <Card
                        className="flex h-full flex-col"
                        bodyClassName="flex-1"
                        icon={IoBoatOutline}
                        title="BOAT INFORMATION"
                        subtitle="Choose the boat and billing period for this entry."
                        loading={isCreateTabLoading}
                        skeletonLayout={[
                          { type: "fields", count: 5, columns: 2, spans: [2, 1, 1, 1, 1] },
                        ]}
                      >
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                          <div className="xl:col-span-2">
                            <div>
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
                            </div>
                            {fieldErrors.boat_id ? <ErrorMessage>{fieldErrors.boat_id}</ErrorMessage> : null}
                          </div>

                          <div>
                            <Label>Boat Owner</Label>
                            <Input
                              value={previewBoat?.owner?.full_name || ""}
                              readOnly
                            />
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
                            <div
                              className="mb-2 flex min-h-[20px] items-center justify-between gap-3"
                              onClickCapture={showUnbilledTransactions}
                            >
                              <p
                                className="m-0 text-[11px] font-semibold uppercase"
                                style={{ color: "#6F6F82", fontFamily: FONT }}
                              >
                                From Date
                              </p>
                              <span className="block h-[18px] w-[52px]" aria-hidden="true" />
                            </div>
                            <div onClickCapture={showUnbilledTransactions}>
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
                          </div>

                          <div>
                            <div
                              className="mb-2 flex min-h-[20px] items-center justify-between gap-3"
                              onClickCapture={showUnbilledTransactions}
                            >
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
                            <div onClickCapture={showUnbilledTransactions}>
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

                        </div>
                      </Card>
                    
                      <div ref={unbilledTransactionsRef}>
                        <Card
                          className="flex h-full flex-col"
                          bodyClassName="flex-1"
                          icon={IoReceiptOutline}
                          title="UNBILLED TRANSACTIONS"
                          subtitle="Review all unpaid transactions pulled from the selected boat."
                          loading={Boolean(
                            billingForm.boat_id &&
                              (isCreateTabLoading || isBoatBillingDataLoading || isRefreshingUnbilledTransactions),
                          )}
                          skeletonLayout={[
                            { type: "table", columns: 3, rows: 4 },
                          ]}
                        >
                        {!billingForm.boat_id ? (
                          <div className="flex min-h-[228px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
                            Select a boat to view unbilled transactions.
                          </div>
                        ) : billingForm.items.every(
                            (item) => !item.record_id,
                          ) ? (
                          <div className="flex min-h-[228px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
                            <span>
                              No unbilled transactions found for the selected boat
                              and date range.
                            </span>
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
                              <p
                                className="m-0 text-[11px] font-semibold uppercase tracking-wider"
                                style={{ color: "#6F6F82", fontFamily: FONT }}
                              >
                                Type
                              </p>
                              <p
                                className="m-0 text-[11px] font-semibold uppercase tracking-wider"
                                style={{ color: "#6F6F82", fontFamily: FONT }}
                              >
                                Date
                              </p>
                              <p
                                className="m-0 text-[11px] font-semibold uppercase tracking-wider"
                                style={{ color: "#6F6F82", fontFamily: FONT }}
                              >
                                Amount (₱)
                              </p>
                            </div>

                            <div
                              className="max-h-[220px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
                              style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}
                            >
                              {billingForm.items.map((item, index) => {
                                const records = (
                                  availableRecordsByType[item.transaction_type] ??
                                  []
                                ).filter((record) => {
                                  if (!billingForm.boat_id) return true;
                                  return record.boatId === billingForm.boat_id;
                                });

                                const typeLabel =
                                  TRANSACTION_TYPE_OPTIONS.find(
                                    (option) =>
                                      option.value === item.transaction_type,
                                  )?.label || "";
                                const recordDate =
                                  formatLongDisplayDate(
                                    records.find(
                                      (record) =>
                                        String(record.value) ===
                                        String(item.record_id),
                                    )?.sortDate,
                                  ) || "";

                                return (
                                  <div
                                    key={`${item.transaction_type}-${index}`}
                                    className="mb-2 grid items-start gap-2 pr-3 last:mb-0"
                                    style={{
                                      gridTemplateColumns:
                                        "minmax(160px,1fr) minmax(160px,0.9fr) minmax(140px,0.8fr)",
                                    }}
                                  >
                                    <input
                                      value={typeLabel}
                                      disabled
                                      readOnly
                                      className="h-[46px] rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-[#1a1f36] opacity-100 outline-none"
                                      placeholder=""
                                    />
                                    <input
                                      value={recordDate}
                                      disabled
                                      readOnly
                                      className="h-[46px] rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-[#1a1f36] opacity-100 outline-none"
                                      placeholder=""
                                    />
                                    <input
                                      value={item.amount}
                                      disabled
                                      readOnly
                                      className="h-[46px] rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-[#1a1f36] opacity-100 outline-none"
                                      inputMode="decimal"
                                      placeholder=""
                                    />
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


                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-stretch">
                      <div ref={billedTransactionsHistoryRef}>
                        <Card
                          className="flex h-full flex-col"
                          bodyClassName="flex-1"
                          icon={IoDocumentTextOutline}
                          title="BILLED TRANSACTIONS HISTORY"
                          subtitle="Check previous billing references already recorded for this boat."
                          loading={isCreateTabLoading}
                          skeletonLayout={[
                            { type: "table", columns: 3, rows: 4 },
                          ]}
                        >
                          {!billingForm.boat_id ? (
                            <div className="flex min-h-[228px] items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
                              Select a boat to view billed transaction history.
                            </div>
                          ) : isCreateTabLoading || isBoatBillingDataLoading ? (
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
                              <div className="space-y-2 pr-1">
                                {Array.from({ length: 4 }).map((_, index) => (
                                  <div
                                    key={index}
                                    className="grid animate-pulse items-start gap-2 pr-3"
                                    style={{
                                      gridTemplateColumns:
                                        "minmax(160px,1fr) minmax(160px,0.9fr) minmax(140px,0.8fr)",
                                    }}
                                  >
                                    <div className="h-[46px] rounded-[10px] border border-slate-200 bg-slate-100" />
                                    <div className="h-[46px] rounded-[10px] border border-slate-200 bg-slate-100" />
                                    <div className="h-[46px] rounded-[10px] border border-slate-200 bg-slate-100" />
                                  </div>
                                ))}
                              </div>
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
                                <p
                                  className="m-0 text-[11px] font-semibold uppercase tracking-wider"
                                  style={{ color: "#6F6F82", fontFamily: FONT }}
                                >
                                  Reference
                                </p>
                                <p
                                  className="m-0 text-[11px] font-semibold uppercase tracking-wider"
                                  style={{ color: "#6F6F82", fontFamily: FONT }}
                                >
                                  Date
                                </p>
                                <p
                                  className="m-0 text-[11px] font-semibold uppercase tracking-wider"
                                  style={{ color: "#6F6F82", fontFamily: FONT }}
                                >
                                  Amount (₱)
                                </p>
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
                                    <input
                                      value={transaction.referenceNumber}
                                      disabled
                                      readOnly
                                      className="h-[46px] rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-[#1a1f36] opacity-100 outline-none"
                                    />
                                    <input
                                      value={transaction.date}
                                      disabled
                                      readOnly
                                      className="h-[46px] rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-[#1a1f36] opacity-100 outline-none"
                                    />
                                    <input
                                      value={Number(
                                        transaction.amount || 0,
                                      ).toLocaleString("en-PH", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                      disabled
                                      readOnly
                                      className="h-[46px] rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-[#1a1f36] opacity-100 outline-none"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </Card>
                      </div>

                      <div
                        className="flex h-full flex-col justify-between rounded-[10px] bg-white px-5 py-5"
                        style={{
                          border: "1px solid #e5e7eb",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                        }}
                      >
                        <div className="flex flex-1 flex-col justify-center gap-6">
                          {isCreateTabLoading ? (
                            <div className="animate-pulse">
                              <div className="mx-auto h-3 w-24 rounded bg-slate-200" />
                              <div className="mx-auto mt-3 h-10 w-40 rounded bg-slate-200" />
                              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                <div className="h-[46px] w-[180px] rounded-[10px] bg-slate-200" />
                                <div className="h-[46px] w-[180px] rounded-[10px] bg-slate-200" />
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="text-center">
                                <p
                                  className="m-0 text-[11px] font-semibold uppercase"
                                  style={{ color: "#6F6F82", fontFamily: FONT }}
                                >
                                  Total Amount
                                </p>
                                <p className="m-0 mt-2 text-[38px] font-bold text-[#1a1f36]">
                                  {Number(previewTotal || 0).toLocaleString("en-PH", {
                                    style: "currency",
                                    currency: "PHP",
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </p>
                              </div>
                              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:items-center">
                                <button
                                  type="button"
                                  onClick={handleProceedToPayment}
                                  disabled={isSaving || isTransactionLocked}
                                  className="flex min-w-[180px] items-center justify-center rounded-[10px] border border-[#1a1f36] bg-white px-7 py-3 text-[13px] font-semibold text-[#1a1f36] cursor-pointer transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {isProceedingToPayment ? (
                                    <Spinner size={4} />
                                  ) : (
                                    "Proceed to Payment"
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleSaveBill}
                                  disabled={isSaving || isTransactionLocked}
                                  className="flex min-w-[180px] items-center justify-center rounded-[10px] border-none bg-[#1a1f36] px-7 py-3 text-[13px] font-semibold text-white cursor-pointer transition-colors hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {isGeneratingBill ? (
                                    <Spinner size={4} />
                                  ) : (
                                    "Generate Bill"
                                  )}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </Tabs>
            </div>
          </main>
        </div>
      </div>
      <EditBillingModal
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
        onSave={handleSaveBill}
      />
    </ConfigProvider>
  );
};

export default SuperBilling;
