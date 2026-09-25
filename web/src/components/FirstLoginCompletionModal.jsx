import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  IoAlertCircleOutline,
  IoCheckmarkOutline,
  IoCloseOutline,
  IoEyeOffOutline,
  IoEyeOutline,
} from "react-icons/io5";
import Modal from "./Modal";
import Spinner from "./Spinner";
import api from "../api/axios";
import { getStoredToken, getStoredUser, normalizeRole } from "../pages/login/auth";
import { logoutUser } from "../pages/login/logout";
import { showBottomToast } from "../store/bottomToastStore";

const FONT = "'Montserrat', sans-serif";

const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters" },
  { key: "uppercase", label: "One uppercase letter" },
  { key: "number", label: "One number" },
  { key: "symbol", label: "One symbol" },
];

const getPasswordStatus = (password = "") => ({
  length: password.length >= 8,
  uppercase: /[A-Z]/.test(password),
  number: /\d/.test(password),
  symbol: /[^A-Za-z0-9]/.test(password),
});

const getPasswordError = (password = "") => {
  const status = getPasswordStatus(password);

  if (!password) return "Password is required.";
  if (!status.length) return "Password must be at least 8 characters.";
  if (!status.uppercase) return "Password must include at least 1 uppercase letter.";
  if (!status.number) return "Password must include at least 1 number.";
  if (!status.symbol) return "Password must include at least 1 symbol.";

  return "";
};

const FieldError = ({ message }) => message ? (
  <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
    <IoAlertCircleOutline className="flex-shrink-0 text-[14px] text-red-400" />
    <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>{message}</p>
  </div>
) : null;

const FieldSuccess = ({ message }) => message ? (
  <div className="mt-2 flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 px-3 py-2">
    <IoCheckmarkOutline className="flex-shrink-0 text-[14px] text-green-500" />
    <p className="m-0 text-[12px] font-normal text-green-700" style={{ fontFamily: FONT }}>{message}</p>
  </div>
) : null;

const LiveInput = ({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  error = "",
  success = false,
  type = "text",
  rightAdornment = null,
}) => (
  <div>
    <p className="m-0 mb-2 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82" }}>
      {label}<span className="ml-0.5 text-red-500"> *</span>
    </p>
    <div
      className={`flex h-[46px] items-center gap-3 rounded-xl border bg-white px-4 transition-all ${
        error ? "border-red-300" : success ? "border-green-300" : "border-slate-200 focus-within:border-[#4096ff]"
      }`}
    >
      <input
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border-none bg-transparent text-[14px] font-medium text-[#0d1117] outline-none placeholder:font-normal placeholder:text-slate-400"
        style={{ fontFamily: FONT }}
      />
      {success && !error ? <IoCheckmarkOutline className="flex-shrink-0 text-[18px] text-green-500" /> : null}
      {rightAdornment}
    </div>
  </div>
);

const needsFirstLoginCompletion = (user) => (
  normalizeRole(user?.role) === "coordinator"
  && (!String(user?.first_name || "").trim() || !String(user?.last_name || "").trim())
);

export default function FirstLoginCompletionModal() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    password: "",
    password_confirmation: "",
  });
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
  }, [location.pathname]);

  const shouldShow = Boolean(getStoredToken()) && location.pathname !== "/login" && needsFirstLoginCompletion(user);

  const localErrors = useMemo(() => ({
    first_name: String(form.first_name || "").trim() ? "" : "First name is required.",
    last_name: String(form.last_name || "").trim() ? "" : "Last name is required.",
    password: getPasswordError(form.password),
    password_confirmation: !form.password_confirmation
      ? "Please re type the password."
      : form.password_confirmation !== form.password
        ? "Passwords do not match."
        : "",
  }), [form]);

  const passwordStatus = useMemo(() => getPasswordStatus(form.password), [form.password]);
  const getError = (field) => serverErrors?.[field]?.[0] || (touched[field] ? localErrors[field] : "");
  const getSuccess = (field) => touched[field] && !getError(field) && String(form[field] || "").trim() !== "";
  const passwordError = getError("password");
  const passwordSuccess = touched.password && !passwordError && !getPasswordError(form.password);
  const confirmError = getError("password_confirmation");
  const confirmSuccess = touched.password_confirmation && !confirmError && form.password_confirmation !== "";

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setTouched((current) => ({ ...current, [field]: true }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
  };

  const markTouched = (field) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const handleSave = async () => {
    const nextTouched = {
      first_name: true,
      last_name: true,
      password: true,
      password_confirmation: true,
    };
    setTouched(nextTouched);

    const nextErrors = Object.fromEntries(
      Object.entries(localErrors)
        .filter(([, message]) => message)
        .map(([field, message]) => [field, [message]])
    );

    if (Object.keys(nextErrors).length) {
      setServerErrors(nextErrors);
      return;
    }

    setSaving(true);
    setServerErrors({});

    try {
      const response = await api.put(`/users/${user.user_id ?? user.id}`, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        password: form.password,
        password_confirmation: form.password_confirmation,
      });
      const updatedUser = response.data?.data ? { ...user, ...response.data.data } : {
        ...user,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
      };

      sessionStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      setForm({
        first_name: updatedUser.first_name || "",
        last_name: updatedUser.last_name || "",
        password: "",
        password_confirmation: "",
      });
      setTouched({});
      showBottomToast("success", "Account Completed", "Your account details were saved successfully.");
    } catch (error) {
      if (error.response?.status === 422) {
        setServerErrors(error.response.data?.errors || {});
      } else {
        showBottomToast("error", "Update Failed", error.response?.data?.message || "Unable to complete your account.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (saving || signingOut) return;

    setSigningOut(true);
    try {
      await logoutUser();
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  if (!shouldShow) return null;

  return (
    <Modal
      title="Complete Account"
      onClose={() => {}}
      saving={saving}
      showFooterActions={false}
      closeOnBackdrop={false}
      maxWidth="540px"
      hideCloseButton
      titleClassName="text-center"
      centerFooterContent
      footerRightContent={
        <div className="flex w-full flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={saving || signingOut}
            className="flex h-[46px] w-[150px] cursor-pointer items-center justify-center rounded-[10px] bg-white px-6 text-[14px] font-normal disabled:cursor-not-allowed disabled:opacity-70"
            style={{ border: "2px solid #1a1f36", color: "#1a1f36", fontFamily: FONT }}
          >
            {signingOut ? <Spinner size={4} /> : "Go Back"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex h-[46px] w-[150px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none px-6 text-[14px] font-normal text-white disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: "#1a1f36", fontFamily: FONT }}
          >
            {saving ? <Spinner size={4} /> : "Save Changes"}
          </button>
        </div>
      }
    >
      <div>
        <LiveInput
          label="First Name"
          value={form.first_name}
          onChange={(event) => updateField("first_name", event.target.value)}
          onBlur={() => markTouched("first_name")}
          placeholder="Enter first name"
          error={getError("first_name")}
        />
        <FieldError message={getError("first_name")} />
      </div>

      <div>
        <LiveInput
          label="Last Name"
          value={form.last_name}
          onChange={(event) => updateField("last_name", event.target.value)}
          onBlur={() => markTouched("last_name")}
          placeholder="Enter last name"
          error={getError("last_name")}
        />
        <FieldError message={getError("last_name")} />
      </div>

      <div>
        <LiveInput
          label="Password"
          value={form.password}
          onChange={(event) => updateField("password", event.target.value)}
          onBlur={() => markTouched("password")}
          placeholder="Enter password"
          error={passwordError}
          success={passwordSuccess}
          type={showPassword ? "text" : "password"}
          rightAdornment={
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="flex items-center justify-center border-none bg-transparent p-0 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <IoEyeOffOutline className="text-[18px]" /> : <IoEyeOutline className="text-[18px]" />}
            </button>
          }
        />
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {PASSWORD_RULES.map((rule) => {
            const passed = passwordStatus[rule.key];
            const active = touched.password || form.password !== "";

            return (
              <div key={rule.key} className="flex items-center gap-2">
                {passed ? (
                  <IoCheckmarkOutline className="flex-shrink-0 text-[13px] text-green-500" />
                ) : (
                  <IoCloseOutline className={`flex-shrink-0 text-[13px] ${active ? "text-red-400" : "text-slate-300"}`} />
                )}
                <span className={`text-[11px] ${passed ? "text-green-700" : active ? "text-red-500" : "text-slate-400"}`}>
                  {rule.label}
                </span>
              </div>
            );
          })}
        </div>
        <FieldError message={passwordError} />
        <FieldSuccess message={passwordSuccess ? "Password is strong." : ""} />
      </div>

      <div>
        <LiveInput
          label="Re Type Password"
          value={form.password_confirmation}
          onChange={(event) => updateField("password_confirmation", event.target.value)}
          onBlur={() => markTouched("password_confirmation")}
          placeholder="Re type password"
          error={confirmError}
          success={confirmSuccess}
          type={showConfirmPassword ? "text" : "password"}
          rightAdornment={
            <button
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              className="flex items-center justify-center border-none bg-transparent p-0 text-slate-400 hover:text-slate-600"
            >
              {showConfirmPassword ? <IoEyeOffOutline className="text-[18px]" /> : <IoEyeOutline className="text-[18px]" />}
            </button>
          }
        />
        <FieldError message={confirmError} />
        <FieldSuccess message={confirmSuccess ? "Passwords match." : ""} />
      </div>
    </Modal>
  );
}
