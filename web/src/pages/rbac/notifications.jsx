import React, { useEffect, useMemo, useRef, useState } from "react";
import { ConfigProvider } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  IoNotificationsOutline,
  IoSearchOutline,
  IoCheckmarkOutline,
  IoCloseOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import FilterButton from "../../components/FilterButton";
import Legend from "../../components/Legend";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import NoDataFound from "../../components/NoDataFound";
import { useSidebar } from "../../store/sidebarStore";
import { useNotificationsDataQuery } from "../../hooks/useNotificationsDataQuery";
import api from "../../api/axios";

const FONT = "'Montserrat', sans-serif";
const PAGE_SIZE = 10;
const PAGE_DEBOUNCE_MS = 150;
const SEARCH_DEBOUNCE_MS = 300;

const antTheme = {
  token: { colorPrimary: "#4096ff", borderRadius: 12, fontFamily: FONT },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

const STATUS_LEGEND = [
  { key: "unread", label: "Unread", meaning: "Needs attention from the recipient", color: "#f59e0b" },
  { key: "read", label: "Read", meaning: "Already reviewed or completed", color: "#16a34a" },
];

const NOTIFICATION_TABS = [
  { key: "history", label: "Notifications", icon: IoNotificationsOutline },
];

const TH = ({ children }) => (
  <th
    className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap"
    style={{ color: "#1a1f36", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}
  >
    {children}
  </th>
);

const TailDropdown = ({ value, onChange, options, height = 42, minWidth = 150 }) => (
  <FilterButton value={value} onChange={onChange} options={options} height={height} width={minWidth} />
);


const MONTH_NAME_TO_NUMBER = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const normalizeDateSearch = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const monthFirstMatch = raw.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (monthFirstMatch) {
    const month = MONTH_NAME_TO_NUMBER[monthFirstMatch[1].toLowerCase()];
    const day = Number(monthFirstMatch[2]);
    const year = monthFirstMatch[3] || String(new Date().getFullYear());

    if (month && day >= 1 && day <= 31) {
      return `${year}-${month}-${String(day).padStart(2, "0")}`;
    }
  }

  const dayFirstMatch = raw.match(/^(\d{1,2})\s+([a-zA-Z]+)(?:,?\s+(\d{4}))?$/);
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = MONTH_NAME_TO_NUMBER[dayFirstMatch[2].toLowerCase()];
    const year = dayFirstMatch[3] || String(new Date().getFullYear());

    if (month && day >= 1 && day <= 31) {
      return `${year}-${month}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsedTimestamp = Date.parse(raw);
  if (!Number.isNaN(parsedTimestamp)) {
    const parsedDate = new Date(parsedTimestamp);
    return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;
  }

  return raw;
};

const formatNotificationDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatNotificationTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const NotificationsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const [activeItem, setActiveItem] = useState("Notification");
  const [contentMargin, setContentMargin] = useState(() => (window.innerWidth >= 1024 ? 256 : 0));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [requestedPage, setRequestedPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const normalizedDebouncedSearch = useMemo(() => normalizeDateSearch(debouncedSearch), [debouncedSearch]);
  const didRunTableFilterResetRef = useRef(false);
  const { data, isLoading } = useNotificationsDataQuery({
    page: currentPage,
    perPage: PAGE_SIZE,
    search: normalizedDebouncedSearch,
    status: statusFilter,
    paginated: true,
  });

  const notifications = data?.notifications ?? [];
  const notificationsMeta = data?.notificationsMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };

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

  const filteredRows = notifications;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearch(params.get("q") || "");
  }, [location.search]);

  const totalPages = Math.max(1, Number(notificationsMeta.last_page || 1));
  const safePage = Math.min(requestedPage, totalPages);
  const paginatedRows = filteredRows;
  const isNotificationsTableLoading = isLoading && !data;

  useEffect(() => {
    if (!didRunTableFilterResetRef.current) {
      didRunTableFilterResetRef.current = true;
      return;
    }

    setRequestedPage(1);
    setCurrentPage(1);
  }, [normalizedDebouncedSearch, statusFilter]);

  useEffect(() => {
    if (requestedPage === currentPage) return undefined;

    const timeout = window.setTimeout(() => {
      void queryClient.cancelQueries({ queryKey: ["notifications-data"] });
      setCurrentPage(requestedPage);
    }, PAGE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [currentPage, queryClient, requestedPage]);

  useEffect(() => {
    if (requestedPage <= totalPages) return;
    setRequestedPage(totalPages);
    setCurrentPage(totalPages);
  }, [requestedPage, totalPages]);

  const totalNotifications = data?.totalCount ?? 0;
  const unreadNotifications = data?.unreadCount ?? 0;
  const readNotifications = data?.readCount ?? 0;

  const markReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      await api.patch(`/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications-data"], refetchType: "active" });
    },
  });

  const getNotificationNavigationTarget = (notification) => {
    const relatedType = String(notification?.related_type || "").trim().toLowerCase();
    const relatedId = notification?.related_id;

    if (relatedType === "remittance" && relatedId) {
      const highlightId = `remittance-${relatedId}`;

      return {
        pathname: "/remittance",
        search: `?highlight=${highlightId}`,
        state: {
          universalSearchResult: {
            id: highlightId,
            group: "Remittance",
            path: `/remittance?highlight=${highlightId}`,
            title: notification?.title || "Remittance",
            subtitle: notification?.message || "",
          },
        },
      };
    }

    return {
      pathname: "/notification",
      search: "",
      state: null,
    };
  };

  const handleNotificationRowClick = async (row) => {
    const target = getNotificationNavigationTarget(row);

    if (!row?.notification_id) {
      navigate(
        { pathname: target.pathname, search: target.search },
        { state: target.state }
      );
      return;
    }

    if (!row.is_read) {
      try {
        await markReadMutation.mutateAsync(row.notification_id);
      } catch (error) {
        // Keep navigation responsive even if read-state update fails.
      }
    }

    navigate(
      { pathname: target.pathname, search: target.search },
      { state: target.state }
    );
  };

  return (
    <ConfigProvider theme={antTheme}>
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
              <div className="mb-5 flex items-center justify-between">
                <TitlePage title="Notifications" subtitle="Review all notification history." loading={!data && isLoading} />
                <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: "Notifications" }]} fontFamily={FONT} loading={!data && isLoading} />
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <OverviewCard title="Total Notifications" value={String(totalNotifications)} icon={IoNotificationsOutline} loading={!data && isLoading} />
                <OverviewCard title="Unread Notifications" value={String(unreadNotifications)} icon={IoCloseOutline} loading={!data && isLoading} />
                <OverviewCard title="Read Notifications" value={String(readNotifications)} icon={IoCheckmarkOutline} loading={!data && isLoading} />
              </div>

              <Tabs
                tabs={NOTIFICATION_TABS}
                activeKey="history"
                onTabChange={() => {}}
                fontFamily={FONT}
                className="mb-5"
                loading={!data && isLoading}
                rightContent={<Legend items={STATUS_LEGEND} loading={!data && isLoading} />}
              >
              <TableCard
                title="Notification History"
                subtitle="All notifications record."
                loading={isNotificationsTableLoading}
                headerActionsSkeletonCount={2}
                bodyClassName="overflow-x-auto"
                footerClassName="flex items-center justify-between"
                actions={
                  <>
                    <div className="flex items-center gap-2.5 px-4 rounded-lg border border-gray-200 bg-white transition-all" style={{ height: 42, width: 280 }}>
                      <IoSearchOutline className="text-[17px] flex-shrink-0" style={{ color: "#1a1f36" }} />
                      <input
                        type="text"
                        placeholder="Search dates, e.g. June 15"
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setRequestedPage(1);
                          setCurrentPage(1);
                        }}
                        className="bg-transparent border-none outline-none text-[13px] w-full"
                        style={{ fontFamily: FONT, color: "#1a1f36" }}
                      />
                    </div>
                    <TailDropdown
                      value={statusFilter}
                      onChange={(value) => {
                        setStatusFilter(value || "all");
                        setRequestedPage(1);
                        setCurrentPage(1);
                      }}
                      options={STATUS_FILTER_OPTIONS}
                      height={42}
                      minWidth={150}
                    />
                  </>
                }
                pagination={{
                  meta: notificationsMeta,
                  totalPages,
                  currentPage: safePage,
                  requestedPage,
                  isLoading: isNotificationsTableLoading,
                  onPageChange: setRequestedPage,
                }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{ minWidth: 980 }}>
                    <thead>
                      <tr>
                        <TH>Title</TH>
                        <TH>Message</TH>
                        <TH>Date</TH>
                        <TH>Time</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {isNotificationsTableLoading ? (
                        Array.from({ length: PAGE_SIZE }).map((_, index) => (
                          <tr key={`notification-skeleton-${index}`} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                            {Array.from({ length: 4 }).map((__, column) => (
                              <td key={column} className="px-4 py-3">
                                <div className="h-3 rounded bg-slate-100" style={{ width: column === 1 ? 220 : 120 }} />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={4}>
                            <NoDataFound title={search ? "No results found" : "No Data Found"} />
                          </td>
                        </tr>
                      ) : (
                        paginatedRows.map((row, index) => (
                            <tr
                              key={row.notification_id}
                              onClick={() => handleNotificationRowClick(row)}
                              className={`transition-colors cursor-pointer ${index % 2 === 0 ? "table-row-even" : "table-row-odd"}`}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: !row.is_read ? "#f3f4f6" : "#ffffff",
                              }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: row.is_read ? "#16a34a" : "#f59e0b",
                                      minWidth: 10,
                                      minHeight: 10,
                                    }}
                                  />
                                  <span className="text-[13px] font-semibold text-[#1a1f36]">
                                    {row.title || "-"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[13px] text-[#1a1f36]">
                                <div
                                  className="overflow-hidden break-words"
                                  style={{
                                    lineHeight: "1.35",
                                    maxWidth: 320,
                                    whiteSpace: "normal",
                                  }}
                                >
                                  {row.message || "-"}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[13px] text-[#1a1f36]">{formatNotificationDate(row.created_at)}</td>
                              <td className="px-4 py-3 text-[13px] text-[#1a1f36]">{formatNotificationTime(row.created_at)}</td>
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
    </ConfigProvider>
  );
};

export default NotificationsPage;
