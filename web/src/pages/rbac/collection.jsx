import React, { useEffect, useMemo, useState } from "react";
import { Tooltip } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import "typeface-montserrat";
import {
  IoAddOutline,
  IoCheckmarkOutline,
  IoCashOutline,
  IoDocumentTextOutline,
  IoLayersOutline,
  IoRefreshOutline,
  IoSearchOutline,
  IoWalletOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Legend from "../../components/Legend";
import FilterButton from "../../components/FilterButton";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import NoDataFound from "../../components/NoDataFound";
import Card from "../../components/Card";
import Modal, { ModalFieldError } from "../../components/Modal";
import Spinner from "../../components/Spinner";
import { useSidebar } from "../../store/sidebarStore";
import { showBottomToast } from "../../store/bottomToastStore";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useCollectionsDataQuery } from "../../hooks/useCollectionsDataQuery";
import { useRemittanceDataQuery } from "../../hooks/useRemittanceDataQuery";
import { useTodayCollectionQuery } from "../../hooks/useTodayCollectionQuery";
import { useRemittanceReportDataQuery } from "../../hooks/useRemittanceReportDataQuery";
import { buildRemittanceReportPdf } from "../../lib/pdfDocumentRemittanceReport";
import api from "../../api/axios";
import { getNormalizedRole } from "../../utils/transactionLock";
import { invalidateTodayCollection } from "../../utils/remittanceCollectionCache";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import { cacheTab, getCachedTab } from "../../utils/tabSession";

const FONT = "'Montserrat', sans-serif";
const PAGE_SIZE = 10;
const PAGE_DEBOUNCE_MS = 150;

const COLLECTION_TABS = [
  { key: "collections", label: "Collections", icon: IoCashOutline },
  { key: "remittance", label: "Remittance", icon: IoDocumentTextOutline },
];
const COLLECTION_TAB_STORAGE_KEY = "opol:collections:active-tab";
const COLLECTION_TAB_KEYS = COLLECTION_TABS.map((tab) => tab.key);

const PERIOD_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

const REMITTANCE_STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "remitted", label: "Checked" },
  { value: "pending", label: "Unchecked" },
];

const REMITTANCE_STATUS_LEGEND = [
  {
    key: "remitted",
    label: "Checked",
    meaning: "Checked remittance record",
    color: "#16a34a",
  },
  {
    key: "pending",
    label: "Unchecked",
    meaning: "Awaiting remittance check",
    color: "#f59e0b",
  },
];

const TH = ({ children, className = "" }) => (
  <th
    className={`whitespace-nowrap bg-white px-4 py-3 text-left text-[13px] font-semibold ${className}`.trim()}
    style={{ color: "#1a1f36", borderBottom: "2px solid #e5e7eb" }}
  >
    {children}
  </th>
);

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatPeso = (value) => `₱${formatMoney(value)}`;

const formatReferenceNumber = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-6).padStart(6, "0");
};

const getRemittanceReportFilename = (row) => {
  const reference = formatReferenceNumber(row?.remittance_reference_no);
  const safeReference = (reference || "remittance-report")
    .replace(/[<>:"/\\|?*]+/g, "")
    .trim();

  return `${safeReference}.pdf`;
};

const getRemittanceTodayCashReceived = (row) =>
  Number(row?.amount || 0) - Number(row?.surplus || 0) + Number(row?.deficit || 0);

const getRemittanceHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Remittance" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("remittance-") ? rawId.slice("remittance-".length) : "";
};

const getRemittanceStatusColor = (status) =>
  String(status || "").toLowerCase() === "remitted" ? "#16a34a" : "#f59e0b";

const getTodayDateString = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const getDefaultCreateRemittanceForm = () => ({
  confirmedAmount: "",
  remarks: "",
});

const RemittanceFormLabel = ({ children, required = false }) => (
  <label
    className="mb-1.5 block text-[11px] font-semibold uppercase"
    style={{ color: "#6F6F82", fontFamily: FONT }}
  >
    {children}
    {required ? <span className="ml-0.5 text-red-500">*</span> : null}
  </label>
);

const RemittanceReportModal = ({
  open,
  pdfFile,
  loading,
  onClose,
}) => {
  if (!open) return null;

  return (
    <Modal
      title="Remittance Report"
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
            title="Remittance Report PDF"
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-[13px] text-slate-500">
            No report preview available.
          </div>
        )}
      </div>
    </Modal>
  );
};

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

const SuperCollections = ({ initialTab }) => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const [contentMargin, setContentMargin] = useState(() => (window.innerWidth >= 1024 ? 256 : 0));
  const [activeItem, setActiveItem] = useState("Collections");
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [activeCollectionTab, setActiveCollectionTab] = useState(() =>
    initialTab === "remittance" || window.location.pathname === "/remittance"
      ? "remittance"
      : getCachedTab(COLLECTION_TAB_STORAGE_KEY, COLLECTION_TAB_KEYS, "collections")
  );
  const [requestedPage, setRequestedPage] = useState(1);
  const [remittanceSearch, setRemittanceSearch] = useState("");
  const [remittancePeriodFilter, setRemittancePeriodFilter] = useState("all");
  const [remittanceStatusFilter, setRemittanceStatusFilter] = useState("all");
  const [remittanceRequestedPage, setRemittanceRequestedPage] = useState(1);
  const [remittanceCurrentPage, setRemittanceCurrentPage] = useState(1);
  const [selectedRemittanceReportDate, setSelectedRemittanceReportDate] = useState("");
  const [selectedRemittanceReportFileName, setSelectedRemittanceReportFileName] = useState("");
  const [selectedRemittanceReportPdfFile, setSelectedRemittanceReportPdfFile] = useState(null);
  const [selectedRemittanceReportPdfLoading, setSelectedRemittanceReportPdfLoading] = useState(false);
  const [remittingRemittanceId, setRemittingRemittanceId] = useState(null);
  const [unremittingRemittanceId, setUnremittingRemittanceId] = useState(null);
  const [showCreateRemittanceModal, setShowCreateRemittanceModal] = useState(false);
  const [createRemittanceForm, setCreateRemittanceForm] = useState(getDefaultCreateRemittanceForm);
  const [createRemittanceErrors, setCreateRemittanceErrors] = useState({});
  const [submitRemittanceLoading, setSubmitRemittanceLoading] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 350);
  const debouncedRemittanceSearch = useDebouncedValue(remittanceSearch, 350);
  const rawHighlightedRemittanceId = getRemittanceHighlightId({ highlightedSearchResult, search: location.search });
  const highlightToken = rawHighlightedRemittanceId
    ? `${rawHighlightedRemittanceId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedRemittanceId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedRemittanceId;
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const todayDateString = getTodayDateString().slice(0, 10);
  const shouldLoadRemittanceData = activeCollectionTab === "remittance" || initialTab === "remittance" || location.pathname === "/remittance";
  const { data, isLoading, isError, refetch } = useCollectionsDataQuery({
    page: requestedPage,
    perPage: PAGE_SIZE,
    search: debouncedSearch,
    period: periodFilter,
  });
  const { data: collectionsOverviewData } = useCollectionsDataQuery({
    page: 1,
    perPage: PAGE_SIZE,
    search: "",
    period: "all",
  });
  const { data: todayCollectionData } = useTodayCollectionQuery(
    { date: todayDateString },
    {
      enabled: shouldLoadRemittanceData || showCreateRemittanceModal,
      staleTime: 0,
      refetchOnMount: "always",
    },
  );
  const {
    data: remittanceData,
    isFetching: isRemittanceFetching,
    isLoading: isRemittanceLoading,
    isPending: isRemittancePending,
  } = useRemittanceDataQuery({
    page: remittanceCurrentPage,
    perPage: PAGE_SIZE,
    search: highlightedRemittanceId ? "" : debouncedRemittanceSearch,
    period: highlightedRemittanceId ? "all" : remittancePeriodFilter,
    status: highlightedRemittanceId ? "all" : remittanceStatusFilter,
    highlightRemittanceId: highlightedRemittanceId,
    paginated: true,
  }, {
    enabled: shouldLoadRemittanceData,
  });
  const { data: remittanceOverviewData } = useRemittanceDataQuery({
    page: 1,
    perPage: PAGE_SIZE,
    search: "",
    period: "all",
    status: "all",
    paginated: true,
  }, {
    enabled: shouldLoadRemittanceData,
  });
  const selectedRemittanceReportData = useRemittanceReportDataQuery({
    selectedDate: selectedRemittanceReportDate,
    remittanceFilters: {
      page: 1,
      perPage: PAGE_SIZE,
      search: selectedRemittanceReportDate,
      paginated: true,
    },
  }, { enabled: Boolean(selectedRemittanceReportDate) });
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
  const normalizedRole = getNormalizedRole();
  const isHead = normalizedRole === "head";
  const isCoordinator = normalizedRole === "coordinator";
  const canManageRemittanceRow = (row) => {
    const submitterRole = String(row?.submitted_by_role || "").trim().toLowerCase();

    if (isCoordinator) return submitterRole === "inspector";
    if (isHead) return submitterRole === "coordinator";

    return false;
  };
  const collections = data?.collections ?? [];
  const meta = data?.meta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const stats = collectionsOverviewData?.stats ?? data?.stats ?? {
    total_collections: 0,
    collections_today: 0,
    collection_records: 0,
    collection_categories: 0,
  };
  const totalPages = Math.max(1, Number(meta.last_page || 1));
  const safePage = Math.min(requestedPage, totalPages);
  const showInitialSkeleton = !isError && isLoading && !data;
  const showEmptyState = !showInitialSkeleton && !isError && Number(meta.total ?? 0) === 0;
  const remittances = remittanceData?.remittances ?? [];
  const remittanceStats = remittanceOverviewData?.stats ?? remittanceData?.stats ?? {};
  const remittancesMeta = remittanceData?.remittancesMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const remittanceTotalPages = Math.max(1, Number(remittancesMeta.last_page || 1));
  const remittanceSafePage = Math.min(remittanceRequestedPage, remittanceTotalPages);
  const showRemittanceSkeleton =
    shouldLoadRemittanceData &&
    (isRemittancePending || isRemittanceLoading || (isRemittanceFetching && !remittanceData));
  const isActiveTabLoading = activeCollectionTab === "remittance" ? showRemittanceSkeleton : showInitialSkeleton;
  const currentUserId = currentUser?.user_id ?? currentUser?.id ?? null;
  const hasTodayDailyRemittance = useMemo(
    () =>
      remittances.some((row) => {
        const submittedBy = row.submitted_by ?? row.submittedBy?.user_id ?? row.submittedBy?.id ?? null;
        return (
          String(row.date || "").slice(0, 10) === todayDateString &&
          submittedBy !== null &&
          currentUserId !== null &&
          String(submittedBy) === String(currentUserId)
        );
      }),
    [currentUserId, remittances, todayDateString],
  );
  const previewRemittanceAmount = useMemo(() => {
    if (hasTodayDailyRemittance) return 0;
    return Number(todayCollectionData?.amount ?? 0);
  }, [hasTodayDailyRemittance, todayCollectionData?.amount]);
  const remittanceProgress = todayCollectionData?.remittance_progress ?? {};
  const remittanceProgressPercentage = Math.min(
    Math.max(Number(remittanceProgress?.percentage ?? 0), 0),
    100,
  );
  const remittedUsersCount = Number(remittanceProgress?.remitted_users ?? 0);
  const eligibleUsersCount = Number(remittanceProgress?.eligible_users ?? 0);
  const pendingRemittanceUsers = Array.isArray(remittanceProgress?.users)
    ? remittanceProgress.users.filter((user) => !user?.has_remitted)
    : [];
  const hasPendingInspectorRemittances = pendingRemittanceUsers.length > 0;
  const confirmedRemittanceAmount = Number(createRemittanceForm.confirmedAmount || 0);
  const totalAmountToRemit = createRemittanceForm.confirmedAmount === "" ? 0 : confirmedRemittanceAmount;
  const surplusAmount = createRemittanceForm.confirmedAmount === ""
    ? 0
    : Math.max(confirmedRemittanceAmount - Number(previewRemittanceAmount || 0), 0);
  const deficitAmount = createRemittanceForm.confirmedAmount === ""
    ? 0
    : Math.max(Number(previewRemittanceAmount || 0) - confirmedRemittanceAmount, 0);

  useEffect(() => {
    setActiveItem("Collections");
  }, []);

  useEffect(() => {
    if (initialTab === "remittance" || location.pathname === "/remittance") {
      setActiveCollectionTab("remittance");
      cacheTab(COLLECTION_TAB_STORAGE_KEY, "remittance", COLLECTION_TAB_KEYS);
      return;
    }

    if (location.pathname === "/collections" || location.pathname === "/payments") {
      const nextTab = location.pathname === "/collections"
        ? getCachedTab(COLLECTION_TAB_STORAGE_KEY, COLLECTION_TAB_KEYS, "collections")
        : "collections";
      setActiveCollectionTab(nextTab);
      cacheTab(COLLECTION_TAB_STORAGE_KEY, nextTab, COLLECTION_TAB_KEYS);

      if (location.pathname === "/collections" && nextTab === "remittance") {
        navigate("/remittance", { replace: true, state: location.state });
      }
    }
  }, [initialTab, location.pathname, location.state, navigate]);

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

  useEffect(() => {
    if (!highlightedRemittanceId) return;
    setRemittanceSearch("");
    setRemittancePeriodFilter("all");
    setRemittanceStatusFilter("all");
    setRemittanceRequestedPage(1);
    setRemittanceCurrentPage(1);
  }, [highlightedRemittanceId]);

  const handleCollectionTabChange = (nextTab) => {
    clearUniversalHighlight();
    setActiveCollectionTab(nextTab);
    cacheTab(COLLECTION_TAB_STORAGE_KEY, nextTab, COLLECTION_TAB_KEYS);
    const nextPath = nextTab === "remittance" ? "/remittance" : "/collections";

    if (location.pathname !== nextPath) {
      navigate(nextPath);
    }
  };

  useEffect(() => {
    if (requestedPage > totalPages) setRequestedPage(totalPages);
  }, [requestedPage, totalPages]);

  useEffect(() => {
    if (remittanceRequestedPage === remittanceCurrentPage) return undefined;

    const timeout = window.setTimeout(() => {
      setRemittanceCurrentPage(remittanceRequestedPage);
    }, PAGE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [remittanceCurrentPage, remittanceRequestedPage]);

  useEffect(() => {
    if (remittanceRequestedPage > remittanceTotalPages) {
      setRemittanceRequestedPage(remittanceTotalPages);
      setRemittanceCurrentPage(remittanceTotalPages);
    }
  }, [remittanceRequestedPage, remittanceTotalPages]);

  useEffect(() => {
    if (!highlightedRemittanceId) return;
    const resolvedPage = Number(remittancesMeta.current_page || 0);
    if (resolvedPage > 0 && resolvedPage !== remittanceRequestedPage) {
      setRemittanceRequestedPage(resolvedPage);
      setRemittanceCurrentPage(resolvedPage);
    }
  }, [highlightedRemittanceId, remittanceRequestedPage, remittancesMeta.current_page]);

  useEffect(() => {
    let isActive = true;
    let nextUrl = "";

    const buildSelectedReportPdf = async () => {
      if (!selectedRemittanceReportDate) {
        setSelectedRemittanceReportPdfFile((current) => {
          if (current?.url) URL.revokeObjectURL(current.url);
          return null;
        });
        setSelectedRemittanceReportPdfLoading(false);
        return;
      }

      const [year = "", month = "", day = ""] = String(selectedRemittanceReportDate).slice(0, 10).split("-");
      if (!year || !month || !day) {
        setSelectedRemittanceReportPdfFile((current) => {
          if (current?.url) URL.revokeObjectURL(current.url);
          return null;
        });
        setSelectedRemittanceReportPdfLoading(false);
        return;
      }

      setSelectedRemittanceReportPdfFile((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return null;
      });
      setSelectedRemittanceReportPdfLoading(true);

      try {
        const monthLabel = new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("en-PH", {
          month: "long",
        });
        const pdfBytes = await buildRemittanceReportPdf({
          month: monthLabel,
          day,
          year,
          preparedBy,
          reportData: selectedRemittanceReportData.data ?? {},
        });

        if (!isActive) return;
        const nextData = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
        const filename = selectedRemittanceReportFileName || "remittance-report.pdf";
        const pdfFile = new File([nextData], filename, {
          type: "application/pdf",
        });
        nextUrl = URL.createObjectURL(pdfFile);
        setSelectedRemittanceReportPdfFile({
          url: nextUrl,
          filename,
        });
      } catch {
        if (!isActive) return;
        setSelectedRemittanceReportPdfFile(null);
      } finally {
        if (isActive) setSelectedRemittanceReportPdfLoading(false);
      }
    };

    buildSelectedReportPdf();

    return () => {
      isActive = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [preparedBy, selectedRemittanceReportData.data, selectedRemittanceReportDate, selectedRemittanceReportFileName]);

  const overviewCards = useMemo(() => [
    { title: "Total Collections", value: formatPeso(stats.total_collections), icon: IoCashOutline, tone: "green" },
    { title: "Today's Collections", value: formatPeso(stats.collections_today), icon: IoCashOutline, tone: "blue" },
  ], [stats]);

  const remittanceOverviewCards = useMemo(() => [
    { title: "Total Remittance", value: formatPeso(remittanceStats.total_remittances), icon: IoDocumentTextOutline, tone: "blue" },
    { title: "Total Surplus", value: formatPeso(remittanceStats.total_surplus), icon: IoWalletOutline, tone: "blue" },
    { title: "Total Deficit", value: formatPeso(remittanceStats.total_deficit), icon: IoWalletOutline, tone: "blue" },
  ], [remittanceStats.total_deficit, remittanceStats.total_remittances, remittanceStats.total_surplus]);
  const pageLabel = activeCollectionTab === "remittance" ? "Remittance" : "Collections";

  const requestPage = (pageOrUpdater) => {
    setRequestedPage((page) => {
      const nextPage = typeof pageOrUpdater === "function" ? pageOrUpdater(page) : pageOrUpdater;
      return Math.min(Math.max(1, Number(nextPage) || 1), totalPages);
    });
  };

  const requestRemittancePage = (pageOrUpdater) => {
    clearUniversalHighlight();

    setRemittanceRequestedPage((page) => {
      const nextPage = typeof pageOrUpdater === "function" ? pageOrUpdater(page) : pageOrUpdater;
      return Math.min(Math.max(1, Number(nextPage) || 1), remittanceTotalPages);
    });
  };

  const remitMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.patch(`/remittances/${id}/remit`);
      return res.data;
    },
    onMutate: (id) => {
      setRemittingRemittanceId(id);
    },
    onSuccess: (data) => {
      showBottomToast("success", "Remittance Checked", "The remittance was marked as checked.");
      try {
        const lockObj = data?.transaction_lock ?? null;
        queryClient.setQueryData(["transaction-lock"], () => ({
          transaction_lock: lockObj,
        }));
      } catch {
        // Keep the table refresh as the source of truth if optimistic cache fails.
      }
      void queryClient.invalidateQueries({ queryKey: ["transaction-lock"] });
      void queryClient.invalidateQueries({ queryKey: ["remittances-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["remittance-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["payments-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["notifications-data"], refetchType: "active" });
    },
    onError: (error) => {
      const response = error?.response?.data;
      showBottomToast("error", "Update Failed", response?.message || "Unable to mark the remittance as checked right now.");
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
      showBottomToast("success", "Remittance Unchecked", "The remittance was returned to unchecked.");
      try {
        const lockObj = data?.transaction_lock ?? null;
        queryClient.setQueryData(["transaction-lock"], () => ({
          transaction_lock: lockObj,
        }));
      } catch {
        // Keep the table refresh as the source of truth if optimistic cache fails.
      }
      void queryClient.invalidateQueries({ queryKey: ["transaction-lock"] });
      void queryClient.invalidateQueries({ queryKey: ["remittances-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["remittance-report"], refetchType: "active" });
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

  const createRemittanceMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/remittances", payload);
      return res.data;
    },
    onSuccess: (data) => {
      setSubmitRemittanceLoading(false);
      showBottomToast("success", "Remittance Submitted", "The remittance was submitted to head successfully.");
      setShowCreateRemittanceModal(false);
      setCreateRemittanceForm(getDefaultCreateRemittanceForm());
      setCreateRemittanceErrors({});

      try {
        const lockObj = data?.transaction_lock ?? null;
        if (lockObj) {
          queryClient.setQueryData(["transaction-lock"], () => ({
            transaction_lock: lockObj,
          }));
        }
      } catch {
        // Keep query invalidation as the source of truth if the optimistic cache write fails.
      }

      void queryClient.invalidateQueries({ queryKey: ["transaction-lock"] });
      void queryClient.invalidateQueries({ queryKey: ["collections-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["remittances-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["remittance-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-data"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["notifications-data"], refetchType: "active" });
      invalidateTodayCollection(queryClient, todayDateString);
    },
    onError: (error) => {
      setSubmitRemittanceLoading(false);
      const response = error?.response?.data;
      const nextErrors = {};

      Object.entries(response?.errors ?? {}).forEach(([key, value]) => {
        nextErrors[key] = Array.isArray(value) ? value[0] : value;
      });

      setCreateRemittanceErrors(nextErrors);
      showBottomToast("error", "Save Failed", response?.message || "Unable to submit remittance right now.");
    },
  });

  const closeCreateRemittanceModal = () => {
    if (submitRemittanceLoading || createRemittanceMutation.isPending) return;
    setShowCreateRemittanceModal(false);
    setCreateRemittanceForm(getDefaultCreateRemittanceForm());
    setCreateRemittanceErrors({});
  };

  const handleSubmitCreateRemittance = () => {
    setSubmitRemittanceLoading(true);
    const nextErrors = {};
    const trimmedRemarks = String(createRemittanceForm.remarks || "").trim();

    if (!todayDateString) nextErrors.date = "Date is required.";
    if (previewRemittanceAmount <= 0) nextErrors.date = "No cash collections were found for today.";
    if (hasPendingInspectorRemittances) {
      nextErrors.remittance_progress =
        "All inspectors with vehicle ticket collections must submit their remittance first.";
    }
    if (!String(createRemittanceForm.confirmedAmount || "").trim()) {
      nextErrors.confirmedAmount = "Amount to remit is required.";
    }
    if ((surplusAmount > 0 || deficitAmount > 0) && !trimmedRemarks) {
      nextErrors.remarks = "Remarks is required when there is a surplus or deficit.";
    }

    setCreateRemittanceErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setSubmitRemittanceLoading(false);
      return;
    }

    if (isTransactionLocked) {
      setSubmitRemittanceLoading(false);
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }

    createRemittanceMutation.mutate({
      date: todayDateString,
      amount: totalAmountToRemit,
      surplus: surplusAmount,
      deficit: deficitAmount,
      remarks: trimmedRemarks || null,
    });
  };

  const openRemittanceReport = (row) => {
    const reportDate = String(row?.date || "").slice(0, 10);
    if (!reportDate) return;
    setSelectedRemittanceReportFileName(getRemittanceReportFilename(row));
    setSelectedRemittanceReportDate(reportDate);
  };

  const handleRemitRemittance = (row) => {
    if (String(row?.status || "").toLowerCase() === "remitted") return;
    remitMutation.mutate(row.remittance_id);
  };

  const handleUnremitRemittance = (row) => {
    if (String(row?.status || "").toLowerCase() !== "remitted") return;
    unremitMutation.mutate(row.remittance_id);
  };

  const renderRemittanceStatusAction = (row) => {
    const isUnremitting = unremitMutation.isPending && unremittingRemittanceId === row.remittance_id;
    const isRemitting = remitMutation.isPending && remittingRemittanceId === row.remittance_id;
    const isRowRemitted = String(row.status || "").toLowerCase() === "remitted";

    if (isUnremitting) {
      return (
        <Tooltip title="Undo checked">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleUnremitRemittance(row);
            }}
            disabled
            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: "#f59e0b" }}
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
        <Tooltip title="Mark as checked">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleRemitRemittance(row);
            }}
            disabled
            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: "#16a34a" }}
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
        <Tooltip title="Undo checked">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleUnremitRemittance(row);
            }}
            disabled={unremittingRemittanceId === row.remittance_id && unremitMutation.isPending}
            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: "#f59e0b" }}
          >
            <span className="inline-flex h-full w-full items-center justify-center">
              <IoRefreshOutline style={{ fontSize: "15px", color: "#f59e0b" }} />
            </span>
          </button>
        </Tooltip>
      );
    }

    return (
      <Tooltip title="Mark as checked">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleRemitRemittance(row);
          }}
          disabled={isRemitting}
          className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderColor: "#16a34a" }}
        >
          <span className="inline-flex h-full w-full items-center justify-center">
            <IoCheckmarkOutline style={{ fontSize: "16px", color: "#16a34a" }} />
          </span>
        </button>
      </Tooltip>
    );
  };

  const closeRemittanceReport = () => {
    setSelectedRemittanceReportDate("");
    setSelectedRemittanceReportFileName("");
    setSelectedRemittanceReportPdfFile((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
    setSelectedRemittanceReportPdfLoading(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white" style={{ fontFamily: FONT }}>
      <Sidebar
        activeItem={activeItem}
        setActiveItem={setActiveItem}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onWidthChange={setContentMargin}
      />

      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
        style={{
          marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px",
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
              <TitlePage title="Collections" subtitle="Manage collection records across transactions." loading={isActiveTabLoading} />
              <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: pageLabel }]} fontFamily={FONT} loading={isActiveTabLoading} />
            </div>

            <div className={`mb-5 grid grid-cols-1 gap-3 ${activeCollectionTab === "remittance" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              {(activeCollectionTab === "remittance" ? remittanceOverviewCards : overviewCards).map((card) => (
                <OverviewCard
                  key={card.title}
                  {...card}
                  loading={isActiveTabLoading}
                />
              ))}
            </div>

            <Tabs
              key={activeCollectionTab}
              tabs={COLLECTION_TABS}
              activeKey={activeCollectionTab}
              onTabChange={handleCollectionTabChange}
              fontFamily={FONT}
              className="mb-5"
              loading={isActiveTabLoading}
              rightContent={
                activeCollectionTab === "remittance" ? (
                  <Legend items={REMITTANCE_STATUS_LEGEND} loading={isActiveTabLoading} />
                ) : null
              }
            >
              {activeCollectionTab === "collections" ? (
                <TableCard
                  title="Collection Records"
                  subtitle="All collections from tickets and payments."
                  loading={showInitialSkeleton}
                  headerActionsSkeletonCount={2}
                  className=""
                  bodyClassName="overflow-x-auto"
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
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setRequestedPage(1);
                        }}
                        placeholder="Search for transaction, type, receipt no., date, amount"
                        className="w-full border-none bg-transparent text-[13px] outline-none"
                        style={{ fontFamily: FONT, color: "#1a1f36" }}
                      />
                    </div>
                    <FilterButton
                      value={periodFilter}
                      onChange={(value) => {
                        setPeriodFilter(value);
                        setRequestedPage(1);
                      }}
                      options={PERIOD_OPTIONS}
                      width={150}
                    />
                    </>
                  }
                  pagination={{
                    meta,
                    totalPages,
                    currentPage: safePage,
                    requestedPage,
                    isLoading: showInitialSkeleton,
                    onPageChange: requestPage,
                  }}
                >
                <div className="relative overflow-x-auto">
                  <table className="w-full border-collapse" style={{ minWidth: 920 }}>
                    <thead>
                      <tr>
                        <TH>Transaction</TH>
                        <TH>Boat Type/Vehicle Type</TH>
                        <TH>Official Receipt No.</TH>
                        <TH>Date</TH>
                        <TH className="text-right">Cash Received (₱)</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {showInitialSkeleton ? (
                        Array.from({ length: PAGE_SIZE }).map((_, index) => (
                          <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                            {Array.from({ length: 5 }).map((__, column) => (
                              <td key={column} className="px-4 py-3">
                                <div className="h-3 rounded bg-slate-100" style={{ width: column <= 2 ? 130 : 90 }} />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : isError ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center">
                            <p className="m-0 text-[13px] text-red-500">Unable to load collection records.</p>
                            <button
                              type="button"
                              onClick={() => refetch()}
                              className="mt-3 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#1a1f36]"
                            >
                              Retry
                            </button>
                          </td>
                        </tr>
                      ) : showEmptyState ? (
                        <tr>
                          <td colSpan={5}>
                            <NoDataFound title={debouncedSearch ? "No results found" : "No Data Found"} />
                          </td>
                        </tr>
                      ) : (
                        collections.map((record, index) => (
                          <tr
                            key={record.id}
                            className={index % 2 === 0 ? "table-row-even" : "table-row-odd"}
                            style={{ borderBottom: "1px solid #f1f5f9" }}
                          >
                            <td className="px-4 py-3 text-[13px] font-semibold text-[#1a1f36]">{record.transaction || "-"}</td>
                            <td className="px-4 py-3 text-[13px] text-slate-700">{record.type_name || "-"}</td>
                            <td className="px-4 py-3 text-[13px] text-slate-700">{record.official_receipt_no || "-"}</td>
                            <td className="px-4 py-3 text-[13px] text-slate-700">{formatDisplayDate(record.date)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="inline-block min-w-[96px] text-right text-[13px] font-semibold text-[#1a1f36]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {formatMoney(record.cash_received)}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                </TableCard>
              ) : (
                <div className="space-y-5">
                  <TableCard
                    title="Remittance Records"
                    subtitle="All remittance records in the system."
                    loading={showRemittanceSkeleton}
                    headerActionsSkeletonCount={4}
                    className=""
                    bodyClassName="overflow-hidden"
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
                          type="text"
                          placeholder="Search for remittance reference no., date, cash received"
                          value={remittanceSearch}
                          onChange={(event) => {
                            clearUniversalHighlight();
                            setRemittanceSearch(event.target.value);
                            setRemittanceRequestedPage(1);
                            setRemittanceCurrentPage(1);
                          }}
                          className="w-full border-none bg-transparent text-[13px] outline-none"
                          style={{ fontFamily: FONT, color: "#1a1f36" }}
                        />
                      </div>
                      <FilterButton
                        value={remittancePeriodFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setRemittancePeriodFilter(value);
                          setRemittanceRequestedPage(1);
                          setRemittanceCurrentPage(1);
                        }}
                        options={PERIOD_OPTIONS}
                        width={150}
                      />
                      <FilterButton
                        value={remittanceStatusFilter}
                        onChange={(value) => {
                          clearUniversalHighlight();
                          setRemittanceStatusFilter(value);
                          setRemittanceRequestedPage(1);
                          setRemittanceCurrentPage(1);
                        }}
                        options={REMITTANCE_STATUS_OPTIONS}
                        width={150}
                      />
                      {isCoordinator ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (isTransactionLocked) {
                              showBottomToast("error", "Transactions Locked", transactionLockMessage);
                              return;
                            }

                            setCreateRemittanceErrors({});
                            setShowCreateRemittanceModal(true);
                          }}
                          disabled={isTransactionLocked}
                          className="flex h-[42px] items-center justify-center gap-2 rounded-[10px] border-none bg-[#1a1f36] px-4 text-[13px] font-semibold text-white cursor-pointer transition-colors hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:hover:bg-[#1a1f36]"
                          style={{ fontFamily: FONT, opacity: isTransactionLocked ? 0.55 : 1 }}
                        >
                          <IoAddOutline className="text-[16px]" />
                          <span>Create Remittance</span>
                        </button>
                      ) : null}
                      </>
                    }
                    pagination={{
                      meta: remittancesMeta,
                      totalPages: remittanceTotalPages,
                      currentPage: remittanceSafePage,
                      requestedPage: remittanceRequestedPage,
                      isLoading: showRemittanceSkeleton,
                      onPageChange: requestRemittancePage,
                    }}
                  >
                  <div className={showRemittanceSkeleton ? "overflow-hidden" : "relative overflow-hidden"}>
                    <table className="w-full table-fixed border-collapse">
                      <thead>
                        <tr>
                          <TH className="w-[13%] whitespace-normal px-3 leading-tight">Remittance Ref. No.</TH>
                          <TH className="w-[10%] px-3">Date</TH>
                          <TH className="w-[15%] px-3">Submitted By</TH>
                          <TH className="w-[13%] whitespace-normal px-3 text-right leading-tight">Today's Collection (₱)</TH>
                          <TH className="w-[12%] whitespace-normal px-3 text-right leading-tight">Amount to Remit (₱)</TH>
                          <TH className="w-[9%] px-3 text-right">Surplus (₱)</TH>
                          <TH className="w-[9%] px-3 text-right">Deficit (₱)</TH>
                          <TH className="w-[13%] px-3">Remarks</TH>
                          <TH className="w-[6%] px-3 text-center">Action</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {showRemittanceSkeleton ? (
                          Array.from({ length: PAGE_SIZE }).map((_, index) => (
                            <tr key={`collection-remittance-skeleton-${index}`} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                              {Array.from({ length: 9 }).map((__, column) => (
                                <td key={column} className="px-3 py-3">
                                  {column === 8 ? (
                                    <div className="mx-auto h-8 w-8 rounded-lg bg-slate-100" />
                                  ) : (
                                    <div className="h-3 rounded bg-slate-100" style={{ width: column === 4 ? 76 : "100%" }} />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : remittances.length === 0 ? (
                          <tr>
                            <td colSpan={9}>
                              <NoDataFound title={debouncedRemittanceSearch ? "No results found" : "No Data Found"} />
                            </td>
                          </tr>
                        ) : (
                          remittances.map((row, index) => (
                            <tr
                              key={row.remittance_id}
                              onClick={() => openRemittanceReport(row)}
                              className={`cursor-pointer transition-colors ${
                                highlightedRemittanceId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"
                              } ${String(highlightedRemittanceId) === String(row.remittance_id) ? "universal-search-highlight" : ""}`.trim()}
                              style={{ borderBottom: "1px solid #f1f5f9" }}
                            >
                              <td className="px-3 py-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: getRemittanceStatusColor(row.status),
                                      minWidth: 10,
                                      minHeight: 10,
                                    }}
                                  />
                                  <span className="min-w-0 truncate text-[13px] font-semibold text-[#1a1f36]" title={row.remittance_reference_no || "-"}>
                                    {row.remittance_reference_no || "-"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-[13px] text-[#1a1f36]">{formatDisplayDate(row.date)}</td>
                              <td className="px-3 py-3">
                                <div className="truncate text-[13px] font-semibold text-[#1a1f36]" title={row.submitted_by_name || row.submitted_by_email || "-"}>
                                  {row.submitted_by_name || row.submitted_by_email || "-"}
                                </div>
                                <div className="mt-1 truncate text-[11px] capitalize text-[#6F6F82]" title={row.submitted_by_role || "-"}>
                                  {row.submitted_by_role || "-"}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right text-[13px] font-semibold text-[#1a1f36]">{formatMoney(getRemittanceTodayCashReceived(row))}</td>
                              <td className="px-3 py-3 text-right text-[13px] font-semibold text-[#1a1f36]">{formatMoney(row.amount)}</td>
                              <td className="px-3 py-3 text-right text-[13px] font-semibold text-[#1a1f36]">{formatMoney(row.surplus)}</td>
                              <td className="px-3 py-3 text-right text-[13px] font-semibold text-[#1a1f36]">{formatMoney(row.deficit)}</td>
                              <td className="px-3 py-3 text-[13px] text-[#1a1f36]">
                                <span className="block truncate" title={row.remarks || "-"}>
                                  {row.remarks || "-"}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center justify-center gap-2">
                                  {canManageRemittanceRow(row) ? renderRemittanceStatusAction(row) : null}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  </TableCard>
                </div>
              )}
            </Tabs>
            {showCreateRemittanceModal ? (
              <Modal
                title="Create Remittance"
                onClose={closeCreateRemittanceModal}
                onCancel={closeCreateRemittanceModal}
                onSave={handleSubmitCreateRemittance}
                saving={submitRemittanceLoading || createRemittanceMutation.isPending}
                saveDisabled={
                  submitRemittanceLoading ||
                  createRemittanceMutation.isPending ||
                  isTransactionLocked ||
                  hasPendingInspectorRemittances
                }
                saveLabel="Save"
                closeOnBackdrop={false}
                maxWidth="680px"
                bodyClassName="max-h-[78vh] overflow-y-auto !p-5"
                footerLeftContent={
                  <div>
                    <p
                      className="m-0 text-[11px] font-semibold uppercase"
                      style={{ color: "#6F6F82", fontFamily: FONT }}
                    >
                      Total Amount to Remit
                    </p>
                    <p
                      className="m-0 text-[28px] font-bold leading-tight text-[#1a1f36]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatPeso(totalAmountToRemit)}
                    </p>
                  </div>
                }
              >
                <div className="grid grid-cols-1 gap-6">
                  <Card
                    icon={IoLayersOutline}
                    title="REMITTANCE DETAILS"
                    subtitle="Review today's remittance details before submitting to head."
                  >
                    <div className="space-y-4">
                      <div>
                        <RemittanceFormLabel>Today's Collection</RemittanceFormLabel>
                        <input
                          type="text"
                          value={formatPeso(previewRemittanceAmount)}
                          readOnly
                          className="h-[46px] w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-medium text-[#1a1f36] outline-none"
                        />
                      </div>
                      <ModalFieldError message={createRemittanceErrors.date} />

                      <div>
                        <RemittanceFormLabel required>Amount to Remit</RemittanceFormLabel>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={createRemittanceForm.confirmedAmount}
                          onChange={(event) => {
                            setCreateRemittanceForm((current) => ({ ...current, confirmedAmount: event.target.value }));
                            setCreateRemittanceErrors((current) => ({ ...current, confirmedAmount: "" }));
                          }}
                          placeholder="Enter amount to remit"
                          className={`h-[46px] w-full rounded-[12px] border bg-white px-3.5 text-[13px] outline-none ${createRemittanceErrors.confirmedAmount ? "border-red-300" : "border-slate-200"}`}
                        />
                        <ModalFieldError message={createRemittanceErrors.confirmedAmount} />
                      </div>

                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div>
                          <RemittanceFormLabel>Surplus</RemittanceFormLabel>
                          <input
                            type="text"
                            value={formatPeso(surplusAmount)}
                            readOnly
                            className="h-[46px] w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-medium text-[#1a1f36] outline-none"
                          />
                        </div>

                        <div>
                          <RemittanceFormLabel>Deficit</RemittanceFormLabel>
                          <input
                            type="text"
                            value={formatPeso(deficitAmount)}
                            readOnly
                            className="h-[46px] w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-medium text-[#1a1f36] outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <RemittanceFormLabel>Remarks</RemittanceFormLabel>
                        <textarea
                          value={createRemittanceForm.remarks}
                          onChange={(event) => {
                            setCreateRemittanceForm((current) => ({ ...current, remarks: event.target.value }));
                            setCreateRemittanceErrors((current) => ({ ...current, remarks: "" }));
                          }}
                          rows={4}
                          placeholder="Add remittance remarks"
                          className={`min-h-[96px] w-full resize-none rounded-xl border px-3.5 py-3 text-[13px] outline-none ${createRemittanceErrors.remarks ? "border-red-300" : "border-slate-200 focus:border-[#4096ff]"}`}
                          style={{ fontFamily: FONT, color: "#0d1117" }}
                        />
                        <ModalFieldError message={createRemittanceErrors.remarks} />
                      </div>

                      <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="m-0 text-[11px] font-semibold uppercase text-[#6F6F82]">
                              Remittance Progress
                            </p>
                          </div>
                          <p
                            className="m-0 text-[24px] font-bold text-[#2563eb]"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {`${remittanceProgressPercentage}%`}
                          </p>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[#2563eb] transition-all"
                            style={{ width: `${remittanceProgressPercentage}%` }}
                          />
                        </div>
                        {pendingRemittanceUsers.length > 0 ? (
                          <div className="mt-3">
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <p className="m-0 text-[11px] font-semibold uppercase text-[#6F6F82]">
                                Pending:
                              </p>
                              <p className="m-0 text-right text-[11px] font-semibold uppercase text-[#6F6F82]">
                                {`${remittedUsersCount} of ${eligibleUsersCount} users remitted`}
                              </p>
                            </div>
                            <ol className="m-0 mt-1 list-decimal space-y-1 pl-5 text-[12px] leading-5 text-slate-600">
                              {pendingRemittanceUsers.map((user, index) => {
                                const displayName = String(user?.name || "").trim();
                                const displayEmail = String(user?.email || "").trim();
                                const label = displayName || displayEmail || "Unknown user";

                                return <li key={user?.user_id ?? user?.email ?? index}>{label}</li>;
                              })}
                            </ol>
                          </div>
                        ) : (
                          <p className="m-0 mt-2 text-right text-[11px] font-semibold uppercase text-[#6F6F82]">
                            {`${remittedUsersCount} of ${eligibleUsersCount} users remitted`}
                          </p>
                        )}
                        <ModalFieldError message={createRemittanceErrors.remittance_progress} />
                      </div>
                    </div>
                  </Card>
                </div>
              </Modal>
            ) : null}
            <RemittanceReportModal
              open={Boolean(selectedRemittanceReportDate)}
              pdfFile={selectedRemittanceReportPdfFile}
              loading={
                selectedRemittanceReportPdfLoading ||
                selectedRemittanceReportData.isLoading ||
                selectedRemittanceReportData.isFetching
              }
              onClose={closeRemittanceReport}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default SuperCollections;
