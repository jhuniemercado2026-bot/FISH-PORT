import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tooltip } from "antd";
import "typeface-montserrat";
import {
  IoArchiveOutline,
  IoBoatOutline,
  IoCarOutline,
  IoCashOutline,
  IoLayersOutline,
  IoPersonOutline,
  IoRefreshOutline,
  IoSearchOutline,
  IoCalendarOutline,
  IoFishOutline,
  IoWarningOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import api from "../../api/axios";
import { showBottomToast } from "../../store/bottomToastStore";
import { useSidebar } from "../../store/sidebarStore";
import { useArchivedDataQuery } from "../../hooks/useArchivedDataQuery";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import StatusPill from "../../components/StatusPill";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import Spinner from "../../components/Spinner";
import NoDataFound from "../../components/NoDataFound";

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
  { key: "fees", label: "Fees", icon: IoCashOutline },
];

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
  if (tab === "fees") return item?.fee_type_name ?? item?.fee_name ?? "this record";
  if (tab === "fishClassifications") return item?.classification_name ?? "this record";
  if (tab === "vehicleTypes") return item?.type_name ?? "this record";
  return item?.full_name || getBoatOwnerName(item) || "this record";
};

const getFeeApplicableLabel = (fee) =>
  fee?.boat_type?.type_name ??
  fee?.boatType?.type_name ??
  fee?.vehicle_type?.type_name ??
  fee?.vehicleType?.type_name ??
  "General / Ticket Fee";

const formatMoneyValue = (value) => {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return "0.00";
  return numeric.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatEffectivityRange = (item) => {
  const effectiveFrom = formatDateOnly(item?.effective_from);
  const effectiveTo = item?.effective_to ? formatDateOnly(item.effective_to) : "Onward";
  return `${effectiveFrom} - ${effectiveTo}`;
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
  fees: {
    label: "Archived Fee Records",
    emptyMessage: "No archived fee records found.",
    restoreLabel: "Restore Fee Record",
    restorePath: (item) => `/fees/${item.fee_id}/restore`,
    permanentDeleteLabel: "Fee record",
    permanentDeletePath: () => null,
    getKey: (item) => `fee-${item.fee_id}`,
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

const ArchiveActionModal = ({ open, tab, item, onClose, onConfirm }) => {
  const [processing, setProcessing] = useState(false);
  if (!open || !item) return null;

  const itemLabel =
    tab === "boats" ? "Boat" :
    tab === "boatTypes" ? "Boat Type" :
    tab === "boatOwners" ? "Boat Owner" :
    tab === "fishClassifications" ? "Fish Classification" :
    tab === "vehicleTypes" ? "Vehicle Type" :
    "Fee";
  const actionLabel = `Restore ${itemLabel}`;
  const accentBg = "#eff6ff";
  const accentColor = "#2563eb";
  const buttonBg = "#1a1f36";
  const buttonHover = "#2d3561";
  const processingBg = "#1a1f36";
  const buttonText = "Restore";

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      await onConfirm();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(10,13,28,0.55)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="bg-white w-full overflow-hidden"
        style={{ maxWidth: 400, borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.2)", fontFamily: FONT, animation: "modalPop 0.22s cubic-bezier(0.34,1.56,0.64,1)" }}
      >
        <style>{`@keyframes modalPop{from{opacity:0;transform:scale(0.92) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <div className="px-6 pt-8 pb-5 flex flex-col items-center text-center">
          <div className="mb-5 flex items-center justify-center" style={{ width: 68, height: 68, borderRadius: 18, backgroundColor: accentBg }}>
            <IoWarningOutline style={{ fontSize: 36, color: accentColor }} />
          </div>
          <p className="m-0 text-[18px] font-bold mb-2" style={{ color: "#0d1117" }}>{actionLabel}</p>
          <p className="m-0 text-[15px] leading-relaxed" style={{ color: "#64748b" }}>
            Are you sure you want to restore{" "}
            <span className="font-bold" style={{ color: "#1a1f36" }}>"{getArchiveItemName(tab, item)}"</span>?{" "}
           
          </p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={processing}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] font-semibold cursor-pointer hover:bg-gray-50 transition-colors"
            style={{ fontFamily: FONT, color: "#1a1f36" }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={processing}
            className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2"
            style={{ fontFamily: FONT, backgroundColor: processing ? processingBg : buttonBg, border: "none", opacity: processing ? 0.7 : 1 }}
            onMouseEnter={(e) => { if (!processing) e.currentTarget.style.backgroundColor = buttonHover; }}
            onMouseLeave={(e) => { if (!processing) e.currentTarget.style.backgroundColor = buttonBg; }}
          >
            {processing ? <Spinner size={4} /> : buttonText}
          </button>
        </div>
      </div>
    </div>
  );
};

// Page component keeps layout wiring separate from archive presentation logic.
const SuperArchived = () => {
  const [activeItem, setActiveItem] = useState("Archives");
  const [activeTab, setActiveTab] = useState("boats");
  const [currentPage, setCurrentPage] = useState(1);
  const setRequestedPage = setCurrentPage;
  const requestedPage = currentPage;
  const [restoringKey, setRestoringKey] = useState(null);
  const [actionModal, setActionModal] = useState({ open: false, item: null });
  const [search, setSearch] = useState("");
  const [feeTypeSearch, setFeeTypeSearch] = useState("");
  const [fishNameSearch, setFishNameSearch] = useState("");
  const [vehicleTypeSearch, setVehicleTypeSearch] = useState("");
  const didRunTableFilterResetRef = React.useRef(false);
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const debouncedFeeTypeSearch = useDebounce(feeTypeSearch, SEARCH_DEBOUNCE_MS);
  const debouncedFishNameSearch = useDebounce(fishNameSearch, SEARCH_DEBOUNCE_MS);
  const debouncedVehicleTypeSearch = useDebounce(vehicleTypeSearch, SEARCH_DEBOUNCE_MS);

  const { sidebarOpen, sidebarCollapsed, toggleSidebar, setSidebarOpen } = useSidebar();
  const [contentMargin, setContentMargin] = useState(() => (sidebarCollapsed ? 72 : 256));

  const queryClient = useQueryClient();
  const activeSearchValue = activeTab === "fishClassifications"
    ? debouncedFishNameSearch
    : activeTab === "vehicleTypes"
      ? debouncedVehicleTypeSearch
      : activeTab === "fees"
        ? debouncedFeeTypeSearch
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
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();

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
  }, [activeTab, debouncedSearch, debouncedFeeTypeSearch, debouncedFishNameSearch]);

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
    setCurrentPage(1);
    setActiveTab(nextTab);
    setSearch("");
    setFeeTypeSearch("");
    setFishNameSearch("");
    setVehicleTypeSearch("");
    setActionModal({ open: false, item: null });
  };

  const handleRestore = async (item) => {
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
        queryClient.invalidateQueries({ queryKey: ["boat-types"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["boat-owners"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["fees-data"], refetchType: "active" }),
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
          "action",
        ],
        boatTypes: ["text-lg", "pill", "text-md", "date", "time", "action"],
        fishClassifications: ["text-lg", "pill", "text-md", "date", "time", "action"],
        fees: ["text-md", "text-lg", "date", "amount", "date", "time", "action"],
        vehicleTypes: ["text-lg", "pill", "text-md", "date", "time", "action"],
        boatOwners: ["text-lg", "text-xl", "text-md", "pill", "text-md", "date", "time", "action"],
      };
      const cellShapes = skeletonCellsByTab[activeTab] ?? skeletonCellsByTab.boatOwners;
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
        activeTab === "boats" ? 9 :
        activeTab === "fees" ? 8 :
        activeTab === "fishClassifications" ? 7 :
        activeTab === "vehicleTypes" ? 7 : 7;

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
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              {renderRestoreAction(boat)}
            </div>
           </td>
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
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              {renderRestoreAction(boatType)}
            </div>
           </td>
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
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              {renderRestoreAction(classification)}
            </div>
            </td>
          </tr>
      ));
    }

    if (activeTab === "fees") {
      return paginatedItems.map((fee, index) => (
        <tr key={fee.fee_id} className="transition-colors" style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: index % 2 === 0 ? "#ffffff" : "#ededed" }}>
          <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: "#1a1f36" }}>
            {fee.fee_type_name || "-"}
          </td>
          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
            {getFeeApplicableLabel(fee)}
          </td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>
            {formatEffectivityRange(fee)}
          </td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap text-right" style={{ color: "#1a1f36", fontVariantNumeric: "tabular-nums" }}>
            {formatMoneyValue(fee.amount)}
          </td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatDateOnly(getArchivedAt(fee))}</td>
          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatTimeOnly(getArchivedAt(fee))}</td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              {renderRestoreAction(fee)}
            </div>
          </td>
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
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              {renderRestoreAction(vehicleType)}
            </div>
            </td>
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
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {renderRestoreAction(owner)}
          </div>
          </td>
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
          <TH>Action</TH>
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
          <TH>Action</TH>
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
          <TH>Action</TH>
        </tr>
      );
    }

    if (activeTab === "fees") {
      return (
        <tr>
          <TH>Fee Type</TH>
          <TH>Boat / Vehicle Type</TH>
          <TH>Effectivity</TH>
          <TH><div className="pr-4 text-right">Amount (P)</div></TH>
          <TH>Archived At</TH>
          <TH>Time</TH>
          <TH>Action</TH>
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
          <TH>Action</TH>
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
        <TH>Action</TH>
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
            marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px",
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
                headerActionsSkeletonCount={2}
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
                                    : activeTab === "fees"
                                      ? "Search for fee type"
                                      : "Search..."
                        }
                        value={
                          activeTab === "fishClassifications"
                            ? fishNameSearch
                            : activeTab === "vehicleTypes"
                              ? vehicleTypeSearch
                              : activeTab === "fees"
                                ? feeTypeSearch
                                : search
                        }
                        onChange={(event) => {
                          const nextValue = event.target.value;

                          if (activeTab === "fishClassifications") {
                            setFishNameSearch(nextValue);
                          } else if (activeTab === "vehicleTypes") {
                            setVehicleTypeSearch(nextValue);
                          } else if (activeTab === "fees") {
                            setFeeTypeSearch(nextValue);
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
                  <table className="w-full border-collapse" style={{ minWidth: activeTab === "boats" ? 1080 : activeTab === "fishClassifications" || activeTab === "vehicleTypes" || activeTab === "boatTypes" ? 780 : 860 }}>
                    <thead>{renderTableHeader()}</thead>
                    <tbody>{renderRows()}</tbody>
                  </table>
                </div>
              </TableCard>
              </Tabs>
            </div>
          </main>
        </div>
        <ArchiveActionModal
          open={actionModal.open}
          tab={activeTab}
          item={actionModal.item}
          onClose={() => setActionModal({ open: false, item: null })}
          onConfirm={async () => {
            if (!actionModal.item) return;
            await handleRestore(actionModal.item);
            setActionModal({ open: false, item: null });
          }}
        />
      </div>
  );
};

export default SuperArchived;
