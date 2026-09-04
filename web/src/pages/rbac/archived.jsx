import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tooltip } from "antd";
import "typeface-montserrat";
import {
  IoArchiveOutline,
  IoBoatOutline,
  IoCarOutline,
  IoLayersOutline,
  IoPersonOutline,
  IoRefreshOutline,
  IoSearchOutline,
  IoCalendarOutline,
  IoFishOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import api from "../../api/axios";
import { showBottomToast } from "../../store/bottomToastStore";
import { useSidebar } from "../../store/sidebarStore";
import { useArchivedDataQuery } from "../../hooks/useArchivedDataQuery";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import { isHeadRole } from "../../utils/transactionLock";
import { cacheTab, getCachedTab } from "../../utils/tabSession";
import StatusPill from "../../components/StatusPill";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import NoDataFound from "../../components/NoDataFound";
import RestoreModal from "../../components/RestoreModal";

const FONT = "'Montserrat', sans-serif";
const ARCHIVE_FOCUS_COLOR = "#4096ff";
const ARCHIVE_FOCUS_SHADOW = "none";
const PAGE_SIZE = 10;
const PAGE_DEBOUNCE_MS = 150;
const SEARCH_DEBOUNCE_MS = 300;

// Settings-style tabs keep archive categories familiar and easy to switch.
const TABS = [
  { key: "boats", label: "Boats", icon: IoBoatOutline },
  { key: "boatTypes", label: "Boat Types", icon: IoLayersOutline },
  { key: "boatOwners", label: "Boat Owners", icon: IoPersonOutline },
  { key: "fishClassifications", label: "Fish Classifications", icon: IoFishOutline },
  { key: "vehicleTypes", label: "Vehicle Types", icon: IoCarOutline },
];
const ARCHIVES_TAB_STORAGE_KEY = "opol:archives:active-tab";
const ARCHIVES_TAB_KEYS = TABS.map((tab) => tab.key);

// Table header matches the visual language used in Registered Boats.
const TH = ({ children }) => (
  <th
    className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap"
    style={{
      color: "#1a1f36",
      backgroundColor: "#ffffff",
      borderBottom: "2px solid #e5e7eb",
    }}
  >
    {children}
  </th>
);


// Shared formatting helpers keep archive data readable across all tabs.
const formatDateOnly = (value) => {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatTimeOnly = (value) => {
  if (!value) return "-";

  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getBoatOwnerName = (owner) =>
  `${owner?.owner_firstname ?? ""} ${owner?.owner_lastname ?? ""}`.trim() || "-";

const getBoatType = (boat) => boat?.boat_type ?? boat?.boatType ?? null;
const getArchivedBy = (item) => item?.archived_by ?? item?.archivedBy ?? null;
const getUserDisplayName = (user) => {
  if (!user) return "-";
  if (typeof user === "string") return user || "-";
  if (user?.full_name) return user.full_name;
  const combinedName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  if (combinedName) return combinedName;
  return user?.user_name ?? user?.email ?? "-";
};
const getArchivedAt = (item) => item?.deleted_at ?? item?.archived_at ?? item?.deletedAt ?? item?.archivedAt ?? null;
const getArchiveItemName = (tab, item) => {
  if (tab === "boats") return item?.boat_name ?? "this record";
  if (tab === "boatTypes") return item?.type_name ?? "this record";
  if (tab === "fishClassifications") return item?.classification_name ?? "this record";
  if (tab === "vehicleTypes") return item?.type_name ?? "this record";
  return item?.full_name || getBoatOwnerName(item) || "this record";
};

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const formatUsageCountLabel = (count) => {
  const normalizedCount = Number(count ?? 0);
  return `${normalizedCount} ${normalizedCount === 1 ? "count" : "counts"}`;
};

const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
};

// Resource metadata centralizes row labels, filtering, restore endpoints, and titles.
const RESOURCE_META = {
  boats: {
    label: "Archived Boats",
    emptyMessage: "No archived boats found.",
    restoreLabel: "Restore Boat",
    restorePath: (item) => `/boats/${item.boat_id}/restore`,
    permanentDeleteLabel: "Boat",
    permanentDeletePath: (item) => `/boats/${item.boat_id}/permanent`,
    getKey: (item) => `boat-${item.boat_id}`,
  },
  boatTypes: {
    label: "Archived Boat Types",
    emptyMessage: "No archived boat types found.",
    restoreLabel: "Restore Type",
    restorePath: (item) => `/boat-types/${item.boat_type_id}/restore`,
    permanentDeleteLabel: "Boat type",
    permanentDeletePath: (item) => `/boat-types/${item.boat_type_id}/permanent`,
    getKey: (item) => `boat-type-${item.boat_type_id}`,
  },
  boatOwners: {
    label: "Archived Boat Owners",
    emptyMessage: "No archived boat owners found.",
    restoreLabel: "Restore Owner",
    restorePath: (item) => `/boat-owners/${item.owner_id}/restore`,
    permanentDeleteLabel: "Boat owner",
    permanentDeletePath: (item) => `/boat-owners/${item.owner_id}/permanent`,
    getKey: (item) => `boat-owner-${item.owner_id}`,
  },
  fishClassifications: {
    label: "Archived Fish Classifications",
    emptyMessage: "No archived fish classifications found.",
    restoreLabel: "Restore Fish Classification",
    restorePath: (item) => `/fish-classifications/${item.classification_id}/restore`,
    permanentDeleteLabel: "Fish classification",
    permanentDeletePath: () => null,
    getKey: (item) => `fish-classification-${item.classification_id}`,
  },
  vehicleTypes: {
    label: "Archived Vehicle Types",
    emptyMessage: "No archived vehicle types found.",
    restoreLabel: "Restore Vehicle Type",
    restorePath: (item) => `/vehicle-types/${item.vehicle_type_id}/restore`,
    permanentDeleteLabel: "Vehicle type",
    permanentDeletePath: () => null,
    getKey: (item) => `vehicle-type-${item.vehicle_type_id}`,
  },
};

// Page component keeps layout wiring separate from archive presentation logic.
const SuperArchived = () => {
  const [activeItem, setActiveItem] = useState("Archives");
  const [activeTab, setActiveTab] = useState(() => getCachedTab(ARCHIVES_TAB_STORAGE_KEY, ARCHIVES_TAB_KEYS, "boats"));
  const [currentPage, setCurrentPage] = useState(1);
  const setRequestedPage = setCurrentPage;
  const requestedPage = currentPage;
  const [restoringKey, setRestoringKey] = useState(null);
  const [actionModal, setActionModal] = useState({ open: false, item: null });
  const [search, setSearch] = useState("");
  const [fishNameSearch, setFishNameSearch] = useState("");
  const [vehicleTypeSearch, setVehicleTypeSearch] = useState("");
  const didRunTableFilterResetRef = React.useRef(false);
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const debouncedFishNameSearch = useDebounce(fishNameSearch, SEARCH_DEBOUNCE_MS);
  const debouncedVehicleTypeSearch = useDebounce(vehicleTypeSearch, SEARCH_DEBOUNCE_MS);

  const { sidebarOpen, sidebarCollapsed, toggleSidebar, setSidebarOpen } = useSidebar();
  const [contentMargin, setContentMargin] = useState(() => (sidebarCollapsed ? 72 : 256));

  const queryClient = useQueryClient();
  const isHeadViewOnly = isHeadRole();
  const activeSearchValue = activeTab === "fishClassifications"
    ? debouncedFishNameSearch
    : activeTab === "vehicleTypes"
      ? debouncedVehicleTypeSearch
      : debouncedSearch;
  const { data, isLoading, isFetching, isPlaceholderData, isError, error } = useArchivedDataQuery({
    type: activeTab,
    page: currentPage,
    perPage: PAGE_SIZE,
    search: activeSearchValue,
    paginated: true,
    skipFiscalYear: true,
  });
  const loadedContextRef = React.useRef({ tab: activeTab, search: activeSearchValue });
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery("archives");

  const currentMeta = RESOURCE_META[activeTab];
  const archiveBreadcrumbLabel = currentMeta?.label ?? "Archives";
  const searchTerm = activeSearchValue.trim().toLowerCase();
  const archiveMeta = data?.meta ?? {
    current_page: currentPage,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: null,
    to: null,
  };
  const archiveStats = data?.stats ?? { total: 0, archived_today: 0, counts: {} };
  const activeItems = data?.data ?? [];
  const isSameTabPlaceholder =
    isPlaceholderData &&
    loadedContextRef.current.tab === activeTab;

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("q") || "");
    setRequestedPage(1);
    setCurrentPage(1);
  }, [window.location.search]);

  const filteredItems = activeItems;
  const totalPages = Math.max(1, Number(archiveMeta.last_page) || 1);
  const safePage = Math.min(requestedPage, totalPages);
  const paginatedItems = filteredItems;
  const overviewLoading = !data && isLoading;
  const isInitialLoading =
    (isLoading && activeItems.length === 0) ||
    (isPlaceholderData && !isSameTabPlaceholder);
  const fetching = !isError && isInitialLoading;
  const overviewStats = useMemo(() => {
    return [
      { label: "Total Archived Records", value: archiveStats.total, icon: IoArchiveOutline, tone: "navy" },
      {
        label: "Today's Archive",
        value: archiveStats.archived_today,
        icon: IoCalendarOutline,
        tone: "red",
      },
    ];
  }, [archiveStats]);

  React.useEffect(() => {
    if (!didRunTableFilterResetRef.current) {
      didRunTableFilterResetRef.current = true;
      return;
    }

    setRequestedPage(1);
    setCurrentPage(1);
  }, [activeTab, debouncedSearch, debouncedFishNameSearch]);

  React.useEffect(() => {
    if (!data || isPlaceholderData) return;
    loadedContextRef.current = { tab: activeTab, search: activeSearchValue };
  }, [activeTab, data, activeSearchValue, isPlaceholderData]);

  React.useEffect(() => {
    if (requestedPage === currentPage) return undefined;

    const timeout = window.setTimeout(() => {
      void queryClient
        .cancelQueries({ queryKey: ["archives-data"] })
        .finally(() => setCurrentPage(currentPage));
    }, PAGE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [currentPage, queryClient, requestedPage]);

  React.useEffect(() => {
    if (requestedPage <= totalPages) return;
    setCurrentPage(totalPages);
  }, [requestedPage, totalPages]);

  const switchTab = (nextTab) => {
    cacheTab(ARCHIVES_TAB_STORAGE_KEY, nextTab, ARCHIVES_TAB_KEYS);
    setCurrentPage(1);
    setActiveTab(nextTab);
    setSearch("");
    setFishNameSearch("");
    setVehicleTypeSearch("");
    setActionModal({ open: false, item: null });
  };

  const handleRestore = async (item) => {
    if (isHeadViewOnly) return;

    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }
    const itemKey = currentMeta.getKey(item);
    setRestoringKey(itemKey);

    try {
      const response = await api.patch(currentMeta.restorePath(item));
      const restoredItem =
        response?.data?.classification ??
        response?.data?.vehicle_type ??
        response?.data?.vehicleType ??
        response?.data?.data ??
        response?.data;

      showBottomToast("success", "Restore Successful", `${currentMeta.restoreLabel} successful.`);
      
      // Handle fish classification restoration with immediate cache update
      if (activeTab === "fishClassifications" && restoredItem) {
        // Add back to lookup cache
        queryClient.setQueryData(["banyera-data", "lookups"], (previous) =>
          previous
            ? {
                ...previous,
                classifications: [restoredItem, ...(previous.classifications ?? [])],
              }
            : previous
        );
        
        // Update paginated classifications cache
        queryClient.setQueriesData(
          { queryKey: ["banyera-data", "fish-classifications"] },
          (previous) => {
            if (!previous || !Array.isArray(previous.classifications)) return previous;
            
            return {
              ...previous,
              classifications: [restoredItem, ...previous.classifications],
              classificationsMeta: {
                ...previous.classificationsMeta,
                total: (previous.classificationsMeta?.total ?? 0) + 1,
              },
            };
          }
        );
      }

      // Handle vehicle type restoration with immediate cache update
      if (activeTab === "vehicleTypes" && restoredItem) {
        queryClient.setQueriesData(
          { queryKey: ["vehicle-tickets-lookups"] },
          (previous) =>
            previous
              ? {
                  ...previous,
                  vehicleTypes: [restoredItem, ...(previous.vehicleTypes ?? [])],
                }
              : previous
        );

        queryClient.setQueriesData(
          { queryKey: ["vehicle-tickets-data", "vehicle-types"] },
          (previous) => {
            if (!previous || !Array.isArray(previous.vehicleTypes)) return previous;

            return {
              ...previous,
              vehicleTypes: [restoredItem, ...previous.vehicleTypes],
              vehicleTypesMeta: {
                ...previous.vehicleTypesMeta,
                total: (previous.vehicleTypesMeta?.total ?? 0) + 1,
              },
            };
          }
        );
      }
      
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["archives-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["registered-boats-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["registered-boats-report"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["boat-types-report"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["owner-info-report"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["boat-types"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["boat-owners"], refetchType: "active" }),
        activeTab === "boats" ? queryClient.invalidateQueries({ queryKey: ["docking-lookups"], refetchType: "active" }) : Promise.resolve(),
        activeTab === "boats" ? queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" }) : Promise.resolve(),
        activeTab === "boats" ? queryClient.invalidateQueries({ queryKey: ["dockings-calendar"], refetchType: "active" }) : Promise.resolve(),
        activeTab === "boats" ? queryClient.invalidateQueries({ queryKey: ["banyera-data"], refetchType: "active" }) : Promise.resolve(),
        activeTab === "fishClassifications" ? queryClient.invalidateQueries({ queryKey: ["banyera-data", "fish-classifications"], refetchType: "active" }) : Promise.resolve(),
        activeTab === "vehicleTypes" ? queryClient.invalidateQueries({ queryKey: ["vehicle-tickets-data", "vehicle-types"], refetchType: "active" }) : Promise.resolve(),
        activeTab === "vehicleTypes" ? queryClient.invalidateQueries({ queryKey: ["vehicle-tickets-lookups"], refetchType: "active" }) : Promise.resolve(),
      ]);
    } catch (restoreError) {
      showBottomToast("error", "Restore Failed", restoreError?.response?.data?.message || "Unable to restore this archived record.");
    } finally {
      setRestoringKey(null);
    }
  };

  const renderRestoreAction = (item) => {
    if (isHeadViewOnly) return null;

    const itemKey = currentMeta.getKey(item);
    const isRestoring = restoringKey === itemKey;
    const tooltipTitle = isTransactionLocked
      ? transactionLockMessage
      : isRestoring
      ? "Restoring..."
      : currentMeta.restoreLabel;

    return (
      <Tooltip title={tooltipTitle}>
        <button
          type="button"
          onClick={() => {
            if (isTransactionLocked || isRestoring) return;
            setActionModal({ open: true, item });
          }}
          disabled={isTransactionLocked || isRestoring}
          className="flex items-center justify-center w-9 h-9 rounded-lg border bg-white transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:opacity-60"
          style={{ fontFamily: FONT, borderColor: isTransactionLocked || isRestoring ? undefined : "#1a1f36" }}
        >
          <IoRefreshOutline style={{ fontSize: "15px", color: isTransactionLocked || isRestoring ? "#94a3b8" : "#1a1f36" }} />
        </button>
      </Tooltip>
    );
  };

  // Row renderers keep each table shape explicit while reusing the same shell.
  const renderRows = () => {
    if (fetching) {
      const skeletonCellsByTab = {
        boats: [
          "image",
          "text-lg",
          "text-md",
          "text-lg",
          "text-md",
          "date",
          "time",
        ],
        boatTypes: ["text-lg", "pill", "text-md", "date", "time"],
        fishClassifications: ["text-lg", "pill", "text-md", "date", "time"],
        vehicleTypes: ["text-lg", "pill", "text-md", "date", "time"],
        boatOwners: ["text-lg", "text-xl", "text-md", "pill", "text-md", "date", "time"],
      };
      const baseCellShapes = skeletonCellsByTab[activeTab] ?? skeletonCellsByTab.boatOwners;
      const cellShapes = isHeadViewOnly ? baseCellShapes : [...baseCellShapes, "action"];
      const renderSkeletonCell = (shape, index) => {
        const shapeClassName = {
          image: "w-10 h-10 rounded-lg",
          "text-xl": "h-3 w-36 rounded",
          "text-lg": "h-3 w-28 rounded",
          "text-md": "h-3 w-24 rounded",
          date: "h-3 w-24 rounded",
          time: "h-3 w-20 rounded",
          pill: "h-6 w-20 rounded-full",
          amount: "h-3 w-20 rounded ml-auto",
          action: "w-9 h-9 rounded-lg",
        }[shape] ?? "h-3 w-24 rounded";

        return (
          <td key={`${shape}-${index}`} className="px-4 py-3">
            <div className={`${shapeClassName} bg-slate-100`} />
          </td>
        );
      };

      return Array.from({ length: 10 }).map((_, index) => (
        <tr key={`loading-${index}`} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
          {cellShapes.map(renderSkeletonCell)}
        </tr>
      ));
    }

    if (paginatedItems.length === 0) {
      const colSpan =
        activeTab === "boats" ? (isHeadViewOnly ? 7 : 8) :
        activeTab === "boatOwners" ? (isHeadViewOnly ? 7 : 8) :
        isHeadViewOnly ? 5 : 6;

      return (
        <tr>
          <td colSpan={colSpan}>
            <NoDataFound title={searchTerm ? "No results found" : "No Data Found"} />
          </td>
        </tr>
      );
    }

    if (activeTab === "boats") {
      return paginatedItems.map((boat, index) => (
        <tr key={boat.boat_id} className="transition-colors" style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: index % 2 === 0 ? "#ffffff" : "#ededed" }}>
          <td className="px-4 py-3">
            <div className="w-[40px] h-[40px] rounded-lg overflow-hidden border border-gray-200 bg-blue-50 flex items-center justify-center">
              {boat.image_path ? (
                <img
                  src={`${api.defaults.baseURL.replace("/api", "")}/storage/${boat.image_path}`}
                  alt={boat.boat_name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "";
                    e.currentTarget.style.display = "none";
                    const fallback = e.currentTarget.nextElementSibling;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
              ) : null}
              <div className={`${boat.image_path ? "hidden" : "flex"} h-full w-full items-center justify-center`}>
                <IoBoatOutline className="text-[18px] text-blue-300" />
              </div>
            </div>
          </td>
          <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: "#1a1f36" }}>
            {boat.boat_name}
           </td>
          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
            {getBoatType(boat)?.type_name ?? "-"}
           </td>
          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>{getBoatOwnerName(boat.owner)}</td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{getUserDisplayName(getArchivedBy(boat))}</td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatDateOnly(getArchivedAt(boat))}</td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatTimeOnly(getArchivedAt(boat))}</td>
          {!isHeadViewOnly ? (
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                {renderRestoreAction(boat)}
              </div>
             </td>
          ) : null}
         </tr>
      ));
    }

    if (activeTab === "boatTypes") {
      return paginatedItems.map((boatType, index) => (
        <tr key={boatType.boat_type_id} className="transition-colors" style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: index % 2 === 0 ? "#ffffff" : "#ededed" }}>
          <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: "#1a1f36" }}>{boatType.type_name}</td>
          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
            <StatusPill
              status={(boatType.boats_count ?? 0) > 0 ? "enabled" : "disabled"}
              label={formatUsageCountLabel(boatType.boats_count)}
            />
           </td>
          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>{getUserDisplayName(getArchivedBy(boatType))}</td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatDateOnly(getArchivedAt(boatType))}</td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatTimeOnly(getArchivedAt(boatType))}</td>
          {!isHeadViewOnly ? (
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                {renderRestoreAction(boatType)}
              </div>
             </td>
          ) : null}
         </tr>
      ));
    }

    if (activeTab === "fishClassifications") {
      return paginatedItems.map((classification, index) => (
        <tr key={classification.classification_id} className="transition-colors" style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: index % 2 === 0 ? "#ffffff" : "#ededed" }}>
          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>{classification.classification_name || "-"}</td>
          <td className="px-4 py-3">
            <StatusPill
              status={(classification.fish_using_count ?? 0) > 0 ? "enabled" : "disabled"}
              label={formatUsageCountLabel(classification.fish_using_count)}
            />
            </td>
          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>{getUserDisplayName(getArchivedBy(classification))}</td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatDateOnly(getArchivedAt(classification))}</td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatTimeOnly(getArchivedAt(classification))}</td>
          {!isHeadViewOnly ? (
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                {renderRestoreAction(classification)}
              </div>
              </td>
          ) : null}
          </tr>
      ));
    }

    if (activeTab === "vehicleTypes") {
      return paginatedItems.map((vehicleType, index) => (
        <tr key={vehicleType.vehicle_type_id} className="transition-colors" style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: index % 2 === 0 ? "#ffffff" : "#ededed" }}>
          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>{vehicleType.type_name || "-"}</td>
          <td className="px-4 py-3">
            <StatusPill
              status={(vehicleType.tickets_count ?? 0) > 0 ? "enabled" : "disabled"}
              label={formatUsageCountLabel(vehicleType.tickets_count)}
            />
            </td>
          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>{getUserDisplayName(getArchivedBy(vehicleType))}</td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatDateOnly(getArchivedAt(vehicleType))}</td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatTimeOnly(getArchivedAt(vehicleType))}</td>
          {!isHeadViewOnly ? (
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                {renderRestoreAction(vehicleType)}
              </div>
              </td>
          ) : null}
          </tr>
      ));
    }

    return paginatedItems.map((owner, index) => (
      <tr key={owner.owner_id} className="transition-colors" style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: index % 2 === 0 ? "#ffffff" : "#ededed" }}>
        <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: "#1a1f36" }}>{owner.full_name || getBoatOwnerName(owner)}</td>
        <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>{owner.address || "-"}</td>
        <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>{owner.contact_number || "-"}</td>
        <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
          <StatusPill
            status={(owner.boats_count ?? 0) > 0 ? "enabled" : "disabled"}
            label={formatUsageCountLabel(owner.boats_count)}
          />
          </td>
        <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>{getUserDisplayName(getArchivedBy(owner))}</td>
        <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatDateOnly(getArchivedAt(owner))}</td>
        <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatTimeOnly(getArchivedAt(owner))}</td>
        {!isHeadViewOnly ? (
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              {renderRestoreAction(owner)}
            </div>
            </td>
        ) : null}
        </tr>
    ));
  };

  const renderTableHeader = () => {
    if (activeTab === "boats") {
      return (
        <tr>
          <TH>Image</TH>
          <TH>Boat Name</TH>
          <TH>Type</TH>
          <TH>Owner</TH>
          <TH>Archived By</TH>
          <TH>Archived At</TH>
          <TH>Time</TH>
          {!isHeadViewOnly ? <TH>Action</TH> : null}
        </tr>
      );
    }

    if (activeTab === "boatTypes") {
      return (
        <tr>
          <TH>Boat Type</TH>
          <TH>Usage Count</TH>
          <TH>Archived By</TH>
          <TH>Archived At</TH>
          <TH>Time</TH>
          {!isHeadViewOnly ? <TH>Action</TH> : null}
        </tr>
      );
    }

    if (activeTab === "fishClassifications") {
      return (
        <tr>
          <TH>Fish Name</TH>
          <TH>Usage Count</TH>
          <TH>Archived By</TH>
          <TH>Archived At</TH>
          <TH>Time</TH>
          {!isHeadViewOnly ? <TH>Action</TH> : null}
        </tr>
      );
    }

    if (activeTab === "vehicleTypes") {
      return (
        <tr>
          <TH>Vehicle Type</TH>
          <TH>Usage Count</TH>
          <TH>Archived By</TH>
          <TH>Archived At</TH>
          <TH>Time</TH>
          {!isHeadViewOnly ? <TH>Action</TH> : null}
        </tr>
      );
    }

    return (
      <tr>
        <TH>Boat Owner</TH>
        <TH>Address</TH>
        <TH>Contact</TH>
        <TH>Usage Count</TH>
        <TH>Archived By</TH>
        <TH>Archived At</TH>
        <TH>Time</TH>
        {!isHeadViewOnly ? <TH>Action</TH> : null}
      </tr>
    );
  };

  return (
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#ffffff", fontFamily: FONT }}>
        <Sidebar
          activeItem={activeItem}
          setActiveItem={setActiveItem}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onWidthChange={setContentMargin}
        />

        <div
          className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            marginLeft: sidebarOpen && window.innerWidth >= 900 ? `${contentMargin}px` : "0px",
            transition: "margin-left 0.3s ease",
          }}
        >
          <Topbar
            sidebarOpen={sidebarOpen}
            sidebarCollapsed={sidebarCollapsed}
            onMenuToggle={toggleSidebar}
          />

          <main className="min-w-0 flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">
              <div className="mb-5 flex items-center justify-between">
                <TitlePage title="Archives" subtitle="All archived records stored in the system." loading={overviewLoading} />
                <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: archiveBreadcrumbLabel }]} fontFamily={FONT} loading={overviewLoading} />
              </div>

              {isError ? (
                <div className="rounded-2xl px-4 py-3 mb-6" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
                  <p className="m-0 text-[13px] font-semibold" style={{ color: "#b91c1c" }}>
                    {error?.response?.data?.message || "Unable to load archived records right now."}
                  </p>
                </div>
              ) : null}

              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                {overviewStats.map(({ label, value, icon: Icon, tone }) => (
                  <OverviewCard
                    key={label}
                    title={label}
                    value={value}
                    icon={Icon}
                    tone={tone}
                    loading={overviewLoading}
                  />
                ))}
              </div>

              <Tabs
                tabs={TABS}
                activeKey={activeTab}
                onTabChange={switchTab}
                fontFamily={FONT}
                className="mb-6"
                loading={overviewLoading}
              >
              <TableCard
                title={currentMeta.label}
                subtitle="All archived records stored in the system."
                loading={fetching}
                headerActionsSkeletonCount={isHeadViewOnly ? 1 : 2}
                bodyClassName="overflow-x-auto"
                actions={
                  <div className="flex items-center gap-2 flex-wrap">
                    <div
                      className="flex items-center gap-2.5 px-4 rounded-lg border border-gray-200 bg-white transition-all"
                      style={{ height: 42, width: 280, maxWidth: "100%" }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = ARCHIVE_FOCUS_COLOR; e.currentTarget.style.boxShadow = ARCHIVE_FOCUS_SHADOW; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <IoSearchOutline className="text-[17px] flex-shrink-0" style={{ color: "#1a1f36" }} />
                      <input
                        type="text"
                        placeholder={
                          activeTab === "boats"
                            ? "Search for boat name"
                            : activeTab === "boatTypes"
                              ? "Search for boat type"
                              : activeTab === "boatOwners"
                                ? "Search for Owner Name"
                                : activeTab === "fishClassifications"
                                  ? "Search for fish name"
                                  : activeTab === "vehicleTypes"
                                    ? "Search for Vehicle Type"
                                    : "Search..."
                        }
                        value={
                          activeTab === "fishClassifications"
                            ? fishNameSearch
                            : activeTab === "vehicleTypes"
                              ? vehicleTypeSearch
                              : search
                        }
                        onChange={(event) => {
                          const nextValue = event.target.value;

                          if (activeTab === "fishClassifications") {
                            setFishNameSearch(nextValue);
                          } else if (activeTab === "vehicleTypes") {
                            setVehicleTypeSearch(nextValue);
                          } else {
                            setSearch(nextValue);
                          }

                          setRequestedPage(1);
                          setCurrentPage(1);
                        }}
                        className="bg-transparent border-none outline-none text-[13px] w-full"
                        style={{ fontFamily: FONT, color: "#1a1f36" }}
                      />
                    </div>
                  </div>
                }
                pagination={{
                  meta: archiveMeta,
                  totalPages,
                  currentPage: safePage,
                  requestedPage,
                  isLoading: fetching,
                  onPageChange: setRequestedPage,
                }}
              >
                <div className="overflow-x-auto">
                  <table
                    className="w-full border-collapse"
                    style={{
                      minWidth: activeTab === "boats"
                        ? isHeadViewOnly ? 960 : 1080
                        : activeTab === "fishClassifications" || activeTab === "vehicleTypes" || activeTab === "boatTypes"
                          ? isHeadViewOnly ? 680 : 780
                          : isHeadViewOnly ? 760 : 860,
                    }}
                  >
                    <thead>{renderTableHeader()}</thead>
                    <tbody>{renderRows()}</tbody>
                  </table>
                </div>
              </TableCard>
              </Tabs>
            </div>
          </main>
        </div>
        {!isHeadViewOnly ? <RestoreModal
          open={actionModal.open}
          title={
            activeTab === "boats" ? "Restore Boat" :
            activeTab === "boatTypes" ? "Restore Boat Type" :
            activeTab === "boatOwners" ? "Restore Boat Owner" :
            activeTab === "fishClassifications" ? "Restore Fish Classification" :
            activeTab === "vehicleTypes" ? "Restore Vehicle Type" :
            "Restore Record"
          }
          itemName={actionModal.item ? getArchiveItemName(activeTab, actionModal.item) : ""}
          onClose={() => setActionModal({ open: false, item: null })}
          onConfirm={async () => {
            if (!actionModal.item) return;
            await handleRestore(actionModal.item);
            setActionModal({ open: false, item: null });
          }}
        /> : null}
      </div>
  );
};

export default SuperArchived;
