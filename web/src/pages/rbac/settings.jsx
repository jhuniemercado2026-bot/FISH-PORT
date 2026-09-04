import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import { useNavigate } from "react-router-dom";
import "typeface-montserrat";
import {
  IoPersonOutline, IoCallOutline, IoMailOutline,
  IoCreateOutline, IoShieldCheckmarkOutline,
  IoLocationOutline,
  IoAlertCircleOutline,
  IoCloudUploadOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoChevronDownOutline,
  IoChevronUpOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import BirthdayPicker from "../../components/BirthdayPicker";
import Modal, { ModalFieldError, ModalTextInput } from "../../components/Modal";
import Spinner from "../../components/Spinner";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import api from "../../api/axios";
import { showBottomToast, showInfoToast, showNoChangesToast, showUpdatedToast } from "../../store/bottomToastStore";
import { SETTINGS_QUERY_KEY, useSettingsQuery } from "../../hooks/useSettingsQuery";
import { useSidebar } from "../../store/sidebarStore";
import { useTransactionLockQuery } from "../../hooks/useTransactionLockQuery";
import { useFiscalYearStore, getFiscalYearOptions } from "../../store/fiscalYearStore";

const ROLE_LABELS = { head: "Head of MEEO", coordinator: "Coordinator", inspector: "Inspector" };
const GENDER_LABELS = { male: "Male", female: "Female" };
const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];
const FONT = "'Montserrat', sans-serif";
const PERSONAL_MODAL_LABEL_CLASS = "uppercase";
const PERSONAL_MODAL_LABEL_STYLE = { color: "#6F6F82", fontSize: "11px" };
const antTheme = {
  token: { colorPrimary: "#4096ff", borderRadius: 10, fontFamily: FONT },
};
const HIDE_SCROLLBAR_STYLE = {
  msOverflowStyle: "none",
  scrollbarWidth: "none",
};
const FISCAL_YEAR_OPTIONS = getFiscalYearOptions();
const EMPTY_PASSWORD_FORM = { current: "", new_pass: "", confirm: "" };
const EMPTY_PASSWORD_ERRORS = { current: "", new_pass: "", confirm: "" };
const EMPTY_VERIFICATION_CODE = ["", "", "", "", "", ""];
const PASSWORD_CODE_RESEND_COOLDOWN_SECONDS = 59;
const PASSWORD_CODE_RESEND_DAILY_LIMIT = 3;
const VERIFICATION_CODE_LIMIT_MESSAGE =
  "You have reached the verification code limit for today. Please use the latest verification code sent to your email. This code expires within this day.";
const EMPTY_PERSONAL_ERRORS = {
  first_name: "",
  last_name: "",
  email: "",
  gender: "",
  contact_number: "",
  birthday: "",
  address: "",
};

// -- Info Row ---------------------------------------------------------
const InfoRow = ({ label, value }) => (
  <div>
    <p className="m-0 mb-1 text-[11px] font-semibold uppercase" style={{ color: "#8C8CA0" }}>{label}</p>
    <p className="m-0 text-[15px] font-medium text-slate-700">{value || "-"}</p>
  </div>
);

const RequiredLabel = ({ children }) => (
  <>
    {children}
    <span className="text-red-500 ml-0.5"> *</span>
  </>
);

const PersonalGenderCardSelect = ({ value, onChange, error = "" }) => (
  <div>
    <p className={`m-0 mb-2 font-semibold ${PERSONAL_MODAL_LABEL_CLASS}`} style={PERSONAL_MODAL_LABEL_STYLE}>
      <RequiredLabel>Gender</RequiredLabel>
    </p>
    <div className="grid grid-cols-2 gap-3">
      {GENDER_OPTIONS.map((option) => {
        const selected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="flex h-[46px] items-center justify-center rounded-[10px] border px-4 text-[13px] font-normal transition-colors cursor-pointer"
            style={{
              borderColor: error ? "#fca5a5" : selected ? "#1a1f36" : "#e2e8f0",
              backgroundColor: selected ? "#1a1f36" : "#ffffff",
              color: selected ? "#ffffff" : "#1a1f36",
              fontFamily: FONT,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  </div>
);

const DataActionCard = ({ icon: Icon, title, description, actionLabel, actionIcon: ActionIcon, loading = false, disabled = false, onAction, showIcon = true }) => (
  <div className="bg-white rounded-[10px] border border-slate-200 shadow-sm overflow-hidden">
    <div className="flex min-h-[92px] items-center justify-between gap-4 px-6 py-4">
      <div className="flex min-w-0 items-center gap-4">
        {showIcon && Icon ? (
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-200">
            <Icon className="text-[21px]" style={{ color: "#1a1f36" }} />
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="m-0 text-[14px] font-medium uppercase" style={{ color: "#1a1f36" }}>{title}</h3>
          <p className="m-0 mt-0.5 text-[12px] text-slate-700">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled || loading}
        className="cursor-pointer inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-[10px] bg-white px-6 py-2 text-[14px] font-medium transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ border: "2px solid #1a1f36", color: "#1a1f36", fontFamily: FONT, minWidth: 132 }}
      >
        {loading ? <Spinner size={4} /> : (
          <>
            <ActionIcon className="text-[15px]" />
            {actionLabel}
          </>
        )}
      </button>
    </div>
  </div>
);

const getRequestErrorMessage = async (error, fallback) => {
  const data = error?.response?.data;

  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      return parsed?.message || fallback;
    } catch {
      return fallback;
    }
  }

  return data?.message || fallback;
};

// -- Avatar component -------------------------------------------------
const Avatar = ({ initials, size = 80, className = "" }) => {
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [initials]);
  return (
    <div className={`overflow-hidden flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: "#1A1F36", border: "2px solid #ffffff", borderRadius: "999px" }}>
      {initials && !imgError
        ? <span className="text-white font-bold" style={{ fontSize: size * 0.34 }}>{initials}</span>
        : <IoPersonOutline className="text-white" style={{ fontSize: size * 0.44 }} />}
    </div>
  );
};

const SkeletonBlock = ({ className = "", style = {} }) => (
  <div className={`rounded bg-slate-100 ${className}`.trim()} style={style} />
);

const getStoredUserRole = () => {
  try {
    return String(JSON.parse(localStorage.getItem("user") || "{}")?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

const SettingsSkeleton = ({ showRecovery = false }) => (
  <div className="animate-pulse">
    <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="overflow-hidden rounded-[10px] border border-[#1A1F36] bg-[#1A1F36]">
        <div className="flex min-h-[122px] items-center gap-5 px-7 py-5">
          <div className="h-[60px] w-[60px] flex-shrink-0 rounded-full bg-white/20" />
          <div className="min-w-0 flex-1">
            <div className="mb-3 h-4 w-48 rounded bg-white/25" />
            <div className="h-3 w-28 rounded bg-white/20" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-[122px] flex-col justify-center gap-3 px-6 py-5">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-10 w-full rounded-[10px] border border-slate-200" />
        </div>
      </div>
    </div>

    <div className="mb-5 overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <SkeletonBlock className="mb-2 h-3 w-40" />
          <SkeletonBlock className="h-3 w-56" />
        </div>
        <SkeletonBlock className="h-9 w-9 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-5 px-6 pb-5 pt-4 sm:grid-cols-2">
        {[120, 116, 94, 210, 145, 180, 260].map((width, index) => (
          <div key={`settings-personal-skeleton-${index}`}>
            <SkeletonBlock className="mb-2 h-3 w-24" />
            <SkeletonBlock className="h-4" style={{ width }} />
          </div>
        ))}
      </div>
    </div>

    <div className={`grid grid-cols-1 gap-5 ${showRecovery ? "lg:grid-cols-2" : ""}`}>
      <div className="overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-[92px] items-center justify-between gap-4 px-6 py-4">
          <div>
            <SkeletonBlock className="mb-2 h-3 w-24" />
            <SkeletonBlock className="h-3 w-48" />
          </div>
          <SkeletonBlock className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {showRecovery && (
        <div className="overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-sm">
          <div className="flex min-h-[92px] items-center justify-between gap-4 px-6 py-4">
            <div>
              <SkeletonBlock className="mb-2 h-3 w-24" />
              <SkeletonBlock className="h-3 w-64 max-w-full" />
            </div>
            <SkeletonBlock className="h-9 w-28 rounded-[10px]" />
          </div>
        </div>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------
const UserProfileTab = ({ showToast }) => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useSettingsQuery();
  const {
    transactionLock,
    transactionLockMessage,
  } = useTransactionLockQuery();
  const isTransactionLocked = Boolean(transactionLock && transactionLock.applies_to !== "transactions");
  const profile = data?.user ?? null;
  const [saving,            setSaving]            = useState(false);
  const [showPersonalModal, setShowPersonalModal] = useState(false);
  const [showPwModal,       setShowPwModal]       = useState(false);
  const [showPwCodeModal,   setShowPwCodeModal]   = useState(false);
  const [tmpP,  setTmpP]  = useState({});
  const [tmpPw, setTmpPw] = useState(EMPTY_PASSWORD_FORM);
  const [personalErrors, setPersonalErrors] = useState(EMPTY_PERSONAL_ERRORS);
  const [pwErr, setPwErr] = useState("");
  const [pwFieldErrors, setPwFieldErrors] = useState(EMPTY_PASSWORD_ERRORS);
  const [pwCode, setPwCode] = useState(EMPTY_VERIFICATION_CODE);
  const [pwCodeErr, setPwCodeErr] = useState("");
  const [pwResendCountdown, setPwResendCountdown] = useState(0);
  const [pwResendCount, setPwResendCount] = useState(0);
  const [resendingPwCode, setResendingPwCode] = useState(false);
  const [showPwFields, setShowPwFields] = useState({ current: false, new_pass: false, confirm: false });
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [pendingRecoveryFile, setPendingRecoveryFile] = useState(null);
  const selectedFiscalYear = useFiscalYearStore((state) => state.fiscalYear);
  const setSelectedFiscalYear = useFiscalYearStore((state) => state.setFiscalYear);
  const [fiscalYearDropdownOpen, setFiscalYearDropdownOpen] = useState(false);

  const pwCodeInputRefs = useRef([]);
  const recoveryFileInputRef = useRef(null);

  useEffect(() => {
    if (profile) localStorage.setItem("user", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (error) showToast("error", "Error", error.response?.data?.message || "Failed to load profile data.");
  }, [error, showToast]);

  useEffect(() => {
    if (pwResendCountdown <= 0) return undefined;

    const timeoutId = window.setTimeout(() => {
      setPwResendCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [pwResendCountdown]);

  useEffect(() => {
    if (!fiscalYearDropdownOpen) return undefined;

    const handler = (event) => {
      if (!event.target.closest("[data-settings-fiscal-year-dropdown]")) {
        setFiscalYearDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [fiscalYearDropdownOpen]);

  const syncProfileCache = useCallback((nextProfile) => {
    queryClient.setQueryData(SETTINGS_QUERY_KEY, { user: nextProfile });
    localStorage.setItem("user", JSON.stringify(nextProfile));
  }, [queryClient]);

  const initials = profile
    ? `${String(profile.first_name || "").trim().charAt(0)}${String(profile.last_name || "").trim().charAt(0)}`.toUpperCase()
    : "";
  const normalizedProfileRole = String(profile?.role || getStoredUserRole()).trim().toLowerCase();
  const canRecoverDatabase = normalizedProfileRole === "head";

  const handleRecoveryFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".sql")) {
      showToast("error", "Invalid File", "Please select a .sql backup file.");
      return;
    }

    setPendingRecoveryFile(file);
  };

  const handleRecoverDatabase = async () => {
    if (!pendingRecoveryFile || recoveryLoading) return;

    const formData = new FormData();
    formData.append("backup_file", pendingRecoveryFile);

    setRecoveryLoading(true);
    try {
      const response = await api.post("/database/recover", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPendingRecoveryFile(null);
      await queryClient.cancelQueries();
      await queryClient.invalidateQueries({ refetchType: "all" });
      showToast("success", "Recovery Complete", response.data?.message || "Database recovered successfully.");
    } catch (err) {
      showToast("error", "Recovery Failed", await getRequestErrorMessage(err, "Unable to recover the database from the selected file."));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const buildBirthday = () => {
    const birthday = String(tmpP.birthday || "").trim();
    return birthday || null;
  };

  const hasPersonalChanges = () => {
    if (!profile) return true;
    return (
      (tmpP.first_name ?? "") !== (profile.first_name ?? "") ||
      (tmpP.last_name ?? "") !== (profile.last_name ?? "") ||
      (tmpP.email ?? "") !== (profile.email ?? "") ||
      (tmpP.gender || "") !== (profile.gender || "") ||
      (tmpP.contact_number ?? "") !== (profile.contact_number ?? "") ||
      (tmpP.address ?? "") !== (profile.address ?? "") ||
      (buildBirthday() || null) !== (profile.birthday ? profile.birthday.slice(0, 10) : null)
    );
  };

  const savePersonal = async () => {
    if (isTransactionLocked) {
      showToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }
    const nextErrors = { ...EMPTY_PERSONAL_ERRORS };
    const firstName = String(tmpP.first_name ?? "").trim();
    const lastName = String(tmpP.last_name ?? "").trim();
    const email = String(tmpP.email ?? "").trim();
    const contactNumber = String(tmpP.contact_number ?? "").trim();
    const address = String(tmpP.address ?? "").trim();
    const hasAnyBirthdayPart = Boolean(String(tmpP.birthday || "").trim());

    if (!firstName) nextErrors.first_name = "First name is required.";
    if (!lastName) nextErrors.last_name = "Last name is required.";
    if (!String(tmpP.gender ?? "").trim()) nextErrors.gender = "Gender is required.";
    if (!email) nextErrors.email = "Email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = "Enter a valid email address.";
    if (!contactNumber) nextErrors.contact_number = "Contact number is required.";
    else if (!/^09\d{9}$/.test(contactNumber)) nextErrors.contact_number = "Enter a valid 11-digit contact number.";
    if (hasAnyBirthdayPart && !buildBirthday()) nextErrors.birthday = "Complete your birthday.";
    else if (!hasAnyBirthdayPart) nextErrors.birthday = "Birthday is required.";
    else {
      const birthdayValue = buildBirthday();
      if (birthdayValue) {
        const birthdayDate = new Date(birthdayValue);
        const today = new Date();
        const minimumBirthday = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate());

        if (Number.isNaN(birthdayDate.getTime())) {
          nextErrors.birthday = "Complete your birthday.";
        } else if (birthdayDate > minimumBirthday) {
          nextErrors.birthday = "Users must be at least 15 years old.";
        }
      }
    }
    if (!address) nextErrors.address = "Address is required.";
    if (Object.values(nextErrors).some(Boolean)) {
      setPersonalErrors(nextErrors);
      return;
    }

    if (!hasPersonalChanges()) {
      setShowPersonalModal(false);
      showToast("info", "No Changes Made", "No changes were made. The record remains the same.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.put(`/users/${profile.user_id}`, {
        first_name:     firstName,
        last_name:      lastName,
        email,
        gender:         tmpP.gender || null,
        contact_number: contactNumber,
        birthday:       buildBirthday(),
        address,
      });
      const updated = res.data.data;
      updated.profile_image_url = profile.profile_image_url;
      syncProfileCache(updated);
      setShowPersonalModal(false);
      setPersonalErrors(EMPTY_PERSONAL_ERRORS);
      showUpdatedToast("Profile", "profile");
    } catch (err) {
      const backendErrors = err.response?.data?.errors || {};
      setPersonalErrors({
        first_name: backendErrors.first_name?.[0] || "",
        last_name: backendErrors.last_name?.[0] || "",
        email: backendErrors.email?.[0] || "",
        gender: backendErrors.gender?.[0] || "",
        contact_number: backendErrors.contact_number?.[0] || "",
        birthday: backendErrors.birthday?.[0] || "",
        address: backendErrors.address?.[0] || "",
      });
      showToast("error", "Failed to Update", err.response?.data?.message || "Failed to update personal information.");
    } finally {
      setSaving(false);
    }
  };

  const savePw = async () => {
    if (isTransactionLocked) {
      showToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }
    const nextErrors = { ...EMPTY_PASSWORD_ERRORS };
    setPwErr("");
    if (!tmpPw.current.trim()) nextErrors.current = "Current password is required.";
    if (!tmpPw.new_pass) nextErrors.new_pass = "New password is required.";
    else if (tmpPw.new_pass.length < 8) nextErrors.new_pass = "Password must be at least 8 characters.";
    else if (tmpPw.new_pass === tmpPw.current) nextErrors.new_pass = "New password must be different from your current password.";
    if (!tmpPw.confirm) nextErrors.confirm = "Please confirm your new password.";
    else if (tmpPw.new_pass !== tmpPw.confirm) nextErrors.confirm = "Passwords do not match.";
    setPwFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await api.put(`/users/${profile.user_id}`, {
        send_password_change_code: true,
        current_password: tmpPw.current,
        new_password: tmpPw.new_pass,
        new_password_confirmation: tmpPw.confirm,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setPwCode([...EMPTY_VERIFICATION_CODE]);
      setPwCodeErr("");
      setPwResendCountdown(0);
      setPwResendCount(PASSWORD_CODE_RESEND_DAILY_LIMIT - Number(res.data?.remaining_resends ?? PASSWORD_CODE_RESEND_DAILY_LIMIT));
      setShowPwModal(false);
      setShowPwFields({ current: false, new_pass: false, confirm: false });
      setShowPwCodeModal(true);
    } catch (err) {
      const backendErrors = err.response?.data?.errors || {};
      const remainingResends = err.response?.data?.remaining_resends;
      setPwFieldErrors({
        current: backendErrors.current_password?.[0] || "",
        new_pass: backendErrors.new_password?.[0] || "",
        confirm: backendErrors.new_password_confirmation?.[0] || "",
      });
      if (
        remainingResends === 0 &&
        !backendErrors.current_password &&
        !backendErrors.new_password &&
        !backendErrors.new_password_confirmation
      ) {
        setPwCode([...EMPTY_VERIFICATION_CODE]);
        setPwCodeErr(VERIFICATION_CODE_LIMIT_MESSAGE);
        setPwErr("");
        setPwResendCountdown(0);
        setPwResendCount(PASSWORD_CODE_RESEND_DAILY_LIMIT);
        setShowPwModal(false);
        setShowPwFields({ current: false, new_pass: false, confirm: false });
        setShowPwCodeModal(true);
        return;
      }
      setPwErr(err.response?.data?.message || "Failed to send the verification code.");
    } finally {
      setSaving(false);
    }
  };

  const handlePwCodeChange = (index, value) => {
    const digitsOnly = value.replace(/\D/g, "");
    const nextDigit = digitsOnly.slice(-1);

    setPwCode((current) => {
      const next = [...current];
      next[index] = nextDigit;
      return next;
    });
    setPwCodeErr("");

    if (nextDigit && index < pwCodeInputRefs.current.length - 1) {
      pwCodeInputRefs.current[index + 1]?.focus();
    }
  };

  const handlePwCodeKeyDown = (index, event) => {
    if (event.key === "Backspace" && !pwCode[index] && index > 0) {
      pwCodeInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePwCodeFocus = (event) => {
    event.target.select();
  };

  const handlePwCodePaste = (event) => {
    const pastedDigits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);

    if (!pastedDigits) return;

    event.preventDefault();

    setPwCode((current) => {
      const next = [...current];
      pastedDigits.split("").forEach((digit, index) => {
        next[index] = digit;
      });
      return next;
    });
    setPwCodeErr("");

    const focusIndex = Math.min(pastedDigits.length, pwCodeInputRefs.current.length) - 1;
    if (focusIndex >= 0) {
      pwCodeInputRefs.current[focusIndex]?.focus();
    }
  };

  const verifyPwChange = async () => {
    if (isTransactionLocked) {
      showToast("error", "Transactions Locked", transactionLockMessage);
      return;
    }
    setPwCodeErr("");
    const verificationCode = pwCode.join("");

    if (!verificationCode.trim()) {
      setPwCodeErr("Verification code is required.");
      return;
    }
    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setPwCodeErr("Enter the 6 digits code sent to your email.");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      await api.put(`/users/${profile.user_id}`, {
        verify_password_change_code: true,
        current_password: tmpPw.current,
        new_password: tmpPw.new_pass,
        new_password_confirmation: tmpPw.confirm,
        verification_code: verificationCode.trim(),
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setShowPwCodeModal(false);
      setTmpPw(EMPTY_PASSWORD_FORM);
      setPwFieldErrors(EMPTY_PASSWORD_ERRORS);
      setPwErr("");
      setPwCode([...EMPTY_VERIFICATION_CODE]);
      setPwCodeErr("");
      setShowPwFields({ current: false, new_pass: false, confirm: false });
      showUpdatedToast("Password", "password");
    } catch (err) {
      const backendErrors = err.response?.data?.errors || {};
      if (backendErrors.current_password || backendErrors.new_password || backendErrors.new_password_confirmation) {
        setPwFieldErrors({
          current: backendErrors.current_password?.[0] || "",
          new_pass: backendErrors.new_password?.[0] || "",
          confirm: backendErrors.new_password_confirmation?.[0] || "",
        });
        setShowPwCodeModal(false);
        setShowPwModal(true);
      }
      setPwCodeErr(
        backendErrors.verification_code?.[0]
        || err.response?.data?.message
        || "Failed to verify the code."
      );
    } finally {
      setSaving(false);
    }
  };

  const resendPwCode = async () => {
    if (pwResendCountdown > 0 || resendingPwCode || pwResendCount >= PASSWORD_CODE_RESEND_DAILY_LIMIT) return;

    setPwCodeErr("");
    setPwResendCountdown(PASSWORD_CODE_RESEND_COOLDOWN_SECONDS);
    setResendingPwCode(true);

    try {
      const token = localStorage.getItem("token");
      const res = await api.put(`/users/${profile.user_id}`, {
        send_password_change_code: true,
        resend_password_change_code: true,
        current_password: tmpPw.current,
        new_password: tmpPw.new_pass,
        new_password_confirmation: tmpPw.confirm,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      setPwCode([...EMPTY_VERIFICATION_CODE]);
      setPwCodeErr("");
      setPwResendCount(PASSWORD_CODE_RESEND_DAILY_LIMIT - Number(res.data?.remaining_resends ?? PASSWORD_CODE_RESEND_DAILY_LIMIT));
      pwCodeInputRefs.current[0]?.focus();
      showToast("success", "Code Resent", "A new verification code has been sent to your email.");
    } catch (err) {
      const retryAfter = Number(err.response?.data?.retry_after || 0);
      const remainingResends = err.response?.data?.remaining_resends;

      setPwResendCountdown(retryAfter > 0 ? retryAfter : 0);
      if (typeof remainingResends === "number") {
        setPwResendCount(PASSWORD_CODE_RESEND_DAILY_LIMIT - remainingResends);
      }

      setPwCodeErr(
        remainingResends === 0
          ? VERIFICATION_CODE_LIMIT_MESSAGE
          : err.response?.data?.message || "Failed to resend the verification code."
      );
    } finally {
      setResendingPwCode(false);
    }
  };

  if (isLoading && !profile) {
    return <SettingsSkeleton showRecovery={canRecoverDatabase} />;
  }

  return (
    <div>
      {/* -- Profile and Fiscal Year Cards -- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 mb-5">
        <div className="rounded-[10px] border shadow-sm overflow-hidden" style={{ backgroundColor: "#1A1F36", borderColor: "#1A1F36" }}>
          <div className="px-7 py-5 flex min-h-[122px] items-center justify-start gap-5 text-left">
            <Avatar initials={initials} size={60} />
            <div className="min-w-0">
              <h2 className="m-0 truncate text-[18px] font-bold uppercase leading-tight text-white">{profile?.first_name} {profile?.last_name}</h2>
              <span className="mt-0.5 block text-[14px] font-medium leading-tight text-white/90">
                {ROLE_LABELS[profile?.role] || profile?.role}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[10px] border border-slate-200 shadow-sm overflow-visible">
          <div className="px-6 py-5 flex h-full min-h-[122px] flex-col items-start justify-center gap-3">
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase" style={{ color: "#8C8CA0" }}>Fiscal Year</p>
            </div>

            <div className="relative w-full" data-settings-fiscal-year-dropdown>
              <button
                type="button"
                onClick={() => setFiscalYearDropdownOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                {selectedFiscalYear}
                {fiscalYearDropdownOpen ? (
                  <IoChevronUpOutline className="text-[13px] text-slate-400" />
                ) : (
                  <IoChevronDownOutline className="text-[13px] text-slate-400" />
                )}
              </button>
              {fiscalYearDropdownOpen && (
                <div
                  className="absolute left-0 top-[calc(100%+8px)] z-30 max-h-[220px] w-full overflow-y-auto rounded-[10px] border border-slate-200 bg-white pt-0 pb-1 shadow-[0_16px_40px_rgba(15,23,42,0.12)] [&::-webkit-scrollbar]:hidden"
                  style={HIDE_SCROLLBAR_STYLE}
                >
                  {FISCAL_YEAR_OPTIONS.map((year) => (
                    <button
                      key={year}
                      type="button"
                      onClick={() => {
                        setSelectedFiscalYear(year);
                        setFiscalYearDropdownOpen(false);
                        const isCurrentYear = year === String(new Date().getFullYear());
                        const fiscalYearToastMessage = isCurrentYear
                          ? `Operational pages will show and save records under fiscal year ${year}.`
                          : `Transactions in ${year} is for viewing only.`;
                        showInfoToast("Fiscal Year Set", fiscalYearToastMessage);
                      }}
                      className="block w-full border-none px-3 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                      style={{
                        backgroundColor: year === selectedFiscalYear ? "#1a1f36" : "transparent",
                        color: year === selectedFiscalYear ? "#ffffff" : "#1a1f36",
                        fontWeight: 400,
                      }}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* -- Personal Information Card -- */}
      <div className="bg-white rounded-[10px] border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="m-0 text-[14px] font-medium uppercase" style={{ color: "#1a1f36" }}>Personal Information</h3>
            <p className="m-0 text-[12px] mt-0.5 text-slate-700">Your basic info and contact details</p>
          </div>
          <button
            onClick={() => {
              if (isTransactionLocked) { showToast("error", "Transactions Locked", transactionLockMessage); return; }
              setPersonalErrors(EMPTY_PERSONAL_ERRORS);
              setTmpP({
                first_name: profile.first_name,
                last_name: profile.last_name,
                email: profile.email,
                gender: profile.gender || "",
                contact_number: profile.contact_number,
                birthday: profile.birthday ? profile.birthday.slice(0, 10) : "",
                address: profile.address,
              });
              setShowPersonalModal(true);
            }}
            disabled={isTransactionLocked}
            className="cursor-pointer rounded-[10px] bg-white px-6 py-2 text-[14px] font-medium transition-colors inline-flex items-center gap-2"
            style={{ border: "2px solid #1a1f36", color: "#1a1f36", fontFamily: FONT, opacity: isTransactionLocked ? 0.5 : 1 }}
          >
            <IoCreateOutline className="text-[15px]" />
            Edit
          </button>
        </div>
        <div className="px-6 pt-4 pb-5 grid grid-cols-2 gap-5">
          <InfoRow label="First Name"     value={profile?.first_name}     />
          <InfoRow label="Last Name"      value={profile?.last_name}      />
          <InfoRow label="Gender"         value={GENDER_LABELS[profile?.gender] || profile?.gender} />
          <InfoRow label="Email Address"  value={profile?.email}          />
          <InfoRow label="Contact Number" value={profile?.contact_number} />
          <InfoRow label="Birthday"
            value={profile?.birthday ? new Date(profile.birthday).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : null} />
          <InfoRow label="Address" value={profile?.address} />
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-5 mb-5 ${canRecoverDatabase ? "lg:grid-cols-2" : ""}`}>
        {/* -- Security Card -- */}
        <div className="bg-white rounded-[10px] border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex min-h-[92px] items-center justify-between gap-4 px-6 py-4">
            <div>
              <h3 className="m-0 text-[14px] font-medium uppercase" style={{ color: "#1a1f36" }}>Security</h3>
              <p className="m-0 text-[12px] mt-0.5 text-slate-700">Manage your account password</p>
            </div>
            <button
              onClick={() => { if (isTransactionLocked) { showToast("error", "Transactions Locked", transactionLockMessage); return; } setPwErr(""); setPwCode([...EMPTY_VERIFICATION_CODE]); setPwCodeErr(""); setPwFieldErrors(EMPTY_PASSWORD_ERRORS); setTmpPw(EMPTY_PASSWORD_FORM); setShowPwCodeModal(false); setShowPwFields({ current: false, new_pass: false, confirm: false }); setShowPwModal(true); }}
              disabled={isTransactionLocked}
              className="cursor-pointer rounded-[10px] bg-white px-6 py-2 text-[14px] font-medium transition-colors inline-flex items-center gap-2"
              style={{ border: "2px solid #1a1f36", color: "#1a1f36", fontFamily: FONT, opacity: isTransactionLocked ? 0.5 : 1 }}
            >
              <IoCreateOutline className="text-[15px]" />
              Edit
            </button>
          </div>
        </div>

        {canRecoverDatabase && (
          <DataActionCard
            icon={IoCloudUploadOutline}
            title="Restore Backup"
            description="Upload a SQL backup file to restore the database."
            actionLabel="Upload Backup"
            actionIcon={IoCloudUploadOutline}
            loading={recoveryLoading}
            disabled={false}
            onAction={() => recoveryFileInputRef.current?.click()}
            showIcon={false}
          />
        )}
      </div>

      {canRecoverDatabase && (
        <input
          ref={recoveryFileInputRef}
          type="file"
          accept=".sql"
          className="hidden"
          onChange={handleRecoveryFileChange}
        />
      )}

      {pendingRecoveryFile && (
        <Modal
          title="Restore Database"
          onClose={() => {
            if (!recoveryLoading) setPendingRecoveryFile(null);
          }}
          onSave={handleRecoverDatabase}
          saving={recoveryLoading}
          saveLabel="Restore"
          savingLabel=""
          saveButtonWidth="118px"
          closeLabel="Cancel"
          maxWidth="520px"
        >
          <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <IoAlertCircleOutline className="mt-0.5 flex-shrink-0 text-[20px] text-amber-600" />
              <div className="min-w-0">
                <p className="m-0 text-[14px] font-semibold text-[#1a1f36]">Confirm database restore</p>
                <p className="m-0 mt-1 text-[13px] leading-6 text-slate-700">
                  This will restore the database using the selected SQL backup file. A safety backup will be created before the restore starts.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-3">
            <p className="m-0 mb-1 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>Selected File</p>
            <p className="m-0 break-words text-[13px] font-medium text-slate-700">{pendingRecoveryFile.name}</p>
          </div>
        </Modal>
      )}

      {/* -- Personal Info Modal -- */}
      {showPersonalModal && (
        <ConfigProvider theme={antTheme}>
        <Modal title="Edit Personal Information" onClose={() => setShowPersonalModal(false)} onSave={savePersonal} saving={saving}>
          <div className="settings-personal-placeholders flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <ModalTextInput label={<RequiredLabel>First Name</RequiredLabel>} value={tmpP.first_name} error={personalErrors.first_name} onChange={e => { const value = e.target.value; setTmpP(p => ({ ...p, first_name: value })); setPersonalErrors((current) => ({ ...current, first_name: "" })); }} placeholder="First name" labelClassName={PERSONAL_MODAL_LABEL_CLASS} labelStyle={PERSONAL_MODAL_LABEL_STYLE} />
            <ModalTextInput label={<RequiredLabel>Last Name</RequiredLabel>}  value={tmpP.last_name}  error={personalErrors.last_name} onChange={e => { const value = e.target.value; setTmpP(p => ({ ...p, last_name: value })); setPersonalErrors((current) => ({ ...current, last_name: "" })); }}  placeholder="Last name" labelClassName={PERSONAL_MODAL_LABEL_CLASS} labelStyle={PERSONAL_MODAL_LABEL_STYLE} />
          </div>
          <div>
            <PersonalGenderCardSelect
              value={tmpP.gender || ""}
              error={personalErrors.gender}
              onChange={(value) => {
                setTmpP((p) => ({ ...p, gender: value }));
                setPersonalErrors((current) => ({ ...current, gender: "" }));
              }}
            />
            <ModalFieldError message={personalErrors.gender} />
          </div>
          <ModalTextInput label={<RequiredLabel>Email Address</RequiredLabel>}  value={tmpP.email}          error={personalErrors.email} onChange={() => {}}          placeholder="email@example.com" type="email" icon={IoMailOutline} readOnly wrapperClassName="!bg-slate-100 !border-slate-200" inputClassName="cursor-default" labelClassName={PERSONAL_MODAL_LABEL_CLASS} labelStyle={PERSONAL_MODAL_LABEL_STYLE} />
          <ModalTextInput label={<RequiredLabel>Contact Number</RequiredLabel>} value={tmpP.contact_number} error={personalErrors.contact_number} onChange={e => { const value = e.target.value.replace(/\D/g, '').slice(0, 11); setTmpP(p => ({ ...p, contact_number: value })); setPersonalErrors((current) => ({ ...current, contact_number: "" })); }} placeholder="09XXXXXXXXX" icon={IoCallOutline} labelClassName={PERSONAL_MODAL_LABEL_CLASS} labelStyle={PERSONAL_MODAL_LABEL_STYLE} />
       
       {/* -- Birthday Field -- */}
<div>
  <p className={`m-0 mb-2 font-semibold ${PERSONAL_MODAL_LABEL_CLASS}`} style={PERSONAL_MODAL_LABEL_STYLE}><RequiredLabel>Birthday</RequiredLabel></p>
  <BirthdayPicker
    value={tmpP.birthday || ""}
    onChange={(_, currentDateString) => {
      setTmpP((p) => ({ ...p, birthday: currentDateString || "" }));
      setPersonalErrors((current) => ({ ...current, birthday: "" }));
    }}
    placeholder="Select birthday"
    containerClassName="w-full"
    inputClassName={personalErrors.birthday ? "border-red-300" : "border-slate-200"}
  />
  <ModalFieldError message={personalErrors.birthday} />
</div>
          <ModalTextInput label={<RequiredLabel>Address</RequiredLabel>}        value={tmpP.address ?? ""}   error={personalErrors.address} onChange={e => { const value = e.target.value; setTmpP(p => ({ ...p, address: value })); setPersonalErrors((current) => ({ ...current, address: "" })); }}        placeholder="e.g. Opol, Misamis Oriental" icon={IoLocationOutline} labelClassName={PERSONAL_MODAL_LABEL_CLASS} labelStyle={PERSONAL_MODAL_LABEL_STYLE} />
          </div>
        </Modal>
        </ConfigProvider>
      )}

      {/* -- Password Modal -- */}
      {showPwModal && (
        <Modal title="Change Password" onClose={() => { setShowPwModal(false); setShowPwFields({ current: false, new_pass: false, confirm: false }); }} onSave={savePw} saving={saving}>
          {[{ label: "Current Password", key: "current", placeholder: "Enter current password" },
            { label: "New Password",     key: "new_pass", placeholder: "Minimum 8 characters" },
            { label: "Confirm Password", key: "confirm",  placeholder: "Re-enter new password" }
          ].map(({ label, key, placeholder }) => (
            <ModalTextInput
              key={key}
              label={<RequiredLabel>{label}</RequiredLabel>}
              error={pwFieldErrors[key]}
              type={showPwFields[key] ? "text" : "password"}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              data-lpignore="true"
              data-form-type="other"
              name={`settings-${key}`}
              value={tmpPw[key]}
              onChange={e => {
                const { value } = e.target;
                setTmpPw(p => ({ ...p, [key]: value }));
                setPwErr("");
                setPwFieldErrors((current) => ({ ...current, [key]: "" }));
              }}
              placeholder={placeholder}
              icon={IoShieldCheckmarkOutline}
              rightAdornment={
                <button
                  type="button"
                  onClick={() => setShowPwFields((current) => ({ ...current, [key]: !current[key] }))}
                  className="flex items-center justify-center border-none bg-transparent cursor-pointer p-0 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPwFields[key] ? `Hide ${label}` : `Show ${label}`}
                >
                  {showPwFields[key] ? <IoEyeOffOutline className="text-[18px]" /> : <IoEyeOutline className="text-[18px]" />}
                </button>
              }
            />
          ))}
          {pwErr && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
              <IoAlertCircleOutline className="text-red-400 text-[14px] flex-shrink-0" />
              <p className="m-0 text-[12px] font-normal text-red-600">{pwErr}</p>
            </div>
          )}
        </Modal>
      )}

      {showPwCodeModal && (
        <Modal
          title="Email Verification"
          onClose={() => {
            setShowPwCodeModal(false);
            setPwCode([...EMPTY_VERIFICATION_CODE]);
            setPwCodeErr("");
          }}
          onSave={verifyPwChange}
          saving={saving}
          saveLabel="Verify"
        >
          <div className="pt-4 pb-1">
            <div className="flex flex-col items-center gap-4">
            <p className="m-0 text-center text-[14px] leading-6 text-slate-600">
              Please check your email, we've send a code to {profile?.email || tmpP.email}.
            </p>
            <div className="flex justify-center gap-2 sm:gap-3">
              {pwCode.map((digit, index) => (
                <input
                  key={`pw-code-${index}`}
                  ref={(element) => {
                    pwCodeInputRefs.current[index] = element;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  value={digit}
                  onChange={(event) => handlePwCodeChange(index, event.target.value)}
                  onFocus={handlePwCodeFocus}
                  onClick={handlePwCodeFocus}
                  onKeyDown={(event) => handlePwCodeKeyDown(index, event)}
                  onPaste={handlePwCodePaste}
                  className={`h-14 w-12 rounded-xl border bg-[#f8fbff] text-center text-xl font-semibold text-[#0f172a] outline-none transition sm:w-14 ${
                    pwCodeErr
                      ? "border-red-400 focus:border-red-500 focus:ring-0"
                      : "border-slate-200 focus:border-[#2563eb] focus:ring-0"
                  }`}
                />
              ))}
            </div>
            <p className="m-0 text-center text-[14px] leading-6 text-slate-600">
              Didn't get the code?{" "}
              {pwResendCountdown > 0 ? (
                <span className="font-semibold uppercase text-[#2563eb]">
                  {pwResendCountdown}
                </span>
              ) : pwResendCount >= PASSWORD_CODE_RESEND_DAILY_LIMIT ? (
                <span className="font-normal text-slate-400">
                  Resend
                </span>
              ) : (
                <button
                  type="button"
                  onClick={resendPwCode}
                  disabled={resendingPwCode}
                  className="inline-flex items-center justify-center border-none bg-transparent p-0 font-normal text-[#2563eb] cursor-pointer transition hover:text-[#1d4ed8] disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Resend
                </button>
              )}
            </p>
            </div>
          </div>
        </Modal>
      )}

      {/* -- Avatar Modal -- */}
      {false && (
        <Modal
          title="Edit Profile Photo"
          onClose={() => setShowAvatarModal(false)}
          onSave={saveAvatar}
          saving={saving}
          saveDisabled={isTransactionLocked}
          saveLabel="Save"
          savingLabel="Uploading..."
          closeLabel="Cancel"
          saveButtonWidth="116px"
          maxWidth="480px"
        >
          <div className="flex flex-col items-center gap-5 pb-1">
              <div ref={dragRef}
                className="relative w-36 h-36 rounded-full overflow-hidden flex items-center justify-center border-4 shadow-md select-none"
                style={{ background: "linear-gradient(135deg, #2d3561, #1a1f36)", borderColor: "#1a1f36", cursor: avatarPreview ? "grab" : "default" }}
                onMouseEnter={() => setShowGrid(true)}
                onMouseLeave={() => { setShowGrid(false); onDragEnd(); }}
                onMouseDown={onDragStart} onMouseMove={onDragMove} onMouseUp={onDragEnd}
                onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}>
                {avatarPreview
                  ? <img src={avatarPreview} alt="preview" draggable={false} className="w-full h-full"
                      style={{ objectFit: "cover", objectPosition: `${imgOffset.x}% ${imgOffset.y}%`, pointerEvents: "none" }} />
                  : <span className="text-white text-3xl font-bold" style={{ pointerEvents: "none" }}>{initials}</span>}
                {showGrid && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-px" style={{ background: "rgba(255,255,255,0.35)" }} />
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-px"  style={{ background: "rgba(255,255,255,0.35)" }} />
                    <div className="absolute left-0 right-0 h-px" style={{ top: "33%",  background: "rgba(255,255,255,0.2)" }} />
                    <div className="absolute left-0 right-0 h-px" style={{ top: "66%",  background: "rgba(255,255,255,0.2)" }} />
                    <div className="absolute top-0 bottom-0 w-px" style={{ left: "33%", background: "rgba(255,255,255,0.2)" }} />
                    <div className="absolute top-0 bottom-0 w-px" style={{ left: "66%", background: "rgba(255,255,255,0.2)" }} />
                    <div className="absolute w-2 h-2 rounded-full" style={{ top: "calc(50% - 4px)", left: "calc(50% - 4px)", background: "rgba(255,255,255,0.6)" }} />
                  </div>
                )}
              </div>
              {selectedFile && (
                <p className="m-0 text-[11px] text-center" style={{ color: "#1a1f36" }}>
                  Drag to reposition � <span className="font-semibold">{selectedFile.name}</span>
                </p>
              )}
              <button onClick={() => { if (!isTransactionLocked) avatarFileRef.current.click(); else showToast("error", "Transactions Locked", transactionLockMessage); }}
                disabled={isTransactionLocked}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-[10px] border-2 text-[13px] font-semibold cursor-pointer bg-white w-full disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderColor: "#1a1f36", color: "#1a1f36", fontFamily: "'Montserrat', sans-serif" }}>
                <IoCameraOutline style={{ fontSize: "15px" }} />
                {selectedFile ? "Change Photo" : "Upload Photo"}
              </button>
              <input ref={avatarFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={e => {
                  const f = e.target.files[0];
                  if (!f) return;
                  if (f.size > 2 * 1024 * 1024) { showToast("error", "Invalid File", "File must be smaller than 2MB."); return; }
                  setSelectedFile(f);
                  const reader = new FileReader();
                  reader.onload = ev => { setAvatarPreview(ev.target.result); setImgOffset({ x: 50, y: 50 }); };
                  reader.readAsDataURL(f);
                }} />
          </div>
        </Modal>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------
// SuperSettings
// ---------------------------------------------------------------------
const SuperSettings = () => {
  const navigate = useNavigate();
  const [activeItem, setActiveItem] = useState("Settings");

  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const settingsQuery = useSettingsQuery();

  const [contentMargin, setContentMargin] = useState(() =>
    window.innerWidth >= 900 ? 256 : 0
  );

  const handleWidthChange = useCallback((width) => {
    setContentMargin(width);
  }, []);

  const showToast = (type, title, message) => {
    if (type === "info" && title === "No Changes Made") {
      showNoChangesToast();
      return;
    }
    showBottomToast(type, title, message);
  };

  useEffect(() => {
    if (window.innerWidth >= 900 && sidebarOpen)
      setContentMargin(sidebarCollapsed ? 72 : 256);
    else if (window.innerWidth < 900)
      setContentMargin(0);
  }, [sidebarCollapsed, sidebarOpen]);

  return (
    <>
      <style>{`
        * { font-family: 'Montserrat', sans-serif !important; }
        input::placeholder { color: #1a1f36 !important; opacity: 0.4; }
        .settings-personal-placeholders input::placeholder {
          color: #94a3b8 !important;
          opacity: 1 !important;
          font-weight: 400 !important;
        }
        .settings-personal-placeholders .ant-select-selection-placeholder,
        .settings-personal-placeholders .ant-picker-input input::placeholder {
          color: #94a3b8 !important;
          opacity: 1 !important;
          font-weight: 400 !important;
        }
        .settings-scroll-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .settings-scroll-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onWidthChange={handleWidthChange} />

        <div
          className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            marginLeft: sidebarOpen && window.innerWidth >= 900 ? `${contentMargin}px` : "0px",
            transition: "margin-left 0.3s ease",
          }}
        >
          <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />

          <main className="min-w-0 flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8 settings-scroll-hide">
            <div className="mx-auto w-full max-w-[1440px]">
              <div className="mb-5 flex items-center justify-between">
                <TitlePage title="Settings" subtitle="Manage your profile information" loading={!settingsQuery.data && settingsQuery.isLoading} />
                <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: "Settings" }]} fontFamily={FONT} loading={!settingsQuery.data && settingsQuery.isLoading} />
              </div>

              <UserProfileTab showToast={showToast} />
            </div>
          </main>
        </div>
      </div>
    </>
  );
};

export default SuperSettings;
