import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ConfigProvider, Drawer as AntDrawer, Select, Tooltip } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import "typeface-montserrat";
import {
  IoAddOutline,
  IoPersonOutline,
  IoLocationOutline,
  IoCalendarOutline,
  IoCallOutline,
  IoDocumentTextOutline,
  IoCloseOutline,
  IoLayersOutline,
  IoBoatOutline,
  IoSearchOutline,
  IoCloudDownloadOutline,
  IoChevronDownOutline,
  IoCreateOutline,
  IoTrashOutline,
  IoCheckmarkOutline,
  IoImageOutline,
  IoCloudUploadOutline,
  IoExpandOutline,
  IoAlertCircleOutline,
  IoCardOutline,
  IoWarningOutline,
  IoInformationCircleOutline,
  IoPeopleOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import StatusPill from "../../components/StatusPill";
import DetailDrawer, { DrawerInfoCard, DrawerSection } from "../../components/Drawer";
import FilterSelect from "../../components/FilterSelect";
import Legend from "../../components/Legend";
import Modal, { ModalFieldError, ModalTextInput } from "../../components/Modal";
import Card from "../../components/Card";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import Spinner from "../../components/Spinner";
import NoDataFound from "../../components/NoDataFound";
import { showAddedToast, showBottomToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import { useSidebar } from "../../store/sidebarStore";
import api from "../../api/axios";
import {
  useRegisteredBoatsDataQuery,
  useBoatTypesQuery,
  useBoatOwnersQuery,
} from "../../hooks/useBoatManagement";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import {
  addBoatTypeToDataCache,
  addOwnerToDataCache,
  addRegisteredBoatToDataCache,
  archiveBoatTypeInDataCache,
  archiveOwnerInDataCache,
  archiveRegisteredBoatInDataCache,
  updateBoatTypeInDataCache,
  updateOwnerInDataCache,
  updateRegisteredBoatsDataCache,
} from "../../utils/boatManagementCache";

const RB_PAGE_SIZE = 10;
const RB_FONT = "'Montserrat', sans-serif";

const RB_getOwnerName = (owner) =>
  `${owner?.owner_firstname ?? ""} ${owner?.owner_lastname ?? ""}`.trim() || "-";

const RB_getBoatType  = (boat) => boat?.boat_type  ?? boat?.boatType  ?? null;
const RB_getCreatedBy = (boat) => boat?.created_by ?? boat?.createdBy ?? null;
const RB_getCreatedByLabel = (boat) => {
  const createdBy = RB_getCreatedBy(boat);
  if (!createdBy) return "-";

  const fullName = String(createdBy?.full_name || "").trim();
  if (fullName !== "") return fullName;

  const firstLast = [createdBy?.first_name, createdBy?.last_name].filter(Boolean).join(" ").trim();
  if (firstLast !== "") return firstLast;

  return String(createdBy?.email || "-").trim() || "-";
};
const RB_getOwnerLabel = (owner) =>
  `${owner?.owner_firstname ?? ""} ${owner?.owner_lastname ?? ""}`.trim() || owner?.owner_name || RB_getOwnerName(owner);
const RB_getBoatTypeLabel = (boatType) => boatType?.type_name || "-";
const RB_hasBoatTransactions = (boat) =>
  Boolean(boat?.has_dockings) ||
  Boolean(boat?.has_banyera_transactions) ||
  Number(boat?.dockings_count || 0) > 0 ||
  Number(boat?.banyera_transactions_count || 0) > 0;
const BM_getHighlightId = ({ highlightedSearchResult, group, prefix, search }) => {
  const stateId = highlightedSearchResult?.group === group ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith(prefix) ? rawId.slice(prefix.length) : "";
};
const BM_clearUniversalHighlight = ({ highlightedSearchResult, location, navigate }) => {
  const params = new URLSearchParams(location.search);
  const hadHighlight = params.delete("highlight");

  if (!highlightedSearchResult && !hadHighlight) return;

  const nextSearch = params.toString();
  navigate(
    {
      pathname: location.pathname,
      search: nextSearch ? `?${nextSearch}` : "",
    },
    { replace: true, state: null }
  );
};

const RB_statusStyle = (status) => {
  if (status === "active")        return { key: "active", label: "Active" };
  if (status === "expired")       return { key: "expired", label: "Expired" };
  if (status === "suspended")     return { key: "suspended", label: "Suspended" };
  if (status === "under_repair")  return { key: "under_repair", label: "Under Repair" };
  return { key: status, label: status };
};

const RB_formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
};

const RB_STATUS_OPTIONS = [
  { value: "active",       label: "Active",        activeBorder: "border-emerald-600", activeBg: "bg-emerald-50", activeText: "text-emerald-700" },
  { value: "expired",      label: "Expired",       activeBorder: "border-rose-500",    activeBg: "bg-rose-50",    activeText: "text-rose-700" },
  { value: "suspended",    label: "Suspended",     activeBorder: "border-amber-500",   activeBg: "bg-amber-50",   activeText: "text-amber-700" },
  { value: "under_repair", label: "Under Repair",  activeBorder: "border-violet-500", activeBg: "bg-violet-50", activeText: "text-violet-700" },
];

const RB_STATUS_FILTER_OPTIONS = [
  { value: "all",       label: "All Status" },
  { value: "active",       label: "Active"        },
  { value: "expired",      label: "Expired"       },
  { value: "suspended",    label: "Suspended"     },
  { value: "under_repair", label: "Under Repair"  },
];

const RB_BOAT_STATUS_LEGEND = [
  {
    key: "active",
    label: "Active",
    meaning: "Boat is allowed to Banyera and Docking",
    color: "#16a34a",
  },
  {
    key: "expired",
    label: "Expired",
    meaning: "Not allowed to operate in Banyera",
    color: "#ef4444",
  },
  {
    key: "suspended",
    label: "Suspended",
    meaning: "Not allowed to operate in Banyera",
    color: "#f59e0b",
  },
  {
    key: "under_repair",
    label: "Under Repair",
    meaning: "Not allowed to operate in Banyera",
    color: "#8b5cf6",
  },
];
const BOAT_MANAGEMENT_TABS = [
  { key: "/registered-boats", label: "Registered Boat", icon: IoBoatOutline },
  { key: "/boat-type", label: "Boat Type", icon: IoLayersOutline },
  { key: "/boat-owners", label: "Boat Owner", icon: IoPersonOutline },
  { key: "/add-boat", label: "Add Boat", icon: IoAddOutline },
];

const BM_TITLE = "Boat Management";
const BM_SUBTITLE = "Manage all registered boats, boat types, and boat owners.";
const BM_BREADCRUMB = "Registered Boats";

const RB_getBoatStatusIndicatorColor = (status) =>
  RB_BOAT_STATUS_LEGEND.find((item) => item.key === status)?.color ?? "#94a3b8";


const BM_getBoatStatus = (boat) =>
  String(boat?.status ?? "").trim().toLowerCase().replace(/\s+/g, "_");

const BM_buildOverviewStats = (boats = [], boatTypes = [], owners = []) => [
  {
    label: "Total Registered Boats",
    value: boats.length,
    icon: IoBoatOutline,
    tone: "blue",
  },
  {
    label: "Active Boats",
    value: boats.filter((boat) => BM_getBoatStatus(boat) === "active").length,
    icon: IoCheckmarkOutline,
    tone: "green",
  },
  {
    label: "Expired Boats",
    value: boats.filter((boat) => BM_getBoatStatus(boat) === "expired").length,
    icon: IoAlertCircleOutline,
    tone: "rose",
  },
  {
    label: "Suspended Boats",
    value: boats.filter((boat) => BM_getBoatStatus(boat) === "suspended").length,
    icon: IoCloseOutline,
    tone: "amber",
  },
  {
    label: "Under Repair Boats",
    value: boats.filter((boat) => BM_getBoatStatus(boat) === "under_repair").length,
    icon: IoWarningOutline,
    tone: "violet",
  },
];

const BT_buildOverviewStats = (boatTypes = [], stats = {}) => [
  {
    label: "Total Boat Type",
    value: stats.total_types ?? boatTypes.length,
    icon: IoLayersOutline,
    tone: "blue",
  },
  {
    label: "Boat Type in Use",
    value: stats.boat_types_in_use ?? boatTypes.filter((type) => Number(type?.boats_count ?? 0) > 0).length,
    icon: IoCheckmarkOutline,
    tone: "green",
  },
  {
    label: "Boat Type Not in Use",
    value: stats.boat_types_not_in_use ?? boatTypes.filter((type) => Number(type?.boats_count ?? 0) === 0).length,
    icon: IoCloseOutline,
    tone: "amber",
  },
];

const BO_buildOverviewStats = (owners = [], stats = {}) => [
  {
    label: "Total Boat Owner",
    value: stats.total_owners ?? owners.length,
    icon: IoPeopleOutline,
    tone: "blue",
  },
  {
    label: "Boat Owner in Use",
    value: stats.boat_owners_in_use ?? owners.filter((owner) => Number(owner?.boats_count ?? 0) > 0).length,
    icon: IoCheckmarkOutline,
    tone: "green",
  },
  {
    label: "Boat Owner Not in Use",
    value: stats.boat_owners_not_in_use ?? owners.filter((owner) => Number(owner?.boats_count ?? 0) === 0).length,
    icon: IoCloseOutline,
    tone: "amber",
  },
];

const BM_applyOverviewStats = (items = [], stats = {}) =>
  items.map((item) => {
    if (item.label === "Total Registered Boats" && stats.total_registered !== undefined) {
      return { ...item, value: stats.total_registered };
    }
    if (item.label === "Active Boats" && stats.active_boats !== undefined) {
      return { ...item, value: stats.active_boats };
    }
    if (item.label === "Expired Boats" && stats.expired_boats !== undefined) {
      return { ...item, value: stats.expired_boats };
    }
    if (item.label === "Suspended Boats" && stats.suspended_boats !== undefined) {
      return { ...item, value: stats.suspended_boats };
    }
    if (item.label === "Under Repair Boats" && stats.under_repair_boats !== undefined) {
      return { ...item, value: stats.under_repair_boats };
    }

    return item;
  });

const BM_getCachedOverviewData = (queryClient) => {
  const candidate = queryClient
    .getQueriesData({ queryKey: ["registered-boats-data"] })
    .map(([queryKey, data]) => ({ queryKey, data }))
    .filter(({ data }) => data?.stats || Array.isArray(data?.boats));

  const withStats = candidate.find(({ data }) => data?.stats);
  if (withStats) return withStats.data;

  const withCargo = candidate.find(({ queryKey }) => queryKey?.[1]?.includeBoats);
  if (withCargo) return withCargo.data;

  return candidate.length > 0 ? candidate[0].data : undefined;
};

const BM_getOverviewStats = (data, fallback = {}) =>
  BM_applyOverviewStats(
    BM_buildOverviewStats(
      data?.boats ?? fallback.boats ?? [],
      data?.boatTypes ?? fallback.boatTypes ?? [],
      data?.owners ?? fallback.owners ?? []
    ),
    data?.stats
  );

const BM_OverviewGrid = ({ stats, loading = false, columns = 5 }) => {
  const gridColsClass =
    columns === 1 ? "xl:grid-cols-1" :
    columns === 2 ? "xl:grid-cols-2" :
    columns === 3 ? "xl:grid-cols-3" :
    columns === 4 ? "xl:grid-cols-4" :
    "xl:grid-cols-5";

  return (
    <div className={`mb-5 grid grid-cols-1 gap-2 md:grid-cols-2 ${gridColsClass}`}>
      {stats.map(({ label, value, icon: Icon, tone }) => (
        <OverviewCard
          key={label}
          title={label}
          value={value}
          icon={Icon}
          tone={tone}
          loading={loading}
          className="px-3 py-3"
        />
      ))}
    </div>
  );
};

const BM_buildLocalMeta = (items = [], page = 1, perPage = 10) => {
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(1, page), lastPage);
  const from = total ? (currentPage - 1) * perPage + 1 : 0;
  const to = total ? Math.min(currentPage * perPage, total) : 0;

  return {
    current_page: currentPage,
    last_page: lastPage,
    per_page: perPage,
    total,
    from,
    to,
  };
};

const BM_paginate = (items = [], page = 1, perPage = 10) => {
  const meta = BM_buildLocalMeta(items, page, perPage);
  const start = (meta.current_page - 1) * perPage;

  return {
    data: items.slice(start, start + perPage),
    meta,
  };
};

const BM_useDebouncedValue = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
};

const BM_useQueuedPageChange = ({
  currentPage,
  setCurrentPage,
  totalPages,
  queryClient,
  queryKey = ["registered-boats-data"],
  delay = 140,
}) => {
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  return useCallback((pageOrUpdater) => {
    const rawNextPage =
      typeof pageOrUpdater === "function" ? pageOrUpdater(currentPage) : pageOrUpdater;
    const nextPage = Math.max(1, Math.min(Number(rawNextPage) || 1, totalPages));

    if (nextPage === currentPage) return;

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setCurrentPage(nextPage);
      timerRef.current = null;
    }, delay);
  }, [currentPage, delay, queryClient, setCurrentPage, totalPages]);
};

const BM_formatPaginationRange = (meta) => {
  const from = meta?.from ?? 0;
  const to = meta?.to ?? 0;
  const total = meta?.total;

  return Number.isFinite(Number(total)) && total !== null
    ? `Showing ${from} to ${to} of ${total}`
    : `Showing ${from} to ${to}`;
};

const BM_Header = ({ breadcrumbLabel = BM_BREADCRUMB, fontFamily, loading = false }) => (
  <div className="mb-5 flex items-center justify-between">
    <TitlePage title={BM_TITLE} subtitle={BM_SUBTITLE} loading={loading} />
    <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: breadcrumbLabel }]} fontFamily={fontFamily} loading={loading} />
  </div>
);

const BM_DeleteModal = ({
  open,
  title,
  itemName,
  onClose,
  onConfirm,
  saving,
  warningItems = [],
  fontFamily = RB_FONT,
}) => {
  const [internalSaving, setInternalSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setInternalSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const deleting = typeof saving === "boolean" ? saving : internalSaving;

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
            Are you sure you want to archive{" "}
            <span className="font-bold" style={{ color: "#1a1f36" }}>
              "{itemName}"
            </span>
            ?
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
            disabled={deleting}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-[13px] font-semibold cursor-pointer transition-colors hover:bg-gray-50"
            style={{ fontFamily, color: "#1a1f36" }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white cursor-pointer transition-colors"
            style={{
              fontFamily,
              backgroundColor: deleting ? "#fca5a5" : "#dc2626",
              border: "none",
              minWidth: 108,
            }}
            onMouseEnter={(e) => {
              if (!deleting) e.currentTarget.style.backgroundColor = "#b91c1c";
            }}
            onMouseLeave={(e) => {
              if (!deleting) e.currentTarget.style.backgroundColor = "#dc2626";
            }}
          >
            {deleting ? <Spinner size={4} /> : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
};

const RB_buildOwnerFilterOptions = (owners) => [
  { value: "all", label: "All Owners" },
  ...owners.map((owner) => ({
    value: String(owner.owner_id),
    label: RB_getOwnerLabel(owner),
  })),
];

const RB_buildBoatTypeFilterOptions = (boatTypes) => [
  { value: "all", label: "All Boat Types" },
  ...boatTypes.map((type) => ({
    value: String(type.boat_type_id),
    label: RB_getBoatTypeLabel(type),
  })),
];

const RB_antTheme = {
  token: { colorPrimary: "#4096ff", borderRadius: 12, fontFamily: RB_FONT, controlHeight: 42, fontSize: 13 },
  components: {
    Select: { optionSelectedBg: "#1a1f36", optionSelectedColor: "#ffffff", optionActiveBg: "#f8fafc", optionFontSize: 13 },
  },
};

const RB_Label = ({ children, required }) => (
  <label
    className="mb-1.5 block text-[11px] font-semibold uppercase"
    style={{ color: "#6F6F82", fontFamily: RB_FONT }}
  >
    {children}
    {required && <span className="ml-0.5 text-red-500">*</span>}
  </label>
);

const RB_FInput = React.forwardRef(({ icon: Icon, placeholder, value, onChange, readOnly }, ref) => (
  <div
    className={`flex items-center gap-2.5 px-3.5 border border-gray-200 transition-all ${readOnly ? "bg-gray-50" : "bg-white"}`}
    style={{ height: 42, borderRadius: 12 }}
    onFocus={(e) => { if (!readOnly) { e.currentTarget.style.borderColor = "#4096ff"; e.currentTarget.style.boxShadow = "none"; } }}
    onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
  >
    {Icon && <Icon className="text-gray-400 text-[15px] flex-shrink-0" />}
    <input
      ref={ref} placeholder={placeholder} value={value} onChange={onChange} readOnly={readOnly}
      className={`border-none outline-none text-[13px] w-full bg-transparent font-medium h-full ${readOnly ? "text-gray-400 cursor-default" : ""}`}
      style={{ fontFamily: RB_FONT, color: readOnly ? undefined : "#0d1117" }}
    />
  </div>
));

const RB_FieldError = ({ msg }) => msg ? (
  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 mt-2">
    <IoAlertCircleOutline className="text-red-400 text-[14px] flex-shrink-0" />
    <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: RB_FONT }}>{msg}</p>
  </div>
) : null;

const RB_ArchivedNotice = ({ message }) => (
  <div
    className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5"
    style={{ backgroundColor: "#fff7ed", border: "1px solid #fdba74" }}
  >
    <IoWarningOutline className="mt-0.5 text-[14px] flex-shrink-0" style={{ color: "#d97706" }} />
    <p className="m-0 text-[12px] leading-relaxed" style={{ color: "#9a3412", fontFamily: RB_FONT }}>
      {message}
    </p>
  </div>
);

const RB_Spinner = Spinner;

const RB_TailDropdown = ({ value, onChange, options, height = 38 }) => (
  <FilterSelect value={value} onChange={onChange} options={options} height={height} width={160} />
);


const RB_EditBoatDrawer = ({ boat, open, onClose, onSuccess, onNoChanges, onError, boatTypes, owners }) => {
  const fileInputRef = useRef(null);
  const [formData,     setFormData]     = useState({ boat_name: "", boat_type_id: "", status: "active", owner_id: "" });
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [errors,       setErrors]       = useState({});

  const selectedOwner =
    owners.find((owner) => String(owner.owner_id) === String(formData.owner_id)) || boat?.owner || null;

  useEffect(() => {
    if (boat) {
      setFormData({
        boat_name:       boat.boat_name        || "",
        boat_type_id:    boat.boat_type_id     || "",
        status:          boat.status           || "active",
        owner_id:        boat.owner_id         || "",
      });
      setImagePreview(boat.image_path ? `${api.defaults.baseURL.replace("/api", "")}/storage/${boat.image_path}` : null);
      setImageFile(null);
      setLightboxOpen(false);
      setErrors({});
    }
  }, [boat]);

  const handleImageChange = (file) => {
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  // Keep the selected owner readable even if the original owner record is no longer in the active list.
  const ownerOptions = owners.map((owner) => ({
    value: owner.owner_id,
    label: RB_getOwnerLabel(owner),
  }));

  if (formData.owner_id && !ownerOptions.some((option) => String(option.value) === String(formData.owner_id))) {
    ownerOptions.unshift({
      value: formData.owner_id,
      label: `${RB_getOwnerLabel(boat?.owner)} (Archived)`,
    });
  }

  const selectedOwnerNoticeLabel = RB_getOwnerLabel(selectedOwner);
  const ownerIsArchived = !!(
    formData.owner_id &&
    !owners.some((owner) => String(owner.owner_id) === String(formData.owner_id))
  );

  const boatTypeOptions = boatTypes.map((type) => ({
    value: type.boat_type_id,
    label: RB_getBoatTypeLabel(type),
  }));

  if (formData.boat_type_id && !boatTypeOptions.some((option) => String(option.value) === String(formData.boat_type_id))) {
    boatTypeOptions.unshift({
      value: formData.boat_type_id,
      label: `${RB_getBoatTypeLabel(RB_getBoatType(boat))} (Archived)`,
    });
  }

  const selectedBoatTypeLabel =
    boatTypeOptions.find((option) => String(option.value) === String(formData.boat_type_id))?.label || RB_getBoatTypeLabel(RB_getBoatType(boat));
  const selectedBoatType =
    boatTypes.find((type) => String(type.boat_type_id) === String(formData.boat_type_id)) || RB_getBoatType(boat) || null;
  const selectedBoatTypeNoticeLabel = RB_getBoatTypeLabel(selectedBoatType);
  const boatTypeIsArchived = !!(
    formData.boat_type_id &&
    !boatTypes.some((type) => String(type.boat_type_id) === String(formData.boat_type_id))
  );

  if (!boat) return null;

  const validate = () => {
    const e = {};
    if (!formData.boat_name.trim()) e.boat_name    = "Boat name is required.";
    if (!formData.boat_type_id)     e.boat_type_id = "Please select a boat type.";
    if (!formData.owner_id)         e.owner_id     = "Please select an owner.";
    return e;
  };

  const hasChanges = () => {
    if (!boat) return true;
    const noFieldChange =
      formData.boat_name.trim() === (boat.boat_name || "").trim() &&
      String(formData.boat_type_id) === String(boat.boat_type_id || "") &&
      formData.status === (boat.status || "active") &&
      String(formData.owner_id) === String(boat.owner_id || "");
    return !noFieldChange || !!imageFile;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    if (!hasChanges()) {
      onClose();
      onNoChanges?.();
      return;
    }

    setLoading(true);
    setErrors((current) => ({ ...current, submit: "" }));
    try {
      const response = await api.put(`/boats/${boat.boat_id}`, {
        boat_name: formData.boat_name.trim(),
        boat_type_id: Number(formData.boat_type_id),
        owner_id: Number(formData.owner_id),
        status: formData.status,
      });
      if (imageFile) {
        const fd = new FormData();
        fd.append("image", imageFile);
        await api.post(`/boats/${boat.boat_id}/upload-image`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      // After updating (and uploading image if any), refetch the authoritative boat record
      // so the UI reflects the persisted state exactly as the server saved it.
      let freshBoat = null;
      try {
        const freshRes = await api.get(`/boats/${boat.boat_id}`);
        freshBoat = freshRes.data;
      } catch (err) {
        // Fall back to optimistic merged data if refetch fails
        freshBoat = response?.data ?? {
          boat_id: boat.boat_id,
          status: formData.status,
          boat_name: formData.boat_name.trim(),
          boat_type_id: Number(formData.boat_type_id),
          owner_id: Number(formData.owner_id),
        };
      }

      onSuccess?.({
        ...freshBoat,
        prev_status: boat.status || "active",
      });
      onClose();
    } catch (err) {
      const message =
        err.response?.data?.errors?.image?.[0] ||
        err.response?.data?.errors?.boat_name?.[0] ||
        err.response?.data?.errors?.boat_type_id?.[0] ||
        err.response?.data?.errors?.owner_id?.[0] ||
        err.response?.data?.message ||
        "Failed to update boat.";
      setErrors({ submit: message });
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  if (!open || !boat) return null;

  return (
    <Modal
      title="Edit Boat"
      onClose={onClose}
      onSave={handleSubmit}
      saving={loading}
      saveLabel="Save"
      closeOnBackdrop
      maxWidth="560px"
    >
      <div className="space-y-5">
        <RB_FieldError msg={errors.submit} />
        <div className="rounded-[10px] border border-slate-200 bg-white p-4">
          <div className="mb-3">
            <p className="m-0 text-[13px] font-bold" style={{ color: "#1a1f36", fontFamily: RB_FONT }}>Boat Image</p>
            
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleImageChange(e.target.files[0])} className="hidden" />
            {imagePreview ? (
              <div className="flex flex-col gap-3">
                <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-black">
                  <img src={imagePreview} alt="preview" className="block w-full object-contain" style={{ maxHeight: 220 }} />
                  <div className="absolute left-0 right-0 top-0 flex items-center justify-between gap-2 px-3 py-2.5"
                    style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-[10px] bg-white/20">
                        <IoImageOutline className="text-[13px] text-white" />
                      </div>
                      <span className="max-w-[220px] truncate text-[11px] font-medium text-white/90">
                        {imageFile?.name || boat.image_path || "Boat image"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setLightboxOpen(true)} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-white/20 text-white cursor-pointer transition-colors hover:bg-white/35">
                        <IoExpandOutline className="text-[14px]" />
                      </button>
                      <button type="button" onClick={() => { setImagePreview(null); setImageFile(null); setLightboxOpen(false); }} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-white/20 text-white cursor-pointer transition-colors hover:bg-red-500/70">
                        <IoCloseOutline className="text-[14px]" />
                      </button>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-[10px] border border-dashed border-gray-300 bg-[#fafbfc] py-2.5 text-[13px] font-medium text-gray-500 cursor-pointer transition-all hover:border-[#4096ff] hover:bg-blue-50 hover:text-[#4096ff]" style={{ fontFamily: RB_FONT }}>
                  Change Image
                </button>
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); handleImageChange(e.dataTransfer.files?.[0]); }}
                onDragOver={(e) => e.preventDefault()}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#4096ff"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#d1d5db"}
                className="flex cursor-pointer flex-col items-center gap-3 rounded-[10px] border-2 border-dashed border-gray-300 bg-[#fafbfc] px-5 py-10 transition-colors"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
                  <IoCloudUploadOutline className="text-blue-500 text-[22px]" />
                </div>
                <div className="text-center">
                  <p className="m-0 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: RB_FONT }}>Click to upload boat image</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[10px] border border-slate-200 bg-white p-4">
          <div className="space-y-4">
            <div>
                <ModalTextInput label={<>Boat Name <span className="text-red-500">*</span></>} icon={IoBoatOutline} placeholder="Enter boat name" value={formData.boat_name}
                  onChange={(e) => { setFormData(f => ({ ...f, boat_name: e.target.value })); setErrors(er => ({ ...er, boat_name: "" })); }} error={errors.boat_name} inputStyle={{ fontFamily: RB_FONT }} />
            </div>
            <div>
              <RB_Label required>Boat Type</RB_Label>
              <div className={errors.boat_type_id ? "modal-field-control-error" : ""}>
                <FilterSelect width="100%" height={46}
                  showSearch allowClear placeholder="Select boat type" optionFilterProp="label"
                  value={formData.boat_type_id || undefined}
                  onChange={(val) => { setFormData(f => ({ ...f, boat_type_id: val ?? "" })); setErrors(e => ({ ...e, boat_type_id: "" })); }}
                  options={boatTypeOptions}
                  getPopupContainer={() => document.body}
                  placement="bottomLeft"
                  notFoundContent="No types found"
                />
              </div>
              <RB_FieldError msg={errors.boat_type_id} />
              {boatTypeIsArchived && (
                <RB_ArchivedNotice message={`This boat is linked to an archived boat type (${selectedBoatTypeNoticeLabel}). Restore the boat type from Archives or assign a new active boat type when editing this record.`} />
              )}
            </div>
            <div>
              <RB_Label>Status</RB_Label>
              <div className="grid grid-cols-2 gap-2.5">
                {RB_STATUS_OPTIONS.map(({ value, label, activeBorder, activeBg, activeText }) => (
                  <button key={value} onClick={() => setFormData(f => ({ ...f, status: value }))}
                    className={`w-full rounded-xl border-2 px-3 py-2.5 text-[11px] font-semibold uppercase cursor-pointer transition-all ${formData.status === value ? `${activeBorder} ${activeBg} ${activeText}` : "border-gray-200 bg-white text-slate-700 hover:bg-gray-50"}`}
                    style={{ fontFamily: RB_FONT }}
                  >{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[10px] border border-slate-200 bg-white p-4">
          <div className="space-y-4">
            <div>
              <RB_Label required>Boat Owner</RB_Label>
              <div className={errors.owner_id ? "modal-field-control-error" : ""}>
                <FilterSelect width="100%" height={46}
                  showSearch allowClear placeholder="Choose existing owner" optionFilterProp="label"
                  value={formData.owner_id || undefined}
                  onChange={(val) => { setFormData(f => ({ ...f, owner_id: val ?? "" })); setErrors(e => ({ ...e, owner_id: "" })); }}
                  options={ownerOptions}
                  getPopupContainer={() => document.body}
                  placement="bottomLeft"
                  notFoundContent="No owners found"
                />
              </div>
              <RB_FieldError msg={errors.owner_id} />
              {ownerIsArchived && (
                <RB_ArchivedNotice message={`This boat is linked to an archived owner (${selectedOwnerNoticeLabel}). Restore the owner from Archives or assign a new active owner when editing this record.`} />
              )}
            </div>
            <div>
              <RB_Label>Address</RB_Label>
              <div className="flex h-[46px] items-center gap-2.5 rounded-[10px] border border-gray-200 bg-gray-50 px-3.5">
                <IoLocationOutline className="text-gray-400 text-[15px] flex-shrink-0" />
                <input readOnly value={selectedOwner?.address ?? ""} placeholder="Address" className="h-full w-full border-none bg-transparent text-[13px] font-medium text-gray-400 outline-none cursor-default" style={{ fontFamily: RB_FONT }} />
              </div>
            </div>
            <div>
              <RB_Label>Contact Number</RB_Label>
              <div className="flex h-[46px] items-center gap-2.5 rounded-[10px] border border-gray-200 bg-gray-50 px-3.5">
                <IoCallOutline className="text-gray-400 text-[15px] flex-shrink-0" />
                <input readOnly value={selectedOwner?.contact_number ?? ""} placeholder="Contact Number" className="h-full w-full border-none bg-transparent text-[13px] font-medium text-gray-400 outline-none cursor-default" style={{ fontFamily: RB_FONT }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {lightboxOpen && imagePreview ? <BA_Lightbox src={imagePreview} onClose={() => setLightboxOpen(false)} /> : null}
    </Modal>
  );
};

const RB_TH = ({ children }) => (
  <th className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#1a1f36", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}>
    {children}
  </th>
);

const RB_RegisteredBoats = ({ activeBoatTab, onBoatTabChange }) => {
  const location = useLocation();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cachedRegisteredBoatsData = queryClient.getQueriesData({ queryKey: ["registered-boats-data"] })
    .find(([, data]) => data?.boats)?.[1];
  const [activeItem,     setActiveItem]     = useState("Boat Management");
  const [contentMargin,  setContentMargin]  = useState(() => window.innerWidth >= 1024 ? 256 : 0);
  const [boats,          setBoats]          = useState(() => cachedRegisteredBoatsData?.boats ?? []);
  const [boatTypes,      setBoatTypes]      = useState(() => cachedRegisteredBoatsData?.boatTypes ?? []);
  const [owners,         setOwners]         = useState(() => cachedRegisteredBoatsData?.owners ?? []);
  const [fetching,       setFetching]       = useState(() => !cachedRegisteredBoatsData?.boats);
  const [requestedPage,  setRequestedPage]  = useState(1);
  const [currentPage,    setCurrentPage]    = useState(1);
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [selectedBoat,   setSelectedBoat]   = useState(null);
  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [ownerFilter,    setOwnerFilter]    = useState("all");
  const [boatTypeFilter, setBoatTypeFilter] = useState("all");
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editingBoat,    setEditingBoat]    = useState(null);
  const [deleteModal,    setDeleteModal]    = useState({ open: false, boat: null });
  const urlFiltersKeyRef = useRef(null);

  const debouncedSearch = BM_useDebouncedValue(search);
  const rawHighlightedBoatId = BM_getHighlightId({
    highlightedSearchResult,
    group: "Registered Boats",
    prefix: "boat-",
    search: location.search,
  });
  const highlightToken = rawHighlightedBoatId
    ? `${rawHighlightedBoatId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedBoatId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedBoatId;
  const clearUniversalHighlight = useCallback(() => {
    if (highlightToken) {
      setDismissedHighlightToken(highlightToken);
    }
    BM_clearUniversalHighlight({ highlightedSearchResult, location, navigate });
  }, [highlightToken, highlightedSearchResult, location, navigate]);
  useEffect(() => {
    setDismissedHighlightToken("");
  }, [location.key]);
  const boatsQuery = useRegisteredBoatsDataQuery(
    {
      boatsPage: currentPage,
      boatTypesPage: 1,
      ownersPage: 1,
      perPage: RB_PAGE_SIZE,
      boatsSearch: debouncedSearch,
      boatsStatus: statusFilter,
      owner: ownerFilter,
      boatType: boatTypeFilter,
      highlightBoatId: highlightedBoatId,
      boatsPaginated: true,
      boatTypesPaginated: false,
      ownersPaginated: false,
      includeBoats: true,
      includeBoatTypes: true,
      includeOwners: true,
    },
    { enabled: activeBoatTab === "/registered-boats" }
  );
  // boat types and owners are provided by the registered-boats-data request
  // avoid separate /boat-management calls to reduce duplicate requests
  const boatTypesQuery = { data: { boatTypes: boatsQuery.data?.boatTypes }, isLoading: false };
  const boatOwnersQuery = { data: { owners: boatsQuery.data?.owners }, isLoading: false };
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const handleWidthChange = useCallback((w) => setContentMargin(w), []);

  const showToast = (type, title, message) => {
    if (type === "info" && title === "No Changes Made") {
      showNoChangesToast();
      return;
    }
    showBottomToast(type, title, message);
  };

  useEffect(() => {
    setFetching(boatsQuery.isLoading && !boatsQuery.data && boats.length === 0);
  }, [boats.length, boatsQuery.data, boatsQuery.isLoading]);

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) setContentMargin(sidebarCollapsed ? 72 : 256);
    else if (window.innerWidth < 1024) setContentMargin(0);
  }, [sidebarCollapsed, sidebarOpen]);

  useEffect(() => {
    if (boatsQuery.data) {
      setBoats(boatsQuery.data.boats ?? []);
    }
  }, [boatsQuery.data]);

  useEffect(() => {
    if (boatsQuery.data?.boatTypes) {
      setBoatTypes(boatsQuery.data.boatTypes);
      queryClient.setQueryData(["boat-types"], boatsQuery.data.boatTypes);
    }
  }, [boatTypesQuery.data, queryClient]);

  useEffect(() => {
    if (boatsQuery.data?.owners) {
      setOwners(boatsQuery.data.owners);
      queryClient.setQueryData(["boat-owners"], boatsQuery.data.owners);
    }
  }, [boatOwnersQuery.data, queryClient]);

  useEffect(() => {
    if (!highlightedBoatId) return;
    const resolvedPage = Number(boatsQuery.data?.boatsMeta?.current_page || 0);
    if (resolvedPage > 0 && (resolvedPage !== currentPage || resolvedPage !== requestedPage)) {
      setRequestedPage(resolvedPage);
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, highlightedBoatId, boatsQuery.data?.boatsMeta?.current_page, requestedPage]);

  useEffect(() => {
    if (boatsQuery.isError) {
      showToast("error", "Error", "Failed to load data.");
    }
  }, [boatsQuery.isError]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextOwnerFilter = params.get("ownerId") || "all";
    const nextBoatTypeFilter = params.get("boatTypeId") || "all";
    const nextSearch = params.get("q") || "";
    const nextUrlFiltersKey = JSON.stringify({
      owner: nextOwnerFilter,
      boatType: nextBoatTypeFilter,
      search: nextSearch,
    });
    const filtersChanged = urlFiltersKeyRef.current !== null && urlFiltersKeyRef.current !== nextUrlFiltersKey;
    urlFiltersKeyRef.current = nextUrlFiltersKey;

    setOwnerFilter(nextOwnerFilter);
    setBoatTypeFilter(nextBoatTypeFilter);
    setSearch(nextSearch);

    if (filtersChanged) {
      setRequestedPage(1);
      setCurrentPage(1);
    }
  }, [highlightedSearchResult, location.search]);

  const handleDelete = async () => {
    const { boat } = deleteModal;
    try {
      await api.patch(`/boats/${boat.boat_id}/archive`);
      setBoats(prev => prev.filter(b => b.boat_id !== boat.boat_id));
      archiveRegisteredBoatInDataCache(queryClient, boat);
      setDeleteModal({ open: false, boat: null });
      showToast("success", "Boat Archived", `"${boat.boat_name}" has been archived successfully.`);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["boats"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["archives-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" }),
      ]);
    } catch (err) {
      showToast("error", "Archive Failed", err.response?.data?.message ?? "Failed to archive boat.");
      throw err;
    }
  };

  const handleEditSuccess = (updatedBoat) => {
    showUpdatedToast("Boat", "boat details");

    if (updatedBoat?.boat_id) {
      setBoats((prev) => prev.map((boat) =>
        String(boat.boat_id) === String(updatedBoat.boat_id)
          ? { ...boat, ...updatedBoat }
          : boat
      ));
      setSelectedBoat((prev) =>
        prev && String(prev.boat_id) === String(updatedBoat.boat_id)
          ? { ...prev, ...updatedBoat }
          : prev
      );
      updateRegisteredBoatsDataCache(queryClient, updatedBoat);
    }

    // Ensure both the lightweight boats query and the registered-boats-data cache are refreshed
    void queryClient.invalidateQueries({ queryKey: ["boats"], refetchType: "active" });
    void queryClient.invalidateQueries({ queryKey: ["registered-boats-data"], refetchType: "active" });
    void queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" });
  };

  const handleEditNoChanges = () => {
    showToast("info", "No Changes Made", "No changes were made. The record remains the same.");
  };

  const ownerFilterOptions = RB_buildOwnerFilterOptions(owners);
  const boatTypeFilterOptions = RB_buildBoatTypeFilterOptions(boatTypes);

  const paginated = boats;
  const boatsMeta = boatsQuery.data?.boatsMeta ?? BM_buildLocalMeta(boats, currentPage, RB_PAGE_SIZE);
  const totalPages = Math.max(1, Number(boatsMeta.last_page || 1));
  const safePage = Math.min(requestedPage, totalPages);
  const highlightedBoatIndex = highlightedBoatId
    ? boats.findIndex((boat) => String(highlightedBoatId) === String(boat.boat_id))
    : -1;

  useEffect(() => {
    if (highlightedBoatIndex < 0) return;
    setRequestedPage(Math.max(1, Number(boatsMeta.current_page || 1)));
    setCurrentPage(Math.max(1, Number(boatsMeta.current_page || 1)));
  }, [highlightedBoatIndex, boatsMeta.current_page]);

  useEffect(() => {
    setRequestedPage(1);
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, ownerFilter, boatTypeFilter]);

  useEffect(() => {
    if (requestedPage > totalPages) {
      setRequestedPage(totalPages);
      setCurrentPage(totalPages);
      return;
    }

    if (requestedPage === currentPage) return undefined;

    const timeout = window.setTimeout(() => {
      setCurrentPage(requestedPage);
    }, 140);

    return () => window.clearTimeout(timeout);
  }, [currentPage, requestedPage, totalPages]);

  const overviewData = BM_getCachedOverviewData(queryClient) ?? boatsQuery.data;
  const overviewLoading = !overviewData && boatsQuery.isLoading;
  const overviewStats = BM_getOverviewStats(overviewData, { boats, boatTypes, owners });

  return (
    <ConfigProvider theme={RB_antTheme}>
      <style>{`
        * { font-family: ${RB_FONT} !important; }
        input::placeholder { color: #1a1f36 !important; opacity: 0.4; }
        .boat-ant-select .ant-select-selector { border-radius: 12px !important; border: 1px solid #e5e7eb !important; font-family: ${RB_FONT} !important; font-size: 13px !important; font-weight: 500 !important; box-shadow: none !important; transition: border-color 0.15s, box-shadow 0.15s !important; }
        .boat-ant-select.ant-select-focused .ant-select-selector, .boat-ant-select.ant-select-open .ant-select-selector { border-color: #4096ff !important; box-shadow: none !important; }
        .boat-ant-select .ant-select-selector:hover { border-color: #4096ff !important; }
        .boat-ant-select .ant-select-selection-item, .boat-ant-select .ant-select-selection-search-input { font-family: ${RB_FONT} !important; font-size: 13px !important; font-weight: 500 !important; color: #0d1117 !important; }
        .boat-ant-select .ant-select-selection-placeholder { font-family: ${RB_FONT} !important; font-size: 13px !important; color: rgba(26,31,54,0.4) !important; }
        .boat-ant-select .ant-select-arrow { color: #9ca3af !important; }
        .boat-ant-select-dropdown { border-radius: 12px !important; overflow: hidden !important; box-shadow: 0 4px 24px rgba(0,0,0,0.13) !important; border: 1px solid #e5e7eb !important; padding: 4px !important; }
        .boat-ant-select-dropdown .ant-select-item { font-family: ${RB_FONT} !important; font-size: 13px !important; font-weight: 500 !important; border-radius: 8px !important; color: #1a1f36 !important; padding: 8px 12px !important; }
        .boat-ant-select-dropdown .ant-select-item-option-selected { background-color: #1a1f36 !important; color: #fff !important; font-weight: 400 !important; }
        .boat-ant-select-dropdown .ant-select-item-option-active:not(.ant-select-item-option-selected) { background-color: #f8fafc !important; }
      `}</style>

      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onWidthChange={handleWidthChange} />

        <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden" style={{ marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px" }}>
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />

          <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 xl:px-8" style={{ backgroundColor: "#ffffff" }}>
            <div className="mx-auto w-full max-w-[1440px]">

            <BM_Header breadcrumbLabel="Registered Boats" fontFamily={RB_FONT} loading={overviewLoading} />

            <BM_OverviewGrid stats={overviewStats} loading={overviewLoading} />

            <Tabs
              tabs={BOAT_MANAGEMENT_TABS}
              activeKey={activeBoatTab}
              onTabChange={onBoatTabChange}
              fontFamily={RB_FONT}
              className="mb-5"
              loading={overviewLoading}
              rightContent={<Legend items={RB_BOAT_STATUS_LEGEND} loading={overviewLoading} />}
            >
            <TableCard
              title="Registered Boat Records"
              subtitle="All registered boats in the system"
              className="table-card--image-first-column"
              loading={fetching}
              headerActionsSkeletonCount={2}
              pagination={{
                meta: boatsMeta,
                total: boatsMeta.total,
                totalPages,
                currentPage: safePage,
                requestedPage,
                isLoading: fetching,
                onPageChange: setRequestedPage,
                beforePageChange: clearUniversalHighlight,
              }}
              bodyClassName="overflow-x-auto"
              footerClassName="flex items-center justify-between"
              actions={
                <>
                  <div
                    className="flex items-center gap-2.5 px-4 rounded-lg border border-gray-200 bg-white transition-all"
                    style={{ height: 42, width: 300 }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#4096ff"; e.currentTarget.style.boxShadow = "none"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <IoSearchOutline className="text-[17px] flex-shrink-0" style={{ color: "#1a1f36" }} />
                    <input type="text" placeholder="Search for boat name, type, owner" value={search} onChange={e => { clearUniversalHighlight(); setSearch(e.target.value); setRequestedPage(1); setCurrentPage(1); }}
                      className="bg-transparent border-none outline-none text-[13px] w-full" style={{ fontFamily: RB_FONT, color: "#1a1f36" }} />
                  </div>
                  <RB_TailDropdown value={statusFilter} onChange={v => { clearUniversalHighlight(); setStatusFilter(v); setRequestedPage(1); setCurrentPage(1); }} options={RB_STATUS_FILTER_OPTIONS} height={42} />
                </>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 930 }}>
                  <thead>
                      <tr>
                        <RB_TH>Image</RB_TH><RB_TH>Boat Name</RB_TH><RB_TH>Type</RB_TH><RB_TH>Owner</RB_TH>
                        <RB_TH>Contact</RB_TH><RB_TH>Date Registered</RB_TH><RB_TH align="right">Action</RB_TH>
                      </tr>
                  </thead>
                  <tbody>
                    {fetching ? (
                      Array.from({ length: RB_PAGE_SIZE }).map((_, i) => (
                        <tr key={i} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td className="px-4 py-3"><div className="w-10 h-10 rounded-lg bg-slate-100" /></td>
                          <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-28" /></td>
                          <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-24" /></td>
                          <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-28" /></td>
                          <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-24" /></td>
                          <td className="px-4 py-3"><div className="h-5 bg-slate-100 rounded-md w-20" /></td>
                          <td className="px-4 py-3"><div className="flex gap-2"><div className="w-8 h-8 rounded-lg bg-slate-100" /><div className="w-8 h-8 rounded-lg bg-slate-100" /></div></td>
                        </tr>
                      ))
                    ) : paginated.length === 0 ? (
                      <tr><td colSpan={7}>
                        <NoDataFound title={search || statusFilter !== "all" || ownerFilter !== "all" || boatTypeFilter !== "all" ? "No results found" : "No Data Found"} />
                      </td></tr>
                    ) : paginated.map((boat, index) => {
                      const ownerName = RB_getOwnerName(boat.owner);
                      const boatType  = RB_getBoatType(boat);
                      const archiveDisabled = RB_hasBoatTransactions(boat);
                      const imageSrc  = boat.image_path ? `${api.defaults.baseURL.replace("/api", "")}/storage/${boat.image_path}` : null;
                      const isHighlighted =
                        highlightedBoatId &&
                        String(highlightedBoatId) === String(boat.boat_id);
                      return (
                        <tr key={boat.boat_id} className={`cursor-pointer transition-colors ${highlightedSearchResult ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${isHighlighted ? "universal-search-highlight" : ""}`.trim()} style={{
                          borderBottom: "1px solid #f1f5f9",
                        }}
                          onClick={() => { setSelectedBoat(boat); setDrawerOpen(true); }}
                        >
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="relative flex h-[40px] w-[40px] items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-blue-50 p-0">
                              {imageSrc ? (
                                <img
                                  src={imageSrc}
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
                              <div className="hidden h-full w-full items-center justify-center">
                                <IoImageOutline className="text-[18px] text-blue-300" />
                              </div>
                              {!imageSrc ? <IoImageOutline className="text-[18px] text-blue-300" /> : null}
                              <span
                                className="absolute bottom-1 right-1 inline-block h-2.5 w-2.5 rounded-full border border-white"
                                style={{ backgroundColor: RB_getBoatStatusIndicatorColor(boat.status) }}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[13px] font-normal" style={{ color: "#1a1f36" }}>{boat.boat_name}</td>
                          <td className="px-4 py-3 text-[13px] font-normal" style={{ color: "#1a1f36" }}>{boatType?.type_name ?? "-"}</td>
                          <td className="px-4 py-3 text-[13px] font-normal" style={{ color: "#1a1f36" }}>{ownerName}</td>
                          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{boat.owner?.contact_number ?? "-"}</td>
                          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{RB_formatDate(boat.created_at)}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-start gap-2">
                              <Tooltip title={isTransactionLocked ? transactionLockMessage : "Edit"}>
                                <button onClick={(e) => { e.stopPropagation(); if (isTransactionLocked) return; setEditingBoat(boat); setEditDrawerOpen(true); }}
                                  disabled={isTransactionLocked}
                                  className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer bg-white hover:bg-blue-50 transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:opacity-60"
                                  style={{ borderColor: isTransactionLocked ? undefined : "#1a1f36" }}
                                ><IoCreateOutline style={{ fontSize: "15px", color: isTransactionLocked ? "#94a3b8" : "#1a1f36" }} /></button>
                              </Tooltip>
                              <Tooltip
                                title={
                                  isTransactionLocked
                                    ? transactionLockMessage
                                    : archiveDisabled
                                    ? "Cannot archive boats with docking or banyera transactions"
                                    : "Archive"
                                }
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (archiveDisabled) return;
                                    setDeleteModal({ open: true, boat });
                                  }}
                                  disabled={archiveDisabled || isTransactionLocked}
                                  className={`w-8 h-8 rounded-lg border flex items-center justify-center bg-white transition-colors ${
                                    archiveDisabled || isTransactionLocked
                                      ? "cursor-not-allowed border-slate-200"
                                      : "cursor-pointer border-red-300 hover:bg-red-50"
                                  }`}
                                >
                                  <IoTrashOutline
                                    style={{
                                      fontSize: "15px",
                                      color: archiveDisabled || isTransactionLocked ? "#94a3b8" : "#ef4444",
                                    }}
                                  />
                                </button>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
            </TableCard>
            </Tabs>
            </div>
          </main>
        </div>
      </div>

      <RB_RegisteredBoatDetailsDrawer boat={selectedBoat} open={drawerOpen} onClose={() => setDrawerOpen(false)} boatTypes={boatTypes} owners={owners} />
      <RB_EditBoatDrawer
        boat={editingBoat}
        open={editDrawerOpen}
        onClose={() => setEditDrawerOpen(false)}
        onSuccess={handleEditSuccess}
        onNoChanges={handleEditNoChanges}
        onError={(message) => showToast("error", "Update Failed", message)}
        boatTypes={boatTypes}
        owners={owners}
      />
      <BM_DeleteModal
        open={deleteModal.open}
        title="Archive Boat"
        itemName={deleteModal.boat?.boat_name ?? ""}
        onClose={() => setDeleteModal({ open: false, boat: null })}
        onConfirm={handleDelete}
      />
    </ConfigProvider>
  );
};

const RB_BoatDrawer = ({ boat, open, onClose }) => {
  if (!boat) return null;
  const ds        = RB_statusStyle(boat.status);
  const ownerName = RB_getOwnerName(boat.owner);
  const boatType  = RB_getBoatType(boat);
  const createdBy = RB_getCreatedBy(boat);
  const imageSrc  = boat.image_path ? `${api.defaults.baseURL.replace("/api", "")}/storage/${boat.image_path}` : null;
  return (
    <AntDrawer open={open} onClose={onClose} width={460} closable={false} styles={{ body: { padding: 0, fontFamily: RB_FONT, backgroundColor: "#f8fafc" }, header: { display: "none" } }}>
      <div className="h-[180px] relative overflow-hidden">
        {imageSrc
          ? <img src={imageSrc} alt={boat.boat_name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; e.target.parentNode.style.backgroundColor = "#1a1f36"; }} />
          : <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "#1a1f36" }}><IoBoatOutline className="text-white/20 text-[64px]" /></div>
        }
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(26,31,54,0.95) 0%, rgba(26,31,54,0.3) 100%)" }} />
        <button onClick={onClose} className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-white/15 text-white border-none cursor-pointer flex items-center justify-center hover:bg-white/25">
          <IoCloseOutline className="text-lg" />
        </button>
        <div className="absolute bottom-3.5 left-5">
          <p className="m-0 text-lg font-bold text-white mb-0.5">{boat.boat_name}</p>
          <span className="text-xs text-white/60">{boatType?.type_name ?? "-"}</span>
        </div>
      </div>
      <div className="px-5 py-3 border-b border-slate-100">
        <StatusPill status={ds.key} label={ds.label} />
      </div>
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="m-0 mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Boat Owner</p>
        <div className="flex items-center gap-3 mb-3.5">
          <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #60a5fa, #3b82f6)" }}>
            <span className="text-base font-bold text-white">{boat.owner?.owner_firstname?.charAt(0) ?? "?"}</span>
          </div>
          <div>
            <p className="m-0 text-sm font-bold" style={{ color: "#1a1f36" }}>{ownerName}</p>
            <p className="m-0 text-xs text-slate-400">Registered Owner</p>
          </div>
        </div>
        {[
          { icon: IoPersonOutline,   label: "Full Name", value: ownerName },
          { icon: IoLocationOutline, label: "Address",   value: boat.owner?.address        ?? "-" },
          { icon: IoCallOutline,     label: "Contact",   value: boat.owner?.contact_number ?? "-" },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 mb-2">
            <div className="w-[30px] h-[30px] rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0"><Icon className="text-blue-500 text-sm" /></div>
            <div><p className="m-0 text-[11px] text-slate-400">{label}</p><p className="m-0 text-[13px] font-medium text-slate-700">{value}</p></div>
          </div>
        ))}
      </div>
      <div className="px-5 py-4">
        <p className="m-0 mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Boat Information</p>
        {[
          { icon: IoBoatOutline,         label: "Boat Name",       value: boat.boat_name },
          { icon: IoLayersOutline,       label: "Type",            value: boatType?.type_name ?? "-" },
          { icon: IoCalendarOutline,     label: "Date Registered", value: RB_formatDate(boat.created_at) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 mb-2">
            <div className="w-[30px] h-[30px] rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0"><Icon className="text-blue-500 text-sm" /></div>
            <div><p className="m-0 text-[11px] text-slate-400">{label}</p><p className="m-0 text-[13px] font-medium text-slate-700">{value}</p></div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-6 flex gap-2.5">
        <button className="flex-1 py-2.5 rounded-xl text-white border-none cursor-pointer text-[13px] font-semibold transition-colors" style={{ backgroundColor: "#1a1f36" }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#2d3561"}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#1a1f36"}
        >Edit Details</button>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 border-none cursor-pointer text-[13px] font-semibold hover:bg-slate-200 transition-colors" style={{ color: "#1a1f36" }}>Close</button>
      </div>
    </AntDrawer>
  );
};

const RB_RegisteredBoatDetailsDrawer = ({ boat, open, onClose, boatTypes, owners }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!open) setLightboxOpen(false);
  }, [open]);

  if (!boat) return null;
  const ds = RB_statusStyle(boat.status);
  const ownerName = RB_getOwnerName(boat.owner);
  const boatType = RB_getBoatType(boat);
  const createdBy = RB_getCreatedBy(boat);
  const imageSrc = boat.image_path ? `${api.defaults.baseURL.replace("/api", "")}/storage/${boat.image_path}` : null;
  const ownerIsArchived = !!(boat.owner_id && !owners.some((owner) => owner.owner_id === boat.owner_id));
  const boatTypeIsArchived = !!(boat.boat_type_id && !boatTypes.some((type) => type.boat_type_id === boat.boat_type_id));

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={460}
      fontFamily={RB_FONT}
      title="Boat Details"
      subtitle="Review the selected boat record."
      icon={IoBoatOutline}
    >
      <DrawerSection
        icon={IoImageOutline}
        title="Boat Image"
        subtitle="Registered image for this boat"
        fontFamily={RB_FONT}
      >
            <div className="relative h-[220px] overflow-hidden border border-gray-200 bg-blue-50 flex items-center justify-center" style={{ borderRadius: 10 }}>
              {imageSrc
                ? <img src={imageSrc} alt={boat.boat_name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                : <IoBoatOutline className="text-blue-300 text-[52px]" />}
              {imageSrc ? (
                <div
                  className="absolute left-0 right-0 top-0 flex items-center justify-end px-3 py-2.5"
                  style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
                >
                  <button
                    onClick={() => setLightboxOpen(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-[10px] border-none bg-white/20 text-white cursor-pointer transition-colors hover:bg-white/35"
                  >
                    <IoExpandOutline className="text-[14px]" />
                  </button>
                </div>
              ) : null}
              <span
                className="absolute bottom-3 right-3 inline-block h-4 w-4 rounded-full border-2 border-white"
                style={{ backgroundColor: RB_getBoatStatusIndicatorColor(boat.status) }}
              />
            </div>
      </DrawerSection>

      <DrawerSection
        icon={IoDocumentTextOutline}
        title="Registration Info"
        subtitle="Registered details for this boat"
        fontFamily={RB_FONT}
      >
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Boat Name", value: boat.boat_name ?? "-", className: "col-span-2" },
                { label: "Boat Type", value: boatType?.type_name ?? "-" },
                { label: "Date Registered", value: RB_formatDate(boat.created_at) },
                { label: "Created By", value: RB_getCreatedByLabel(boat), className: "col-span-2" },
              ].map(({ label, value, className }) => (
                <DrawerInfoCard key={label} label={label} value={value} className={className} />
              ))}
            </div>
            {boatTypeIsArchived && (
              <RB_ArchivedNotice message={`This boat is linked to an archived boat type (${RB_getBoatTypeLabel(boatType)}). Restore the boat type from Archives or assign a new active boat type when editing this record.`} />
            )}
      </DrawerSection>
      <DrawerSection
        icon={IoPersonOutline}
        title="Boat Owner"
        subtitle="Owner information linked to this boat"
        fontFamily={RB_FONT}
      >
            <div className="grid grid-cols-1 gap-3">
              {[
                { label: "Full Name", value: ownerName },
                { label: "Address", value: boat.owner?.address ?? "-" },
                { label: "Contact Number", value: boat.owner?.contact_number ?? "-" },
              ].map(({ label, value }) => (
                <DrawerInfoCard key={label} label={label} value={value} />
              ))}
            </div>
            {ownerIsArchived && (
              <RB_ArchivedNotice message={`This boat is linked to an archived owner (${ownerName}). Restore the owner from Archives or assign a new active owner when editing this record.`} />
            )}
      </DrawerSection>
      {lightboxOpen && imageSrc ? <BA_Lightbox src={imageSrc} onClose={() => setLightboxOpen(false)} /> : null}
    </DetailDrawer>
  );
};

const BT_FONT         = "'Montserrat', sans-serif";
const BT_PAGE_SIZE    = 10;
const BT_FOCUS_COLOR  = "#4096ff";
const BT_FOCUS_SHADOW = "none";
const BT_BOAT_TYPE_STATUS_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "used", label: "Used" },
  { value: "unused", label: "Unused" },
];
const BT_formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
};

const BT_Spinner = Spinner;


const BT_BoatTypeModal = ({ title, typeName, setTypeName, onClose, onSave, saving, error, saveLabel = "Add" }) => (
  <Modal
    title={title}
    onClose={onClose}
    onSave={onSave}
    saving={saving}
    saveLabel={saveLabel}
    maxWidth="520px"
    closeOnBackdrop
  >
    <ModalTextInput
      label={
        <>
          Type Name <span className="text-red-500">*</span>
        </>
      }
      autoFocus
      value={typeName}
      onChange={(e) => setTypeName(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
      placeholder="Enter boat type name"
      icon={IoLayersOutline}
      error={error}
      inputStyle={{ fontFamily: BT_FONT }}
    />
  </Modal>
);

const BT_TailDropdown = ({ value, onChange, options, height = 38 }) => (
  <FilterSelect value={value} onChange={onChange} options={options} height={height} width={160} />
);

const BT_BoatTypeDrawer = ({ open, title, subtitle, typeName, setTypeName, onClose, onSave, saving, error, saveLabel }) => (
  <AntDrawer
    open={open}
    onClose={onClose}
    width={500}
    closable={false}
    styles={{
      body: { padding: 0, fontFamily: BT_FONT, backgroundColor: "#f8fafc" },
      header: { display: "none" },
      footer: { padding: "16px 24px", borderTop: "1px solid #e5e7eb", backgroundColor: "#ffffff" },
    }}
    footer={
      <div className="flex justify-end gap-3">
        <button onClick={onClose} disabled={saving}
          className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] font-semibold cursor-pointer hover:bg-gray-50 transition-colors"
          style={{ fontFamily: BT_FONT, color: "#1a1f36", opacity: saving ? 0.5 : 1 }}>
          Cancel
        </button>
        <button onClick={onSave} disabled={saving}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-[13px] font-semibold cursor-pointer transition-colors"
          style={{ fontFamily: BT_FONT, backgroundColor: saving ? "#6b7280" : "#1a1f36", border: "none", minWidth: 108 }}
          onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = "#2d3561"; }}
          onMouseLeave={(e) => { if (!saving) e.currentTarget.style.backgroundColor = "#1a1f36"; }}>
          {saving && <BT_Spinner size={4} />}
          {saving ? "" : saveLabel}
        </button>
      </div>
    }
  >
    <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: "#1a1f36" }}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
          <IoLayersOutline className="text-white text-[18px]" />
        </div>
        <div>
          <p className="m-0 text-[15px] font-bold text-white">{title}</p>
          <p className="m-0 text-[11px] text-white/50">{subtitle}</p>
        </div>
      </div>
      <button onClick={onClose}
        className="flex items-center justify-center border-none cursor-pointer transition-colors"
        style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.2)"}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
      >
        <IoCloseOutline style={{ fontSize: 17 }} />
      </button>
    </div>
    <div className="p-5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>
      <div className="bg-white rounded-2xl overflow-hidden mb-4" style={{ border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: "1px solid #e5e7eb" }}>
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <IoLayersOutline className="text-blue-500 text-[16px]" />
          </div>
          <div>
            <p className="m-0 text-[13px] font-bold" style={{ color: "#1a1f36", fontFamily: BT_FONT }}>Boat Type Information</p>
            <p className="m-0 text-[11px] text-slate-500" style={{ fontFamily: BT_FONT }}>{subtitle}</p>
          </div>
        </div>
        <div className="p-5">
          <p
            className="m-0 mb-2 text-[11px] font-semibold uppercase"
            style={{ color: "#6F6F82", fontFamily: BT_FONT }}
          >
            Type Name <span className="text-red-500">*</span>
          </p>
          <div
            className="flex items-center gap-3 px-4 rounded-xl border border-slate-200 bg-white transition-all"
            style={{ height: 46 }}
            onFocus={(e) => { e.currentTarget.style.borderColor = BT_FOCUS_COLOR; e.currentTarget.style.boxShadow = BT_FOCUS_SHADOW; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = "#e2e8f0";   e.currentTarget.style.boxShadow = "none"; }}
          >
            <IoLayersOutline className="text-slate-400 text-[16px] flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
              placeholder="e.g. Fishing Vessel"
              className="border-none outline-none text-[14px] font-medium w-full bg-transparent"
              style={{ fontFamily: BT_FONT, color: "#0d1117" }}
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 mt-3">
              <IoAlertCircleOutline className="text-red-400 text-[14px] flex-shrink-0" />
              <p className="m-0 text-[12px] font-normal text-red-600">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  </AntDrawer>
);

const BT_BoatTypeDetailsDrawer = ({ boatType, open, onClose }) => {
  if (!boatType) return null;
  const navigate = useNavigate();

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={460}
      fontFamily={BT_FONT}
      title="Boat Type Details"
      subtitle="Review the selected boat type record."
      icon={IoLayersOutline}
    >
      <DrawerSection
        icon={IoLayersOutline}
        title="Boat Type Info"
        subtitle="Registered details for this boat type"
        fontFamily={BT_FONT}
      >
        <div className="grid grid-cols-1 gap-3">
          <DrawerInfoCard label="Type Name" value={boatType.type_name ?? "-"} />
          <DrawerInfoCard
            label="Usage Count"
            value={
              <button
                type="button"
                onClick={() => navigate(`/registered-boats?boatTypeId=${boatType.boat_type_id}`)}
                className="border-none bg-transparent p-0 text-[13px] font-semibold cursor-pointer hover:underline"
                style={{ fontFamily: BT_FONT, color: "#1a1f36" }}
              >
                {`${boatType.boats_count ?? 0} ${(boatType.boats_count ?? 0) <= 1 ? "count" : "counts"}`}
              </button>
            }
          />
        </div>
      </DrawerSection>
      <DrawerSection
        icon={IoCalendarOutline}
        title="Created Details"
        subtitle="Record creation information"
        fontFamily={BT_FONT}
      >
        <div className="grid grid-cols-1 gap-3">
          <DrawerInfoCard label="Created By" value={RB_getCreatedByLabel(boatType)} />
          <DrawerInfoCard label="Date Added" value={BT_formatDate(boatType.created_at)} />
        </div>
      </DrawerSection>
    </DetailDrawer>
  );
};

const BT_TH = ({ children }) => (
  <th className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap"
    style={{ color: "#1a1f36", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}>
    {children}
  </th>
);

const BT_SuperAddBoatType = ({ activeBoatTab, onBoatTabChange }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const cachedRegisteredBoatsData = queryClient.getQueriesData({ queryKey: ["registered-boats-data"] })
    .find(([, data]) => data?.boatTypes)?.[1];
  const [activeItem,    setActiveItem]    = useState("Boat Management");
  const [contentMargin, setContentMargin] = useState(() => window.innerWidth >= 1024 ? 256 : 0);
  const [boatTypes,     setBoatTypes]     = useState(() => cachedRegisteredBoatsData?.boatTypes ?? []);
  const [search,        setSearch]        = useState("");
  const [typeStatusFilter, setTypeStatusFilter] = useState("all");
  const [requestedPage, setRequestedPage] = useState(1);
  const [currentPage,   setCurrentPage]   = useState(1);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const [editTarget,    setEditTarget]    = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [selectedType,  setSelectedType]  = useState(null);
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [fetching,      setFetching]      = useState(() => !cachedRegisteredBoatsData?.boatTypes);
  const urlFiltersKeyRef = useRef(null);

  const [addName,   setAddName]   = useState("");
  const [addError,  setAddError]  = useState("");
  const [editName,  setEditName]  = useState("");
  const [editError, setEditError] = useState("");

  const debouncedSearch = BM_useDebouncedValue(search);
  const rawHighlightedBoatTypeId = BM_getHighlightId({
    highlightedSearchResult,
    group: "Boat Type",
    prefix: "boat-type-",
    search: location.search,
  });
  const highlightToken = rawHighlightedBoatTypeId
    ? `${rawHighlightedBoatTypeId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedBoatTypeId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedBoatTypeId;
  const clearUniversalHighlight = useCallback(() => {
    if (highlightToken) {
      setDismissedHighlightToken(highlightToken);
    }
    BM_clearUniversalHighlight({ highlightedSearchResult, location, navigate });
  }, [highlightToken, highlightedSearchResult, location, navigate]);
  useEffect(() => {
    setDismissedHighlightToken("");
  }, [location.key]);
  const boatTypesQuery = useBoatTypesQuery(
    {
      page: currentPage,
      perPage: BT_PAGE_SIZE,
      search: debouncedSearch,
      usage: typeStatusFilter,
      highlightBoatTypeId: highlightedBoatTypeId,
    },
    { enabled: activeBoatTab === "/boat-type" }
  );
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const handleWidthChange = useCallback((w) => setContentMargin(w), []);

  useEffect(() => {
    setFetching(boatTypesQuery.isLoading && boatTypes.length === 0);
  }, [boatTypes.length, boatTypesQuery.isLoading]);

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen)
      setContentMargin(sidebarCollapsed ? 72 : 256);
    else if (window.innerWidth < 1024) setContentMargin(0);
  }, [sidebarCollapsed, sidebarOpen]);

  const showToast = (type, title, message) => {
    if (type === "info" && title === "No Changes Made") {
      showNoChangesToast();
      return;
    }
    showBottomToast(type, title, message);
  };

  useEffect(() => {
    if (boatTypesQuery.data) {
      setBoatTypes(boatTypesQuery.data.boatTypes);
    }
  }, [boatTypesQuery.data]);

  useEffect(() => {
    if (!highlightedBoatTypeId) return;
    const resolvedPage = Number(boatTypesQuery.data?.boatTypesMeta?.current_page || 0);
    if (resolvedPage > 0 && (resolvedPage !== currentPage || resolvedPage !== requestedPage)) {
      setRequestedPage(resolvedPage);
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, highlightedBoatTypeId, boatTypesQuery.data?.boatTypesMeta?.current_page, requestedPage]);

  useEffect(() => {
    if (boatTypesQuery.isError) {
      showToast("error", "Error", "Failed to load boat types.");
    }
  }, [boatTypesQuery.isError]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextSearch = params.get("q") || "";
    const nextUrlFiltersKey = JSON.stringify({ search: nextSearch });
    const filtersChanged = urlFiltersKeyRef.current !== null && urlFiltersKeyRef.current !== nextUrlFiltersKey;
    urlFiltersKeyRef.current = nextUrlFiltersKey;

    setSearch(nextSearch);

    if (filtersChanged) {
      setCurrentPage(1);
    }
  }, [highlightedSearchResult, location.search]);

  const handleAdd = async () => {
    if (isTransactionLocked) { showToast("error", "Transactions Locked", transactionLockMessage); return; }
    if (!addName.trim()) { setAddError("Boat type name is required."); return; }
    setLoading(true);
    try {
      const res = await api.post("/boat-types", { type_name: addName.trim() });
      setBoatTypes((prev) => [res.data, ...prev]);
      queryClient.setQueryData(["boat-types"], (prev = []) => [res.data, ...prev]);
      addBoatTypeToDataCache(queryClient, res.data);
      setShowAddModal(false);
      setAddName("");
      setAddError("");
      showAddedToast("Boat Type", "boat type");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["boat-types"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" }),
      ]);
    } catch (err) {
      setAddError(err.response?.data?.message ?? "Failed to add boat type.");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async () => {
    if (isTransactionLocked) { showToast("error", "Transactions Locked", transactionLockMessage); return; }
    if (!editName.trim()) { setEditError("Boat type name is required."); return; }

    // No-changes detection
    if (editName.trim() === editTarget.type_name.trim()) {
      setEditTarget(null);
      showToast("info", "No Changes Made", "No changes were made. The record remains the same.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.put(`/boat-types/${editTarget.boat_type_id}`, { type_name: editName.trim() });
      setBoatTypes((prev) => prev.map((t) => t.boat_type_id === editTarget.boat_type_id ? res.data : t));
      setSelectedType((prev) => (prev?.boat_type_id === editTarget.boat_type_id ? res.data : prev));
      queryClient.setQueryData(["boat-types"], (prev = []) =>
        prev.map((t) => (t.boat_type_id === editTarget.boat_type_id ? res.data : t))
      );
      updateBoatTypeInDataCache(queryClient, res.data);
      setEditTarget(null);
      setEditName("");
      setEditError("");
      showUpdatedToast("Boat Type", "boat type");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["boat-types"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" }),
      ]);
    } catch (err) {
      setEditError(err.response?.data?.message ?? "Failed to update boat type.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (isTransactionLocked) { showToast("error", "Transactions Locked", transactionLockMessage); return; }
    const { boat_type_id, type_name } = deleteTarget;
    try {
      await api.patch(`/boat-types/${boat_type_id}/archive`);
      setBoatTypes((prev) => prev.filter((t) => t.boat_type_id !== boat_type_id));
      queryClient.setQueryData(["boat-types"], (prev = []) => prev.filter((t) => t.boat_type_id !== boat_type_id));
      archiveBoatTypeInDataCache(queryClient, boat_type_id);
      setDeleteTarget(null);
      showToast("success", "Boat Type Archived", `"${type_name}" has been archived successfully.`);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["boat-types"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["archives-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" }),
      ]);
    } catch (err) {
      showToast("error", "Archive Failed", err.response?.data?.message ?? "Failed to archive boat type.");
      throw err;
    }
  };

  const openEdit = (type) => {
    setDrawerOpen(false);
    setSelectedType(type);
    setEditTarget(type);
    setEditName(type.type_name);
    setEditError("");
  };

  const openTypeDetails = (type) => {
    setSelectedType(type);
    setDrawerOpen(true);
  };

  const paginated = boatTypes;
  const boatTypesMeta = boatTypesQuery.data?.boatTypesMeta ?? BM_buildLocalMeta(boatTypes, currentPage, BT_PAGE_SIZE);
  const totalPages = Math.max(1, Number(boatTypesMeta.last_page || 1));
  const safePage = Math.min(requestedPage, totalPages);
  const overviewLoading = boatTypesQuery.isLoading && !boatTypesQuery.data;
  const overviewStats = BT_buildOverviewStats(boatTypesQuery.data?.boatTypes ?? [], boatTypesQuery.data?.stats);

  useEffect(() => {
    setRequestedPage(1);
    setCurrentPage(1);
  }, [debouncedSearch, typeStatusFilter]);

  useEffect(() => {
    if (requestedPage > totalPages) {
      setRequestedPage(totalPages);
      setCurrentPage(totalPages);
      return;
    }

    if (requestedPage === currentPage) return undefined;

    const timeout = window.setTimeout(() => {
      setCurrentPage(requestedPage);
    }, 140);

    return () => window.clearTimeout(timeout);
  }, [currentPage, requestedPage, totalPages]);

  return (
    <>
      <style>{`* { font-family: ${BT_FONT} !important; } input::placeholder { color: #1a1f36 !important; opacity: 0.4; }`}</style>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onWidthChange={handleWidthChange} />

        <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden"
          style={{ marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px" }}>
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />

          <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 xl:px-8" style={{ backgroundColor: "#ffffff" }}>
            <div className="mx-auto w-full max-w-[1440px]">

            <BM_Header breadcrumbLabel="Boat Types" fontFamily={BT_FONT} loading={overviewLoading} />

            <BM_OverviewGrid stats={overviewStats} loading={overviewLoading} columns={3} />

            <Tabs
              tabs={BOAT_MANAGEMENT_TABS}
              activeKey={activeBoatTab}
              onTabChange={onBoatTabChange}
              fontFamily={BT_FONT}
              className="mb-5"
              loading={overviewLoading}
            >
            <TableCard
              title="Boat Type Records"
              subtitle="All registered boat types in the system"
              loading={fetching}
              headerActionsSkeletonCount={3}
              pagination={{
                meta: boatTypesMeta,
                total: boatTypesMeta.total,
                totalPages,
                currentPage: safePage,
                requestedPage,
                isLoading: fetching,
                onPageChange: setRequestedPage,
                beforePageChange: clearUniversalHighlight,
              }}
              bodyClassName="overflow-x-auto"
              footerClassName="flex items-center justify-between"
              actions={
                <>
                  <div
                    className="flex items-center gap-2.5 px-4 rounded-lg border border-gray-200 bg-white transition-all"
                    style={{ height: 42, width: 280 }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = BT_FOCUS_COLOR; e.currentTarget.style.boxShadow = BT_FOCUS_SHADOW; }}
                    onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb";   e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <IoSearchOutline className="text-[17px] flex-shrink-0" style={{ color: "#1a1f36" }} />
                    <input type="text" placeholder="Search for type name" value={search}
                      onChange={(e) => { clearUniversalHighlight(); setSearch(e.target.value); setRequestedPage(1); setCurrentPage(1); }}
                      className="bg-transparent border-none outline-none text-[13px] w-full"
                      style={{ fontFamily: BT_FONT, color: "#1a1f36" }} />
                  </div>
                  <BT_TailDropdown
                    value={typeStatusFilter}
                    onChange={(value) => {
                      clearUniversalHighlight();
                      setTypeStatusFilter(value);
                      setRequestedPage(1);
                      setCurrentPage(1);
                    }}
                    options={BT_BOAT_TYPE_STATUS_OPTIONS}
                    height={42}
                  />
                  <button
                    onClick={() => { clearUniversalHighlight(); if (!isTransactionLocked) { setAddName(""); setAddError(""); setShowAddModal(true); } else showToast("error", "Transactions Locked", transactionLockMessage); }}
                    disabled={isTransactionLocked}
                    className="ml-1 flex items-center gap-1.5 px-4 py-2 rounded-lg border-none bg-[#1a1f36] cursor-pointer text-[13px] font-semibold text-white hover:bg-[#2d3561] transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ fontFamily: BT_FONT, height: 42 }}
                  >
                    <IoAddOutline className="text-[17px]" /> Add Boat Type
                  </button>
                </>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 540 }}>
                  <thead>
                    <tr>
                      <BT_TH>Type Name</BT_TH>
                      <BT_TH>Usage Count</BT_TH>
                      <BT_TH>Action</BT_TH>
                    </tr>
                  </thead>
                  <tbody>
                    {fetching ? (
                      Array.from({ length: BT_PAGE_SIZE }).map((_, i) => (
                        <tr key={i} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-32" /></td>
                          <td className="px-4 py-3"><div className="h-5 bg-slate-100 rounded w-16" /></td>
                          <td className="px-4 py-3"><div className="flex gap-2"><div className="w-8 h-8 rounded-lg bg-slate-100" /><div className="w-8 h-8 rounded-lg bg-slate-100" /></div></td>
                        </tr>
                      ))
                    ) : paginated.length === 0 ? (
                      <tr>
                        <td colSpan={3}>
                          <NoDataFound title={search || typeStatusFilter !== "all" ? "No results found" : "No Data Found"} />
                        </td>
                      </tr>
                    ) : (
                        paginated.map((type, index) => {
                          const isHighlighted =
                            highlightedBoatTypeId &&
                            String(highlightedBoatTypeId) === String(type.boat_type_id);
                          return (
                        <tr key={type.boat_type_id} className={`cursor-pointer transition-colors ${isHighlighted ? "universal-search-highlight" : ""}`.trim()} onClick={() => openTypeDetails(type)} style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: highlightedSearchResult ? "#ffffff" : index % 2 === 0 ? "#ffffff" : "#ededed" }}>
                          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
                            <p className="m-0 text-[13px] font-normal" style={{ color: "#1a1f36" }}>{type.type_name}</p>
                          </td>
                          <td className="px-4 py-3 text-[13px]">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                navigate(`/registered-boats?boatTypeId=${type.boat_type_id}`);
                              }}
                              className="border-none bg-transparent p-0 cursor-pointer"
                            >
                              <StatusPill
                                status={(type.boats_count ?? 0) > 0 ? "enabled" : "disabled"}
                                label={`${type.boats_count ?? 0} ${(type.boats_count ?? 0) <= 1 ? "count" : "counts"}`}
                              />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-[13px]">
                            <div className="flex items-center gap-2">
                              <Tooltip title={isTransactionLocked ? transactionLockMessage : "Edit"}>
                                <button onClick={(e) => { e.stopPropagation(); if (!isTransactionLocked) openEdit(type); else showToast("error", "Transactions Locked", transactionLockMessage); }}
                                  disabled={isTransactionLocked}
                                  className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer bg-white hover:bg-blue-50 transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:opacity-60"
                                  style={{ borderColor: isTransactionLocked ? undefined : "#1a1f36" }}>
                                  <IoCreateOutline style={{ fontSize: "15px", color: isTransactionLocked ? "#94a3b8" : "#1a1f36" }} />
                                </button>
                              </Tooltip>
                              <Tooltip
                                title={
                                  (type.boats_count ?? 0) > 0
                                    ? "Cannot archive boat types with usage count"
                                    : "Archive"
                                }
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if ((type.boats_count ?? 0) > 0) return;
                                    setDeleteTarget(type);
                                  }}
                                  disabled={(type.boats_count ?? 0) > 0 || isTransactionLocked}
                                  className={`w-8 h-8 rounded-lg border flex items-center justify-center bg-white transition-colors ${
                                    (type.boats_count ?? 0) > 0 || isTransactionLocked
                                      ? "cursor-not-allowed border-slate-200"
                                      : "cursor-pointer border-red-300 hover:bg-red-50"
                                  }`}
                                >
                                  <IoTrashOutline
                                    style={{
                                      fontSize: "15px",
                                      color: (type.boats_count ?? 0) > 0 || isTransactionLocked ? "#94a3b8" : "#ef4444",
                                    }}
                                  />
                                </button>
                              </Tooltip>
                            </div>
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
      </div>

      {showAddModal && (
        <BT_BoatTypeModal
          title="Add Boat Type"
          subtitle="Register a new boat type"
          typeName={addName}
          setTypeName={(v) => { setAddName(v); setAddError(""); }}
          onClose={() => setShowAddModal(false)}
          onSave={handleAdd}
          saving={loading}
          error={addError}
          saveLabel="Add"
        />
      )}

      {editTarget && (
        <BT_BoatTypeModal
          title="Edit Boat Type"
          subtitle="Update the selected boat type"
          typeName={editName}
          setTypeName={(v) => { setEditName(v); setEditError(""); }}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
          saving={loading}
          error={editError}
          saveLabel="Save"
        />
      )}

      <BT_BoatTypeDetailsDrawer
        boatType={selectedType}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <BM_DeleteModal
        open={!!deleteTarget}
        title="Delete Boat Type"
        itemName={deleteTarget?.type_name ?? ""}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        fontFamily={BT_FONT}
      />
    </>
  );
};

const BO_FONT         = "'Montserrat', sans-serif";
const BO_PAGE_SIZE    = 10;
const BO_FOCUS_COLOR  = "#4096ff";
const BO_FOCUS_SHADOW = "none";
const BO_OWNER_STATUS_OPTIONS = [
  { value: "all", label: "All Owners" },
  { value: "used", label: "Used" },
  { value: "unused", label: "Unused" },
];
const BO_getFullName = (owner) =>
  `${owner?.owner_firstname ?? ""} ${owner?.owner_lastname ?? ""}`.trim() || "-";
const BO_getUsageCount = (owner) => Number(owner?.boats_count ?? 0);
const BO_getUsageCountLabel = (owner) => {
  const count = BO_getUsageCount(owner);
  return `${count} ${count <= 1 ? "count" : "counts"}`;
};
const BO_formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
};

const BO_Spinner = Spinner;


const BO_Field = ({ label, required, error, children }) => (
  <div>
    <p
      className="m-0 mb-2 text-[11px] font-semibold uppercase"
      style={{ color: "#6F6F82", fontFamily: BO_FONT }}
    >
      {label}{required && <span className="text-red-500 ml-0.5"> *</span>}
    </p>
    <div className={error ? "modal-field-control-error" : ""}>{children}</div>
    {error && (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 mt-2">
        <IoAlertCircleOutline className="text-red-400 text-[14px] flex-shrink-0" />
        <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: BO_FONT }}>{error}</p>
      </div>
    )}
  </div>
);

const BO_FieldInput = React.forwardRef(({ icon: Icon, placeholder, value, onChange }, ref) => (
  <div
    className="modal-input-shell flex items-center gap-3 px-4 rounded-xl border border-slate-200 bg-white transition-all"
    style={{ height: 46 }}
    onFocus={(e) => { e.currentTarget.style.borderColor = BO_FOCUS_COLOR; e.currentTarget.style.boxShadow = BO_FOCUS_SHADOW; }}
    onBlur={(e)  => { e.currentTarget.style.borderColor = "#e2e8f0";   e.currentTarget.style.boxShadow = "none"; }}
  >
    {Icon && <Icon className="text-slate-400 flex-shrink-0" style={{ fontSize: 16 }} />}
    <input
      ref={ref} value={value} onChange={onChange} placeholder={placeholder}
      className="border-none outline-none text-[14px] font-medium w-full bg-transparent"
      style={{ fontFamily: BO_FONT, color: "#0d1117" }}
    />
  </div>
));

const BO_TailDropdown = ({ value, onChange, options, height = 38 }) => (
  <FilterSelect value={value} onChange={onChange} options={options} height={height} width={160} />
);

const BO_OwnerDrawer = ({ owner, open, onClose, onSave, onNoChanges, saving }) => {
  const isEdit = !!owner;
  const [form, setForm] = useState({
    owner_firstname: owner?.owner_firstname || "",
    owner_lastname:  owner?.owner_lastname  || "",
    contact_number:  owner?.contact_number  || "",
    address:         owner?.address         || "",
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm({
      owner_firstname: owner?.owner_firstname || "",
      owner_lastname:  owner?.owner_lastname  || "",
      contact_number:  owner?.contact_number  || "",
      address:         owner?.address         || "",
    });
    setErrors({});
  }, [owner, open]);

  const setField = (key) => (e) => {
    const value =
      key === "contact_number"
        ? e.target.value.replace(/\D/g, "").slice(0, 11)
        : e.target.value;

    setForm((f) => ({ ...f, [key]: value }));
    setErrors((er) => ({ ...er, [key]: "" }));
  };

  const validate = () => {
    const e = {};
    if (!form.owner_firstname.trim()) e.owner_firstname = "First name is required.";
    if (!form.owner_lastname.trim())  e.owner_lastname  = "Last name is required.";
    if (!form.address.trim())         e.address         = "Address is required.";
    if (form.contact_number.trim() && !/^\d{11}$/.test(form.contact_number.trim())) {
      e.contact_number = "Contact number must be 11 digits.";
    }
    return e;
  };

  const hasChanges = () => {
    if (!isEdit) return true;
    return (
      form.owner_firstname.trim() !== (owner.owner_firstname || "").trim() ||
      form.owner_lastname.trim()  !== (owner.owner_lastname  || "").trim() ||
      form.address.trim()         !== (owner.address         || "").trim() ||
      form.contact_number.trim()  !== (owner.contact_number  || "").trim()
    );
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    if (isEdit && !hasChanges()) { onNoChanges?.(); return; }
    await onSave({
      owner_firstname: form.owner_firstname,
      owner_lastname:  form.owner_lastname,
      address:         form.address,
      contact_number:  form.contact_number,
    });
  };

  if (!open) return null;

  return (
    <Modal
      title={isEdit ? "Edit Owner" : "Add Owner"}
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      saveLabel={isEdit ? "Save" : "Add"}
      maxWidth="620px"
      closeOnBackdrop
    >
      <div className="grid grid-cols-2 gap-3">
        <ModalTextInput
          label={
            <>
              First Name <span className="text-red-500">*</span>
            </>
          }
          value={form.owner_firstname}
          onChange={setField("owner_firstname")}
          placeholder="Enter your first name"
          icon={IoPersonOutline}
          error={errors.owner_firstname}
          inputStyle={{ fontFamily: BO_FONT }}
        />
        <ModalTextInput
          label={
            <>
              Last Name <span className="text-red-500">*</span>
            </>
          }
          value={form.owner_lastname}
          onChange={setField("owner_lastname")}
          placeholder="Enter your last name"
          icon={IoPersonOutline}
          error={errors.owner_lastname}
          inputStyle={{ fontFamily: BO_FONT }}
        />
      </div>
      <ModalTextInput
        label={
          <>
            Address <span className="text-red-500">*</span>
          </>
        }
        value={form.address}
        onChange={setField("address")}
        placeholder="Enter your address"
        icon={IoLocationOutline}
        error={errors.address}
        inputStyle={{ fontFamily: BO_FONT }}
      />
      <ModalTextInput
        label="Contact Number (Optional)"
        value={form.contact_number}
        onChange={setField("contact_number")}
        placeholder="Enter your contact number"
        icon={IoCallOutline}
        error={errors.contact_number}
        inputStyle={{ fontFamily: BO_FONT }}
      />
    </Modal>
  );
};

const BO_TH = ({ children }) => (
  <th className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#1a1f36", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}>
    {children}
  </th>
);

const BO_OwnerDetailsDrawer = ({ owner, open, onClose }) => {
  if (!owner) return null;

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={460}
      fontFamily={BO_FONT}
      title="Owner Details"
      subtitle="Review the selected boat owner record."
      icon={IoPersonOutline}
    >
      <DrawerSection
        icon={IoDocumentTextOutline}
        title="Owner Info"
        subtitle="Registered details for this boat owner"
        fontFamily={BO_FONT}
      >
        <div className="grid grid-cols-1 gap-3">
          <DrawerInfoCard label="Full Name" value={BO_getFullName(owner)} />
          <DrawerInfoCard label="Address" value={owner.address ?? "-"} />
          <DrawerInfoCard label="Contact Number" value={owner.contact_number ?? "-"} />
        </div>
      </DrawerSection>
      <DrawerSection
        icon={IoCalendarOutline}
        title="Created Details"
        subtitle="Record creation information"
        fontFamily={BO_FONT}
      >
        <div className="grid grid-cols-1 gap-3">
          <DrawerInfoCard label="Created By" value={RB_getCreatedByLabel(owner)} />
          <DrawerInfoCard label="Date Added" value={BO_formatDate(owner.created_at)} />
        </div>
      </DrawerSection>
    </DetailDrawer>
  );
};

const BO_BoatOwners = ({ activeBoatTab, onBoatTabChange }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const cachedRegisteredBoatsData = queryClient.getQueriesData({ queryKey: ["registered-boats-data"] })
    .find(([, data]) => data?.owners)?.[1];
  const [activeItem,    setActiveItem]    = useState("Boat Management");
  const [contentMargin, setContentMargin] = useState(() => window.innerWidth >= 1024 ? 256 : 0);
  const [owners,        setOwners]        = useState(() => cachedRegisteredBoatsData?.owners ?? []);
  const [search,        setSearch]        = useState("");
  const [ownerStatusFilter, setOwnerStatusFilter] = useState("all");
  const [requestedPage, setRequestedPage] = useState(1);
  const [currentPage,   setCurrentPage]   = useState(1);
  const [toast,         setToast]         = useState({ open: false, type: "success", title: "", message: "" });
  const [addModal,      setAddModal]      = useState(false);
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const [editOwner,     setEditOwner]     = useState(null);
  const [deleteOwner,   setDeleteOwner]   = useState(null);
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [fetching,      setFetching]      = useState(() => !cachedRegisteredBoatsData?.owners);
  const [saving,        setSaving]        = useState(false);
  const urlFiltersKeyRef = useRef(null);

  const debouncedSearch = BM_useDebouncedValue(search);
  const rawHighlightedOwnerId = BM_getHighlightId({
    highlightedSearchResult,
    group: "Boat Owner",
    prefix: "boat-owner-",
    search: location.search,
  });
  const highlightToken = rawHighlightedOwnerId
    ? `${rawHighlightedOwnerId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedOwnerId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedOwnerId;
  const clearUniversalHighlight = useCallback(() => {
    if (highlightToken) {
      setDismissedHighlightToken(highlightToken);
    }
    BM_clearUniversalHighlight({ highlightedSearchResult, location, navigate });
  }, [highlightToken, highlightedSearchResult, location, navigate]);
  useEffect(() => {
    setDismissedHighlightToken("");
  }, [location.key]);
  const boatOwnersQuery = useBoatOwnersQuery(
    {
      page: currentPage,
      perPage: BO_PAGE_SIZE,
      search: debouncedSearch,
      usage: ownerStatusFilter,
      highlightOwnerId: highlightedOwnerId,
    },
    { enabled: activeBoatTab === "/boat-owners" }
  );
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const handleWidthChange = useCallback((w) => setContentMargin(w), []);

  useEffect(() => {
    setFetching(boatOwnersQuery.isLoading && owners.length === 0);
  }, [owners.length, boatOwnersQuery.isLoading]);

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen)
      setContentMargin(sidebarCollapsed ? 72 : 256);
    else if (window.innerWidth < 1024) setContentMargin(0);
  }, [sidebarCollapsed, sidebarOpen]);

  const showToast = (type, title, message) => {
    if (type === "info" && title === "No Changes Made") {
      showNoChangesToast();
      return;
    }
    showBottomToast(type, title, message);
  };

  useEffect(() => {
    if (boatOwnersQuery.data) {
      setOwners(boatOwnersQuery.data.owners);
    }
  }, [boatOwnersQuery.data]);

  useEffect(() => {
    if (!highlightedOwnerId) return;
    const resolvedPage = Number(boatOwnersQuery.data?.ownersMeta?.current_page || 0);
    if (resolvedPage > 0 && (resolvedPage !== currentPage || resolvedPage !== requestedPage)) {
      setRequestedPage(resolvedPage);
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, highlightedOwnerId, boatOwnersQuery.data?.ownersMeta?.current_page, requestedPage]);

  useEffect(() => {
    if (boatOwnersQuery.isError) {
      showToast("error", "Error", "Failed to load boat owners.");
    }
  }, [boatOwnersQuery.isError]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextSearch = params.get("q") || "";
    const nextUrlFiltersKey = JSON.stringify({ search: nextSearch });
    const filtersChanged = urlFiltersKeyRef.current !== null && urlFiltersKeyRef.current !== nextUrlFiltersKey;
    urlFiltersKeyRef.current = nextUrlFiltersKey;

    setSearch(nextSearch);

    if (filtersChanged) {
      setCurrentPage(1);
    }
  }, [highlightedSearchResult, location.search]);

  const handleAdd = async (form) => {
    if (isTransactionLocked) { showToast("error", "Transactions Locked", transactionLockMessage); return; }
    setSaving(true);
    try {
      const res = await api.post("/boat-owners", form);
      setOwners((prev) => [res.data, ...prev]);
      queryClient.setQueryData(["boat-owners"], (prev = []) => [res.data, ...prev]);
      addOwnerToDataCache(queryClient, res.data);
      setAddModal(false);
      showAddedToast("Boat Owner", "boat owner");
      void queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" });
    } catch (err) {
      showToast("error", "Failed to Add", err.response?.data?.message ?? "Failed to add owner.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (form) => {
    if (isTransactionLocked) { showToast("error", "Transactions Locked", transactionLockMessage); return; }
    setSaving(true);
    try {
      const res = await api.put(`/boat-owners/${editOwner.owner_id}`, form);
      setOwners((prev) => prev.map((o) => o.owner_id === editOwner.owner_id ? res.data : o));
      setSelectedOwner((prev) => (prev?.owner_id === editOwner.owner_id ? res.data : prev));
      queryClient.setQueryData(["boat-owners"], (prev = []) =>
        prev.map((o) => (o.owner_id === editOwner.owner_id ? res.data : o))
      );
      updateOwnerInDataCache(queryClient, res.data);
      setEditOwner(null);
      showUpdatedToast("Boat Owner", "boat owner");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["boat-owners"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" }),
      ]);
    } catch (err) {
      showToast("error", "Failed to Update", err.response?.data?.message ?? "Failed to update owner.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isTransactionLocked) { showToast("error", "Transactions Locked", transactionLockMessage); return; }
    setSaving(true);
    const fullName = BO_getFullName(deleteOwner);
    try {
      await api.patch(`/boat-owners/${deleteOwner.owner_id}/archive`);
      setOwners((prev) => prev.filter((o) => o.owner_id !== deleteOwner.owner_id));
      queryClient.setQueryData(["boat-owners"], (prev = []) =>
        prev.filter((o) => o.owner_id !== deleteOwner.owner_id)
      );
      archiveOwnerInDataCache(queryClient, deleteOwner.owner_id);
      setDeleteOwner(null);
      showToast("success", "Owner Archived", `"${fullName}" has been archived successfully.`);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["boat-owners"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["archives-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" }),
      ]);
    } catch (err) {
      showToast("error", "Archive Failed", err.response?.data?.message ?? "Failed to archive owner.");
    } finally {
      setSaving(false);
    }
  };

  const openOwnerDetails = (owner) => {
    setSelectedOwner(owner);
    setDrawerOpen(true);
  };

  const openEditDrawer = (owner) => {
    setDrawerOpen(false);
    setSelectedOwner(owner);
    setEditOwner(owner);
  };

  const paginated = owners;
  const ownersMeta = boatOwnersQuery.data?.ownersMeta ?? BM_buildLocalMeta(owners, currentPage, BO_PAGE_SIZE);
  const totalPages = Math.max(1, Number(ownersMeta.last_page || 1));
  const safePage = Math.min(requestedPage, totalPages);
  const overviewLoading = boatOwnersQuery.isLoading && !boatOwnersQuery.data;
  const overviewStats = BO_buildOverviewStats(boatOwnersQuery.data?.owners ?? [], boatOwnersQuery.data?.stats);

  useEffect(() => {
    setRequestedPage(1);
    setCurrentPage(1);
  }, [debouncedSearch, ownerStatusFilter]);

  useEffect(() => {
    if (requestedPage > totalPages) {
      setRequestedPage(totalPages);
      setCurrentPage(totalPages);
      return;
    }

    if (requestedPage === currentPage) return undefined;

    const timeout = window.setTimeout(() => {
      setCurrentPage(requestedPage);
    }, 140);

    return () => window.clearTimeout(timeout);
  }, [currentPage, requestedPage, totalPages]);

  return (
    <>
      <style>{`
        * { font-family: ${BO_FONT} !important; }
        input::placeholder { color: #1a1f36 !important; opacity: 0.4; }
        .universal-modal-shell input::placeholder,
        .universal-modal-shell textarea::placeholder,
        .universal-modal-shell .ant-select-selection-placeholder,
        .universal-modal-shell .ant-picker-input > input::placeholder {
          color: #94a3b8 !important;
          opacity: 1 !important;
          font-weight: 400 !important;
        }
      `}</style>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onWidthChange={handleWidthChange} />

        <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden"
          style={{ marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px" }}>
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />

          <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 xl:px-8" style={{ backgroundColor: "#ffffff" }}>
            <div className="mx-auto w-full max-w-[1440px]">

            {/* Page Header */}
            <BM_Header breadcrumbLabel="Boat Owners" fontFamily={BO_FONT} loading={overviewLoading} />

            <BM_OverviewGrid stats={overviewStats} loading={overviewLoading} columns={3} />

            <Tabs
              tabs={BOAT_MANAGEMENT_TABS}
              activeKey={activeBoatTab}
              onTabChange={onBoatTabChange}
              fontFamily={BO_FONT}
              className="mb-5"
              loading={overviewLoading}
            >
            <TableCard
              title="Boat Owner Records"
              subtitle="All registered boat owners in the system"
              loading={fetching}
              headerActionsSkeletonCount={3}
              pagination={{
                meta: ownersMeta,
                total: ownersMeta.total,
                totalPages,
                currentPage: safePage,
                requestedPage,
                isLoading: fetching,
                onPageChange: setRequestedPage,
                beforePageChange: clearUniversalHighlight,
              }}
              bodyClassName="overflow-x-auto"
              footerClassName="flex items-center justify-between"
              actions={
                <>
                  <div className="flex items-center gap-2.5 px-4 rounded-lg border border-gray-200 bg-white transition-all"
                    style={{ height: 42, width: 280 }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = BO_FOCUS_COLOR; e.currentTarget.style.boxShadow = BO_FOCUS_SHADOW; }}
                    onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb";   e.currentTarget.style.boxShadow = "none"; }}>
                    <IoSearchOutline className="text-[17px] flex-shrink-0" style={{ color: "#1a1f36" }} />
                    <input type="text" placeholder="Search for owner name" value={search}
                      onChange={(e) => { clearUniversalHighlight(); setSearch(e.target.value); setRequestedPage(1); setCurrentPage(1); }}
                      className="bg-transparent border-none outline-none text-[13px] w-full"
                      style={{ fontFamily: BO_FONT, color: "#1a1f36" }} />
                  </div>
                  <BO_TailDropdown
                    value={ownerStatusFilter}
                    onChange={(value) => {
                      clearUniversalHighlight();
                      setOwnerStatusFilter(value);
                      setRequestedPage(1);
                      setCurrentPage(1);
                    }}
                    options={BO_OWNER_STATUS_OPTIONS}
                    height={42}
                  />
                  <button
                    onClick={() => { clearUniversalHighlight(); if (!isTransactionLocked) setAddModal(true); else showToast("error", "Transactions Locked", transactionLockMessage); }}
                    disabled={isTransactionLocked}
                    className="ml-1 flex items-center gap-1.5 px-4 py-2 rounded-lg border-none bg-[#1a1f36] cursor-pointer text-[13px] font-semibold text-white hover:bg-[#2d3561] transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ fontFamily: BO_FONT, height: 42 }}
                  >
                    <IoAddOutline className="text-[17px]" /> Add Owner
                  </button>
                </>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                  <colgroup>
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <BO_TH>Owner Name</BO_TH>
                      <BO_TH>Address</BO_TH>
                      <BO_TH>Contact</BO_TH>
                      <BO_TH>Usage Count</BO_TH>
                      <BO_TH>Action</BO_TH>
                    </tr>
                  </thead>
                  <tbody>
                    {fetching ? (
                      Array.from({ length: BO_PAGE_SIZE }).map((_, i) => (
                        <tr key={i} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-32" /></td>
                          <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-24" /></td>
                          <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-36" /></td>
                          <td className="px-4 py-3"><div className="h-5 bg-slate-100 rounded w-16" /></td>
                          <td className="px-4 py-3"><div className="flex gap-2"><div className="w-8 h-8 rounded-lg bg-slate-100" /><div className="w-8 h-8 rounded-lg bg-slate-100" /></div></td>
                        </tr>
                      ))
                    ) : paginated.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <NoDataFound title={search || ownerStatusFilter !== "all" ? "No results found" : "No Data Found"} />
                        </td>
                      </tr>
                    ) : (
                      paginated.map((owner, index) => {
                        const fullName = BO_getFullName(owner);
                        const usageCount = BO_getUsageCount(owner);
                        const isHighlighted =
                          highlightedOwnerId &&
                          String(highlightedOwnerId) === String(owner.owner_id);
                          return (
                          <tr
                            key={owner.owner_id}
                            className={`cursor-pointer transition-colors ${isHighlighted ? "universal-search-highlight" : ""}`.trim()}
                            onClick={() => openOwnerDetails(owner)}
                            style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: highlightedSearchResult ? "#ffffff" : index % 2 === 0 ? "#ffffff" : "#ededed" }}
                          >
                          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
                            <p className="m-0 text-[13px] font-normal" style={{ color: "#1a1f36" }}>{fullName}</p>
                          </td>
                          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
                              {owner.address}
                          </td>
                          <td className="px-4 py-3 text-[13px]" style={{ color: "#1a1f36" }}>
                              {owner.contact_number ?? "-"}
                          </td>
                            <td className="px-4 py-3 text-[13px]">
                              <button
                                type="button"
                                disabled={usageCount === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (usageCount === 0) return;
                                  navigate(`/registered-boats?ownerId=${owner.owner_id}`);
                                }}
                                className="border-none bg-transparent p-0"
                                style={{ cursor: usageCount > 0 ? "pointer" : "default" }}
                                title={usageCount > 0 ? "View registered boats using this owner" : undefined}
                              >
                                <StatusPill
                                  status={usageCount > 0 ? "enabled" : "disabled"}
                                  label={BO_getUsageCountLabel(owner)}
                                />
                              </button>
                            </td>
                            <td className="px-4 py-3 text-[13px]">
                              <div className="flex items-center gap-2">
                                <Tooltip title={isTransactionLocked ? transactionLockMessage : "Edit"}>
                                  <button onClick={(e) => { e.stopPropagation(); if (!isTransactionLocked) openEditDrawer(owner); else showToast("error", "Transactions Locked", transactionLockMessage); }}
                                    disabled={isTransactionLocked}
                                    className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer bg-white hover:bg-blue-50 transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:opacity-60"
                                    style={{ borderColor: isTransactionLocked ? undefined : "#1a1f36" }}>
                                    <IoCreateOutline style={{ fontSize: "15px", color: isTransactionLocked ? "#94a3b8" : "#1a1f36" }} />
                                  </button>
                                </Tooltip>
                                <Tooltip
                                  title={
                                    isTransactionLocked
                                      ? transactionLockMessage
                                      : usageCount > 0
                                      ? "Cannot archive boat owners with usage count"
                                      : "Archive"
                                  }
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (usageCount > 0 || isTransactionLocked) return;
                                      setDeleteOwner(owner);
                                    }}
                                    disabled={usageCount > 0 || isTransactionLocked}
                                    className={`w-8 h-8 rounded-lg border flex items-center justify-center bg-white transition-colors ${
                                      usageCount > 0 || isTransactionLocked
                                        ? "cursor-not-allowed border-slate-200"
                                        : "cursor-pointer border-red-300 hover:bg-red-50"
                                    }`}
                                  >
                                    <IoTrashOutline
                                      style={{
                                        fontSize: "15px",
                                        color: usageCount > 0 || isTransactionLocked ? "#94a3b8" : "#ef4444",
                                      }}
                                    />
                                  </button>
                                </Tooltip>
                              </div>
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
      </div>

      <BO_OwnerDrawer
        open={addModal}
        onClose={() => setAddModal(false)}
        onSave={handleAdd}
        saving={saving}
      />

      <BO_OwnerDrawer
        owner={editOwner}
        open={!!editOwner}
        onClose={() => setEditOwner(null)}
        onNoChanges={() => {
          setEditOwner(null);
          showToast("info", "No Changes Made", "No changes were made. The record remains the same.");
        }}
        onSave={handleEdit}
        saving={saving}
      />

      {/* Delete Confirmation Modal */}
      {deleteOwner && (
        <BM_DeleteModal
          open={!!deleteOwner}
          title="Delete Owner"
          itemName={BO_getFullName(deleteOwner)}
          onClose={() => setDeleteOwner(null)}
          onConfirm={handleDelete}
          saving={saving}
          fontFamily={BO_FONT}
          warningItems={
            (deleteOwner?.boats_count ?? 0) > 0
              ? [
                  {
                    icon: IoAlertCircleOutline,
                    text: (
                      <>
                        Existing boats may <span className="font-semibold">lose their owner reference</span>
                      </>
                    ),
                  },
                  {
                    icon: IoPersonOutline,
                    text: (
                      <>
                        This owner will <span className="font-semibold">no longer be available</span> for new registrations
                      </>
                    ),
                  },
                ]
              : []
          }
        />
      )}

      <BO_OwnerDetailsDrawer
        owner={selectedOwner}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
};

const BA_FONT = "'Montserrat', sans-serif";

const BA_STATUS_OPTIONS = [
  { value: "active", label: "Active", active: "border-emerald-600 bg-emerald-50 text-emerald-700" },
  { value: "expired", label: "Expired", active: "border-amber-500 bg-amber-50 text-amber-700" },
  { value: "suspended", label: "Suspended", active: "border-rose-500 bg-rose-50 text-rose-700" },
  { value: "under_repair", label: "Under Repair", active: "border-violet-500 bg-violet-50 text-violet-700" },
];

const BA_antTheme = {
  token: {
    colorPrimary: "#4096ff",
    colorPrimaryHover: "#4096ff",
    colorPrimaryActive: "#4096ff",
    borderRadius: 10,
    fontFamily: BA_FONT,
    controlHeight: 46,
    fontSize: 13,
  },
};

const BA_getOwnerLabel = (owner) =>
  `${owner?.owner_firstname ?? ""} ${owner?.owner_lastname ?? ""}`.trim() || owner?.owner_name || "-";

const BA_Spinner = Spinner;


const BA_DialogModal = ({ open, title, content, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(10,13,28,0.55)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full bg-white overflow-hidden"
        style={{
          maxWidth: 420,
          borderRadius: 20,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          fontFamily: BA_FONT,
        }}
      >
        <div style={{ height: 4, backgroundColor: "#1a1f36" }} />
        <div className="px-6 pt-6 pb-5">
          <div className="mb-4 flex items-start justify-between">
            <div
              className="flex items-center justify-center"
              style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: "#e8eaf0" }}
            >
              <IoWarningOutline style={{ fontSize: 26, color: "#1a1f36" }} />
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg border-none cursor-pointer"
              style={{ backgroundColor: "#f1f5f9", color: "#64748b" }}
            >
              <IoCloseOutline style={{ fontSize: 17, marginTop: 2 }} />
            </button>
          </div>
          <p className="m-0 text-[17px] font-bold text-[#0d1117]">{title}</p>
          <p className="m-0 mt-2 text-[13px] leading-relaxed text-slate-500">{content}</p>
        </div>
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="rounded-[10px] border-none px-6 py-2.5 text-[13px] font-semibold text-white cursor-pointer"
            style={{ backgroundColor: "#1a1f36", fontFamily: BA_FONT }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

const BA_BannerToast = ({ message, onClose }) => (
  <div
    className="mb-5 flex items-center gap-4 rounded-2xl px-5 py-4"
    style={{ backgroundColor: "#fff1f2", border: "1.5px solid #fca5a5", borderLeft: "5px solid #dc2626", borderRadius: 10 }}
  >
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 text-white"
      style={{ backgroundColor: "#dc2626" }}
    >
      <IoCloseOutline style={{ fontSize: 16 }} />
    </div>
    <div className="flex-1">
      <p className="m-0 text-[13px] font-bold text-red-700">Error</p>
      <p className="m-0 mt-0.5 text-[12px] font-normal text-red-800/85">{message}</p>
    </div>
    <button
      onClick={onClose}
      className="flex h-7 w-7 items-center justify-center rounded-full border-none cursor-pointer"
      style={{ backgroundColor: "#fee2e2" }}
    >
      <IoCloseOutline style={{ fontSize: 15, color: "#b91c1c" }} />
    </button>
  </div>
);

const BA_Label = ({ children, required }) => (
  <label className="mb-1.5 block text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: BA_FONT }}>
    {children}
    {required && <span className="ml-0.5 text-red-500">*</span>}
  </label>
);

const BA_Input = React.forwardRef(({ icon: Icon, readOnly = false, error = false, ...props }, ref) => (
  <div
    className={`flex items-center gap-2.5 px-3.5 border transition-all ${readOnly ? "bg-slate-50" : "bg-white"} ${error && !readOnly ? "border-red-300" : "border-slate-200 focus-within:border-[#4096ff]"}`}
    style={{ height: 46, borderRadius: 10 }}
  >
    {Icon && <Icon className="text-[15px] text-slate-400 flex-shrink-0" />}
    <input
      ref={ref}
      readOnly={readOnly}
      {...props}
      className={`h-full w-full border-none bg-transparent text-[13px] font-medium outline-none placeholder:font-normal placeholder:text-slate-400 ${readOnly ? "cursor-default text-slate-500" : "text-[#0d1117]"}`}
      style={{ fontFamily: BA_FONT }}
    />
  </div>
));

const BA_FieldError = ({ msg }) =>
  msg ? (
    <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-red-100 bg-red-50 px-3 py-2">
      <IoAlertCircleOutline className="text-[14px] text-red-400 flex-shrink-0" />
      <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: BA_FONT }}>
        {msg}
      </p>
    </div>
  ) : null;

const BA_Lightbox = ({ src, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm" onClick={onClose}>
    <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
      <img src={src} alt="Boat preview" className="w-full rounded-[10px] object-contain shadow-2xl" style={{ maxHeight: "85vh" }} />
      <button
        onClick={onClose}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-[10px] border-none bg-black/60 text-white cursor-pointer"
      >
        <IoCloseOutline className="text-xl" />
      </button>
    </div>
  </div>
);

const BA_SuperAddBoat = ({ activeBoatTab, onBoatTabChange }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const overviewQuery = useRegisteredBoatsDataQuery(
    {
      boatsPaginated: false,
      boatTypesPaginated: false,
      ownersPaginated: false,
      includeBoats: true,
      includeBoatTypes: true,
      includeOwners: true,
    },
    { enabled: activeBoatTab === "/add-boat" }
  );

  const [activeItem, setActiveItem] = useState("Boat Management");
  const [contentMargin, setContentMargin] = useState(() => (window.innerWidth >= 1024 ? 256 : 0));
  const [fetchError, setFetchError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [lightbox, setLightbox] = useState(false);
  const [form, setForm] = useState({
    boat_name: "",
    boat_type_id: "",
    status: "active",
    owner_id: "",
    image_preview: null,
    image_path: "",
  });
  const [errors, setErrors] = useState({});

  const fileInputRef = useRef(null);
  const boatNameRef = useRef(null);
  const boatTypeRef = useRef(null);
  const ownerRef = useRef(null);

  const handleWidthChange = useCallback((width) => setContentMargin(width), []);

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) {
      setContentMargin(sidebarCollapsed ? 72 : 256);
    } else if (window.innerWidth < 1024) {
      setContentMargin(0);
    }
  }, [sidebarCollapsed, sidebarOpen]);

  useEffect(() => {
    if (overviewQuery.isError) {
      setFetchError("Failed to load form data. Please refresh.");
      return;
    }

    setFetchError("");
  }, [overviewQuery.isError]);

  const setField = (key) => (e) => {
    const nextValue = key === "boat_name" ? e.target.value.toUpperCase() : e.target.value;
    setForm((current) => ({ ...current, [key]: nextValue }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const handleOwnerSelect = (value) => {
    setForm((current) => ({ ...current, owner_id: value ?? "" }));
    setErrors((current) => ({ ...current, owner_id: "" }));
  };

  const handleBoatTypeSelect = (value) => {
    setForm((current) => ({ ...current, boat_type_id: value ?? "" }));
    setErrors((current) => ({ ...current, boat_type_id: "" }));
  };

  const handleImageFile = (file) => {
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (event) =>
      setForm((current) => ({
        ...current,
        image_preview: event.target?.result ?? null,
        image_path: file.name,
      }));
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.boat_name.trim()) nextErrors.boat_name = "Boat name is required.";
    if (!form.boat_type_id) nextErrors.boat_type_id = "Please select a boat type.";
    if (!form.owner_id) nextErrors.owner_id = "Please select an owner.";
    return nextErrors;
  };

  const focusFirstError = (nextErrors) => {
    if (nextErrors.boat_name) {
      boatNameRef.current?.focus();
      boatNameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (nextErrors.boat_type_id) {
      boatTypeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (nextErrors.owner_id) {
      ownerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleReset = () => {
    setForm({
      boat_name: "",
      boat_type_id: "",
      status: "active",
      owner_id: "",
      image_preview: null,
      image_path: "",
    });
    setImageFile(null);
    setErrors({});
  };

  const handleSubmit = async () => {
    if (isTransactionLocked) {
      showBottomToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    const boatName = form.boat_name.trim();

    try {
      const response = await api.post("/boats", {
        boat_name: form.boat_name.trim(),
        boat_type_id: form.boat_type_id,
        owner_id: form.owner_id,
        status: form.status,
      });

      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        await api.post(`/boats/${response.data.boat_id}/upload-image`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      addRegisteredBoatToDataCache(queryClient, {
        ...response.data,
        status: response.data?.status ?? form.status,
      });
      handleReset();
      showAddedToast("Boat", "boat");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["registered-boats-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" }),
      ]);
      setTimeout(() => {
        navigate("/registered-boats");
      }, 900);
    } catch (error) {
      showBottomToast("error", "Registration Failed", error.response?.data?.message ?? "Failed to register boat. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const boatTypes = overviewQuery.data?.boatTypes ?? [];
  const owners = overviewQuery.data?.owners ?? [];
  const cachedOverviewData = BM_getCachedOverviewData(queryClient);
  const overviewData = cachedOverviewData ?? overviewQuery.data;
  const overviewLoading = !overviewData && overviewQuery.isLoading;
  const overviewStats = BM_getOverviewStats(overviewData, { boatTypes, owners });
  const selectedOwner = owners.find((owner) => owner.owner_id === form.owner_id);

  return (
    <ConfigProvider theme={BA_antTheme}>
      <style>{`
        * { font-family: ${BA_FONT} !important; }
        input::placeholder, textarea::placeholder { color: #94a3b8 !important; opacity: 1; font-weight: 400 !important; }

        .boat-ant-select .ant-select-selector {
          border-radius: 10px !important;
          border: 1px solid #e2e8f0 !important;
          box-shadow: none !important;
          font-family: ${BA_FONT} !important;
          font-size: 13px !important;
          font-weight: 500 !important;
        }

        .boat-ant-select-error .ant-select-selector {
          border-color: #fca5a5 !important;
        }

        .boat-ant-select.ant-select-focused .ant-select-selector,
        .boat-ant-select.ant-select-open .ant-select-selector {
          border-color: #4096ff !important;
          box-shadow: none !important;
        }

        .boat-ant-select-error.ant-select-focused .ant-select-selector,
        .boat-ant-select-error.ant-select-open .ant-select-selector {
          border-color: #fca5a5 !important;
        }

        .boat-ant-select .ant-select-selector:hover {
          border-color: #4096ff !important;
        }

        .boat-ant-select-error .ant-select-selector:hover {
          border-color: #fca5a5 !important;
        }

        .boat-ant-select .ant-select-selection-item,
        .boat-ant-select .ant-select-selection-search-input {
          font-family: ${BA_FONT} !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          color: #0d1117 !important;
        }

        .boat-ant-select .ant-select-selection-search-input::placeholder {
          font-family: ${BA_FONT} !important;
          font-size: 13px !important;
          font-weight: 400 !important;
          color: #94a3b8 !important;
          opacity: 1 !important;
        }

        .boat-ant-select .ant-select-selection-placeholder {
          font-family: ${BA_FONT} !important;
          font-size: 13px !important;
          font-weight: 400 !important;
          color: #94a3b8 !important;
        }

        .boat-ant-select .ant-select-arrow {
          color: #9ca3af !important;
        }

        .boat-ant-select-dropdown {
          border-radius: 10px !important;
          overflow: hidden !important;
          border: 1px solid #e5e7eb !important;
          box-shadow: 0 4px 24px rgba(0,0,0,0.13) !important;
          padding: 0 !important;
          z-index: 11000 !important;
        }

        .boat-ant-select-dropdown .ant-select-item {
          border-radius: 0 !important;
          padding: 8px 12px !important;
          font-family: ${BA_FONT} !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          color: #1a1f36 !important;
        }

        .boat-ant-select-dropdown .ant-select-item-option-selected {
          background-color: #1a1f36 !important;
          color: #ffffff !important;
          font-weight: 400 !important;
        }

        .boat-ant-select-dropdown .ant-select-item-option-active:not(.ant-select-item-option-selected) {
          background-color: #f8fafc !important;
        }
      `}</style>

      <div className="flex h-screen overflow-hidden bg-white">
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
          }}
        >
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />

          <main className="min-w-0 flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">
              <BM_Header breadcrumbLabel="Add Boat" fontFamily={BA_FONT} loading={overviewLoading} />

              <BM_OverviewGrid stats={overviewStats} loading={overviewLoading} />

              <Tabs
                tabs={BOAT_MANAGEMENT_TABS}
                activeKey={activeBoatTab}
                onTabChange={onBoatTabChange}
                fontFamily={BA_FONT}
                className="mb-5"
                loading={overviewLoading}
              >
                <div className="border border-slate-200 bg-white px-5 py-5">
                  {fetchError && <BA_BannerToast message={fetchError} onClose={() => setFetchError("")} />}

                  <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <div>
                      <Card
                        icon={IoImageOutline}
                        title="Boat Image"
                        subtitle="Upload a photo of the boat (optional)"
                        loading={overviewLoading}
                        skeletonLayout={[
                          { type: "upload", height: "h-[180px]" },
                          { type: "button" },
                        ]}
                        titleClassName="uppercase"
                        fontFamily={BA_FONT}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageFile(e.target.files?.[0])}
                          className="hidden"
                        />

                        {form.image_preview ? (
                          <div className="flex flex-col gap-3">
                            <div className="relative overflow-hidden rounded-[10px] border border-gray-200 bg-black">
                              <img src={form.image_preview} alt="Boat preview" className="block w-full object-contain" style={{ maxHeight: 320 }} />
                              <div
                                className="absolute left-0 right-0 top-0 flex items-center justify-between px-3 py-2.5"
                                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-[10px] bg-white/20">
                                    <IoImageOutline className="text-[13px] text-white" />
                                  </div>
                                  <span className="max-w-[220px] truncate text-[11px] font-medium text-white/90">{form.image_path}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setLightbox(true)}
                                    className="flex h-7 w-7 items-center justify-center rounded-[10px] border-none bg-white/20 text-white cursor-pointer transition-colors hover:bg-white/35"
                                  >
                                    <IoExpandOutline className="text-[14px]" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setForm((current) => ({ ...current, image_preview: null, image_path: "" }));
                                      setImageFile(null);
                                    }}
                                    className="flex h-7 w-7 items-center justify-center rounded-[10px] border-none bg-white/20 text-white cursor-pointer transition-colors hover:bg-red-500/70"
                                  >
                                    <IoCloseOutline className="text-[15px]" />
                                  </button>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full rounded-[10px] border border-dashed border-gray-300 bg-[#fafbfc] py-2.5 text-[13px] font-medium text-gray-500 cursor-pointer transition-all hover:border-[#4096ff] hover:bg-blue-50 hover:text-[#4096ff]"
                            >
                              Change Image
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            onDrop={(e) => {
                              e.preventDefault();
                              handleImageFile(e.dataTransfer.files?.[0]);
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "#4096ff";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "#d1d5db";
                            }}
                            className="flex cursor-pointer flex-col items-center gap-3 rounded-[10px] border-2 border-dashed border-gray-300 bg-[#fafbfc] px-5 py-12 transition-colors"
                          >
                            <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[10px] bg-blue-50">
                              <IoCloudUploadOutline className="text-[26px] text-blue-500" />
                            </div>
                            <div className="text-center">
                              <p className="m-0 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Click to upload boat image</p>
                            </div>
                          </div>
                    )}
                  </Card>
                </div>

                <div className="space-y-5">
                  <Card
                    icon={IoBoatOutline}
                    title="Boat Information"
                    subtitle="Basic details about the boat"
                    loading={overviewLoading}
                    skeletonLayout={[
                      { type: "fields", count: 2, columns: 2 },
                      { type: "segmented", count: 4, columns: 4 },
                    ]}
                    titleClassName="uppercase"
                    fontFamily={BA_FONT}
                  >
                    <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <BA_Label required>Boat Name</BA_Label>
                        <BA_Input
                          ref={boatNameRef}
                          placeholder="Enter boat name"
                          value={form.boat_name}
                          onChange={setField("boat_name")}
                          error={Boolean(errors.boat_name)}
                        />
                        <BA_FieldError msg={errors.boat_name} />
                      </div>

                      <div ref={boatTypeRef}>
                        <BA_Label required>Boat Type</BA_Label>
                        <FilterSelect
                          className={`boat-ant-select ${errors.boat_type_id ? "boat-ant-select-error" : ""}`}
                          popupClassName="boat-ant-select-dropdown"
                          width="100%"
                          height={46}
                          style={{ width: "100%", height: 46, fontFamily: BA_FONT }}
                          placement="bottomLeft"
                          getPopupContainer={() => document.body}
                          showSearch
                          allowClear
                          placeholder="Select boat type"
                          optionFilterProp="label"
                          value={form.boat_type_id || undefined}
                          onChange={handleBoatTypeSelect}
                          filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                          options={boatTypes.map((type) => ({ value: type.boat_type_id, label: type.type_name }))}
                        />
                        <BA_FieldError msg={errors.boat_type_id} />
                      </div>
                    </div>

                    <div>
                      <BA_Label>Status</BA_Label>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                        {BA_STATUS_OPTIONS.map((option) => {
                          const active = form.status === option.value;
                          return (
                            <button
                              key={option.value}
                              onClick={() => setForm((current) => ({ ...current, status: option.value }))}
                              className={`flex h-[46px] items-center justify-center rounded-[10px] border-2 px-3 text-[11px] font-semibold uppercase cursor-pointer transition-all ${active ? option.active : "border-gray-200 bg-white text-slate-700 hover:bg-gray-50"}`}
                              style={{ fontFamily: BA_FONT }}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </Card>

                  <Card
                    icon={IoPersonOutline}
                    title="Owner Information"
                    subtitle="Details about the boat owner"
                    loading={overviewLoading}
                    skeletonLayout={[
                      { type: "fields", count: 1, columns: 1 },
                      { type: "fields", count: 2, columns: 2 },
                    ]}
                    titleClassName="uppercase"
                    fontFamily={BA_FONT}
                  >
                    <div className="mb-4" ref={ownerRef}>
                      <BA_Label required>Owner Name</BA_Label>
                      {owners.length === 0 ? (
                        <div
                          className="flex h-[46px] items-center rounded-[10px] border border-gray-200 bg-gray-50 px-3.5"
                        >
                          <span className="text-[13px] font-medium text-gray-300">No owners available</span>
                        </div>
                      ) : (
                        <FilterSelect
                          className={`boat-ant-select ${errors.owner_id ? "boat-ant-select-error" : ""}`}
                          popupClassName="boat-ant-select-dropdown"
                          width="100%"
                          height={46}
                          style={{ width: "100%", height: 46, fontFamily: BA_FONT }}
                          placement="bottomLeft"
                          getPopupContainer={() => document.body}
                          showSearch
                          allowClear
                          placeholder="Select from registered boat owners"
                          optionFilterProp="label"
                          value={form.owner_id || undefined}
                          onChange={handleOwnerSelect}
                          filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                          options={owners.map((owner) => ({ value: owner.owner_id, label: BA_getOwnerLabel(owner) }))}
                        />
                      )}
                      <BA_FieldError msg={errors.owner_id} />
                    </div>

                    <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <BA_Label>Owner Address</BA_Label>
                        <BA_Input value={selectedOwner?.address ?? ""} readOnly />
                      </div>
                      <div>
                        <BA_Label>Contact Number</BA_Label>
                        <BA_Input value={selectedOwner?.contact_number ?? ""} readOnly />
                      </div>
                    </div>
                  </Card>

                  <div className="mt-1 flex justify-end gap-3 pb-4">
                    {overviewLoading ? (
                      <div className="flex animate-pulse justify-end gap-3">
                        <div className="h-[46px] w-28 rounded-[10px] bg-slate-200" />
                        <div className="h-[46px] w-28 rounded-[10px] bg-slate-200" />
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={handleReset}
                          disabled={submitting}
                          className="h-[46px] rounded-[10px] border-2 bg-white px-6 text-[13px] font-semibold cursor-pointer transition-colors hover:bg-gray-50"
                          style={{ borderColor: "#1a1f36", color: "#1a1f36", opacity: submitting ? 0.5 : 1 }}
                        >
                          Clear Form
                        </button>
                        <button
                          onClick={handleSubmit}
                          disabled={submitting || isTransactionLocked}
                          className="flex h-[46px] items-center justify-center gap-2 rounded-[10px] border-none bg-[#1a1f36] px-7 text-[13px] font-semibold text-white cursor-pointer transition-colors hover:bg-[#2d3561] disabled:cursor-not-allowed"
                          style={{ opacity: submitting || isTransactionLocked ? 0.7 : 1, minWidth: 112 }}
                        >
                          {submitting ? <><BA_Spinner /></> : "Save Boat"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
                </div>
              </Tabs>
            </div>
          </main>
        </div>
      </div>

      {lightbox && form.image_preview && <BA_Lightbox src={form.image_preview} onClose={() => setLightbox(false)} />}

    </ConfigProvider>
  );
};

const BoatManagement = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const resolveBoatTab = useCallback((path) => {
    if (path === "/boat-type") return "/boat-type";
    if (path === "/boat-owners") return "/boat-owners";
    if (path === "/add-boat") return "/add-boat";
    return "/registered-boats";
  }, []);
  const [activeBoatTab, setActiveBoatTab] = useState(() => resolveBoatTab(pathname));

  useEffect(() => {
    setActiveBoatTab(resolveBoatTab(pathname));
  }, [pathname, resolveBoatTab]);

  const handleBoatTabChange = useCallback((nextTab) => {
    setActiveBoatTab(nextTab);

    if (pathname !== nextTab) {
      navigate(nextTab);
    }
  }, [navigate, pathname]);

  return (
    <>
      {activeBoatTab === "/registered-boats" ? (
        <RB_RegisteredBoats
          activeBoatTab={activeBoatTab}
          onBoatTabChange={handleBoatTabChange}
        />
      ) : null}
      {activeBoatTab === "/boat-type" ? (
        <BT_SuperAddBoatType
          activeBoatTab={activeBoatTab}
          onBoatTabChange={handleBoatTabChange}
        />
      ) : null}
      {activeBoatTab === "/boat-owners" ? (
        <BO_BoatOwners
          activeBoatTab={activeBoatTab}
          onBoatTabChange={handleBoatTabChange}
        />
      ) : null}
      {activeBoatTab === "/add-boat" ? (
        <BA_SuperAddBoat
          activeBoatTab={activeBoatTab}
          onBoatTabChange={handleBoatTabChange}
        />
      ) : null}
    </>
  );
};

export default BoatManagement;
