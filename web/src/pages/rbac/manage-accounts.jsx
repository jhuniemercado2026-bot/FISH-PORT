import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ConfigProvider, Select } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import "typeface-montserrat";
import {
  IoAddOutline,
  IoAlertCircleOutline,
  IoCallOutline,
  IoCheckmarkOutline,
  IoChevronDownOutline,
  IoCloseOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoKeyOutline,
  IoMailOutline,
  IoPaperPlaneOutline,
  IoPeopleOutline,
  IoPersonOutline,
  IoSearchOutline,
  IoShieldCheckmarkOutline,
  IoTimeOutline,
  IoTrashOutline,
  IoLocationOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import StatusPill from "../../components/StatusPill";
import FilterSelect from "../../components/FilterSelect";
import Legend from "../../components/Legend";
import Modal from "../../components/Modal";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Tabs from "../../components/Tabs";
import BirthdayPicker from "../../components/BirthdayPicker";
import DetailDrawer, { DrawerInfoCard, DrawerSection } from "../../components/Drawer";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import NoDataFound from "../../components/NoDataFound";
import { showAddedToast, showBottomToast } from "../../store/bottomToastStore";
import api from "../../api/axios";
import { USERS_QUERY_KEY, useUsersPageQuery } from "../../hooks/useUsersQuery";
import { useSidebar } from "../../store/sidebarStore";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";

const FONT = "'Montserrat', sans-serif";

const antTheme = {
  token: { colorPrimary: "#4096ff", borderRadius: 12, fontFamily: FONT },
  components: {
    Select: {
      optionSelectedBg: "#1a1f36",
      optionSelectedColor: "#ffffff",
      optionActiveBg: "#f8fafc",
      optionFontSize: 13,
    },
  },
};

const ROLE_OPTIONS = [
  { value: "head", label: "Head of MEEO" },
  { value: "coordinator", label: "Coordinator" },
  { value: "inspector", label: "Inspector" },
];

const USER_CREATION_ROLE_OPTIONS = ROLE_OPTIONS.filter((option) => option.value !== "head");

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "deactivated", label: "Deactivated" },
];

const ACCOUNT_STATUS_LEGEND = [
  { key: "active", label: "Active", color: "#16a34a" },
  { key: "deactivated", label: "Deactivated", color: "#dc2626" },
];

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All Roles" },
  ...ROLE_OPTIONS,
];

const PAGE_SIZE = 10;
const PAGE_DEBOUNCE_MS = 150;
const SEARCH_DEBOUNCE_MS = 300;

const getAccountHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Manage Accounts" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("user-") ? rawId.slice("user-".length) : "";
};

const ACCOUNT_TABS = [
  { key: "directory", label: "Account Directory", icon: IoPeopleOutline },
];

const generatePasswordValue = () => {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "@#$%&*";
  const all = uppercase + lowercase + numbers + symbols;

  const requiredChars = [
    uppercase[Math.floor(Math.random() * uppercase.length)],
    lowercase[Math.floor(Math.random() * lowercase.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  const targetLength = Math.random() < 0.5 ? 8 : 10;

  while (requiredChars.length < targetLength) {
    requiredChars.push(all[Math.floor(Math.random() * all.length)]);
  }

  return requiredChars.sort(() => Math.random() - 0.5).join("");
};


const TailDropdown = ({ value, onChange, options, height = 42, minWidth = 150 }) => (
  <FilterSelect value={value} onChange={onChange} options={options} height={height} width={minWidth} />
);

const TH = ({ children }) => (
  <th className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#1a1f36", backgroundColor: "#ffffff", borderBottom: "2px solid #e5e7eb" }}>
    {children}
  </th>
);

const FieldError = ({ message }) => message ? (
  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 mt-2">
    <IoAlertCircleOutline className="text-red-400 text-[14px] flex-shrink-0" />
    <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>{message}</p>
  </div>
) : null;

const ModalInput = ({ label, value, onChange, placeholder, type = "text", icon: Icon, required = false, autoComplete = "off", error = "" }) => (
  <div>
    <p className="m-0 mb-2 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>
      {label}{required && <span className="text-red-500 ml-0.5"> *</span>}
    </p>
    <div
      className={`flex items-center gap-3 px-4 rounded-xl border bg-white transition-all ${error ? "border-red-300" : "border-slate-200 focus-within:border-[#4096ff]"}`}
      style={{ height: 46 }}
    >
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="border-none outline-none text-[14px] font-medium w-full bg-transparent placeholder:font-normal placeholder:text-slate-400"
        style={{ fontFamily: FONT, color: "#0d1117" }}
      />
    </div>
  </div>
);

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getFullName = (user) => user?.full_name || `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "—";

const getAccountLabel = (user) => user?.role_label || user?.role || "User";

const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
};


const StatusToggle = ({ active, loading, disabled = false, disabledReason = "", onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={loading || disabled}
    className="relative flex h-10 w-[132px] items-center rounded-full border p-1 transition-all cursor-pointer disabled:cursor-not-allowed"
    style={{
      borderColor: loading || disabled ? "#cbd5e1" : active ? "#86efac" : "#fca5a5",
      backgroundColor: loading || disabled ? "#f8fafc" : active ? "#f0fdf4" : "#fef2f2",
      opacity: loading || disabled ? 0.6 : 1,
      fontFamily: FONT,
    }}
    title={disabled ? disabledReason || "Transactions are locked" : active ? "Deactivate user" : "Activate user"}
  >
    <span
      className="absolute inset-y-1 flex w-[60px] items-center justify-center rounded-full text-[12px] font-semibold transition-all"
      style={{
        left: active ? "6px" : "calc(100% - 66px)",
        backgroundColor: loading || disabled ? "#94a3b8" : active ? "#16a34a" : "#dc2626",
        color: "#ffffff",
      }}
    >
      {active ? "ON" : "OFF"}
    </span>
    <span className="flex w-full items-center justify-between px-3.5 text-[11px] font-semibold tracking-[0.12em]">
      <span style={{ color: active ? "#16a34a" : "#94a3b8" }}>ON</span>
      <span style={{ color: active ? "#94a3b8" : "#dc2626" }}>OFF</span>
    </span>
  </button>
);

const AddUserModal = ({ open, onClose, onSave, saving, error, setError }) => {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    role: "",
    gender: "",
    contact_number: "",
    birthday: "",
    address: "",
    password: "",
    password_confirmation: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        role: "",
        gender: "",
        contact_number: "",
        birthday: "",
        address: "",
        password: "",
        password_confirmation: "",
      });
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  }, [open]);

  const updateFormField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError((prev) => ({ ...prev, [field]: undefined }));
  };

  if (!open) return null;

  return (
    <Modal
      title="Add User (Manual Creation)"
      onClose={onClose}
      onSave={() => onSave(form)}
      saving={saving}
      saveLabel="Add"
      closeOnBackdrop
      maxWidth="560px"
      saveButtonWidth="120px"
    >
          <div className="flex flex-col gap-5">
            <div>
              <ModalInput label="First Name" required icon={IoPersonOutline} value={form.first_name} onChange={(e) => updateFormField("first_name", e.target.value)} placeholder="Enter first name" error={error?.first_name?.[0]} />
              <FieldError message={error?.first_name?.[0]} />
            </div>
            <div>
              <ModalInput label="Last Name" required icon={IoPersonOutline} value={form.last_name} onChange={(e) => updateFormField("last_name", e.target.value)} placeholder="Enter last name" error={error?.last_name?.[0]} />
              <FieldError message={error?.last_name?.[0]} />
            </div>
            <div>
              <p className="m-0 mb-2 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Role <span className="text-red-500 ml-0.5"> *</span></p>
              <div className={error?.role?.[0] ? "modal-field-control-error" : ""}>
                <FilterSelect width="100%" height={46} value={form.role || undefined} options={USER_CREATION_ROLE_OPTIONS} placeholder="Select role" onChange={(value) => updateFormField("role", value ?? "")} getPopupContainer={() => document.body} placement="bottomLeft" />
              </div>
              <FieldError message={error?.role?.[0]} />
            </div>
            <div>
              <p className="m-0 mb-2 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Gender <span className="text-red-500 ml-0.5"> *</span></p>
              <div className={error?.gender?.[0] ? "modal-field-control-error" : ""}>
                <FilterSelect width="100%" height={46} value={form.gender || undefined} options={GENDER_OPTIONS} placeholder="Select gender" allowClear onChange={(value) => updateFormField("gender", value ?? "")} getPopupContainer={() => document.body} placement="bottomLeft" />
              </div>
              <FieldError message={error?.gender?.[0]} />
            </div>
            <div>
              <ModalInput
                label="Contact Number"
                required
                icon={IoCallOutline}
                value={form.contact_number}
                onChange={(e) => updateFormField("contact_number", e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="Enter contact number"
                error={error?.contact_number?.[0]}
              />
              <FieldError message={error?.contact_number?.[0]} />
            </div>
            <div>
              <p className="m-0 mb-2 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>
                Birthday <span className="text-red-500 ml-0.5"> *</span>
              </p>
              <BirthdayPicker
                value={form.birthday || ""}
                onChange={(_, currentDateString) => updateFormField("birthday", currentDateString || "")}
                placeholder="Select birthday"
                containerClassName="w-full"
                inputClassName={error?.birthday?.[0] ? "border-red-300" : "border-slate-200"}
              />
              <FieldError message={error?.birthday?.[0]} />
            </div>
            <div>
              <ModalInput label="Address" required icon={IoLocationOutline} value={form.address} onChange={(e) => updateFormField("address", e.target.value)} placeholder="Enter address" error={error?.address?.[0]} />
              <FieldError message={error?.address?.[0]} />
            </div>
            <div>
              <ModalInput label="Email" required icon={IoMailOutline} value={form.email} onChange={(e) => updateFormField("email", e.target.value)} placeholder="Enter email address" type="email" autoComplete="off" error={error?.email?.[0]} />
              <FieldError message={error?.email?.[0]} />
            </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <p className="m-0 text-[13px] font-semibold" style={{ color: "#1a1f36" }}>Password Setup</p>
                    <p className="m-0 mt-1 text-[12px]" style={{ color: "#64748b" }}>
                      Generate a secure password first, then review the account before using the email action.
                    </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const generated = generatePasswordValue();
                    setForm((prev) => ({
                      ...prev,
                      password: generated,
                      password_confirmation: generated,
                    }));
                    setError((prev) => ({
                      ...prev,
                      password: undefined,
                      password_confirmation: undefined,
                    }));
                  }}
                    className="flex h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold cursor-pointer transition-colors hover:bg-slate-100"
                    style={{ color: "#1a1f36", fontFamily: FONT }}
                  >
                    <IoKeyOutline className="text-[15px]" />
                    Generate Password
                  </button>
              </div>
            </div>
            <div>
              <p className="m-0 mb-2 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>
                Password <span className="text-red-500 ml-0.5"> *</span>
              </p>
              <div
                className={`flex items-center gap-3 px-4 rounded-xl border bg-white transition-all ${error?.password?.[0] ? "border-red-300" : "border-slate-200 focus-within:border-[#4096ff]"}`}
                style={{ height: 46 }}
              >
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => updateFormField("password", e.target.value)}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  className="border-none outline-none text-[14px] font-medium w-full bg-transparent"
                  style={{ fontFamily: FONT, color: "#0d1117" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="flex items-center justify-center border-none bg-transparent cursor-pointer text-slate-400 hover:text-slate-600 p-0"
                >
                  {showPassword ? <IoEyeOffOutline className="text-[18px]" /> : <IoEyeOutline className="text-[18px]" />}
                </button>
              </div>
              <FieldError message={error?.password?.[0]} />
            </div>
            <div>
              <p className="m-0 mb-2 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>
                Confirm Password <span className="text-red-500 ml-0.5"> *</span>
              </p>
              <div
                className={`flex items-center gap-3 px-4 rounded-xl border bg-white transition-all ${error?.password_confirmation?.[0] ? "border-red-300" : "border-slate-200 focus-within:border-[#4096ff]"}`}
                style={{ height: 46 }}
              >
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.password_confirmation}
                  onChange={(e) => updateFormField("password_confirmation", e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  className="border-none outline-none text-[14px] font-medium w-full bg-transparent"
                  style={{ fontFamily: FONT, color: "#0d1117" }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="flex items-center justify-center border-none bg-transparent cursor-pointer text-slate-400 hover:text-slate-600 p-0"
                >
                  {showConfirmPassword ? <IoEyeOffOutline className="text-[18px]" /> : <IoEyeOutline className="text-[18px]" />}
                </button>
              </div>
              <FieldError message={error?.password_confirmation?.[0]} />
            </div>
          </div>
    </Modal>
  );
};

const SendUserEmailModal = ({ open, onClose, onSend, sending, error, setError }) => {
  const [form, setForm] = useState({
    email: "",
    role: "",
    password: "",
    password_confirmation: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (open) {
      // Auto-generate password when modal opens
      const generated = generatePasswordValue();
      setForm({
        email: "",
        role: "",
        password: generated,
        password_confirmation: generated,
      });
      setShowPassword(false);
      setError({});
    }
  }, [open, setError]);

  const updateInviteField = (field, value) => {
    setForm((prev) => {
      if (field === "password") {
        return { ...prev, password: value, password_confirmation: value };
      }

      return { ...prev, [field]: value };
    });
    setError((prev) => ({
      ...prev,
      [field]: undefined,
      ...(field === "password" ? { password_confirmation: undefined } : {}),
    }));
  };

  if (!open) return null;

  return (
    <Modal
      title="Add User (Email Invitation)"
      onClose={onClose}
      onSave={() => onSend(form)}
      saving={sending}
      saveLabel="Send"
      savingLabel="Sending..."
      closeOnBackdrop
      maxWidth="560px"
      saveButtonWidth="130px"
    >
            <div className="grid grid-cols-1 gap-5">
              <div>
                <p className="m-0 mb-2 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Role <span className="text-red-500 ml-0.5"> *</span></p>
              <div className={error?.role?.[0] ? "modal-field-control-error" : ""}>
                <FilterSelect
                  width="100%"
                  height={46}
                  value={form.role || undefined}
                  options={USER_CREATION_ROLE_OPTIONS}
                  placeholder="Select role"
                  onChange={(value) => updateInviteField("role", value ?? "")}
                  getPopupContainer={() => document.body}
                  placement="bottomLeft"
                />
              </div>
              <FieldError message={error?.role?.[0]} />
            </div>
            <div>
              <ModalInput
                label="Email"
                required
                icon={IoMailOutline}
                value={form.email}
                onChange={(e) => updateInviteField("email", e.target.value)}
                placeholder="Enter email address"
                type="email"
                autoComplete="off"
                error={error?.email?.[0]}
              />
              <FieldError message={error?.email?.[0]} />
            </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <p className="m-0 text-[13px] font-semibold" style={{ color: "#1a1f36" }}>Generated Password</p>
                    <p className="m-0 mt-1 text-[12px]" style={{ color: "#64748b" }}>
                      Enter your own password or generate a secure one for the email invitation.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 px-4 rounded-xl border border-slate-200 bg-white" style={{ height: 46 }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => updateInviteField("password", e.target.value)}
                      placeholder="Enter or generate password"
                      autoComplete="new-password"
                      className="border-none outline-none text-[14px] font-medium w-full bg-transparent"
                      style={{ fontFamily: FONT, color: "#0d1117" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="flex items-center justify-center border-none bg-transparent cursor-pointer text-slate-400 hover:text-slate-600 p-0"
                    >
                      {showPassword ? <IoEyeOffOutline className="text-[18px]" /> : <IoEyeOutline className="text-[18px]" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generatePasswordValue();
                      setForm((prev) => ({
                        ...prev,
                        password: generated,
                        password_confirmation: generated,
                      }));
                      setError((prev) => ({ ...prev, password: undefined, password_confirmation: undefined }));
                    }}
                    className="flex h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold cursor-pointer transition-colors hover:bg-slate-100"
                    style={{ color: "#1a1f36", fontFamily: FONT }}
                  >
                    <IoKeyOutline className="text-[15px]" />
                    Regenerate Password
                  </button>
                </div>
              </div>
          </div>
    </Modal>
  );
};

const AccountDetailsDrawer = ({ user, open, onClose }) => {
  if (!user) return null;

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={440}
      fontFamily={FONT}
      title="Account Details"
      subtitle="Review the selected account record."
      icon={IoPeopleOutline}
    >
      <DrawerSection
        icon={IoShieldCheckmarkOutline}
        title="Account Information"
        subtitle="Current user account details"
        fontFamily={FONT}
      >
        <div className="grid grid-cols-1 gap-3">
          {[
            { label: "Full Name", value: getFullName(user) },
            { label: "Email", value: user.email },
            { label: "Contact Number", value: user.contact_number ?? "-" },
            { label: "Gender", value: user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : "-" },
            { label: "Birthday", value: user.birthday ? formatDate(user.birthday) : "-" },
            { label: "Address", value: user.address ?? "-" },
            { label: "Date Added", value: formatDate(user.created_at) },
          ].map(({ label, value }) => (
            <DrawerInfoCard
              key={label}
              label={label}
              value={
                label === "Email" ? (
                  <div>
                    <p className="m-0 break-words text-[13px] font-medium text-slate-700">{value}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusPill status={user.role} label={user.role_label} />
                      <StatusPill status={user.status} />
                    </div>
                  </div>
                ) : value
              }
            />
          ))}
        </div>
      </DrawerSection>
    </DetailDrawer>
  );
};

const SuperManageAccounts = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const queryClient = useQueryClient();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const [activeItem, setActiveItem] = useState("Accounts");
  const [contentMargin, setContentMargin] = useState(() => window.innerWidth >= 1024 ? 256 : 0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [requestedPage, setRequestedPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [sendEmailModalOpen, setSendEmailModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [actionState, setActionState] = useState({ type: "", userId: null });
  const [formErrors, setFormErrors] = useState({});
  const [sendInviteErrors, setSendInviteErrors] = useState({});
  const didRunTableFilterResetRef = useRef(false);
  const { isTransactionLocked, transactionLockMessage } = useTransactionLockQuery();
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const rawHighlightedUserId = getAccountHighlightId({ highlightedSearchResult, search: location.search });
  const highlightToken = rawHighlightedUserId
    ? `${rawHighlightedUserId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedUserId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedUserId;
  const accountQuerySearch = highlightedUserId ? "" : debouncedSearch;
  const accountQueryStatus = highlightedUserId ? "all" : statusFilter;
  const accountQueryRole = highlightedUserId ? "all" : roleFilter;
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
  const currentUserId = useMemo(() => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("user") || "null");
      return storedUser?.user_id ?? null;
    } catch {
      return null;
    }
  }, []);
  const usersQuery = useUsersPageQuery({
    page: currentPage,
    perPage: PAGE_SIZE,
    search: accountQuerySearch,
    status: accountQueryStatus,
    role: accountQueryRole,
    filters: { role: accountQueryRole },
    sort: "created_at_desc",
    paginated: true,
    includeStats: true,
    excludeCurrent: Boolean(currentUserId),
    highlightUserId: highlightedUserId,
  });

  const handleWidthChange = useCallback((w) => setContentMargin(w), []);

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) setContentMargin(sidebarCollapsed ? 72 : 256);
    else if (window.innerWidth < 1024) setContentMargin(0);
  }, [sidebarCollapsed, sidebarOpen]);

  const showToast = (type, title, message) => {
    showBottomToast(type, title, message);
  };

  const users = usersQuery.data?.users ?? [];
  const usersMeta = usersQuery.data?.usersMeta ?? {
    current_page: 1,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const accountStats = usersQuery.data?.stats ?? { total: 0, active: 0, deactivated: 0 };
  const filteredUsers = users;
  const hasActiveTableFilters = Boolean(
    search.trim() || statusFilter !== "all" || roleFilter !== "all"
  );

  useEffect(() => {
    setDismissedHighlightToken("");
  }, [location.key]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearch(highlightedSearchResult ? "" : params.get("q") || "");
    if (params.get("highlight")?.startsWith("user-")) {
      setStatusFilter("all");
      setRoleFilter("all");
    }
    setRequestedPage(1);
    setCurrentPage(1);
  }, [highlightedSearchResult, location.search]);

  const totalPages = Math.max(1, Number(usersMeta.last_page) || 1);
  const resolvedHighlightedPage = highlightedUserId
    ? Number(usersMeta.current_page || requestedPage)
    : requestedPage;
  const safePage = Math.min(resolvedHighlightedPage, totalPages);
  const paginationRequestedPage = highlightedUserId ? safePage : requestedPage;
  const paginatedUsers = filteredUsers;
  const isUsersTableLoading =
    !usersQuery.isError &&
    usersQuery.isLoading &&
    !usersQuery.data;

  useEffect(() => {
    if (!highlightedUserId) return;
    const resolvedPage = Number(usersMeta.current_page || 0);
    if (resolvedPage > 0 && (resolvedPage !== currentPage || resolvedPage !== requestedPage)) {
      setRequestedPage(resolvedPage);
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, highlightedUserId, requestedPage, usersMeta.current_page]);

  useEffect(() => {
    if (!didRunTableFilterResetRef.current) {
      didRunTableFilterResetRef.current = true;
      return;
    }

    setRequestedPage(1);
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, roleFilter]);

  useEffect(() => {
    if (requestedPage === currentPage) return undefined;

    const timeout = window.setTimeout(() => {
      void (async () => {
        await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
        setCurrentPage(requestedPage);
      })();
    }, PAGE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [currentPage, queryClient, requestedPage]);

  useEffect(() => {
    if (requestedPage <= totalPages) return;
    setRequestedPage(totalPages);
    setCurrentPage(totalPages);
  }, [requestedPage, totalPages]);

  const stats = useMemo(() => ([
    {
      label: "Total Accounts",
      value: accountStats.total,
      icon: IoPeopleOutline,
      iconBg: "#dbeafe",
      iconColor: "#1d4ed8",
    },
    {
      label: "Active",
      value: accountStats.active,
      icon: IoCheckmarkOutline,
      iconBg: "#dbeafe",
      iconColor: "#1d4ed8",
    },
    {
      label: "Deactivated",
      value: accountStats.deactivated,
      icon: IoCloseOutline,
      iconBg: "#dbeafe",
      iconColor: "#1d4ed8",
    },
  ]), [accountStats]);

  const handleAddUser = async (payload) => {
    if (isTransactionLocked) {
      showToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }
    const nextErrors = {};
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!payload.first_name.trim()) nextErrors.first_name = ["First name is required."];
    if (!payload.last_name.trim()) nextErrors.last_name = ["Last name is required."];
    if (!payload.role) nextErrors.role = ["Role is required."];
    if (!payload.gender) nextErrors.gender = ["Gender is required."];
    if (!payload.contact_number.trim()) nextErrors.contact_number = ["Contact number is required."];
    else if (!/^\d{11}$/.test(payload.contact_number.trim())) nextErrors.contact_number = ["Contact number must be 11 digits."];
    if (!payload.birthday.trim()) {
      nextErrors.birthday = ["Birthday is required."];
    } else {
      const birthdayParts = payload.birthday.trim().split("-");
      const birthdayDate = birthdayParts.length === 3
        ? new Date(Number(birthdayParts[0]), Number(birthdayParts[1]) - 1, Number(birthdayParts[2]))
        : new Date(payload.birthday);
      const today = new Date();
      const minBirthday = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate());

      if (Number.isNaN(birthdayDate.getTime())) {
        nextErrors.birthday = ["Please select a valid birthday."];
      } else if (birthdayDate > minBirthday) {
        nextErrors.birthday = ["Users must be at least 15 years old."];
      }
    }
    if (!payload.address.trim()) nextErrors.address = ["Address is required."];
    if (!payload.email.trim()) nextErrors.email = ["Email is required."];
    else if (!emailPattern.test(payload.email.trim())) nextErrors.email = ["Please enter a valid email address."];
    if (!payload.password) nextErrors.password = ["Password is required."];
    else if (payload.password.length < 8) nextErrors.password = ["Password must be at least 8 characters."];
    if (!payload.password_confirmation) nextErrors.password_confirmation = ["Please confirm the password."];
    else if (payload.password_confirmation !== payload.password) nextErrors.password_confirmation = ["Passwords do not match."];

    if (Object.keys(nextErrors).length) {
      setFormErrors(nextErrors);
      return;
    }

    setSaving(true);
    setFormErrors({});

    try {
      await api.post("/users", payload);
      setAddModalOpen(false);
      showAddedToast("User", "user");
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY, refetchType: "active" });
    } catch (error) {
      if (error.response?.status === 422) {
        setFormErrors(error.response.data.errors ?? {});
      } else {
        showToast("error", "Add Failed", error.response?.data?.message ?? "Failed to add user.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSendInvite = async (payload) => {
    if (isTransactionLocked) {
      showToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }
    const nextErrors = {};
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!payload.role) nextErrors.role = ["Role is required."];
    if (!payload.email.trim()) nextErrors.email = ["Email is required."];
    else if (!emailPattern.test(payload.email.trim())) nextErrors.email = ["Please enter a valid email address."];
    if (!payload.password) nextErrors.password = ["Password is required."];
    else if (payload.password.length < 8) nextErrors.password = ["Password must be at least 8 characters."];
    if (!payload.password_confirmation) nextErrors.password_confirmation = ["Please confirm the password."];
    else if (payload.password_confirmation !== payload.password) nextErrors.password_confirmation = ["Passwords do not match."];

    if (Object.keys(nextErrors).length) {
      setSendInviteErrors(nextErrors);
      return;
    }

    setSendingInvite(true);
    setSendInviteErrors({});

    try {
      await api.post("/users/send-invite", payload);
      setSendEmailModalOpen(false);
      showToast("success", "Invite Sent", `Account for "${payload.email}" created and credentials sent successfully.`);
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY, refetchType: "active" });
    } catch (error) {
      if (error.response?.status === 422) {
        setSendInviteErrors(error.response.data.errors ?? {});
      } else {
        showToast("error", "Invite Failed", error.response?.data?.message ?? "Failed to create the invited user.");
      }
    } finally {
      setSendingInvite(false);
    }
  };

  const handleUpdateUserStatus = async (user, nextStatus) => {
    if (isTransactionLocked) {
      showToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }
    const actionType = nextStatus === "active" ? "reactivate" : "deactivate";
    setActionState({ type: actionType, userId: user.user_id });

    try {
      await api.patch(`/users/${user.user_id}/${actionType}`);

      if (selectedUser?.user_id === user.user_id) {
        setSelectedUser((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      }

      showToast(
        "success",
        nextStatus === "active" ? "User Activated" : "User Deactivated",
        nextStatus === "active"
          ? `${getAccountLabel(user)} account has been activated again.`
          : `${getAccountLabel(user)} account has been deactivated.`
      );
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY, refetchType: "active" });
    } catch (error) {
      showToast(
        "error",
        nextStatus === "active" ? "Activate Failed" : "Deactivate Failed",
        error.response?.data?.message ?? `Failed to ${nextStatus === "active" ? "activate" : "deactivate"} the user.`
      );
    } finally {
      setActionState({ type: "", userId: null });
    }
  };

  const handleDeleteUser = async (user) => {
    setActionState({ type: "delete", userId: user.user_id });

    try {
      await api.delete(`/users/${user.user_id}`);

      if (selectedUser?.user_id === user.user_id) {
        setDrawerOpen(false);
        setSelectedUser(null);
      }

      showToast("success", "User Deleted", `"${getFullName(user)}" has been deleted permanently.`);
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY, refetchType: "active" });
    } catch (error) {
      showToast("error", "Delete Failed", error.response?.data?.message ?? "Failed to delete the user.");
    } finally {
      setActionState({ type: "", userId: null });
    }
  };

  return (
    <ConfigProvider theme={antTheme}>
      <style>{`
        * { font-family: ${FONT} !important; }
        input::placeholder { color: #1a1f36 !important; opacity: 0.4; }
        .modal-hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
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
              <TitlePage title="Accounts" subtitle="Manage all registered system users" loading={isUsersTableLoading} />
              <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: "Accounts" }]} fontFamily={FONT} loading={isUsersTableLoading} />
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              {stats.map((item) => <OverviewCard key={item.label} {...item} loading={isUsersTableLoading} />)}
            </div>

            <Tabs
              tabs={ACCOUNT_TABS}
              activeKey="directory"
              onTabChange={() => {}}
              fontFamily={FONT}
              className="mb-5"
              loading={isUsersTableLoading}
              rightContent={<Legend items={ACCOUNT_STATUS_LEGEND} loading={isUsersTableLoading} />}
            >
            <TableCard
              title="Account Directory Records"
              subtitle="All user accounts stored in the system"
              loading={isUsersTableLoading}
              headerActionsSkeletonCount={4}
              bodyClassName="overflow-x-auto"
              footerClassName="flex items-center justify-between"
              actions={
                <>
                  <div className="flex items-center gap-2.5 px-4 rounded-lg border border-gray-200 bg-white transition-all" style={{ height: 42, width: 280 }}>
                    <IoSearchOutline className="text-[17px] flex-shrink-0" style={{ color: "#1a1f36" }} />
                    <input
                      type="text"
                      placeholder="Search for Email"
                      value={search}
                      onChange={(e) => {
                        clearUniversalHighlight();
                        setSearch(e.target.value);
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
                      clearUniversalHighlight();
                      setStatusFilter(value);
                      setRequestedPage(1);
                      setCurrentPage(1);
                    }}
                    options={STATUS_FILTER_OPTIONS}
                    height={42}
                    minWidth={150}
                  />
                  <TailDropdown
                    value={roleFilter}
                    onChange={(value) => {
                      clearUniversalHighlight();
                      setRoleFilter(value);
                      setRequestedPage(1);
                      setCurrentPage(1);
                    }}
                    options={ROLE_FILTER_OPTIONS}
                    height={42}
                    minWidth={150}
                  />
                  <button
                    type="button"
                    onClick={() => { if (!isTransactionLocked) setSendEmailModalOpen(true); else showToast("error", "Transactions Locked", transactionLockMessage); }}
                    disabled={isTransactionLocked}
                    className="flex h-[42px] w-[112px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-4 text-[13px] font-semibold cursor-pointer transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ fontFamily: FONT, color: "#1a1f36" }}
                  >
                    <IoPaperPlaneOutline className="flex-shrink-0 text-[20px]" /> Add User
                  </button>
                  <button
                    onClick={() => { if (!isTransactionLocked) setAddModalOpen(true); else showToast("error", "Transactions Locked", transactionLockMessage); }}
                    disabled={isTransactionLocked}
                    className="flex h-[42px] w-[112px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-none bg-[#1a1f36] px-4 text-[13px] font-semibold text-white cursor-pointer transition-colors hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ fontFamily: FONT }}
                  >
                    <IoAddOutline className="flex-shrink-0 text-[21px]" /> Add User
                  </button>
                </>
              }
              pagination={{
                meta: usersMeta,
                totalPages,
                currentPage: safePage,
                requestedPage: paginationRequestedPage,
                isLoading: isUsersTableLoading,
                beforePageChange: clearUniversalHighlight,
                onPageChange: setRequestedPage,
              }}
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 940 }}>
                  <thead>
                    <tr>
                      <TH>Email</TH>
                      <TH>Name</TH>
                      <TH>Role</TH>
                      <TH>Date Added</TH>
                      <TH>Action</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {isUsersTableLoading ? (
                      Array.from({ length: 10 }).map((_, index) => (
                        <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-40" /></td>
                          <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-32" /></td>
                          <td className="px-4 py-3"><div className="h-6 bg-slate-100 rounded w-24" /></td>
                          <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-28" /></td>
                          <td className="px-4 py-3"><div className="h-9 bg-slate-100 rounded w-20" /></td>
                        </tr>
                      ))
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-14">
                          <NoDataFound title={hasActiveTableFilters ? "No results found" : "No Data Found"} />
                        </td>
                      </tr>
                    ) : (
                      paginatedUsers.map((user, index) => (
                        <tr
                          key={user.user_id}
                          onClick={() => { setSelectedUser(user); setDrawerOpen(true); }}
                          className={`transition-colors cursor-pointer ${highlightedUserId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${highlightedUserId && String(highlightedUserId) === String(user.user_id) ? "universal-search-highlight" : ""}`.trim()}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                          }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-flex h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: user.status === "active" ? "#16a34a" : "#dc2626" }}
                              />
                              <p className="m-0 text-[13px]" style={{ color: "#1a1f36" }}>{user.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="m-0 text-[13px] font-semibold" style={{ color: "#1a1f36" }}>{getFullName(user)}</p>
                          </td>
                          <td className="px-4 py-3 text-[13px]"><StatusPill status={user.role} label={user.role_label} /></td>
                          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: "#1a1f36" }}>{formatDate(user.created_at)}</td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <StatusToggle
                              active={user.status === "active"}
                              loading={actionState.userId === user.user_id && (actionState.type === "deactivate" || actionState.type === "reactivate")}
                              disabled={isTransactionLocked}
                              disabledReason={transactionLockMessage}
                              onToggle={() => handleUpdateUserStatus(user, user.status === "active" ? "deactivated" : "active")}
                            />
                          </td>
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

      <AddUserModal open={addModalOpen} onClose={() => { if (!saving) { setAddModalOpen(false); setFormErrors({}); } }} onSave={handleAddUser} saving={saving} error={formErrors} setError={setFormErrors} />
      <SendUserEmailModal open={sendEmailModalOpen} onClose={() => { if (!sendingInvite) { setSendEmailModalOpen(false); setSendInviteErrors({}); } }} onSend={handleSendInvite} sending={sendingInvite} error={sendInviteErrors} setError={setSendInviteErrors} />
      <AccountDetailsDrawer user={selectedUser} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </ConfigProvider>
  );
};

export default SuperManageAccounts;
