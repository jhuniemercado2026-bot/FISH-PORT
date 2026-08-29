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
  IoArchiveOutline,
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
import FilterButton from "../../components/FilterButton";
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
import ArchiveModal from "../../components/ArchiveModal";
import { showAddedToast, showBottomToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import { useSidebar } from "../../store/sidebarStore";
import api from "../../api/axios";
import { buildTermsAndAgreementPdf } from "../../lib/pdfDocumentTermsAndAgreement";
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
import { isHeadRole } from "../../utils/transactionLock";
import { cacheTab, getCachedTab } from "../../utils/tabSession";

const RB_PAGE_SIZE = 10;
const RB_FONT = "'Montserrat', sans-serif";

const RB_getOwnerName = (owner) =>
  `${owner?.owner_firstname ?? ""} ${owner?.owner_lastname ?? ""}`.trim() || "-";

const RB_getBoatType  = (boat) => boat?.boat_type  ?? boat?.boatType  ?? null;
const RB_getCreatedBy = (boat) => boat?.created_by ?? boat?.createdBy ?? null;
const RB_getBoatImageSrc = (boat) => {
  const imagePath = String(boat?.image_path ?? "").trim();
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  return `${api.defaults.baseURL.replace("/api", "")}/storage/${imagePath}`;
};

const uploadBoatImageInBackground = ({ queryClient, boat, imageFile, onUploaded }) => {
  if (!boat?.boat_id || !imageFile) return;

  const formData = new FormData();
  formData.append("image", imageFile);

  void api
    .post(`/boats/${boat.boat_id}/upload-image`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((response) => {
      const updatedBoat = {
        ...boat,
        image_path: response.data?.image_path ?? boat.image_path,
        image_public_id: response.data?.image_public_id ?? boat.image_public_id,
      };

      updateRegisteredBoatsDataCache(queryClient, updatedBoat);
      onUploaded?.(updatedBoat);
      showBottomToast("success", "Image Uploaded", "Boat image has been saved.");
    })
    .catch((error) => {
      showBottomToast(
        "error",
        "Image Upload Failed",
        error.response?.data?.message ?? "Boat was saved, but the image upload failed."
      );
    });
};
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
const RB_isArchivedLookup = (item) => Boolean(item?.deleted_at);
const RB_getLookupOptionLabel = (label, item) => (
  <span className="flex items-center gap-2">
    <span>{label}</span>
    {RB_isArchivedLookup(item) ? (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
        Archived
      </span>
    ) : null}
  </span>
);
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
];
const BOAT_MANAGEMENT_TAB_STORAGE_KEY = "opol:boat-management:active-tab";
const BOAT_MANAGEMENT_TAB_KEYS = BOAT_MANAGEMENT_TABS.map((tab) => tab.key);

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
  <FilterButton value={value} onChange={onChange} options={options} height={height} width={160} />
);


const RB_EditBoatDrawer = ({ boat, open, onClose, onSuccess, onImageUploaded, onNoChanges, onError, boatTypes, owners }) => {
  const queryClient = useQueryClient();
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
      setImagePreview(RB_getBoatImageSrc(boat));
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

  const ownerOptions = owners.map((owner) => ({
    value: owner.owner_id,
    label: RB_getOwnerLabel(owner),
    searchLabel: RB_getOwnerLabel(owner),
  }));

  const boatTypeOptions = boatTypes.map((type) => ({
    value: type.boat_type_id,
    label: RB_getBoatTypeLabel(type),
    searchLabel: RB_getBoatTypeLabel(type),
  }));

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
      const updatedBoat = {
        ...boat,
        ...(response?.data ?? {}),
        boat_id: boat.boat_id,
        status: response?.data?.status ?? formData.status,
        boat_name: response?.data?.boat_name ?? formData.boat_name.trim(),
        boat_type_id: response?.data?.boat_type_id ?? Number(formData.boat_type_id),
        owner_id: response?.data?.owner_id ?? Number(formData.owner_id),
        image_path: response?.data?.image_path ?? boat.image_path,
        image_public_id: response?.data?.image_public_id ?? boat.image_public_id,
        prev_status: boat.status || "active",
      };

      onSuccess?.(updatedBoat);
      onClose();

      uploadBoatImageInBackground({
        queryClient,
        boat: updatedBoat,
        imageFile,
        onUploaded: onImageUploaded,
      });
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
    <ConfigProvider theme={BA_antTheme}>
      <style>{`
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
        .boat-ant-select-error .ant-select-selector,
        .boat-ant-select-error.ant-select-focused .ant-select-selector,
        .boat-ant-select-error.ant-select-open .ant-select-selector,
        .boat-ant-select-error .ant-select-selector:hover {
          border-color: #fca5a5 !important;
        }
      `}</style>
      <Modal
        title="Edit Boat"
        onClose={loading ? undefined : onClose}
        onCancel={onClose}
        onSave={handleSubmit}
        saving={loading}
        saveDisabled={loading}
        saveLabel="Save"
        saveButtonWidth="170px"
        closeButtonWidth="170px"
        closeOnBackdrop
        maxWidth="980px"
        minimumSavingMs={0}
        bodyClassName="max-h-[64vh] overflow-y-auto !p-5"
      >
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <RB_FieldError msg={errors.submit} />
        <Card
          icon={IoImageOutline}
          title="BOAT IMAGE"
          subtitle="Upload a photo of the boat."
        >
            <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleImageChange(e.target.files[0])} className="hidden" />
            {imagePreview ? (
              <div className="flex flex-col gap-3">
                <div className="relative overflow-hidden rounded-[10px] border border-gray-200 bg-black">
                  <img src={imagePreview} alt="Boat preview" className="block w-full object-contain" style={{ maxHeight: 280 }} />
                  <div className="absolute left-0 right-0 top-0 flex items-center justify-between gap-2 px-3 py-2.5"
                    style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
                  >
                    <div />
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setLightboxOpen(true)} className="flex h-7 w-7 items-center justify-center rounded-[10px] border-none bg-white/20 text-white cursor-pointer transition-colors hover:bg-white/35">
                        <IoExpandOutline className="text-[14px]" />
                      </button>
                      <button type="button" onClick={() => { setImagePreview(null); setImageFile(null); setLightboxOpen(false); }} className="flex h-7 w-7 items-center justify-center rounded-[10px] border-none bg-white/20 text-white cursor-pointer transition-colors hover:bg-red-500/70">
                        <IoCloseOutline className="text-[14px]" />
                      </button>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-[10px] border border-dashed border-gray-300 bg-[#fafbfc] py-2.5 text-[13px] font-medium text-gray-500 cursor-pointer transition-all hover:border-[#4096ff] hover:bg-blue-50 hover:text-[#4096ff]" style={{ fontFamily: BA_FONT }}>
                  Change Image
                </button>
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); handleImageChange(e.dataTransfer.files?.[0]); }}
                onDragOver={(e) => e.preventDefault()}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#4096ff"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#d1d5db"}
                className="flex min-h-[252px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[10px] border-2 border-dashed border-gray-300 bg-[#fafbfc] px-5 py-10 transition-colors hover:border-[#4096ff] hover:bg-blue-50"
              >
                <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[10px] bg-blue-50">
                  <IoCloudUploadOutline className="text-[26px] text-blue-500" />
                </div>
                <p className="m-0 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Click to upload boat image</p>
              </div>
            )}
        </Card>

        <div className="grid grid-cols-1 gap-6">
          <Card icon={IoBoatOutline} title="BOAT INFORMATION" subtitle="Basic details about the boat.">
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <BA_Label required>Boat Name</BA_Label>
                <BA_Input
                  placeholder="Enter boat name"
                  value={formData.boat_name}
                  onChange={(e) => { setFormData(f => ({ ...f, boat_name: e.target.value })); setErrors(er => ({ ...er, boat_name: "" })); }}
                  error={Boolean(errors.boat_name)}
                />
                <BA_FieldError msg={errors.boat_name} />
              </div>
              <div>
                <BA_Label required>Boat Type</BA_Label>
                <FilterSelect
                  className={`boat-ant-select ${errors.boat_type_id ? "boat-ant-select-error" : ""}`}
                  popupClassName="boat-ant-select-dropdown"
                  width="100%"
                  height={46}
                  style={{ width: "100%", height: 46, fontFamily: BA_FONT }}
                  showSearch
                  allowClear
                  placeholder="Select boat type"
                  optionFilterProp="searchLabel"
                  value={formData.boat_type_id || undefined}
                  onChange={(val) => { setFormData(f => ({ ...f, boat_type_id: val ?? "" })); setErrors(e => ({ ...e, boat_type_id: "" })); }}
                  filterOption={(input, option) => (option?.searchLabel ?? "").toLowerCase().includes(input.toLowerCase())}
                  options={boatTypeOptions}
                  getPopupContainer={() => document.body}
                  placement="bottomLeft"
                  notFoundContent="No types found"
                />
                <BA_FieldError msg={errors.boat_type_id} />
              </div>
            </div>
            <div>
              <BA_Label>Status</BA_Label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                {BA_STATUS_OPTIONS.map((option) => {
                  const active = formData.status === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData(f => ({ ...f, status: option.value }))}
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

          <Card icon={IoPersonOutline} title="OWNER INFORMATION" subtitle="Details about the boat owner.">
            <div className="mb-4">
              <BA_Label required>Owner Name</BA_Label>
              <FilterSelect
                className={`boat-ant-select ${errors.owner_id ? "boat-ant-select-error" : ""}`}
                popupClassName="boat-ant-select-dropdown"
                width="100%"
                height={46}
                style={{ width: "100%", height: 46, fontFamily: BA_FONT }}
                showSearch
                allowClear
                placeholder="Select from registered boat owners"
                optionFilterProp="searchLabel"
                value={formData.owner_id || undefined}
                onChange={(val) => { setFormData(f => ({ ...f, owner_id: val ?? "" })); setErrors(e => ({ ...e, owner_id: "" })); }}
                filterOption={(input, option) => (option?.searchLabel ?? "").toLowerCase().includes(input.toLowerCase())}
                options={ownerOptions}
                getPopupContainer={() => document.body}
                placement="bottomLeft"
                notFoundContent="No owners found"
              />
              <BA_FieldError msg={errors.owner_id} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <BA_Label>Owner Address</BA_Label>
                <BA_Input value={selectedOwner?.address ?? ""} readOnly wrapperClassName="!bg-slate-100" />
              </div>
              <div>
                <BA_Label>Contact Number</BA_Label>
                <BA_Input value={selectedOwner?.contact_number ?? ""} readOnly wrapperClassName="!bg-slate-100" />
              </div>
            </div>
          </Card>
        </div>
      </div>
      </Modal>
      {lightboxOpen && imagePreview ? <BA_Lightbox src={imagePreview} onClose={() => setLightboxOpen(false)} /> : null}
    </ConfigProvider>
  );
};

const RB_TH = ({ children }) => (
  <th className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#1a1f36", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}>
    {children}
  </th>
);

const RB_RegisteredBoats = ({ activeBoatTab, onBoatTabChange, openAddBoatOnMount = false }) => {
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
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery("boat-management");
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editingBoat,    setEditingBoat]    = useState(null);
  const [deleteModal,    setDeleteModal]    = useState({ open: false, boat: null });
  const [addBoatModalOpen, setAddBoatModalOpen] = useState(false);
  const isHeadViewOnly = isHeadRole();
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
  useEffect(() => {
    if (!openAddBoatOnMount) return;
    if (isHeadViewOnly) return;
    setAddBoatModalOpen(true);
    navigate("/registered-boats", { replace: true });
  }, [isHeadViewOnly, navigate, openAddBoatOnMount]);
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
      includeArchivedLookups: false,
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

  const refreshBoatDependentModules = () => {
    void queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" });
    void queryClient.invalidateQueries({ queryKey: ["docking-lookups"], refetchType: "active" });
    void queryClient.invalidateQueries({ queryKey: ["dockings-calendar"], refetchType: "active" });
    void queryClient.invalidateQueries({ queryKey: ["banyera-data"], refetchType: "active" });
    void queryClient.invalidateQueries({ queryKey: ["registered-boats-report"], refetchType: "active" });
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
        queryClient.invalidateQueries({ queryKey: ["docking-lookups"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["dockings-calendar"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["banyera-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["registered-boats-report"], refetchType: "active" }),
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
    refreshBoatDependentModules();
  };

  const handleEditNoChanges = () => {
    showToast("info", "No Changes Made", "No changes were made. The record remains the same.");
  };

  const handleBoatImageUploaded = (updatedBoat) => {
    if (!updatedBoat?.boat_id) return;

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
              headerActionsSkeletonCount={isHeadViewOnly ? 2 : 3}
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
                  {!isHeadViewOnly ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearUniversalHighlight();
                        if (isTransactionLocked) {
                          showBottomToast("error", "Transactions Locked", transactionLockMessage);
                          return;
                        }
                        setAddBoatModalOpen(true);
                      }}
                      disabled={isTransactionLocked}
                      className="flex h-[42px] items-center justify-center gap-2 rounded-[10px] border-none px-4 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed"
                      style={{
                        fontFamily: RB_FONT,
                        backgroundColor: isTransactionLocked ? "#94a3b8" : "#1a1f36",
                        cursor: isTransactionLocked ? "not-allowed" : "pointer",
                      }}
                      onMouseEnter={(event) => {
                        if (!isTransactionLocked) event.currentTarget.style.backgroundColor = "#2d3561";
                      }}
                      onMouseLeave={(event) => {
                        if (!isTransactionLocked) event.currentTarget.style.backgroundColor = "#1a1f36";
                      }}
                    >
                      <IoAddOutline className="text-[16px]" />
                      <span>Add Boat</span>
                    </button>
                  ) : null}
                </>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 930 }}>
                  <thead>
                      <tr>
                        <RB_TH>Image</RB_TH><RB_TH>Boat Name</RB_TH><RB_TH>Type</RB_TH><RB_TH>Owner</RB_TH>
                        <RB_TH>Contact</RB_TH><RB_TH>Date Registered</RB_TH>{!isHeadViewOnly ? <RB_TH align="right">Action</RB_TH> : null}
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
                          {!isHeadViewOnly ? <td className="px-4 py-3"><div className="flex gap-2"><div className="w-8 h-8 rounded-lg bg-slate-100" /><div className="w-8 h-8 rounded-lg bg-slate-100" /></div></td> : null}
                        </tr>
                      ))
                    ) : paginated.length === 0 ? (
                      <tr><td colSpan={isHeadViewOnly ? 6 : 7}>
                        <NoDataFound title={search || statusFilter !== "all" || ownerFilter !== "all" || boatTypeFilter !== "all" ? "No results found" : "No Data Found"} />
                      </td></tr>
                    ) : paginated.map((boat, index) => {
                      const ownerName = RB_getOwnerName(boat.owner);
                      const boatType  = RB_getBoatType(boat);
                      const imageSrc  = RB_getBoatImageSrc(boat);
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
                          {!isHeadViewOnly ? (
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-start gap-2">
                                <Tooltip title={isTransactionLocked ? transactionLockMessage : "Edit"}>
                                  <button onClick={(e) => { e.stopPropagation(); if (isTransactionLocked) return; setEditingBoat(boat); setEditDrawerOpen(true); }}
                                    disabled={isTransactionLocked}
                                    className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer bg-white hover:bg-blue-50 transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:opacity-60"
                                    style={{ borderColor: isTransactionLocked ? undefined : "#1a1f36" }}
                                  ><IoCreateOutline style={{ fontSize: "15px", color: isTransactionLocked ? "#94a3b8" : "#1a1f36" }} /></button>
                                </Tooltip>
                                <Tooltip title={isTransactionLocked ? transactionLockMessage : "Archive"}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isTransactionLocked) return;
                                      setDeleteModal({ open: true, boat });
                                    }}
                                    disabled={isTransactionLocked}
                                    className={`w-8 h-8 rounded-lg border flex items-center justify-center bg-white transition-colors ${
                                      isTransactionLocked
                                        ? "cursor-not-allowed border-slate-200"
                                        : "cursor-pointer border-red-300 hover:bg-red-50"
                                    }`}
                                  >
                                    <IoArchiveOutline
                                      style={{
                                        fontSize: "15px",
                                        color: isTransactionLocked ? "#94a3b8" : "#ef4444",
                                      }}
                                    />
                                  </button>
                                </Tooltip>
                              </div>
                            </td>
                          ) : null}
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
      {!isHeadViewOnly ? <RB_EditBoatDrawer
        boat={editingBoat}
        open={editDrawerOpen}
        onClose={() => setEditDrawerOpen(false)}
        onSuccess={handleEditSuccess}
        onImageUploaded={handleBoatImageUploaded}
        onNoChanges={handleEditNoChanges}
        onError={(message) => showToast("error", "Update Failed", message)}
        boatTypes={boatTypes}
        owners={owners}
      /> : null}
      {!isHeadViewOnly ? <BA_AddBoatModal
        open={addBoatModalOpen}
        onClose={() => setAddBoatModalOpen(false)}
        boatTypes={boatTypes}
        owners={owners}
        loading={boatsQuery.isLoading && !boatsQuery.data}
        onSuccess={(createdBoat) => {
          setAddBoatModalOpen(false);
          if (createdBoat?.boat_id) {
            setBoats((prev) => [
              createdBoat,
              ...prev.filter((boat) => String(boat.boat_id) !== String(createdBoat.boat_id)),
            ].slice(0, RB_PAGE_SIZE));
          }
          void queryClient.invalidateQueries({ queryKey: ["boats"], refetchType: "active" });
          void queryClient.invalidateQueries({ queryKey: ["registered-boats-data"], refetchType: "active" });
          refreshBoatDependentModules();
        }}
      /> : null}
      {!isHeadViewOnly ? <ArchiveModal
        open={deleteModal.open}
        title="Archive Boat"
        itemName={deleteModal.boat?.boat_name ?? ""}
        onClose={() => setDeleteModal({ open: false, boat: null })}
        onConfirm={handleDelete}
      /> : null}
    </ConfigProvider>
  );
};

const RB_BoatDrawer = ({ boat, open, onClose }) => {
  if (!boat) return null;
  const ds        = RB_statusStyle(boat.status);
  const ownerName = RB_getOwnerName(boat.owner);
  const boatType  = RB_getBoatType(boat);
  const createdBy = RB_getCreatedBy(boat);
  const imageSrc  = RB_getBoatImageSrc(boat);
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
  const imageSrc = RB_getBoatImageSrc(boat);
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
  <FilterButton value={value} onChange={onChange} options={options} height={height} width={160} />
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
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery("boat-management");
  const isHeadViewOnly = isHeadRole();
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
    if (isHeadViewOnly) return;
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
        queryClient.invalidateQueries({ queryKey: ["registered-boats-report"], refetchType: "active" }),
      ]);
    } catch (err) {
      setAddError(err.response?.data?.message ?? "Failed to add boat type.");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async () => {
    if (isHeadViewOnly) return;
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
        queryClient.invalidateQueries({ queryKey: ["registered-boats-report"], refetchType: "active" }),
      ]);
    } catch (err) {
      setEditError(err.response?.data?.message ?? "Failed to update boat type.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (isHeadViewOnly) return;
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
        queryClient.invalidateQueries({ queryKey: ["registered-boats-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["archives-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["registered-boats-report"], refetchType: "active" }),
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
              headerActionsSkeletonCount={isHeadViewOnly ? 2 : 3}
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
                  {!isHeadViewOnly ? (
                    <button
                      onClick={() => { clearUniversalHighlight(); if (!isTransactionLocked) { setAddName(""); setAddError(""); setShowAddModal(true); } else showToast("error", "Transactions Locked", transactionLockMessage); }}
                      disabled={isTransactionLocked}
                      className="ml-1 flex items-center gap-1.5 px-4 py-2 rounded-lg border-none bg-[#1a1f36] cursor-pointer text-[13px] font-semibold text-white hover:bg-[#2d3561] transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                      style={{ fontFamily: BT_FONT, height: 42 }}
                    >
                      <IoAddOutline className="text-[17px]" /> Add Boat Type
                    </button>
                  ) : null}
                </>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: isHeadViewOnly ? 440 : 540 }}>
                  <colgroup>
                    <col style={{ width: isHeadViewOnly ? "68%" : "56%" }} />
                    <col style={{ width: isHeadViewOnly ? "32%" : "24%" }} />
                    {!isHeadViewOnly ? <col style={{ width: "20%" }} /> : null}
                  </colgroup>
                  <thead>
                    <tr>
                      <BT_TH>Type Name</BT_TH>
                      <BT_TH><div className="text-center">Usage Count</div></BT_TH>
                      {!isHeadViewOnly ? <BT_TH>Action</BT_TH> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {fetching ? (
                      Array.from({ length: BT_PAGE_SIZE }).map((_, i) => (
                        <tr key={i} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-32" /></td>
                          <td className="px-4 py-3"><div className="mx-auto h-5 w-16 rounded bg-slate-100" /></td>
                          {!isHeadViewOnly ? <td className="px-4 py-3"><div className="flex gap-2"><div className="w-8 h-8 rounded-lg bg-slate-100" /><div className="w-8 h-8 rounded-lg bg-slate-100" /></div></td> : null}
                        </tr>
                      ))
                    ) : paginated.length === 0 ? (
                      <tr>
                        <td colSpan={isHeadViewOnly ? 2 : 3}>
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
                          <td className="px-4 py-3 text-center text-[13px]">
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
                          {!isHeadViewOnly ? (
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
                                <Tooltip title={isTransactionLocked ? transactionLockMessage : "Archive"}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isTransactionLocked) return;
                                      setDeleteTarget(type);
                                    }}
                                    disabled={isTransactionLocked}
                                    className={`w-8 h-8 rounded-lg border flex items-center justify-center bg-white transition-colors ${
                                      isTransactionLocked
                                        ? "cursor-not-allowed border-slate-200"
                                        : "cursor-pointer border-red-300 hover:bg-red-50"
                                    }`}
                                  >
                                    <IoArchiveOutline
                                      style={{
                                        fontSize: "15px",
                                        color: isTransactionLocked ? "#94a3b8" : "#ef4444",
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
            </Tabs>
            </div>
          </main>
        </div>
      </div>

      {!isHeadViewOnly && showAddModal && (
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

      {!isHeadViewOnly && editTarget && (
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

      {!isHeadViewOnly ? <ArchiveModal
        open={!!deleteTarget}
        title="Archive Boat Type"
        itemName={deleteTarget?.type_name ?? ""}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        fontFamily={BT_FONT}
      /> : null}
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
  <FilterButton value={value} onChange={onChange} options={options} height={height} width={160} />
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

const BO_TermsAndAgreementModal = ({ owner, open, onClose }) => {
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !owner) {
      setPdfFile((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return null;
      });
      setLoading(false);
      return undefined;
    }

    let isActive = true;
    let nextUrl = "";

    setPdfFile((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });

    const generateTermsPdf = async () => {
      setLoading(true);
      try {
        const hasPermanentSignature = Boolean(owner.owner_signature_data_url);
        let signatureAudits = [];

        if (owner.owner_id) {
          try {
            const response = await api.get(`/boat-owners/${owner.owner_id}/signature-audits`);
            signatureAudits = Array.isArray(response.data) ? response.data : [];
          } catch (error) {
            console.error("Failed to load owner signature audit history", error);
          }
        }

        let agreementBoatName = "";
        if (owner.owner_id) {
          try {
            const response = await api.get("/boat-management", {
              params: {
                include_boats: 1,
                include_boat_types: 0,
                include_owners: 0,
                boats_paginated: 0,
                owner: owner.owner_id,
              },
            });
            const boatNames = (response.data?.boats ?? [])
              .map((boat) => String(boat?.boat_name ?? "").trim())
              .filter(Boolean);
            agreementBoatName = Array.from(new Set(boatNames)).join(", ");
          } catch (error) {
            console.error("Failed to load owner boats for agreement PDF", error);
          }
        }

        const pdfBytes = await buildTermsAndAgreementPdf({
          owner,
          ownerName: BO_getFullName(owner),
          boatName: agreementBoatName,
          date: hasPermanentSignature ? owner.owner_signature_signed_at || "" : "",
          signatureDataUrl: hasPermanentSignature ? owner.owner_signature_data_url || "" : "",
          inspector: hasPermanentSignature
            ? owner.owner_signature_updated_by_user || owner.ownerSignatureUpdatedByUser || owner.ownerSignatureUpdatedBy || null
            : null,
          signatureAudits,
        });

        if (!isActive) return;

        const nextData =
          pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
        const safeOwnerName = BO_getFullName(owner)
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "boat-owner";
        const filename = `terms-and-agreement-${safeOwnerName}.pdf`;
        const file = new File([nextData], filename, {
          type: "application/pdf",
        });

        nextUrl = URL.createObjectURL(file);
        setPdfFile({ url: nextUrl, filename });
      } catch (error) {
        console.error("Failed to generate terms and agreement PDF", error);
        if (isActive) setPdfFile(null);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    generateTermsPdf();

    return () => {
      isActive = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [open, owner]);

  if (!open) return null;

  return (
    <Modal
      title="Terms and Agreement"
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
            title={`Terms and Agreement ${BO_getFullName(owner)}`}
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

const BO_OwnerDetailsDrawer = ({ owner, open, onClose }) => {
  const [termsOpen, setTermsOpen] = useState(false);

  if (!owner) return null;

  return (
    <>
      <DetailDrawer
        open={open}
        onClose={onClose}
        width={460}
        fontFamily={BO_FONT}
        title="Owner Details"
        subtitle="Review the selected boat owner record."
        icon={IoPersonOutline}
        footer={
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                onClose?.();
                setTermsOpen(true);
              }}
              className="inline-flex min-w-[260px] items-center justify-center gap-2 rounded-[10px] border border-[#1a1f36] bg-white px-4 py-2.5 text-[12px] font-semibold text-[#1a1f36] transition-colors hover:bg-slate-50"
              style={{ fontFamily: BO_FONT }}
            >
              <IoDocumentTextOutline className="text-[16px]" />
              View Terms and Agreement
            </button>
          </div>
        }
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

      <BO_TermsAndAgreementModal
        owner={owner}
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
      />
    </>
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
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery("boat-management");
  const isHeadViewOnly = isHeadRole();
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
    if (isHeadViewOnly) return;
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
      void queryClient.invalidateQueries({ queryKey: ["registered-boats-report"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["owner-info-report"], refetchType: "active" });
    } catch (err) {
      showToast("error", "Failed to Add", err.response?.data?.message ?? "Failed to add owner.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (form) => {
    if (isHeadViewOnly) return;
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
        queryClient.invalidateQueries({ queryKey: ["registered-boats-report"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["owner-info-report"], refetchType: "active" }),
      ]);
    } catch (err) {
      showToast("error", "Failed to Update", err.response?.data?.message ?? "Failed to update owner.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isHeadViewOnly) return;
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
        queryClient.invalidateQueries({ queryKey: ["registered-boats-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["archives-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["dockings-data"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["registered-boats-report"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["owner-info-report"], refetchType: "active" }),
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
              headerActionsSkeletonCount={isHeadViewOnly ? 2 : 3}
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
                  {!isHeadViewOnly ? (
                    <button
                      onClick={() => { clearUniversalHighlight(); if (!isTransactionLocked) setAddModal(true); else showToast("error", "Transactions Locked", transactionLockMessage); }}
                      disabled={isTransactionLocked}
                      className="ml-1 flex items-center gap-1.5 px-4 py-2 rounded-lg border-none bg-[#1a1f36] cursor-pointer text-[13px] font-semibold text-white hover:bg-[#2d3561] transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                      style={{ fontFamily: BO_FONT, height: 42 }}
                    >
                      <IoAddOutline className="text-[17px]" /> Add Owner
                    </button>
                  ) : null}
                </>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                  <colgroup>
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "22%" }} />
                    {!isHeadViewOnly ? <col style={{ width: "14%" }} /> : null}
                    <col style={{ width: "14%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <BO_TH>Owner Name</BO_TH>
                      <BO_TH>Address</BO_TH>
                      <BO_TH>Contact</BO_TH>
                      <BO_TH>Usage Count</BO_TH>
                      {!isHeadViewOnly ? <BO_TH>Action</BO_TH> : null}
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
                          {!isHeadViewOnly ? <td className="px-4 py-3"><div className="flex gap-2"><div className="w-8 h-8 rounded-lg bg-slate-100" /><div className="w-8 h-8 rounded-lg bg-slate-100" /></div></td> : null}
                        </tr>
                      ))
                    ) : paginated.length === 0 ? (
                      <tr>
                        <td colSpan={isHeadViewOnly ? 4 : 5}>
                          <NoDataFound title={search || ownerStatusFilter !== "all" ? "No results found" : "No Data Found"} />
                        </td>
                      </tr>
                    ) : (
                      paginated.map((owner, index) => {
                        const fullName = BO_getFullName(owner);
                        const usageCount = BO_getUsageCount(owner);
                        const isArchivedOwner = Boolean(owner?.deleted_at);
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
                            {!isHeadViewOnly ? (
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
                                        : isArchivedOwner
                                          ? "Already archived"
                                          : "Archive"
                                    }
                                  >
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isTransactionLocked || isArchivedOwner) return;
                                        setDeleteOwner(owner);
                                      }}
                                      disabled={isTransactionLocked || isArchivedOwner}
                                      className={`w-8 h-8 rounded-lg border flex items-center justify-center bg-white transition-colors ${
                                        isTransactionLocked || isArchivedOwner
                                          ? "cursor-not-allowed border-slate-200"
                                          : "cursor-pointer border-red-300 hover:bg-red-50"
                                      }`}
                                    >
                                      <IoArchiveOutline
                                        style={{
                                          fontSize: "15px",
                                          color: isTransactionLocked || isArchivedOwner ? "#94a3b8" : "#ef4444",
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
            </Tabs>
            </div>
          </main>
        </div>
      </div>

      {!isHeadViewOnly ? <BO_OwnerDrawer
        open={addModal}
        onClose={() => setAddModal(false)}
        onSave={handleAdd}
        saving={saving}
      /> : null}

      {!isHeadViewOnly ? <BO_OwnerDrawer
        owner={editOwner}
        open={!!editOwner}
        onClose={() => setEditOwner(null)}
        onNoChanges={() => {
          setEditOwner(null);
          showToast("info", "No Changes Made", "No changes were made. The record remains the same.");
        }}
        onSave={handleEdit}
        saving={saving}
      /> : null}

      {/* Archive Confirmation Modal */}
      {!isHeadViewOnly && deleteOwner && (
        <ArchiveModal
          open={!!deleteOwner}
          title="Archive Owner"
          itemName={BO_getFullName(deleteOwner)}
          onClose={() => setDeleteOwner(null)}
          onConfirm={handleDelete}
          saving={saving}
          fontFamily={BO_FONT}
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
  { value: "expired", label: "Expired", active: "border-red-500 bg-red-50 text-red-700" },
  { value: "suspended", label: "Suspended", active: "border-amber-500 bg-amber-50 text-amber-700" },
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

const BA_Label = ({ children, required }) => (
  <label className="mb-1.5 block text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: BA_FONT }}>
    {children}
    {required && <span className="ml-0.5 text-red-500">*</span>}
  </label>
);

const BA_Input = React.forwardRef(({ icon: Icon, readOnly = false, error = false, wrapperClassName = "", ...props }, ref) => (
  <div
    className={`flex items-center gap-2.5 px-3.5 border transition-all bg-white ${error && !readOnly ? "border-red-300" : readOnly ? "border-slate-200" : "border-slate-200 focus-within:border-[#4096ff]"} ${wrapperClassName}`}
    style={{ height: 46, borderRadius: 10 }}
  >
    {Icon && <Icon className="text-[15px] text-slate-400 flex-shrink-0" />}
    <input
      ref={ref}
      readOnly={readOnly}
      {...props}
      className={`h-full w-full border-none bg-transparent text-[13px] font-medium outline-none placeholder:font-normal placeholder:text-slate-400 ${readOnly ? "cursor-default text-[#0d1117]" : "text-[#0d1117]"}`}
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

const BA_AddBoatModal = ({ open, onClose, onSuccess, boatTypes = [], owners = [], loading = false }) => {
  const queryClient = useQueryClient();
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery("boat-management");
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

  const handleReset = useCallback(() => {
    setForm({
      boat_name: "",
      boat_type_id: "",
      status: "active",
      owner_id: "",
      image_preview: null,
      image_path: "",
    });
    setImageFile(null);
    setLightbox(false);
    setErrors({});
  }, []);

  useEffect(() => {
    if (open) return;
    handleReset();
  }, [handleReset, open]);

  if (!open) return null;

  const selectedOwner = owners.find((owner) => String(owner.owner_id) === String(form.owner_id));

  const setField = (key) => (event) => {
    const nextValue = key === "boat_name" ? event.target.value.toUpperCase() : event.target.value;
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

    try {
      const response = await api.post("/boats", {
        boat_name: form.boat_name.trim(),
        boat_type_id: form.boat_type_id,
        owner_id: form.owner_id,
        status: form.status,
      });

      let createdBoat = {
        ...response.data,
        status: response.data?.status ?? form.status,
      };

      addRegisteredBoatToDataCache(queryClient, createdBoat);
      handleReset();
      showAddedToast("Boat", "boat");
      onSuccess?.(createdBoat);
      uploadBoatImageInBackground({
        queryClient,
        boat: createdBoat,
        imageFile,
        onUploaded: onSuccess,
      });
    } catch (error) {
      showBottomToast("error", "Registration Failed", error.response?.data?.message ?? "Failed to register boat. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConfigProvider theme={BA_antTheme}>
      <style>{`
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
        .boat-ant-select-error .ant-select-selector,
        .boat-ant-select-error.ant-select-focused .ant-select-selector,
        .boat-ant-select-error.ant-select-open .ant-select-selector,
        .boat-ant-select-error .ant-select-selector:hover {
          border-color: #fca5a5 !important;
        }
      `}</style>
      <Modal
        title="Add Boat"
        onClose={submitting ? undefined : onClose}
        onCancel={onClose}
        onSave={handleSubmit}
        saving={submitting}
        saveDisabled={submitting || isTransactionLocked || loading}
        saveLabel="Save"
        saveButtonWidth="170px"
        closeButtonWidth="170px"
        maxWidth="980px"
        minimumSavingMs={0}
        closeOnBackdrop
        bodyClassName="max-h-[64vh] overflow-y-auto !p-5"
      >
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card
            icon={IoImageOutline}
            title="BOAT IMAGE"
            subtitle="Upload a photo of the boat."
            loading={loading}
            skeletonLayout={[
              { type: "upload", height: "h-[180px]" },
              { type: "button" },
            ]}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => handleImageFile(event.target.files?.[0])}
              className="hidden"
            />
            {form.image_preview ? (
              <div className="flex flex-col gap-3">
                <div className="relative overflow-hidden rounded-[10px] border border-gray-200 bg-black">
                  <img src={form.image_preview} alt="Boat preview" className="block w-full object-contain" style={{ maxHeight: 280 }} />
                  <div
                    className="absolute left-0 right-0 top-0 flex items-center justify-between px-3 py-2.5"
                    style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
                  >
                    <div />
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setLightbox(true)} className="flex h-7 w-7 items-center justify-center rounded-[10px] border-none bg-white/20 text-white cursor-pointer transition-colors hover:bg-white/35">
                        <IoExpandOutline className="text-[14px]" />
                      </button>
                      <button
                        type="button"
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
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-[10px] border border-dashed border-gray-300 bg-[#fafbfc] py-2.5 text-[13px] font-medium text-gray-500 cursor-pointer transition-all hover:border-[#4096ff] hover:bg-blue-50 hover:text-[#4096ff]"
                >
                  Change Image
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleImageFile(event.dataTransfer.files?.[0]);
                }}
                onDragOver={(event) => event.preventDefault()}
                className="flex min-h-[252px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[10px] border-2 border-dashed border-gray-300 bg-[#fafbfc] px-5 py-10 transition-colors hover:border-[#4096ff] hover:bg-blue-50"
              >
                <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[10px] bg-blue-50">
                  <IoCloudUploadOutline className="text-[26px] text-blue-500" />
                </div>
                <p className="m-0 text-center text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Click to upload boat image</p>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6">
            <Card
              icon={IoBoatOutline}
              title="BOAT INFORMATION"
              subtitle="Basic details about the boat."
              loading={loading}
              skeletonLayout={[
                { type: "fields", count: 2, columns: 2 },
                { type: "segmented", count: 4, columns: 4 },
              ]}
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
                    optionFilterProp="searchLabel"
                    value={form.boat_type_id || undefined}
                    onChange={handleBoatTypeSelect}
                    filterOption={(input, option) => (option?.searchLabel ?? "").toLowerCase().includes(input.toLowerCase())}
                    options={boatTypes.map((type) => ({
                      value: type.boat_type_id,
                      label: type.type_name,
                      searchLabel: type.type_name,
                    }))}
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
                        type="button"
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
              title="OWNER INFORMATION"
              subtitle="Details about the boat owner."
              loading={loading}
              skeletonLayout={[
                { type: "fields", count: 1, columns: 1 },
                { type: "fields", count: 2, columns: 2 },
              ]}
            >
              <div className="mb-4" ref={ownerRef}>
                <BA_Label required>Owner Name</BA_Label>
                {owners.length === 0 ? (
                  <div className="flex h-[46px] items-center rounded-[10px] border border-gray-200 bg-gray-50 px-3.5">
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
                    optionFilterProp="searchLabel"
                    value={form.owner_id || undefined}
                    onChange={handleOwnerSelect}
                    filterOption={(input, option) => (option?.searchLabel ?? "").toLowerCase().includes(input.toLowerCase())}
                    options={owners.map((owner) => ({
                      value: owner.owner_id,
                      label: BA_getOwnerLabel(owner),
                      searchLabel: BA_getOwnerLabel(owner),
                    }))}
                  />
                )}
                <BA_FieldError msg={errors.owner_id} />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <BA_Label>Owner Address</BA_Label>
                  <BA_Input value={selectedOwner?.address ?? ""} readOnly wrapperClassName="!bg-slate-100" />
                </div>
                <div>
                  <BA_Label>Contact Number</BA_Label>
                  <BA_Input value={selectedOwner?.contact_number ?? ""} readOnly wrapperClassName="!bg-slate-100" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </Modal>
      {lightbox && form.image_preview ? <BA_Lightbox src={form.image_preview} onClose={() => setLightbox(false)} /> : null}
    </ConfigProvider>
  );
};

const BoatManagement = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const resolveBoatTab = useCallback((path) => {
    if (path === "/boat-type") return "/boat-type";
    if (path === "/boat-owners") return "/boat-owners";
    if (path === "/registered-boats") return getCachedTab(BOAT_MANAGEMENT_TAB_STORAGE_KEY, BOAT_MANAGEMENT_TAB_KEYS, "/registered-boats");
    return "/registered-boats";
  }, []);
  const [activeBoatTab, setActiveBoatTab] = useState(() => resolveBoatTab(pathname));

  useEffect(() => {
    const nextTab = resolveBoatTab(pathname);
    setActiveBoatTab(nextTab);
    cacheTab(BOAT_MANAGEMENT_TAB_STORAGE_KEY, nextTab, BOAT_MANAGEMENT_TAB_KEYS);

    if (pathname === "/registered-boats" && nextTab !== pathname) {
      navigate(nextTab, { replace: true });
    }
  }, [navigate, pathname, resolveBoatTab]);

  const handleBoatTabChange = useCallback((nextTab) => {
    setActiveBoatTab(nextTab);
    cacheTab(BOAT_MANAGEMENT_TAB_STORAGE_KEY, nextTab, BOAT_MANAGEMENT_TAB_KEYS);

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
          openAddBoatOnMount={pathname === "/add-boat"}
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
    </>
  );
};

export default BoatManagement;
