import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import "typeface-montserrat";
import {
  IoAlertCircleOutline,
  IoCalendarOutline,
  IoCloseOutline,
  IoFlashOutline,
  IoLayersOutline,
  IoNotificationsOutline,
  IoPersonOutline,
  IoSearchOutline,
  IoShieldCheckmarkOutline,
  IoTimeOutline,
} from "react-icons/io5";
import { useLocation, useSearchParams } from "react-router-dom";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import StatusPill from "../../components/StatusPill";
import FilterButton from "../../components/FilterButton";
import Legend from "../../components/Legend";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import DetailDrawer, { DrawerInfoCard, DrawerSection } from "../../components/Drawer";
import NoDataFound from "../../components/NoDataFound";
import { ACTIVITY_LOGS_QUERY_KEY, useActivityLogsQuery } from "../../hooks/useActivityLogsQuery";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useSidebar } from "../../store/sidebarStore";

const FONT = "'Montserrat', sans-serif";
const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 350;
const PAGE_DEBOUNCE_MS = 180;

const PERIOD_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

const severityMeta = {
  info: {
    label: "Info",
    icon: IoNotificationsOutline,
    iconBg: "#dbeafe",
    iconColor: "#2563eb",
  },
  warning: {
    label: "Warning",
    icon: IoAlertCircleOutline,
    iconBg: "#fef3c7",
    iconColor: "#d97706",
  },
  critical: {
    label: "Critical",
    icon: IoFlashOutline,
    iconBg: "#fee2e2",
    iconColor: "#dc2626",
  },
};

// Client-side normalization keeps older records and fallback cases visually consistent.
const getSeverityFromAction = (action) => {
  const normalized = String(action || "").toLowerCase();

  if (normalized.includes("delete")) return "critical";
  if (normalized.includes("archive") || normalized.includes("update") || normalized.includes("restore")) {
    return "warning";
  }

  return "info";
};

const parseDateTimeValue = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
  const isoMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z$/
  );

  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
      hour: Number(isoMatch[4]),
      minute: Number(isoMatch[5]),
      second: Number(isoMatch[6] ?? "0"),
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
  return new Date(parsed.year, parsed.month - 1, parsed.day).toLocaleDateString("en-US", {
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

const splitDetailLines = (details) =>
  String(details || "")
    .split("; ")
    .map((line) => line.trim())
    .filter(Boolean);

const formatMoney = (value) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "";

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const getPaymentReference = (payment, fallback = "") =>
  String(
    payment?.payment_reference_no ||
      payment?.payment_reference ||
      payment?.reference_no ||
      payment?.reference_number ||
      payment?.official_receipt_no ||
      payment?.official_receipt_number ||
      fallback
  ).trim();

const getBillReference = (bill, payment, fallback = "") =>
  String(
    bill?.bill_reference_no ||
      bill?.bill_reference ||
      bill?.reference_no ||
      bill?.reference_number ||
      payment?.bill_reference_no ||
      payment?.bill_reference ||
      fallback
  ).trim();

const getVehicleTypeName = (ticket) =>
  String(ticket?.vehicle_type?.type_name || ticket?.vehicleType?.type_name || ticket?.vehicle_type_name || "").trim();

const findVehicleTicketForLog = ({ ticketType, vehicleTypeName, plateNumber, tickets = [], logTimestamp }) => {
  const normalizedTicketType = String(ticketType || "").toLowerCase();
  const normalizedVehicleType = String(vehicleTypeName || "").trim().toLowerCase();
  const normalizedPlateNumber = String(plateNumber || "").trim().toLowerCase();
  const logTime = logTimestamp ? new Date(logTimestamp).getTime() : 0;

  return [...tickets]
    .filter((ticket) => {
      const currentTicketType = String(ticket?.ticket_type || "").toLowerCase();
      const currentVehicleType = getVehicleTypeName(ticket).toLowerCase();
      const currentPlateNumber = String(ticket?.plate_number || "").trim().toLowerCase();

      return currentTicketType === normalizedTicketType &&
        (normalizedVehicleType ? currentVehicleType === normalizedVehicleType : currentPlateNumber === normalizedPlateNumber);
    })
    .sort((a, b) => {
      const aTime = new Date(a?.created_at || a?.updated_at || a?.ticket_date || 0).getTime();
      const bTime = new Date(b?.created_at || b?.updated_at || b?.ticket_date || 0).getTime();

      if (logTime && Number.isFinite(aTime) && Number.isFinite(bTime)) {
        return Math.abs(aTime - logTime) - Math.abs(bTime - logTime);
      }

      return bTime - aTime;
    })[0];
};

const formatActivityDetails = (details, context = {}) => {
  const normalized = String(details || "").trim();
  if (!normalized) return "";

  const paymentBillMatch = normalized.match(/\bRecorded payment\s+#(\d+)\s+for bill\s+#(\d+)\.?/i);
  if (paymentBillMatch) {
    const [, paymentId, billId] = paymentBillMatch;
    const payment = context.paymentsById?.get(String(paymentId));
    const bill = context.billsById?.get(String(billId)) || context.billsById?.get(String(payment?.bill_id ?? ""));
    const billReference = getPaymentReference(payment, "") || getBillReference(bill, payment, "bill record");
    const amount = formatMoney(payment?.amount_paid);

    return [
      `Recorded payment for bill "${billReference}"`,
      amount ? `with the amount of ${amount}.` : "",
    ].filter(Boolean).join(" ");
  }

  const vehicleTicketMatch = normalized.match(/\bCreated\s+(daily|annual)\s+vehicle ticket for vehicle type\s+"([^"]+)"\.?/i);
  if (vehicleTicketMatch) {
    if (/\bwith the amount of\b/i.test(normalized)) {
      return normalized;
    }

    const [, ticketType, vehicleTypeName] = vehicleTicketMatch;
    const ticket = findVehicleTicketForLog({
      ticketType,
      vehicleTypeName,
      tickets: context.vehicleTickets,
      logTimestamp: context.logTimestamp,
    });
    const amount = ticket ? formatMoney(ticket?.ticket_fee) : "";

    return [
      `Created ${ticketType.toLowerCase()} vehicle ticket for vehicle type "${vehicleTypeName}"`,
      amount ? `with the amount of ${amount}.` : "",
    ].filter(Boolean).join(" ");
  }

  const vehicleTicketPlateMatch = normalized.match(/\bCreated\s+(daily|annual)\s+vehicle ticket for plate\s+"([^"]*)"\.?/i);
  if (vehicleTicketPlateMatch) {
    const [, ticketType, plateNumber] = vehicleTicketPlateMatch;
    const ticket = findVehicleTicketForLog({
      ticketType,
      plateNumber,
      tickets: context.vehicleTickets,
      logTimestamp: context.logTimestamp,
    });
    if (!ticket) {
      return normalized;
    }

    const vehicleTypeName = getVehicleTypeName(ticket) || "vehicle type";
    const amount = formatMoney(ticket?.ticket_fee);

    return [
      `Created ${ticketType.toLowerCase()} vehicle ticket for vehicle type "${vehicleTypeName}"`,
      amount ? `with the amount of ${amount}.` : "",
    ].filter(Boolean).join(" ");
  }

  return normalized
    .replace(/\bPayment\s+#\d+\b/gi, "Payment")
    .replace(/\bBill\s+#\d+\b/gi, "Bill")
    .replace(/\s+#\d+\b/g, "");
};

const splitDisplayDetailLines = (details) => splitDetailLines(formatActivityDetails(details));

const TH = ({ children }) => (
  <th
    className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap"
    style={{ color: "#1a1f36", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}
  >
    {children}
  </th>
);


const SEVERITY_LEGEND = [
  {
    key: "info",
    label: "Info",
    meaning: "Something new was created",
    color: "#2563eb",
  },
  {
    key: "warning",
    label: "Warning",
    meaning: "Data was modified",
    color: "#d97706",
  },
  {
    key: "critical",
    label: "Critical",
    meaning: "Permanent, cannot be undone",
    color: "#dc2626",
  },
];

const ACTIVITY_LOG_TABS = [
  { key: "timeline", label: "Activity Timeline", icon: IoLayersOutline },
];

const ACTIVITY_LOG_FILTER_DROPDOWN_PROPS = {
  getPopupContainer: (triggerNode) => (typeof document !== "undefined" ? document.body : triggerNode.parentElement),
  placement: "bottomLeft",
  dropdownAlign: { overflow: { adjustX: false, adjustY: false } },
};

const getActivityLogOverviewData = (queryClient) => {
  const candidates = queryClient
    .getQueriesData({ queryKey: ACTIVITY_LOGS_QUERY_KEY })
    .map(([queryKey, data]) => ({ queryKey, data }))
    .filter(({ data }) => data?.meta?.stats || Array.isArray(data?.logs));

  const baseData = candidates.find(({ queryKey }) => {
    const params = queryKey?.[1] ?? {};
    return (
      params.search === "" &&
      params.status === "all" &&
      params.period === "all" &&
      params.filters?.module === "all" &&
      params.filters?.user === "all"
    );
  });

  if (baseData) {
    return baseData.data;
  }

  const withStats = candidates.find(({ data }) => data?.meta?.stats);
  return withStats ? withStats.data : candidates.length > 0 ? candidates[0].data : undefined;
};

const getActivityLogOverviewStats = (data) => {
  const stats = data?.meta?.stats ?? {
    total_logs: 0,
    info_count: 0,
    warning_count: 0,
    critical_count: 0,
    today_count: 0,
  };

  return [
    {
      title: "Total Logs",
      value: stats.total_logs,
      icon: IoLayersOutline,
      tone: "navy",
    },
    {
      title: "Info Events",
      value: stats.info_count,
      icon: IoNotificationsOutline,
      tone: "blue",
    },
    {
      title: "Warning Events",
      value: stats.warning_count,
      icon: IoAlertCircleOutline,
      tone: "orange",
    },
    {
      title: "Critical Events",
      value: stats.critical_count,
      icon: IoFlashOutline,
      tone: "red",
    },
    {
      title: "Today's Logged",
      value: stats.today_count,
      icon: IoCalendarOutline,
      tone: "green",
    },
  ];
};

const ActivityLogDrawer = ({ open, log, onClose, displayUserName }) => {
  if (!log) return null;

  const meta = severityMeta[log.severity] ?? severityMeta.info;

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={460}
      fontFamily={FONT}
      title="Activity Details"
      subtitle="Review the selected activity log record."
      icon={IoLayersOutline}
    >
      <DrawerSection
        icon={IoShieldCheckmarkOutline}
        title="Log Information"
        subtitle="Captured metadata for this system activity"
        fontFamily={FONT}
      >
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "User", value: displayUserName(log.user_name) || "System", className: "col-span-2" },
            { label: "Status", value: <StatusPill status={log.severity} label={meta.label} />, className: undefined },
            { label: "Module", value: log.module || "—" },
            { label: "Date", value: formatDate(log.timestamp) },
            { label: "Time", value: formatTime(log.timestamp) },
          ].map(({ label, value, className, indicatorColor }) => (
            <DrawerInfoCard key={label} label={label} value={value} className={className} indicatorColor={indicatorColor} />
          ))}

          <div className="col-span-2">
            <DrawerInfoCard
              label="Details"
              value={
                splitDisplayDetailLines(formatActivityDetails(log.details)).length > 0
                  ? (
                    <div className="space-y-1">
                      {splitDisplayDetailLines(formatActivityDetails(log.details)).map((line, index) => (
                        <p key={`details-${index}`} className="m-0 break-words text-[13px] font-medium text-slate-700">{line}</p>
                      ))}
                    </div>
                  ) : "—"
              }
              className="col-span-2"
            />
          </div>
        </div>
      </DrawerSection>

      
    </DetailDrawer>
  );
};

const SuperActivityLogs = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const highlightedLogKey = highlightedSearchResult?.group === "Activity Logs"
    ? String(highlightedSearchResult?.id || "")
    : searchParams.get("log")
      ? `activity-log-${searchParams.get("log")}`
      : "";
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const [activeItem, setActiveItem] = useState("Activity Logs");
  const [contentMargin, setContentMargin] = useState(() =>
    window.innerWidth >= 1024 ? (sidebarCollapsed ? 72 : 256) : 0
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [currentPage, setPage] = useState(1);
  const requestedPage = currentPage;
  const [selectedLog, setSelectedLog] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const didRunTableFilterResetRef = useRef(false);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const activityLogsQuery = useActivityLogsQuery({
    search: debouncedSearch,
    period: periodFilter,
    status: statusFilter,
    page: currentPage,
    perPage: PAGE_SIZE,
    sort: "created_at_desc",
    paginated: true,
  });
  const logs = activityLogsQuery.data?.logs ?? [];
  const logsMeta = activityLogsQuery.data?.meta ?? {
    current_page: 1,
    last_page: 1,
    total: 0,
    from: 0,
    to: 0,
    stats: {
      total_logs: 0,
      info_count: 0,
      warning_count: 0,
      critical_count: 0,
      today_count: 0,
    },
  };
  const showInitialSkeleton =
    !activityLogsQuery.isError &&
    activityLogsQuery.isLoading &&
    !activityLogsQuery.data;
  const isError = activityLogsQuery.isError;

  const handleWidthChange = useCallback((width) => setContentMargin(width), []);

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) {
      setContentMargin(sidebarCollapsed ? 72 : 256);
    } else if (window.innerWidth < 1024) {
      setContentMargin(0);
    }
  }, [sidebarCollapsed, sidebarOpen]);

  const displayUserName = useCallback(
    (userName) => {
      return userName || "System";
    },
    []
  );

  const normalizedLogs = useMemo(
    () =>
      logs.map((log) => ({
        ...log,
        timestamp: log.timestamp ?? log.created_at,
        severity: log.severity || getSeverityFromAction(log.action),
      })),
    [logs]
  );

  

  const statusFilterOptions = useMemo(
    () => [
      { value: "all", label: "All Status" },
      { value: "info", label: "Info" },
      { value: "warning", label: "Warning" },
      { value: "critical", label: "Critical" },
    ],
    []
  );

  const filteredLogs = normalizedLogs;
  const totalPages = Math.max(1, Number(logsMeta.last_page || 1));
  const safePage = Math.min(requestedPage, totalPages);
  const paginatedLogs = filteredLogs;

  useEffect(() => {
    if (!didRunTableFilterResetRef.current) {
      didRunTableFilterResetRef.current = true;
      return;
    }

    setPage(1);
    void queryClient.invalidateQueries({ queryKey: ACTIVITY_LOGS_QUERY_KEY, refetchActive: true });
  }, [debouncedSearch, queryClient, statusFilter, periodFilter]);

  useEffect(() => {
    if (requestedPage === currentPage) return undefined;

    const timeout = window.setTimeout(() => {
      void queryClient.cancelQueries({ queryKey: ACTIVITY_LOGS_QUERY_KEY, type: "active" });

    }, PAGE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [currentPage, queryClient, requestedPage]);

  useEffect(() => {
    if (requestedPage <= totalPages) return;
    setPage(totalPages);
  }, [requestedPage, totalPages]);

  useEffect(() => {
    const requestedSearch = searchParams.get("q") || "";
    const requestedPage = Math.max(1, Number(searchParams.get("page") || "1") || 1);
    setSearch(requestedSearch);
    setPage(requestedPage);
  }, [searchParams]);

  const handlePageChange = useCallback((nextPage) => {
    setPage(nextPage);
  }, []);

  const overviewData = useMemo(
    () => getActivityLogOverviewData(queryClient) ?? activityLogsQuery.data,
    [queryClient, activityLogsQuery.data]
  );

  const stats = useMemo(() => getActivityLogOverviewStats(overviewData), [overviewData]);

  const openDrawer = (log) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  };

  return (
    <>
      <style>{`* { font-family: ${FONT} !important; } input::placeholder { color: #1a1f36 !important; opacity: 0.4; }`}</style>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onWidthChange={handleWidthChange} />

        <div
          className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px",
          }}
        >
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />

          <main className="min-w-0 flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">
              <div className="mb-5 flex items-center justify-between">
                <TitlePage title="Activity Logs" subtitle="Track account, archive, and system actions." loading={showInitialSkeleton} />
                <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: "Activity Logs" }]} fontFamily={FONT} loading={showInitialSkeleton} />
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                {stats.map((stat) => (
                  <OverviewCard key={stat.title} {...stat} loading={showInitialSkeleton} />
                ))}
              </div>

              <Tabs
                tabs={ACTIVITY_LOG_TABS}
                activeKey="timeline"
                onTabChange={() => {}}
                fontFamily={FONT}
                className="mb-5"
                loading={showInitialSkeleton}
                rightContent={<Legend items={SEVERITY_LEGEND} loading={showInitialSkeleton} />}
              >
              <TableCard
                title="Activity Timeline"
                subtitle="All historical activities."
                loading={showInitialSkeleton}
                headerActionsSkeletonCount={3}
                bodyClassName="overflow-x-auto"
                footerClassName="flex items-center justify-between"
                actions={
                  <>
                    {/* Enhanced Search Input - Like Set Fees */}
                    <div
                      className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-4"
                      style={{ height: 42, width: 300 }}
                    >
                      <IoSearchOutline className="flex-shrink-0 text-[17px]" style={{ color: "#1a1f36" }} />
                      <input
                        type="text"
                        placeholder="Search for date, user, module"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                        }}
                        className="bg-transparent border-none outline-none text-[13px] w-full"
                        style={{ fontFamily: FONT, color: "#1a1f36" }}
                      />
                      {search && (
                        <button
                          onClick={() => {
                            setSearch("");
                          }}
                          className="flex items-center justify-center border-none bg-transparent cursor-pointer"
                          style={{ color: "#9ca3af" }}
                        >
                          <IoCloseOutline className="text-[16px]" />
                        </button>
                      )}
                    </div>
                    
                    <FilterButton
                      {...ACTIVITY_LOG_FILTER_DROPDOWN_PROPS}
                      value={periodFilter}
                      onChange={(value) => {
                        setPeriodFilter(value);
                        setPage(1);
                        void queryClient.invalidateQueries({ queryKey: ACTIVITY_LOGS_QUERY_KEY, refetchActive: true });
                      }}
                      options={PERIOD_OPTIONS}
                      width={150}
                      height={42}
                    />
                    <FilterButton
                      {...ACTIVITY_LOG_FILTER_DROPDOWN_PROPS}
                      value={statusFilter}
                      onChange={(value) => {
                        setStatusFilter(value);
                        setPage(1);
                        void queryClient.invalidateQueries({ queryKey: ACTIVITY_LOGS_QUERY_KEY, refetchActive: true });
                      }}
                      options={statusFilterOptions}
                      width={150}
                      height={42}
                    />
                  </>
                }
                pagination={{
                  meta: logsMeta,
                  totalPages,
                  currentPage: safePage,
                  requestedPage,
                  isLoading: showInitialSkeleton,
                  onPageChange: handlePageChange,
                }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{ minWidth: 980 }}>
                    <thead>
                      <tr>
                        <TH>Date</TH>
                        <TH>Time</TH>
                        <TH>User</TH>
                        <TH>Details</TH>
                        <TH>Module</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {showInitialSkeleton ? (
                        Array.from({ length: PAGE_SIZE }).map((_, index) => (
                          <tr
                            key={`activity-skeleton-${index}`}
                            className="animate-pulse"
                            style={{ borderBottom: "1px solid #f1f5f9" }}
                          >
                            <td className="px-4 py-3"><div className="h-3 w-24 rounded bg-slate-100" /></td>
                            <td className="px-4 py-3"><div className="h-3 w-16 rounded bg-slate-100" /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-lg bg-slate-100 flex-shrink-0" />
                                <div className="h-3 w-28 rounded bg-slate-100" />
                              </div>
                            </td>
                            <td className="px-4 py-3"><div className="h-3 w-56 rounded bg-slate-100" /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-lg bg-slate-100 flex-shrink-0" />
                                <div className="h-3 w-20 rounded bg-slate-100" />
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : isError ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-14 text-center text-[13px] text-red-500">
                            Unable to load activity logs right now.
                          </td>
                        </tr>
                      ) : paginatedLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            <NoDataFound title={search || statusFilter !== "all" ? "No results found" : "No Data Found"} />
                          </td>
                        </tr>
                      ) : (
                        paginatedLogs.map((log, index) => {
                          const meta = severityMeta[log.severity] ?? severityMeta.info;

                          return (
                            <tr
                              key={log.id}
                              onClick={() => openDrawer(log)}
                              className={`transition-colors cursor-pointer ${highlightedLogKey ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${highlightedLogKey === `activity-log-${log.id}` ? "universal-search-highlight" : ""}`.trim()}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                    style={{ backgroundColor: meta.iconColor, minWidth: 10, minHeight: 10 }}
                                    title={meta.label}
                                  />
                                  <span className="text-[13px]" style={{ color: "#1a1f36" }}>
                                    {formatDate(log.timestamp)}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>
                                {formatTime(log.timestamp)}
                              </td>
                              <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
                                <span className="font-semibold">{displayUserName(log.user_name)}</span>
                              </td>
                              <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
                                <div className="max-w-[320px] text-slate-600 leading-5">
                                  {splitDisplayDetailLines(log.details).length > 0
                                    ? splitDisplayDetailLines(log.details).map((line, detailIndex) => (
                                        <p
                                          key={`${log.id}-detail-${detailIndex}`}
                                          className="m-0"
                                        >
                                          {line}
                                        </p>
                                      ))
                                    : "No additional details provided."}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: "#1a1f36" }}>
                                {log.module}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

              </TableCard>
              </Tabs>
            </div>
          </main>
        </div>

        <ActivityLogDrawer
          open={drawerOpen}
          log={selectedLog}
          onClose={() => setDrawerOpen(false)}
          displayUserName={displayUserName}
        />
      </div>
    </>
  );
};

export default SuperActivityLogs;
