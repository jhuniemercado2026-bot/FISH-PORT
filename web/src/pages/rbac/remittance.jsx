import React, { useEffect, useMemo, useRef, useState } from "react";
import { ConfigProvider, Tooltip } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import "typeface-montserrat";
import {
  IoAddOutline,
  IoAlertCircleOutline,
  IoCheckmarkOutline,
  IoChevronDownOutline,
  IoCreateOutline,
  IoDocumentTextOutline,
  IoLayersOutline,
  IoRefreshOutline,
  IoSearchOutline,
  IoWalletOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import FilterSelect from "../../components/FilterSelect";
import Legend from "../../components/Legend";
import Spinner from "../../components/Spinner";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import Card from "../../components/Card";
import Modal, { ModalFieldError, ModalTextInput } from "../../components/Modal";
import NoDataFound from "../../components/NoDataFound";
import { useSidebar } from "../../store/sidebarStore";
import { showBottomToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import api from "../../api/axios";
import { useRemittanceDataQuery } from "../../hooks/useRemittanceDataQuery";
import { useTodaySystemCashReceivedQuery } from "../../hooks/useTodaySystemCashReceivedQuery";
import { useRemittanceReportDataQuery } from "../../hooks/useRemittanceReportDataQuery";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { buildRemittanceReportPdf } from "../../lib/pdfDocumentRemittanceReport";
import { getNormalizedRole } from "../../utils/transactionLock";

const FONT = "'Montserrat', sans-serif";

const antTheme = {
  token: { colorPrimary: "#4096ff", borderRadius: 12, fontFamily: FONT },
};

const PAGE_SIZE = 10;
const PAGE_DEBOUNCE_MS = 150;

const TABS = [
  { value: "records", label: "Remittance", icon: IoDocumentTextOutline },
  { value: "create", label: "Create Remittance", icon: IoAddOutline },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "remitted", label: "Remitted" },
  { value: "pending", label: "Pending" },
];

const PERIOD_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

const REMITTANCE_STATUS_LEGEND = [
  {
    key: "remitted",
    label: "Remitted",
    meaning: "Submitted remittance record",
    color: "#16a34a",
  },
  {
    key: "pending",
    label: "Pending",
    meaning: "Awaiting remittance processing",
    color: "#f59e0b",
  },
];

const formatMoneyValue = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatMoney = (value) => `₱${formatMoneyValue(value)}`;
const getRemittanceTodayCashReceived = (row) =>
  Number(row?.amount || 0) - Number(row?.surplus || 0) + Number(row?.deficit || 0);

const formatRemittanceDate = (value) => {
  const normalized = String(value || "").slice(0, 10);
  if (!normalized) return "-";
  const [year = "", month = "", day = ""] = normalized.split("-");
  if (!year || !month || !day) return normalized;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const getTodayDateString = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const getDefaultCreateForm = () => {
  return {
    confirmedAmount: "",
    remarks: "",
  };
};

const getRemittanceHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Remittance" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("remittance-") ? rawId.slice("remittance-".length) : "";
};

const getDateOnlyValue = (value) => {
  const normalized = String(value || "").slice(0, 10);
  const [year = "", month = "", day = ""] = normalized.split("-");
  if (!year || !month || !day) return null;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const filterByPeriod = (records, period) => {
  if (period === "all") return records;

  const todayStr = getTodayDateString();
  const now = new Date(`${todayStr}T00:00:00`);

  if (period === "today") {
    return records.filter((record) => String(record?.date || "").slice(0, 10) === todayStr);
  }

  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());

    return records.filter((record) => {
      const date = getDateOnlyValue(record?.date);
      return date && date >= start && date <= now;
    });
  }

  if (period === "month") {
    return records.filter((record) => {
      const date = getDateOnlyValue(record?.date);
      return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
  }

  if (period === "year") {
    return records.filter((record) => {
      const date = getDateOnlyValue(record?.date);
      return date && date.getFullYear() === now.getFullYear();
    });
  }

  return records;
};

const TailDropdown = ({ value, onChange, options, height = 42, minWidth = 150 }) => (
  <FilterSelect value={value} onChange={onChange} options={options} height={height} width={minWidth} />
);

const TH = ({ children, align = "left" }) => (
  <th
    className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
    style={{ color: "#1a1f36", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}
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
    <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
      <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
      <p className="m-0 text-[12px] font-normal text-red-600">{message}</p>
    </div>
  ) : null;

const SuperRemittance = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const queryClient = useQueryClient();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const [activeItem, setActiveItem] = useState("Remittance");
  const [contentMargin, setContentMargin] = useState(() => (window.innerWidth >= 1024 ? 256 : 0));
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [requestedPage, setRequestedPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentTab, setTab] = useState("records");
  const [createForm, setCreateForm] = useState(getDefaultCreateForm);
  const [errors, setErrors] = useState({});
  const [editingRemittance, setEditingRemittance] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [remittingRemittanceId, setRemittingRemittanceId] = useState(null);
  const [unremittingRemittanceId, setUnremittingRemittanceId] = useState(null);
  const [selectedReportPdfUrl, setSelectedReportPdfUrl] = useState("");
  const didRunTableFilterResetRef = useRef(false);
  const [isRefreshingTodayCash, setIsRefreshingTodayCash] = useState(false);

  const [selectedReportPdfLoading, setSelectedReportPdfLoading] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 350);
  const rawHighlightedRemittanceId = getRemittanceHighlightId({ highlightedSearchResult, search: location.search });
  const highlightToken = rawHighlightedRemittanceId
    ? `${rawHighlightedRemittanceId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedRemittanceId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedRemittanceId;
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

  useEffect(() => {
    setDismissedHighlightToken("");
  }, [location.key]);

  const todayDateString = getTodayDateString().slice(0, 10);
  const { data: remittanceData, isLoading } = useRemittanceDataQuery({
    page: currentPage,
    perPage: PAGE_SIZE,
    search: debouncedSearch,
    period: periodFilter,
    status: statusFilter,
    highlightRemittanceId: highlightedRemittanceId,
    paginated: true,
  });
  const { data: todayCashData, refetch: refetchTodayCash } = useTodaySystemCashReceivedQuery({ date: todayDateString });

  const handleRefreshTodayCash = async () => {
    setIsRefreshingTodayCash(true);
    try {
      await refetchTodayCash();
    } finally {
      setIsRefreshingTodayCash(false);
    }
  };

  const selectedReportDate = searchParams.get("report") ?? "";
  const { transactionLock, isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const normalizedRole = getNormalizedRole();
  const isCoordinator = normalizedRole === "coordinator";
  const isHead = normalizedRole === "head";
  const remittances = remittanceData?.remittances ?? [];
  const remittancesMeta = remittanceData?.remittancesMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const selectedReportRow = useMemo(
    () => remittances.find((row) => String(row?.date || "").slice(0, 10) === selectedReportDate) ?? null,
    [remittances, selectedReportDate],
  );
  const selectedReportData = useRemittanceReportDataQuery({
    selectedDate: selectedReportDate,
    remittanceFilters: {
      page: 1,
      perPage: PAGE_SIZE,
      search: selectedReportDate,
      paginated: true,
    },
  }, { enabled: Boolean(selectedReportDate) });
  const visibleTabs = useMemo(
    () => (isHead ? TABS.filter((tab) => tab.value === "records") : TABS),
    [isHead],
  );
  const breadcrumbLabel = visibleTabs.find((tab) => tab.value === currentTab)?.label ?? "Remittance";
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);
  const preparedBy = useMemo(
    () =>
      currentUser?.full_name ||
      [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(" ") ||
      currentUser?.user_name ||
      "Admin",
    [currentUser],
  );
  const overviewRows = useMemo(
    () =>
      isHead
        ? remittances.filter((row) => String(row.status || "").toLowerCase() === "remitted")
        : remittances,
    [isHead, remittances],
  );
  const remittanceStats = remittanceData?.stats ?? null;

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) {
      setContentMargin(sidebarCollapsed ? 72 : 256);
    } else if (window.innerWidth < 1024) {
      setContentMargin(0);
    }
  }, [sidebarCollapsed, sidebarOpen]);

  const handleWidthChange = (nextWidth) => {
    if (window.innerWidth >= 1024) setContentMargin(nextWidth);
  };

  const filteredRows = remittances;
  const totalPages = Math.max(1, Number(remittancesMeta.last_page || 1));
  const resolvedHighlightedPage = highlightedRemittanceId
    ? Number(remittancesMeta.current_page || requestedPage)
    : requestedPage;
  const safePage = Math.min(resolvedHighlightedPage, totalPages);
  const paginationRequestedPage = highlightedRemittanceId ? safePage : requestedPage;
  const paginatedRows = filteredRows;
  const showInitialSkeleton = isLoading && !remittanceData;

  const handlePageChange = React.useCallback((nextPageOrUpdater) => {
    clearUniversalHighlight();
    setRequestedPage((page) =>
      typeof nextPageOrUpdater === "function" ? nextPageOrUpdater(page) : nextPageOrUpdater
    );
  }, [clearUniversalHighlight]);

  useEffect(() => {
    if (!didRunTableFilterResetRef.current) {
      didRunTableFilterResetRef.current = true;
      return;
    }

    setRequestedPage(1);
    setCurrentPage(1);
  }, [debouncedSearch, periodFilter, statusFilter]);



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
    if (!highlightedRemittanceId) return;
    const resolvedPage = Number(remittancesMeta.current_page || 0);
    if (resolvedPage > 0 && (resolvedPage !== currentPage || resolvedPage !== requestedPage)) {
      setRequestedPage(resolvedPage);
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, highlightedRemittanceId, remittancesMeta.current_page, requestedPage]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("q")) {
      setSearch(params.get("q") || "");
    }
    if (params.get("highlight")?.startsWith("remittance-")) {
      setRequestedPage(1);
      setCurrentPage(1);
    }
  }, [location.search]);

  useEffect(() => {
    if (currentTab !== "create") return;
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.delete("report");
      return nextParams;
    });
  }, [currentTab, setSearchParams]);

  useEffect(() => {
    if (!selectedReportDate) return;
    if (currentTab !== "records") setTab("records");
  }, [currentTab, selectedReportDate, setTab]);

  useEffect(() => {
    if (isHead && currentTab !== "records") {
      setTab("records");
    }
  }, [currentTab, isHead, setTab]);

  useEffect(() => {
    let isActive = true;
    let nextUrl = "";

    const buildSelectedReportPdf = async () => {
      if (!selectedReportDate) {
        setSelectedReportPdfUrl("");
        setSelectedReportPdfLoading(false);
        return;
      }

      const [year = "", month = "", day = ""] = String(selectedReportDate).slice(0, 10).split("-");
      if (!year || !month || !day) {
        setSelectedReportPdfUrl("");
        setSelectedReportPdfLoading(false);
        return;
      }

      setSelectedReportPdfLoading(true);

      try {
        const monthLabel = new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("en-PH", {
          month: "long",
        });
        const pdfBytes = await buildRemittanceReportPdf({
          month: monthLabel,
          day,
          year,
          preparedBy,
          reportData: selectedReportData.data ?? {},
        });

        if (!isActive) return;
        const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
        nextUrl = URL.createObjectURL(pdfBlob);
        setSelectedReportPdfUrl(nextUrl);
      } catch {
        if (!isActive) return;
        setSelectedReportPdfUrl("");
      } finally {
        if (isActive) setSelectedReportPdfLoading(false);
      }
    };

    buildSelectedReportPdf();

    return () => {
      isActive = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [preparedBy, selectedReportData.data, selectedReportDate]);

  const stats = useMemo(
    () => [
      {
        title: "Total Remittances",
        value: formatMoney(remittanceStats?.total_remittances ?? overviewRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
        icon: IoDocumentTextOutline,
        tone: "blue",
      },
      {
        title: "Total Surplus",
        value: formatMoney(remittanceStats?.total_surplus ?? overviewRows.reduce((sum, row) => sum + Number(row.surplus || 0), 0)),
        icon: IoWalletOutline,
        tone: "blue",
      },
      {
        title: "Total Deficit",
        value: formatMoney(remittanceStats?.total_deficit ?? overviewRows.reduce((sum, row) => sum + Number(row.deficit || 0), 0)),
        icon: IoWalletOutline,
        tone: "blue",
      },
    ],
    [overviewRows, remittanceStats],
  );

  const remittanceDate = String(editingRemittance?.date || todayDateString).slice(0, 10);
  const hasTodayDailyRemittance = useMemo(
    () =>
      remittances.some(
        (row) =>
          String(row.date || "").slice(0, 10) === todayDateString &&
          String(row.remittance_id) !== String(editingRemittance?.remittance_id ?? "")
      ),
    [editingRemittance?.remittance_id, todayDateString, remittances]
  );

  const previewAmount = useMemo(() => {
    if (hasTodayDailyRemittance) return 0;
    return Number(todayCashData?.amount ?? 0);
  }, [hasTodayDailyRemittance, todayCashData?.amount]);

  const confirmedAmountNumber = Number(createForm.confirmedAmount || 0);
  const totalAmountToRemit = createForm.confirmedAmount === "" ? 0 : confirmedAmountNumber;
  const surplusAmount = createForm.confirmedAmount === "" ? 0 : Math.max(confirmedAmountNumber - Number(previewAmount || 0), 0);
  const deficitAmount = createForm.confirmedAmount === "" ? 0 : Math.max(Number(previewAmount || 0) - confirmedAmountNumber, 0);

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/remittances", payload);
      return res.data;
    },
    onSuccess: (data) => {
      setSubmitLoading(false);
      showBottomToast("success", "Remittance Submitted", "The remittance was submitted to head successfully.");
      setCreateForm(getDefaultCreateForm());
      setErrors({});
      setTab("records");

      // Apply a client-side transaction lock immediately so all transaction actions
      // across the app become view-only while the system transitions.
      try {
        const lockObj = data?.transaction_lock ?? null;
        if (lockObj) {
          queryClient.setQueryData(["transaction-lock"], lockObj);
        }
      } catch (e) {
        // swallow - optimistic lock is best-effort
      }

      void queryClient.invalidateQueries({ queryKey: ["transaction-lock"] });
      void queryClient.invalidateQueries({ queryKey: ["remittances-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["notifications-data"], refetchType: "active" });
    },
    onError: (error) => {
      setSubmitLoading(false);
      const response = error?.response?.data;
      const nextErrors = {};

      Object.entries(response?.errors ?? {}).forEach(([key, value]) => {
        nextErrors[key] = Array.isArray(value) ? value[0] : value;
      });

      setErrors(nextErrors);
      showBottomToast("error", "Save Failed", response?.message || "Unable to submit remittance right now.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.put(`/remittances/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      setSubmitLoading(false);
      showUpdatedToast("Remittance", "remittance");
      setCreateForm(getDefaultCreateForm());
      setEditingRemittance(null);
      setShowEditModal(false);
      setErrors({});
      setTab("records");
      void queryClient.invalidateQueries({ queryKey: ["transaction-lock"] });
      void queryClient.invalidateQueries({ queryKey: ["remittances-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["notifications-data"], refetchType: "active" });
    },
    onError: (error) => {
      setSubmitLoading(false);
      const response = error?.response?.data;
      const nextErrors = {};

      Object.entries(response?.errors ?? {}).forEach(([key, value]) => {
        nextErrors[key] = Array.isArray(value) ? value[0] : value;
      });

      setErrors(nextErrors);
      showBottomToast("error", "Update Failed", response?.message || "Unable to update remittance right now.");
    },
  });

  const remitMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.patch(`/remittances/${id}/remit`);
      return res.data;
    },
    onMutate: (id) => {
      setRemittingRemittanceId(id);
    },
    onSuccess: (data) => {
      showBottomToast("success", "Remittance Accepted", "The remittance was marked as remitted.");
      try {
        const lockObj = data?.transaction_lock ?? null;
        queryClient.setQueryData(["transaction-lock"], lockObj);
      } catch (e) {
        // swallow - keep UI consistent with server response if available
      }
      void queryClient.invalidateQueries({ queryKey: ["transaction-lock"] });
      void queryClient.invalidateQueries({ queryKey: ["remittances-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["payments-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["notifications-data"], refetchType: "active" });
    },
    onError: (error) => {
      const response = error?.response?.data;
      showBottomToast("error", "Update Failed", response?.message || "Unable to mark the remittance as remitted right now.");
    },
    onSettled: () => {
      setRemittingRemittanceId(null);
    },
  });

  const unremitMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.patch(`/remittances/${id}/unremit`);
      return res.data;
    },
    onMutate: (id) => {
      setUnremittingRemittanceId(id);
    },
    onSuccess: (data) => {
      showBottomToast("success", "Remittance Reverted", "The remittance was returned to pending.");
      try {
        const lockObj = data?.transaction_lock ?? null;
        queryClient.setQueryData(["transaction-lock"], lockObj);
      } catch (e) {
        // swallow - keep UI consistent with server response if available
      }
      void queryClient.invalidateQueries({ queryKey: ["transaction-lock"] });
      void queryClient.invalidateQueries({ queryKey: ["remittances-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["payments-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["notifications-data"], refetchType: "active" });
    },
    onError: (error) => {
      const response = error?.response?.data;
      showBottomToast("error", "Update Failed", response?.message || "Unable to revert the remittance right now.");
    },
    onSettled: () => {
      setUnremittingRemittanceId(null);
    },
  });

  const handleSubmitRemittance = () => {
    setSubmitLoading(true);
    const nextErrors = {};
    const trimmedRemarks = String(createForm.remarks || "").trim();

    if (!todayDateString) nextErrors.date = "Date is required.";
    if (previewAmount <= 0) nextErrors.date = "No cash collections were found for today.";
    if (!String(createForm.confirmedAmount || "").trim()) {
      nextErrors.confirmedAmount = "Confirm the cash amount is required.";
    }
    if ((surplusAmount > 0 || deficitAmount > 0) && !trimmedRemarks) {
      nextErrors.remarks = "Remarks is required when there is a surplus or deficit.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setSubmitLoading(false);
      return;
    }

    if (isTransactionLocked) {
      setSubmitLoading(false);
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    if (editingRemittance?.remittance_id) {
      const currentAmount = Number(editingRemittance.amount || 0);
      const currentRemarks = String(editingRemittance.remarks || "").trim();
      const nextRemarks = String(createForm.remarks || "").trim();

      if (
        currentAmount === Number(confirmedAmountNumber) &&
        currentRemarks === nextRemarks
      ) {
        showNoChangesToast();
        setEditingRemittance(null);
        setCreateForm(getDefaultCreateForm());
        setErrors({});
        setActiveTab("records");
        setSubmitLoading(false);
        return;
      }
    }

    const payload = {
      date: todayDateString,
      amount: totalAmountToRemit,
      surplus: surplusAmount,
      deficit: deficitAmount,
      remarks: trimmedRemarks || null,
    };

    if (editingRemittance?.remittance_id) {
      // When updating, don't change the date - keep the original
      const updatePayload = { ...payload, date: remittanceDate };
      updateMutation.mutate({ id: editingRemittance.remittance_id, payload: updatePayload });
      return;
    }

    createMutation.mutate(payload);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingRemittance(null);
    setCreateForm(getDefaultCreateForm());
    setErrors({});
  };

  const handleSaveEditModal = () => {
    if (!editingRemittance) return;

    const trimmedRemarks = String(createForm.remarks || "").trim();
    const currentRemarks = String(editingRemittance.remarks || "").trim();

    if (trimmedRemarks === currentRemarks) {
      showNoChangesToast();
      closeEditModal();
      return;
    }

    const updatePayload = {
      date: String(editingRemittance.date || todayDateString).slice(0, 10),
      amount: Number(editingRemittance.amount || 0),
      surplus: Number(editingRemittance.surplus || 0),
      deficit: Number(editingRemittance.deficit || 0),
      remarks: trimmedRemarks || null,
    };

    updateMutation.mutate({ id: editingRemittance.remittance_id, payload: updatePayload });
  };

  const handleEditRemittance = (row) => {
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    setEditingRemittance(row);
    setCreateForm({
      confirmedAmount: String(row.amount ?? ""),
      remarks: row.remarks || "",
    });
    setErrors({});

    if (isCoordinator) {
      setShowEditModal(true);
      return;
    }

    setTab("create");
  };

  const handleOpenRemittanceReport = (row) => {
    const reportDate = String(row?.date || "").slice(0, 10);
    if (!reportDate) return;
    clearUniversalHighlight();
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.delete("highlight");
      nextParams.set("report", reportDate);
      return nextParams;
    });
  };

  const handleRemitRemittance = (row) => {
    if (String(row?.status || "").toLowerCase() === "remitted") {
      return;
    }

    remitMutation.mutate(row.remittance_id);
  };

  const handleUnremitRemittance = (row) => {
    if (String(row?.status || "").toLowerCase() !== "remitted") {
      return;
    }

    unremitMutation.mutate(row.remittance_id);
  };

  return (
    <ConfigProvider theme={antTheme}>
      <style>{`* { font-family: ${FONT} !important; } input::placeholder, textarea::placeholder { color: #1a1f36 !important; opacity: 0.4; }`}</style>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
        <Sidebar
          activeItem={activeItem}
          setActiveItem={setActiveItem}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onWidthChange={handleWidthChange}
        />

        <div
          className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px",
            transition: "margin-left 0.3s ease",
          }}
        >
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />

          <main className="min-w-0 flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">
              {selectedReportDate ? (
                <div className="fixed inset-0 z-[1200] bg-white">
                  {(selectedReportPdfLoading || selectedReportData.isLoading || selectedReportData.isFetching) ? (
                    <div className="flex h-screen items-center justify-center bg-white px-6 text-center text-[13px] text-slate-500">
                      Generating PDF preview...
                    </div>
                  ) : selectedReportPdfUrl ? (
                    <iframe
                      key={selectedReportPdfUrl}
                      src={selectedReportPdfUrl}
                      title="Remittance Report PDF"
                      className="block h-screen w-full border-0"
                      style={{ backgroundColor: "#f8fafc" }}
                    />
                  ) : (
                    <div className="flex h-screen items-center justify-center bg-white px-6 text-center text-[13px] text-slate-500">
                      No report preview available.
                    </div>
                  )}
                </div>
              ) : null}
              <div className="mb-5 flex items-center justify-between">
                <TitlePage title="Remittance" subtitle="Manage all remittance records." loading={showInitialSkeleton} />
                <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: breadcrumbLabel }]} fontFamily={FONT} loading={showInitialSkeleton} />
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                {stats.map((item) => (
                  <OverviewCard key={item.title} {...item} loading={showInitialSkeleton} />
                ))}
              </div>

              <Tabs
                tabs={visibleTabs.map(({ value, label, icon }) => ({
                  key: value,
                  label,
                  icon,
                }))}
                activeKey={currentTab}
                onTabChange={setTab}
                fontFamily={FONT}
                className="mb-5"
                loading={showInitialSkeleton}
                centerContent={null}
                rightContent={
                  currentTab === "records" ? (
                    <Legend items={REMITTANCE_STATUS_LEGEND} loading={showInitialSkeleton} />
                  ) : currentTab === "create" ? (
                    <button
                      type="button"
                      aria-label="Refresh"
                      onClick={handleRefreshTodayCash}
                      disabled={isRefreshingTodayCash}
                      className="flex items-center gap-2 rounded-[10px] border border-gray-200 bg-white px-3 py-2 text-[13px] font-normal text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <IoRefreshOutline className="text-[15px]" />
                      <span>Refresh</span>
                    </button>
                  ) : null
                }
              >
              {currentTab === "records" ? (
                <>
                <TableCard
                  title="Remittance Records"
                  subtitle="All remittance records in the system."
                  loading={showInitialSkeleton}
                  headerActionsSkeletonCount={4}
                  bodyClassName="overflow-x-auto"
                  footerClassName="flex items-center justify-between"
                  actions={
                    <>
                      <div
                        className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-4 transition-all"
                        style={{ height: 42, width: 280 }}
                      >
                        <IoSearchOutline className="text-[17px] flex-shrink-0" style={{ color: "#1a1f36" }} />
                        <input
                          type="text"
                          placeholder="Search for Remittance Reference No., Date, Today's System Cash Received"
                          value={search}
                          onChange={(event) => {
                            clearUniversalHighlight();
                            setSearch(event.target.value);
                          }}
                          className="w-full border-none bg-transparent text-[13px] outline-none"
                          style={{ fontFamily: FONT, color: "#1a1f36" }}
                        />
                      </div>
                      <TailDropdown
                        value={periodFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setPeriodFilter(value);
                          setRequestedPage(1);
                          setCurrentPage(1);
                        }}
                        options={PERIOD_OPTIONS}
                        height={42}
                        minWidth={150}
                      />
                      <TailDropdown
                        value={statusFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setStatusFilter(value);
                          setRequestedPage(1);
                          setCurrentPage(1);
                        }}
                        options={STATUS_OPTIONS}
                        height={42}
                        minWidth={150}
                      />
                    </>
                  }
                  pagination={{
                    meta: remittancesMeta,
                    totalPages,
                    currentPage: safePage,
                    requestedPage: paginationRequestedPage,
                    isLoading: showInitialSkeleton,
                    onPageChange: handlePageChange,
                  }}
                >
                  <div className={showInitialSkeleton ? "overflow-hidden" : "overflow-x-auto"}>
                    <table className="w-full border-collapse" style={{ minWidth: 1220 }}>
                      <thead>
                        <tr>
                          <TH>Remittance Reference No.</TH>
                          <TH>Date</TH>
                          <TH align="right">Today's System Cash Received (PHP)</TH>
                          <TH align="right">Confirm the Cash (PHP)</TH>
                          <TH align="right">Surplus (PHP)</TH>
                          <TH align="right">Deficit (PHP)</TH>
                          <TH>Remarks</TH>
                          <TH>Action</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {showInitialSkeleton ? (
                          Array.from({ length: PAGE_SIZE }).map((_, index) => (
                            <tr key={`remittance-skeleton-${index}`} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                              {Array.from({ length: 8 }).map((__, column) => (
                                <td key={column} className="px-4 py-3">
                                  {column === 7 ? (
                                    <div className="h-8 w-8 rounded-lg bg-slate-100" />
                                  ) : (
                                    <div className="h-3 rounded bg-slate-100" style={{ width: column === 4 ? 90 : 120 }} />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={8}>
                              <NoDataFound title={debouncedSearch ? "No results found" : "No Data Found"} />
                            </td>
                          </tr>
                        ) : (
                          paginatedRows.map((row, index) => (
                            (() => {
                              const isHighlighted =
                                highlightedRemittanceId &&
                                String(highlightedRemittanceId) === String(row.remittance_id);
                              return (
                            <tr
                              key={row.remittance_id}
                              onClick={() => handleOpenRemittanceReport(row)}
                              className={`cursor-pointer transition-colors ${highlightedRemittanceId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${isHighlighted ? "universal-search-highlight" : ""}`.trim()}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                              }}
                              >
                              <td className="px-4 py-3">
                                <Tooltip title="Click Me">
                                  <div className="flex w-fit items-center gap-2">
                                    <span
                                      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                      style={{
                                        backgroundColor:
                                          String(row.status || "").toLowerCase() === "remitted"
                                            ? "#16a34a"
                                            : "#f59e0b",
                                        minWidth: 10,
                                        minHeight: 10,
                                      }}
                                    />
                                    <span className="text-[13px] font-semibold text-[#1a1f36]">
                                      {row.remittance_reference_no}
                                    </span>
                                  </div>
                                </Tooltip>
                              </td>
                              <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>{formatRemittanceDate(row.date)}</td>
                              <td className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: "#1a1f36" }}>
                                {formatMoneyValue(getRemittanceTodayCashReceived(row))}
                              </td>
                              <td className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: "#1a1f36" }}>
                                {formatMoneyValue(row.amount)}
                              </td>
                              <td className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: "#1a1f36" }}>
                                {formatMoneyValue(row.surplus)}
                              </td>
                              <td className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: "#1a1f36" }}>
                                {formatMoneyValue(row.deficit)}
                              </td>
                              <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
                                {row.remarks || "-"}
                              </td>
                              <td className="px-4 py-3">
                                {isHead ? (() => {
                                  const isUnremitting = unremitMutation.isPending && unremittingRemittanceId === row.remittance_id;
                                  const isRemitting = remitMutation.isPending && remittingRemittanceId === row.remittance_id;
                                  const isRowRemitted = String(row.status || "").toLowerCase() === "remitted";

                                  if (isUnremitting) {
                                    return (
                                      <Tooltip title="Undo remitted status">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleUnremitRemittance(row);
                                          }}
                                          disabled
                                          className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                                          style={{ borderColor: "#f59e0b" }}
                                          title="Undo remitted status"
                                        >
                                          <span className="inline-flex h-full w-full items-center justify-center text-amber-600">
                                            <Spinner size={15} />
                                          </span>
                                        </button>
                                      </Tooltip>
                                    );
                                  }

                                  if (isRemitting) {
                                    return (
                                      <Tooltip title="Mark as remitted">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleRemitRemittance(row);
                                          }}
                                          disabled
                                          className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
                                          style={{ borderColor: "#16a34a" }}
                                          title="Mark as remitted"
                                        >
                                          <span className="inline-flex h-full w-full items-center justify-center text-emerald-600">
                                            <Spinner size={15} />
                                          </span>
                                        </button>
                                      </Tooltip>
                                    );
                                  }

                                  if (isRowRemitted) {
                                    return (
                                      <Tooltip title="Undo remitted status">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleUnremitRemittance(row);
                                          }}
                                          disabled={unremittingRemittanceId === row.remittance_id && unremitMutation.isPending}
                                          className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                                          style={{ borderColor: "#f59e0b" }}
                                          title="Undo remitted status"
                                        >
                                          <span className="inline-flex h-full w-full items-center justify-center">
                                            <IoRefreshOutline style={{ fontSize: "15px", color: "#f59e0b" }} />
                                          </span>
                                        </button>
                                      </Tooltip>
                                    );
                                  }

                                  return (
                                    <Tooltip title="Mark as remitted">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleRemitRemittance(row);
                                        }}
                                        disabled={isRemitting}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        style={{ borderColor: "#16a34a" }}
                                        title="Mark as remitted"
                                      >
                                        <span className="inline-flex h-full w-full items-center justify-center">
                                          <IoCheckmarkOutline style={{ fontSize: "16px", color: "#16a34a" }} />
                                        </span>
                                      </button>
                                    </Tooltip>
                                  );
                                })() : (
                                  <Tooltip
                                    title={
                                      isTransactionLocked
                                        ? transactionLockMessage
                                        : String(row.status || "").toLowerCase() === "remitted"
                                          ? "Remitted records can no longer be edited"
                                          : "Edit"
                                    }
                                  >
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleEditRemittance(row);
                                      }}
                                      disabled={isTransactionLocked}
                                      className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      style={{ borderColor: isTransactionLocked ? undefined : "#1a1f36" }}
                                      title={isTransactionLocked ? transactionLockMessage : "Edit"}
                                    >
                                      <IoCreateOutline style={{ fontSize: "15px", color: isTransactionLocked ? "#94a3b8" : "#1a1f36" }} />
                                    </button>
                                  </Tooltip>
                                )}
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
                <div className="space-y-6">
                  <TableCard
                    bodyClassName="p-5"
                    style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
                  >
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:items-stretch">
                      <Card
                        icon={IoLayersOutline}
                        title="REMITTANCE DETAILS"
                        subtitle={
                          editingRemittance
                            ? `Update remittance details for ${formatRemittanceDate(remittanceDate)}.`
                            : "Review today's remittance details before submitting to head."
                        }
                        className="min-h-[520px]"
                        loading={showInitialSkeleton}
                        skeletonLayout={[
                          { type: "fields", count: 5, columns: 2, spans: [2, 2, 1, 1, 2], textareaIndexes: [4] },
                        ]}
                      >
                        <div className="space-y-4">
                          <div>
                            <Label>Today's System Cash Received</Label>
                            <input
                              type="text"
                              value={formatMoney(previewAmount)}
                              readOnly
                              className="h-[46px] w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-medium text-[#1a1f36] outline-none"
                            />
                          </div>
                          <InlineFieldError message={errors.date} />

                          <div>
                            <Label required>Confirm the Cash</Label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={createForm.confirmedAmount}
                              onChange={(event) => {
                                setCreateForm((current) => ({ ...current, confirmedAmount: event.target.value }));
                                setErrors((current) => ({ ...current, confirmedAmount: "" }));
                              }}
                              placeholder="Enter confirmed cash amount"
                              className={`h-[46px] w-full rounded-[12px] border bg-white px-3.5 text-[13px] outline-none ${errors.confirmedAmount ? "border-red-300" : "border-slate-200"}`}
                            />
                            <InlineFieldError message={errors.confirmedAmount} />
                          </div>

                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <div>
                              <Label>Surplus</Label>
                              <input
                                type="text"
                                value={formatMoney(surplusAmount)}
                                readOnly
                                className="h-[46px] w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-medium text-[#1a1f36] outline-none"
                              />
                            </div>

                            <div>
                              <Label>Deficit</Label>
                              <input
                                type="text"
                                value={formatMoney(deficitAmount)}
                                readOnly
                                className="h-[46px] w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-medium text-[#1a1f36] outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <Label>Remarks</Label>
                            <textarea
                              value={createForm.remarks}
                              onChange={(event) => {
                                setCreateForm((current) => ({ ...current, remarks: event.target.value }));
                                setErrors((current) => ({ ...current, remarks: "" }));
                              }}
                              rows={4}
                              placeholder="Add remittance remarks"
                              className={`min-h-[96px] w-full resize-none rounded-xl border px-3.5 py-3 text-[13px] outline-none ${errors.remarks ? "border-red-300" : "border-slate-200 focus:border-[#4096ff]"}`}
                              style={{ fontFamily: FONT, color: "#0d1117" }}
                            />
                            <InlineFieldError message={errors.remarks} />
                          </div>
                        </div>
                      </Card>

                      <div
                        className="flex h-full flex-col justify-between rounded-[10px] bg-white px-5 py-5"
                        style={{
                          border: "1px solid #e5e7eb",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                        }}
                      >
                        <div className="flex flex-1 flex-col justify-center gap-6">
                          {showInitialSkeleton ? (
                            <div className="animate-pulse">
                              <div className="mx-auto h-3 w-36 rounded bg-slate-200" />
                              <div className="mx-auto mt-3 h-11 w-44 rounded bg-slate-200" />
                              <div className="mx-auto mt-6 h-[48px] w-48 rounded-xl bg-slate-200" />
                            </div>
                          ) : (
                            <>
                              <div className="text-center">
                                <p
                                  className="m-0 text-[11px] font-semibold uppercase"
                                  style={{ color: "#6F6F82", fontFamily: FONT }}
                                >
                                  Total Amount to Remit
                                </p>
                                <p
                                  className="m-0 mt-2 text-[40px] font-bold text-[#1a1f36]"
                                  style={{ fontVariantNumeric: "tabular-nums" }}
                                >
                                  {formatMoney(totalAmountToRemit)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={handleSubmitRemittance}
                                disabled={submitLoading || createMutation.isPending || updateMutation.isPending || isTransactionLocked}
                                className="mx-auto flex min-w-[180px] cursor-pointer items-center justify-center rounded-xl border-none bg-[#1a1f36] px-7 py-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:opacity-70"
                                title={isTransactionLocked ? transactionLockMessage : undefined}
                              >
                                {submitLoading || createMutation.isPending || updateMutation.isPending ? (
                                  <Spinner size={4} />
                                ) : (
                                  editingRemittance ? "Save Changes" : "Submit Remittance"
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCard>
                </div>
              )}
              </Tabs>

              {showEditModal && editingRemittance ? (
                <Modal
                  title="Edit Remittance"
                  onClose={closeEditModal}
                  onSave={handleSaveEditModal}
                  saving={updateMutation.isPending}
                  saveLabel="Save"
                  savingLabel=""
                  saveDisabled={updateMutation.isPending}
                  closeOnBackdrop={false}
                >
                  <div className="grid gap-5">
                    <ModalTextInput
                      label="Today's System Cash Received"
                      value={formatMoneyValue(getRemittanceTodayCashReceived(editingRemittance))}
                      disabled
                      placeholder="-"
                    />
                    <ModalTextInput
                      label="Date"
                      value={formatRemittanceDate(editingRemittance?.date)}
                      disabled
                      placeholder="-"
                    />
                    <div>
                      <p className="m-0 mb-2 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>
                        Remarks
                      </p>
                      <textarea
                        value={createForm.remarks}
                        onChange={(event) => {
                          setCreateForm((current) => ({ ...current, remarks: event.target.value }));
                          setErrors((current) => ({ ...current, remarks: "" }));
                        }}
                        rows={4}
                        placeholder="Add remittance remarks"
                        className={`min-h-[96px] w-full resize-none rounded-xl border px-3.5 py-3 text-[13px] outline-none ${errors.remarks ? "border-red-300" : "border-slate-200 focus:border-[#4096ff]"}`}
                        style={{ fontFamily: FONT, color: "#0d1117" }}
                      />
                      <ModalFieldError message={errors.remarks} />
                    </div>
                  </div>
                </Modal>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default SuperRemittance;
