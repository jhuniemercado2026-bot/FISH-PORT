import React, { useEffect, useRef, useState } from "react";
import "@fontsource/anton";
import "typeface-montserrat";
import { useLocation, useNavigate } from "react-router-dom";
import {
  IoAlertCircleOutline,
  IoArrowBackOutline,
  IoBoatOutline,
  IoEyeOffOutline,
  IoEyeOutline,
  IoHeadsetOutline,
  IoLockClosedOutline,
  IoLogInOutline,
  IoMailOutline,
  IoPersonOutline,
  IoShieldCheckmarkOutline,
} from "react-icons/io5";
import { useLoginMutation } from "../../hooks/useLoginMutation";
import api from "../../api/axios";
import {
  clearStoredAuth,
  getDefaultRouteForUser,
  hasAllowedWebRole,
  isAuthenticated,
  getStoredUser,
} from "./auth";
import Spinner from "../../components/Spinner";
import { notifyRealtimeAuthChanged } from "../../lib/realtime";

const FORCED_LOGOUT_MESSAGE_KEY = "forcedLogoutMessage";

const normalizeProfileImageUrl = (user) => {
  if (!user) return user;

  const base = "http://127.0.0.1:8000";
  const rawUrl = String(user.profile_image_url || "").trim();

  if (user.profile_image) {
    return {
      ...user,
      profile_image_url: `${base}/storage/${String(user.profile_image).replace(/^\/+/, "")}`,
    };
  }

  if (!rawUrl) return user;
  if (/^(https?:|data:|blob:)/i.test(rawUrl)) return user;
  if (rawUrl.startsWith("/storage/")) return { ...user, profile_image_url: `${base}${rawUrl}` };
  if (rawUrl.startsWith("storage/")) return { ...user, profile_image_url: `${base}/${rawUrl}` };

  return user;
};

const LoginFieldError = ({ message }) => (
  message ? (
    <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 font-normal">
      <IoAlertCircleOutline className="flex-shrink-0 text-[14px] text-red-400" />
      <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        {message}
      </p>
    </div>
  ) : null
);

const FORGOT_PASSWORD_RESEND_DAILY_LIMIT = 3;
const FORGOT_PASSWORD_RESEND_COOLDOWN_SECONDS = 59;
const VERIFICATION_CODE_LIMIT_MESSAGE =
  "You have reached the verification code limit for today. Please use the latest verification code sent to your email. This code expires within this day.";

const Login = () => {
  // Routing and navigation hooks
  const navigate = useNavigate();
  const location = useLocation();

  // Form state values
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [showForgotOverlay, setShowForgotOverlay] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotEmailError, setForgotEmailError] = useState("");
  const [forgotEmailVerified, setForgotEmailVerified] = useState(false);
  const [forgotCodeVerified, setForgotCodeVerified] = useState(false);
  const [isCheckingForgotEmail, setIsCheckingForgotEmail] = useState(false);
  const [isVerifyingForgotCode, setIsVerifyingForgotCode] = useState(false);
  const [isResettingForgotPassword, setIsResettingForgotPassword] = useState(false);
  const [forgotResendCountdown, setForgotResendCountdown] = useState(0);
  const [forgotResendCount, setForgotResendCount] = useState(0);
  const [forgotCodeError, setForgotCodeError] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotPasswordErrors, setForgotPasswordErrors] = useState({});
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);
  const [resetCode, setResetCode] = useState(["", "", "", "", "", ""]);
  const codeInputRefs = useRef([]);

  // API login mutation hook with loading state
  const loginMutation = useLoginMutation();
  const isLoading = loginMutation.isPending;
  const isResetCodeComplete = resetCode.every((digit) => String(digit || "").trim() !== "");
  const forgotStep = forgotCodeVerified ? 3 : forgotEmailVerified ? 2 : 1;

  useEffect(() => {
    const forcedLogoutMessage = sessionStorage.getItem(FORCED_LOGOUT_MESSAGE_KEY);

    if (!forcedLogoutMessage) {
      return;
    }

    sessionStorage.removeItem(FORCED_LOGOUT_MESSAGE_KEY);
    setErrorMessage(forcedLogoutMessage);
  }, []);

  // Prevent page scrolling on mobile
  useEffect(() => {
    document.documentElement.classList.add("login-scroll-hide");
    document.body.classList.add("login-scroll-hide");
    return () => {
      document.documentElement.classList.remove("login-scroll-hide");
      document.body.classList.remove("login-scroll-hide");
    };
  }, []);

  // Check auth status and redirect if already logged in
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const freshLogin = searchParams.get("fresh") === "1";

    if (freshLogin) {
      clearStoredAuth();
      navigate("/login", { replace: true });
      return;
    }

    const user = getStoredUser();

    if (user && !hasAllowedWebRole(user)) {
      clearStoredAuth();
      return;
    }

    if (isAuthenticated()) {
      navigate(getDefaultRouteForUser(user), { replace: true });
    }
  }, [location.search, navigate]);

  useEffect(() => {
    if (forgotResendCountdown <= 0) return undefined;

    const timer = window.setInterval(() => {
      setForgotResendCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [forgotResendCountdown]);

  // Helper functions for toggling password and clearing errors
  const togglePassword = () => setShowPassword(!showPassword);
  const clearErrors = () => {
    setErrorMessage("");
    setSuccessMessage("");
    setFieldErrors({});
  };
  const clearFieldError = (field) => {
    setErrorMessage("");
    setSuccessMessage("");
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: "",
      };
    });
  };

  const handleResetCodeChange = (index, value) => {
    const sanitizedValue = value.replace(/\D/g, "").slice(-1);
    setForgotCodeError("");

    setResetCode((current) => {
      const next = [...current];
      next[index] = sanitizedValue;
      return next;
    });

    if (sanitizedValue && index < codeInputRefs.current.length - 1) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleResetCodeKeyDown = (index, event) => {
    if (event.key === "Backspace" && !resetCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const openForgotOverlay = () => {
    const nextEmail = email.trim();
    setForgotEmail(nextEmail);
    setForgotEmailError("");
    setForgotEmailVerified(false);
    setForgotCodeVerified(false);
    setForgotResendCountdown(0);
    setForgotResendCount(0);
    setForgotCodeError("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
    setForgotPasswordErrors({});
    setShowForgotNewPassword(false);
    setShowForgotConfirmPassword(false);
    setResetCode(["", "", "", "", "", ""]);
    setShowForgotOverlay(true);
  };

  const closeForgotOverlay = () => {
    setShowForgotOverlay(false);
    setForgotEmail("");
    setForgotEmailError("");
    setForgotEmailVerified(false);
    setForgotCodeVerified(false);
    setIsCheckingForgotEmail(false);
    setIsVerifyingForgotCode(false);
    setIsResettingForgotPassword(false);
    setForgotResendCountdown(0);
    setForgotResendCount(0);
    setForgotCodeError("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
    setForgotPasswordErrors({});
    setShowForgotNewPassword(false);
    setShowForgotConfirmPassword(false);
    setResetCode(["", "", "", "", "", ""]);
  };

  const handleForgotBack = () => {
    if (forgotCodeVerified) {
      setForgotCodeVerified(false);
      setForgotNewPassword("");
      setForgotConfirmPassword("");
      setForgotPasswordErrors({});
      setShowForgotNewPassword(false);
      setShowForgotConfirmPassword(false);
      return;
    }

    if (forgotEmailVerified) {
      setForgotEmailVerified(false);
      setForgotCodeVerified(false);
      setForgotCodeError("");
      setResetCode(["", "", "", "", "", ""]);
      return;
    }

    closeForgotOverlay();
  };

  const handleForgotEmailCheck = async () => {
    const nextEmail = forgotEmail.trim();

    setForgotEmailError("");
    setForgotEmailVerified(false);
    setForgotCodeVerified(false);
    setResetCode(["", "", "", "", "", ""]);

    if (!nextEmail) {
      setForgotEmailError("Email address is required.");
      return;
    }

    setIsCheckingForgotEmail(true);

    try {
      const response = await api.post("/forgot-password/check-email", { email: nextEmail });
      setForgotResendCount(
        FORGOT_PASSWORD_RESEND_DAILY_LIMIT - Number(response.data?.remaining_resends ?? FORGOT_PASSWORD_RESEND_DAILY_LIMIT)
      );
      setForgotEmailVerified(true);
      requestAnimationFrame(() => {
        codeInputRefs.current[0]?.focus();
      });
    } catch (error) {
      const remainingResends = error?.response?.data?.remaining_resends;
      if (typeof remainingResends === "number") {
        setForgotResendCount(FORGOT_PASSWORD_RESEND_DAILY_LIMIT - remainingResends);
      }

      if (remainingResends === 0) {
        setForgotEmailError("");
        setForgotEmailVerified(true);
        setForgotCodeError(VERIFICATION_CODE_LIMIT_MESSAGE);
        requestAnimationFrame(() => {
          codeInputRefs.current[0]?.focus();
        });
        return;
      }

      const message =
        error?.response?.data?.errors?.email?.[0] ||
        error?.response?.data?.message ||
        "Email does not exist.";
      setForgotEmailError(message);
    } finally {
      setIsCheckingForgotEmail(false);
    }
  };

  const handleForgotResendCode = async () => {
    if (
      forgotResendCountdown > 0 ||
      isCheckingForgotEmail ||
      forgotResendCount >= FORGOT_PASSWORD_RESEND_DAILY_LIMIT
    ) {
      return;
    }

    setForgotCodeError("");
    setForgotResendCountdown(FORGOT_PASSWORD_RESEND_COOLDOWN_SECONDS);
    setIsCheckingForgotEmail(true);

    try {
      const response = await api.post("/forgot-password/check-email", {
        email: forgotEmail.trim(),
        resend: true,
      });
      setForgotResendCount(
        FORGOT_PASSWORD_RESEND_DAILY_LIMIT - Number(response.data?.remaining_resends ?? FORGOT_PASSWORD_RESEND_DAILY_LIMIT)
      );
      setResetCode(["", "", "", "", "", ""]);
      requestAnimationFrame(() => {
        codeInputRefs.current[0]?.focus();
      });
    } catch (error) {
      const remainingResends = error?.response?.data?.remaining_resends;
      if (typeof remainingResends === "number") {
        setForgotResendCount(FORGOT_PASSWORD_RESEND_DAILY_LIMIT - remainingResends);
      }
      setForgotResendCountdown(0);
      setForgotCodeError(
        remainingResends === 0
          ? VERIFICATION_CODE_LIMIT_MESSAGE
          : error?.response?.data?.errors?.email?.[0] ||
              error?.response?.data?.message ||
              "Failed to resend the verification code."
      );
    } finally {
      setIsCheckingForgotEmail(false);
    }
  };

  const handleForgotVerifyCode = async () => {
    const verificationCode = resetCode.join("");

    setForgotCodeError("");

    if (!/^\d{6}$/.test(verificationCode)) {
      setForgotCodeError("Enter the 6 digits code sent to your email.");
      return;
    }

    setIsVerifyingForgotCode(true);

    try {
      await api.post("/forgot-password/verify-code", {
        email: forgotEmail.trim(),
        verification_code: verificationCode,
      });
      setForgotCodeVerified(true);
      setForgotPasswordErrors({});
    } catch (error) {
      setForgotCodeError(
        error?.response?.data?.errors?.verification_code?.[0] ||
        error?.response?.data?.message ||
        "Failed to verify the code."
      );
    } finally {
      setIsVerifyingForgotCode(false);
    }
  };

  const handleForgotResetPassword = async () => {
    const verificationCode = resetCode.join("");
    const nextErrors = {};

    if (!forgotNewPassword.trim()) {
      nextErrors.password = "New password is required.";
    } else if (forgotNewPassword.length < 8) {
      nextErrors.password = "New password must be at least 8 characters.";
    }

    if (!forgotConfirmPassword.trim()) {
      nextErrors.password_confirmation = "Confirm password is required.";
    } else if (forgotConfirmPassword !== forgotNewPassword) {
      nextErrors.password_confirmation = "Passwords do not match.";
    }

    setForgotPasswordErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    setIsResettingForgotPassword(true);

    try {
      await api.post("/forgot-password/reset", {
        email: forgotEmail.trim(),
        verification_code: verificationCode,
        password: forgotNewPassword,
        password_confirmation: forgotConfirmPassword,
      });
      closeForgotOverlay();
      setPassword("");
      setFieldErrors({});
      setErrorMessage("");
      setSuccessMessage("Password changed successfully. Please sign in with your new password.");
    } catch (error) {
      const backendErrors = error?.response?.data?.errors ?? {};
      setForgotPasswordErrors({
        password: backendErrors.password?.[0] || "",
        password_confirmation: backendErrors.password_confirmation?.[0] || "",
        verification_code: backendErrors.verification_code?.[0] || "",
      });
    } finally {
      setIsResettingForgotPassword(false);
    }
  };

  // Handle form submission with API call and error handling
  const handleSubmit = async (e) => {
    e.preventDefault();
    clearErrors();

    try {
      const data = await loginMutation.mutateAsync({ email, password });
      const role = data.user?.role;

      if (!hasAllowedWebRole(data.user)) {
        setErrorMessage(
          "Only head and coordinator accounts can sign in on the web app.",
        );
        return;
      }

      const normalizedUser = normalizeProfileImageUrl(data.user);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(normalizedUser));
      notifyRealtimeAuthChanged();

      navigate("/dashboard", { replace: true });
    } catch (error) {
      const response = error?.response;
      if (!response) {
        setErrorMessage("Network error. Please try again.");
        return;
      }
      const { status, data } = response;
      if (status === 422 && data?.errors) {
        setFieldErrors({
          email: data.errors.email?.[0] || "",
          password: data.errors.password?.[0] || "",
        });
      } else if (status === 401) {
        setFieldErrors({ password: data?.message || "Incorrect password." });
      } else if (status === 403) {
        setErrorMessage(data?.message || "Your account has been deactivated.");
      } else if (status === 404) {
        setFieldErrors({ email: data?.message || "Email does not exist." });
      } else {
        setErrorMessage(data?.message || "Login failed. Please try again.");
      }
    }
  };

  // Render mobile-friendly single form layout
  return (
    <div
      className="login-page min-h-screen overflow-hidden bg-[#f8fafc]"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <div className="relative hidden flex-col items-center justify-center overflow-hidden lg:flex lg:w-1/2">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/images/port1.png')" }}
          />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(26, 31, 54, 0.88)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 18% 22%, rgba(59,130,246,0.15), transparent 32%), radial-gradient(circle at 82% 16%, rgba(96,165,250,0.10), transparent 26%)",
            }}
          />
          <div className="relative z-10 flex w-full max-w-[640px] flex-col items-center justify-center px-8 text-center">
            <img
              src="/images/opol_fish_port.png"
              alt="Opol Fish Port Logo"
              className="h-44 w-auto object-contain xl:h-52"
            />
            <p
              className="mt-5 text-[48px] font-normal uppercase leading-none tracking-[0.04em] text-white xl:text-[72px]"
              style={{ fontFamily: "'Anton', sans-serif" }}
            >
              Opol&nbsp;Fish&nbsp;
              <span
                style={{
                  color: "#3b82f6",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  fontWeight: "inherit",
                  letterSpacing: "inherit",
                  lineHeight: "inherit",
                  textTransform: "inherit",
                }}
              >
                Port
              </span>
            </p>
            <div className="mt-6 flex w-full max-w-[380px] items-center justify-center gap-4">
              <div
                className="h-px flex-1 bg-white/75"
                style={{
                  clipPath: "polygon(0 50%, 10px 0, 100% 0, 100% 100%, 10px 100%)",
                }}
              />
              <IoBoatOutline className="text-[30px] text-white/90" />
              <div
                className="h-px flex-1 bg-white/75"
                style={{
                  clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)",
                }}
              />
            </div>
            <div className="mt-6 flex max-w-[520px] flex-col items-center gap-2 text-white/90">
              <p className="m-0 text-[14px] leading-7 text-white/80 xl:text-[20px]">
                Efficient. Transparent. Accountable.
              </p>
              <p className="m-0 text-[14px] leading-7 text-white/80 xl:text-[20px]">
                Building a better future for our fishing community.
              </p>
            </div>
          </div>
        </div>

        <div className="relative flex w-full items-center justify-center overflow-hidden px-4 py-8 sm:px-6 lg:w-1/2 lg:px-10 lg:py-10">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-35"
            style={{ backgroundImage: "url('/images/bg2.jpg')" }}
          />
          <div className="absolute inset-0 bg-white/85" />
          <div className="relative z-10 w-full max-w-[565px]">
            <div className="rounded-[10px] border border-slate-200 bg-white/95 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-10">
              <div className="relative mx-auto w-full">
                <div className="mb-8 text-left">
                  <h1 className="text-3xl font-bold leading-none text-[#0f172a] sm:text-4xl">
                    Sign In
                  </h1>
                  <p className="mt-0.5 text-sm tracking-[0.03em] text-slate-500 sm:text-base">
                    Enter your account to continue!
                  </p>
                </div>

                {/* Login form with fields */}
                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                {/* Email input field */}
                <div>
                  <label className="text-sm font-normal text-[#0f172a]">
                    Email Address
                  </label>
                  <div className="relative mt-2">
                    <IoMailOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError("email");
                      }}
                      placeholder="you@gmail.com"
                      required
                      disabled={isLoading}
                      style={{ fontFamily: "'Montserrat', sans-serif" }}
                      className={`w-full rounded-xl border bg-[#f8fbff] py-3.5 pl-12 pr-4 text-md focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                        fieldErrors.email
                          ? "border-red-300 focus:border-red-300 focus:ring-0"
                          : "border-slate-200 focus:ring-1 focus:ring-[#2563eb]/90"
                      }`}
                    />
                  </div>
                  <LoginFieldError message={fieldErrors.email} />
                </div>

                {/* Password input field with show/hide toggle */}
                <div>
                  <label className="text-sm font-normal text-[#0f172a]">
                    Password
                  </label>
                  <div className="relative mt-2">
                    <IoLockClosedOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearFieldError("password");
                      }}
                      placeholder="......."
                      required
                      disabled={isLoading}
                      style={{ fontFamily: "'Montserrat', sans-serif" }}
                      className={`w-full rounded-xl border bg-[#f8fbff] py-3.5 pl-12 pr-12 text-md focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                        fieldErrors.password
                          ? "border-red-300 focus:border-red-300 focus:ring-0"
                          : "border-slate-200 focus:ring-1 focus:ring-[#2563eb]/90"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={togglePassword}
                      disabled={isLoading}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 disabled:opacity-60"
                    >
                      {showPassword ? (
                        <IoEyeOffOutline className="text-xl" />
                      ) : (
                        <IoEyeOutline className="text-xl" />
                      )}
                    </button>
                  </div>
                  <LoginFieldError message={fieldErrors.password} />
                </div>

                {/* Remember me and forgot password row */}
                <div className="flex items-center justify-between">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 accent-[#2563eb]"
                      disabled={isLoading}
                    />
                    <span className="text-[#4b5769]">Remember Me</span>
                  </label>
                  <button
                    type="button"
                    onClick={openForgotOverlay}
                    disabled={isLoading}
                    className="text-sm font-normal text-[#2563eb] hover:underline disabled:opacity-60"
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* General error message display */}
                {errorMessage && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700">
                    <IoAlertCircleOutline className="shrink-0 text-[18px] text-red-500" />
                    {errorMessage}
                  </div>
                )}
                {successMessage && (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-center text-sm font-medium text-green-700">
                    {successMessage}
                  </div>
                )}

                {/* Submit button with loading state */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0a162b] py-3.5 text-sm font-normal text-white transition hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-80"
                >
                  {isLoading ? (
                    <>
                      <Spinner size={20} className="text-white" />
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>

                <div className="!mt-8 !mb-0">
                  <div className="h-px w-full bg-slate-200" />
                </div>

                <p className="!mt-8 flex items-center justify-center gap-2 text-center text-sm text-slate-500">
                  <IoHeadsetOutline className="text-base text-slate-400" />
                  Need Help? Contact the{' '}
                  <button
                    type="button"
                    className="font-medium text-[#2563eb] hover:underline"
                  >
                    System Administrator
                  </button>
                </p>
                </form>
              </div>
            </div>

            <p className="mt-8 text-center text-[14px] text-slate-500">
              © 2026 Fish Port Management System. All rights reserved.
            </p>

            {showForgotOverlay && (
                  <div className="absolute inset-0 z-10 rounded-[10px] bg-white">
                    <div className="flex h-full flex-col justify-center rounded-[10px] border border-slate-200 bg-white p-6 sm:p-8">
                      <div className="absolute left-6 right-6 top-6 flex items-center justify-between sm:left-8 sm:right-8 sm:top-8">
                        <button
                          type="button"
                          onClick={handleForgotBack}
                          disabled={
                            isCheckingForgotEmail ||
                            isVerifyingForgotCode ||
                            isResettingForgotPassword
                          }
                          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <IoArrowBackOutline className="text-base" />
                        </button>
                        <span className="text-[13px] font-semibold text-slate-500">
                          {forgotStep}/3
                        </span>
                      </div>

                      {!forgotEmailVerified ? (
                        <div className="mx-auto w-full max-w-md text-center">
                          <div className="mt-6">
                            <h2 className="text-2xl font-semibold text-[#0f172a]">
                              Forgot Password
                            </h2>
                            <p className="mt-2 text-sm text-slate-500">
                              Enter your email address first to verify your account.
                            </p>
                          </div>

                          <div className="mt-8 text-left">
                            <label className="text-sm font-normal text-[#0f172a]">
                              Email Address
                            </label>
                            <div className="relative mt-2">
                              <IoMailOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                              <input
                                type="email"
                                value={forgotEmail}
                                onChange={(event) => {
                                  setForgotEmail(event.target.value);
                                  setForgotEmailError("");
                                  setResetCode(["", "", "", "", "", ""]);
                                }}
                                placeholder="you@gmail.com"
                                disabled={isCheckingForgotEmail}
                                className={`w-full rounded-xl border bg-[#f8fbff] py-3.5 pl-12 pr-4 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                                  forgotEmailError
                                    ? "border-red-300 focus:border-red-300 focus:ring-0"
                                    : "border-slate-200 focus:ring-1 focus:ring-[#2563eb]/90"
                                }`}
                              />
                            </div>
                            <LoginFieldError message={forgotEmailError} />
                            <button
                              type="button"
                              onClick={handleForgotEmailCheck}
                              disabled={isCheckingForgotEmail}
                              className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-[#0a162b] py-3.5 text-sm font-normal text-white transition hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-80"
                            >
                              {isCheckingForgotEmail ? <Spinner size={20} className="text-white" /> : "Check Email"}
                            </button>
                          </div>
                        </div>
                      ) : !forgotCodeVerified ? (
                        <div className="mx-auto w-full max-w-md text-center">
                          <div className="mt-6">
                            <h2 className="text-2xl font-semibold text-[#0f172a]">
                              Email verified
                            </h2>
                            <p className="mt-2 text-sm text-slate-500">
                              Enter the 6-digit verification code sent to your email.
                            </p>
                          </div>

                          <div className="mt-8 flex justify-center gap-2 sm:gap-3">
                            {resetCode.map((digit, index) => (
                              <input
                                key={`reset-code-${index}`}
                                ref={(element) => {
                                  codeInputRefs.current[index] = element;
                                }}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                onChange={(event) =>
                                  handleResetCodeChange(index, event.target.value)
                                }
                                onKeyDown={(event) =>
                                  handleResetCodeKeyDown(index, event)
                                }
                                className="h-14 w-12 rounded-xl border border-slate-200 bg-[#f8fbff] text-center text-xl font-semibold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 sm:w-14"
                              />
                            ))}
                          </div>

                          <p className="mt-4 text-sm text-slate-500">
                            Didn&apos;t receive the code?{" "}
                            {forgotResendCountdown > 0 ? (
                              <span className="font-semibold uppercase text-[#2563eb]">
                                {forgotResendCountdown}
                              </span>
                            ) : forgotResendCount >= FORGOT_PASSWORD_RESEND_DAILY_LIMIT ? (
                              <span className="font-normal text-slate-400">
                                Resend
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={handleForgotResendCode}
                                disabled={isCheckingForgotEmail}
                                className="inline-flex items-center justify-center border-none bg-transparent p-0 font-normal text-[#2563eb] cursor-pointer transition hover:text-[#1d4ed8] disabled:cursor-not-allowed disabled:text-slate-400"
                              >
                                Resend
                              </button>
                            )}
                          </p>
                          <LoginFieldError message={forgotCodeError} />
                        </div>
                      ) : (
                        <div className="mx-auto w-full max-w-md text-center">
                          <div className="mt-6">
                            <h2 className="text-2xl font-semibold text-[#0f172a]">
                              Change Password
                            </h2>
                            <p className="mt-2 text-sm text-slate-500">
                              Enter your new password to finish resetting your account.
                            </p>
                          </div>

                          <div className="mt-8 space-y-5 text-left">
                            <div>
                              <label className="text-sm font-normal text-[#0f172a]">
                                New Password
                              </label>
                              <div className="relative mt-2">
                                <IoLockClosedOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                                <input
                                  type={showForgotNewPassword ? "text" : "password"}
                                  value={forgotNewPassword}
                                  onChange={(event) => {
                                    setForgotNewPassword(event.target.value);
                                    setForgotPasswordErrors((current) => ({ ...current, password: "" }));
                                  }}
                                  placeholder="Enter new password"
                                  disabled={isResettingForgotPassword}
                                  className={`w-full rounded-xl border bg-[#f8fbff] py-3.5 pl-12 pr-12 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                                    forgotPasswordErrors.password
                                      ? "border-red-300 focus:border-red-300 focus:ring-0"
                                      : "border-slate-200 focus:ring-1 focus:ring-[#2563eb]/90"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowForgotNewPassword((current) => !current)}
                                  disabled={isResettingForgotPassword}
                                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 disabled:opacity-60"
                                >
                                  {showForgotNewPassword ? <IoEyeOffOutline className="text-xl" /> : <IoEyeOutline className="text-xl" />}
                                </button>
                              </div>
                              <LoginFieldError message={forgotPasswordErrors.password} />
                            </div>

                            <div>
                              <label className="text-sm font-normal text-[#0f172a]">
                                Confirm Password
                              </label>
                              <div className="relative mt-2">
                                <IoLockClosedOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                                <input
                                  type={showForgotConfirmPassword ? "text" : "password"}
                                  value={forgotConfirmPassword}
                                  onChange={(event) => {
                                    setForgotConfirmPassword(event.target.value);
                                    setForgotPasswordErrors((current) => ({ ...current, password_confirmation: "" }));
                                  }}
                                  placeholder="Confirm new password"
                                  disabled={isResettingForgotPassword}
                                  className={`w-full rounded-xl border bg-[#f8fbff] py-3.5 pl-12 pr-12 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                                    forgotPasswordErrors.password_confirmation
                                      ? "border-red-300 focus:border-red-300 focus:ring-0"
                                      : "border-slate-200 focus:ring-1 focus:ring-[#2563eb]/90"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowForgotConfirmPassword((current) => !current)}
                                  disabled={isResettingForgotPassword}
                                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 disabled:opacity-60"
                                >
                                  {showForgotConfirmPassword ? <IoEyeOffOutline className="text-xl" /> : <IoEyeOutline className="text-xl" />}
                                </button>
                              </div>
                              <LoginFieldError message={forgotPasswordErrors.password_confirmation} />
                            </div>

                            <LoginFieldError message={forgotPasswordErrors.verification_code} />
                          </div>
                        </div>
                      )}

                      {forgotEmailVerified && !forgotCodeVerified ? (
                        <button
                          type="button"
                          onClick={handleForgotVerifyCode}
                          disabled={!isResetCodeComplete}
                          className="mx-auto mt-8 flex w-full max-w-md items-center justify-center gap-2 rounded-md bg-[#0a162b] py-3.5 text-sm font-normal text-white transition hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-80"
                        >
                          {isVerifyingForgotCode ? <Spinner size={20} className="text-white" /> : "Verify Code"}
                        </button>
                      ) : null}
                      {forgotCodeVerified ? (
                        <button
                          type="button"
                          onClick={handleForgotResetPassword}
                          disabled={isResettingForgotPassword}
                          className="mx-auto mt-8 flex w-full max-w-md items-center justify-center gap-2 rounded-md bg-[#0a162b] py-3.5 text-sm font-normal text-white transition hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-80"
                        >
                          {isResettingForgotPassword ? <Spinner size={20} className="text-white" /> : "Change Password"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
    
   
  );
};

export default Login;
