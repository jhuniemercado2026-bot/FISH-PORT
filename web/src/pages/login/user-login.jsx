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
const FORGOT_PASSWORD_EMAIL_KEY = "forgotPasswordEmail";
const FORGOT_PASSWORD_RESEND_COUNT_KEY = "forgotPasswordResendCount";
const FORGOT_PASSWORD_CODE_ERROR_KEY = "forgotPasswordCodeError";

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

  const saveForgotResendCount = (count) => {
    const normalizedCount = Math.max(0, Number(count) || 0);
    setForgotResendCount(normalizedCount);
    sessionStorage.setItem(FORGOT_PASSWORD_RESEND_COUNT_KEY, String(normalizedCount));
  };

  const saveForgotCodeError = (message) => {
    setForgotCodeError(message);

    if (message) {
      sessionStorage.setItem(FORGOT_PASSWORD_CODE_ERROR_KEY, message);
    } else {
      sessionStorage.removeItem(FORGOT_PASSWORD_CODE_ERROR_KEY);
    }
  };

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
    const searchParams = new URLSearchParams(location.search);
    const isForgotRoute = searchParams.get("forgot") === "1";
    const forgotRouteStep = searchParams.get("forgotStep");

    setShowForgotOverlay(isForgotRoute);
    setForgotEmailVerified(isForgotRoute && ["code", "reset"].includes(forgotRouteStep));
    setForgotCodeVerified(isForgotRoute && forgotRouteStep === "reset");

    if (isForgotRoute) {
      setForgotEmail((current) => current || sessionStorage.getItem(FORGOT_PASSWORD_EMAIL_KEY) || "");
      setForgotResendCount(Number(sessionStorage.getItem(FORGOT_PASSWORD_RESEND_COUNT_KEY) || 0));
      setForgotCodeError(sessionStorage.getItem(FORGOT_PASSWORD_CODE_ERROR_KEY) || "");
    }
  }, [location.search]);

  const navigateForgotStep = (step) => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.set("forgot", "1");

    if (step) {
      searchParams.set("forgotStep", step);
    } else {
      searchParams.delete("forgotStep");
    }

    navigate(`/login?${searchParams.toString()}`, { replace: true });
  };

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
    saveForgotCodeError("");

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
    if (nextEmail) {
      sessionStorage.setItem(FORGOT_PASSWORD_EMAIL_KEY, nextEmail);
    }
    setForgotEmail(nextEmail);
    setForgotEmailError("");
    setForgotEmailVerified(false);
    setForgotCodeVerified(false);
    setForgotResendCountdown(0);
    saveForgotResendCount(0);
    saveForgotCodeError("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
    setForgotPasswordErrors({});
    setShowForgotNewPassword(false);
    setShowForgotConfirmPassword(false);
    setResetCode(["", "", "", "", "", ""]);
    setShowForgotOverlay(true);
    navigateForgotStep("");
  };

  const closeForgotOverlay = () => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete("forgot");
    searchParams.delete("forgotStep");
    sessionStorage.removeItem(FORGOT_PASSWORD_EMAIL_KEY);
    sessionStorage.removeItem(FORGOT_PASSWORD_RESEND_COUNT_KEY);
    sessionStorage.removeItem(FORGOT_PASSWORD_CODE_ERROR_KEY);
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
    const nextSearch = searchParams.toString();
    navigate(`/login${nextSearch ? `?${nextSearch}` : ""}`, { replace: true });
  };

  const handleForgotBack = () => {
    if (forgotCodeVerified) {
      setForgotCodeVerified(false);
      setForgotNewPassword("");
      setForgotConfirmPassword("");
      setForgotPasswordErrors({});
      setShowForgotNewPassword(false);
      setShowForgotConfirmPassword(false);
      navigateForgotStep("code");
      return;
    }

    if (forgotEmailVerified) {
      setForgotEmailVerified(false);
      setForgotCodeVerified(false);
      saveForgotCodeError("");
      setResetCode(["", "", "", "", "", ""]);
      navigateForgotStep("");
      return;
    }

    closeForgotOverlay();
  };

  const handleForgotEmailCheck = async () => {
    const nextEmail = forgotEmail.trim();

    setForgotEmailError("");
    saveForgotCodeError("");
    setForgotEmailVerified(false);
    setForgotCodeVerified(false);
    setResetCode(["", "", "", "", "", ""]);

    if (!nextEmail) {
      setForgotEmailError("Email address is required.");
      return;
    }

    sessionStorage.setItem(FORGOT_PASSWORD_EMAIL_KEY, nextEmail);

    setIsCheckingForgotEmail(true);

    try {
      const response = await api.post("/forgot-password/check-email", { email: nextEmail });
      saveForgotResendCount(
        FORGOT_PASSWORD_RESEND_DAILY_LIMIT - Number(response.data?.remaining_resends ?? FORGOT_PASSWORD_RESEND_DAILY_LIMIT)
      );
      setForgotEmailVerified(true);
      navigateForgotStep("code");
      requestAnimationFrame(() => {
        codeInputRefs.current[0]?.focus();
      });
    } catch (error) {
      const remainingResends = error?.response?.data?.remaining_resends;
      if (typeof remainingResends === "number") {
        saveForgotResendCount(FORGOT_PASSWORD_RESEND_DAILY_LIMIT - remainingResends);
      }

      if (remainingResends === 0) {
        setForgotEmailError("");
        setForgotEmailVerified(true);
        saveForgotCodeError(VERIFICATION_CODE_LIMIT_MESSAGE);
        navigateForgotStep("code");
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

    saveForgotCodeError("");
    setForgotResendCountdown(FORGOT_PASSWORD_RESEND_COOLDOWN_SECONDS);
    setIsCheckingForgotEmail(true);

    try {
      const response = await api.post("/forgot-password/check-email", {
        email: forgotEmail.trim(),
        resend: true,
      });
      saveForgotResendCount(
        FORGOT_PASSWORD_RESEND_DAILY_LIMIT - Number(response.data?.remaining_resends ?? FORGOT_PASSWORD_RESEND_DAILY_LIMIT)
      );
      setResetCode(["", "", "", "", "", ""]);
      requestAnimationFrame(() => {
        codeInputRefs.current[0]?.focus();
      });
    } catch (error) {
      const remainingResends = error?.response?.data?.remaining_resends;
      if (typeof remainingResends === "number") {
        saveForgotResendCount(FORGOT_PASSWORD_RESEND_DAILY_LIMIT - remainingResends);
      }
      setForgotResendCountdown(0);
      saveForgotCodeError(
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

    saveForgotCodeError("");

    if (!/^\d{6}$/.test(verificationCode)) {
      saveForgotCodeError("Enter the 6 digits code sent to your email.");
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
      navigateForgotStep("reset");
    } catch (error) {
      saveForgotCodeError(
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
      className="login-page min-h-screen min-h-[100dvh] bg-[#f8fafc]"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      <div className="flex min-h-screen min-h-[100dvh] w-full flex-col lg:flex-row">
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

        <div className="relative flex min-h-[100dvh] w-full flex-col items-stretch justify-start overflow-hidden bg-[#1A1F36] px-0 py-0 lg:w-1/2 lg:items-center lg:justify-center lg:bg-transparent lg:px-10 lg:py-10">
          <div
            className="absolute inset-0 hidden bg-cover bg-center bg-no-repeat opacity-35 lg:block"
            style={{ backgroundImage: "url('/images/bg2.jpg')" }}
          />
          <div className="absolute inset-0 hidden bg-white/85 lg:block" />
          <div className="relative z-10 flex min-h-[100dvh] w-full flex-col lg:min-h-0 lg:max-w-[565px]">
            <div className="flex min-h-[230px] flex-col items-center justify-center px-6 py-8 text-center lg:hidden">
              <img
                src="/images/opol_fish_port.png"
                alt="Opol Fish Port Logo"
                className="h-[145px] w-[145px] object-contain"
              />
              <p
                className="m-0 mt-3 text-[36px] font-normal uppercase leading-none tracking-[0.04em] text-white"
                style={{ fontFamily: "'Anton', sans-serif" }}
              >
                Opol&nbsp;Fish&nbsp;
                <span
                  style={{
                    color: "#2563eb",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                    fontWeight: "inherit",
                    lineHeight: "inherit",
                    textTransform: "inherit",
                  }}
                >
                  Port
                </span>
              </p>
            </div>
            <div
              className={`flex-1 rounded-t-[46px] bg-[#FFFDFB] px-7 pb-10 pt-10 lg:flex-none lg:rounded-[10px] lg:border lg:border-slate-200 lg:bg-white/95 lg:p-10 lg:shadow-[0_20px_60px_rgba(15,23,42,0.08)] ${
                showForgotOverlay ? "hidden lg:block" : ""
              }`}
            >
              <div className="relative mx-auto w-full">
                <div className="mb-8 text-center">
                  <h1 className="text-[25px] font-extrabold leading-none text-[#1A1F36] lg:text-4xl">
                    Sign In
                  </h1>
                  <p className="mt-1 text-[12.5px] text-[#6F7883] lg:text-base">
                    Enter your account to continue!
                  </p>
                </div>

                {/* Login form with fields */}
                <form onSubmit={handleSubmit} className="mt-8 space-y-[18px] lg:space-y-6">
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
                      className={`h-14 w-full rounded-xl border bg-white py-3.5 pl-12 pr-4 text-base text-[#1A1F36] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 lg:h-auto lg:bg-[#f8fbff] ${
                        fieldErrors.email
                          ? "border-red-300 focus:border-red-300 focus:ring-0"
                          : "border-[#F2E6EB] focus:ring-1 focus:ring-[#2563eb]/90 lg:border-slate-200"
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
                      className={`h-14 w-full rounded-xl border bg-white py-3.5 pl-12 pr-12 text-base text-[#1A1F36] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 lg:h-auto lg:bg-[#f8fbff] ${
                        fieldErrors.password
                          ? "border-red-300 focus:border-red-300 focus:ring-0"
                          : "border-[#F2E6EB] focus:ring-1 focus:ring-[#2563eb]/90 lg:border-slate-200"
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
                <div className="mt-3 flex items-center justify-between">
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
                  className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-[8px] bg-[#1A1F36] text-base font-normal text-white transition hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-80 lg:h-auto lg:py-3.5 lg:text-sm"
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

                <p className="!mt-8 flex flex-col items-center justify-center gap-1 text-center text-sm text-slate-500 sm:flex-row sm:gap-2">
                  <span className="inline-flex items-center justify-center gap-2">
                    <IoHeadsetOutline className="text-base text-slate-400" />
                    Need Help? Contact the
                  </span>
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

            <p className="mt-8 hidden text-center text-[14px] text-slate-500 lg:block">
              © 2026 Fish Port Management System. All rights reserved.
            </p>

            {showForgotOverlay && (
                  <div className="relative z-10 flex-1 rounded-t-[46px] bg-[#FFFDFB] lg:absolute lg:inset-0 lg:rounded-[10px] lg:bg-white">
                    <div className="flex h-full flex-col rounded-t-[46px] bg-[#FFFDFB] px-7 pb-10 pt-10 lg:justify-center lg:rounded-[10px] lg:border lg:border-slate-200 lg:bg-white lg:p-8">
                      <div className="mb-3 flex items-center justify-between lg:absolute lg:left-8 lg:right-8 lg:top-8 lg:mb-0">
                        <button
                          type="button"
                          onClick={handleForgotBack}
                          disabled={
                            isCheckingForgotEmail ||
                            isVerifyingForgotCode ||
                            isResettingForgotPassword
                          }
                          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[#1A1F36] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 lg:border lg:border-slate-200 lg:text-slate-700"
                        >
                          <IoArrowBackOutline className="text-[22px] lg:text-base" />
                        </button>
                        <span className="text-[13px] font-semibold text-[#6F7883]">
                          {forgotStep}/3
                        </span>
                      </div>

                      {!forgotEmailVerified ? (
                        <div className="mx-auto w-full max-w-md text-center">
                          <div>
                            <h2 className="text-[25px] font-extrabold text-[#1A1F36] lg:text-2xl lg:font-semibold lg:text-[#0f172a]">
                              Forgot Password
                            </h2>
                            <p className="mt-1 text-[12.5px] text-[#6F7883] lg:mt-2 lg:text-sm lg:text-slate-500">
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
                                className={`h-14 w-full rounded-xl border bg-white py-3.5 pl-12 pr-4 text-base text-[#1A1F36] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 lg:h-auto lg:bg-[#f8fbff] lg:text-sm ${
                                  forgotEmailError
                                    ? "border-red-300 focus:border-red-300 focus:ring-0"
                                    : "border-[#F2E6EB] focus:ring-1 focus:ring-[#2563eb]/90 lg:border-slate-200"
                                }`}
                              />
                            </div>
                            <LoginFieldError message={forgotEmailError} />
                            <button
                              type="button"
                              onClick={handleForgotEmailCheck}
                              disabled={isCheckingForgotEmail}
                              className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-[8px] bg-[#1A1F36] text-base font-normal text-white transition hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-80 lg:h-auto lg:bg-[#0a162b] lg:py-3.5 lg:text-sm"
                            >
                              {isCheckingForgotEmail ? <Spinner size={20} className="text-white" /> : "Check Email"}
                            </button>
                          </div>
                        </div>
                      ) : !forgotCodeVerified ? (
                        <div className="mx-auto w-full max-w-md text-center">
                          <div>
                            <h2 className="text-[25px] font-extrabold text-[#1A1F36] lg:text-2xl lg:font-semibold lg:text-[#0f172a]">
                              Email Verified
                            </h2>
                            <p className="mt-1 text-[12.5px] text-[#6F7883] lg:mt-2 lg:text-sm lg:text-slate-500">
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
                                className={`h-14 w-11 rounded-xl border bg-[#F8FBFF] text-center text-xl font-semibold text-[#1A1F36] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 sm:w-14 ${
                                  forgotCodeError ? "border-red-300" : "border-[#E8E1E6] lg:border-slate-200"
                                }`}
                              />
                            ))}
                          </div>

                          <p className="mt-4 text-[13px] text-[#6F7883] lg:text-sm lg:text-slate-500">
                            Did not receive the code?{" "}
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
                          <div>
                            <h2 className="text-[25px] font-extrabold text-[#1A1F36] lg:text-2xl lg:font-semibold lg:text-[#0f172a]">
                              Change Password
                            </h2>
                            <p className="mt-1 text-[12.5px] text-[#6F7883] lg:mt-2 lg:text-sm lg:text-slate-500">
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
                                  className={`h-14 w-full rounded-xl border bg-white py-3.5 pl-12 pr-12 text-base text-[#1A1F36] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 lg:h-auto lg:bg-[#f8fbff] lg:text-sm ${
                                    forgotPasswordErrors.password
                                      ? "border-red-300 focus:border-red-300 focus:ring-0"
                                      : "border-[#F2E6EB] focus:ring-1 focus:ring-[#2563eb]/90 lg:border-slate-200"
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
                                  className={`h-14 w-full rounded-xl border bg-white py-3.5 pl-12 pr-12 text-base text-[#1A1F36] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 lg:h-auto lg:bg-[#f8fbff] lg:text-sm ${
                                    forgotPasswordErrors.password_confirmation
                                      ? "border-red-300 focus:border-red-300 focus:ring-0"
                                      : "border-[#F2E6EB] focus:ring-1 focus:ring-[#2563eb]/90 lg:border-slate-200"
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
                          className="mx-auto mt-8 flex h-14 w-full max-w-md items-center justify-center gap-2 rounded-[8px] bg-[#1A1F36] text-base font-normal text-white transition hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-80 lg:h-auto lg:bg-[#0a162b] lg:py-3.5 lg:text-sm"
                        >
                          {isVerifyingForgotCode ? <Spinner size={20} className="text-white" /> : "Verify Code"}
                        </button>
                      ) : null}
                      {forgotCodeVerified ? (
                        <button
                          type="button"
                          onClick={handleForgotResetPassword}
                          disabled={isResettingForgotPassword}
                          className="mx-auto mt-8 flex h-14 w-full max-w-md items-center justify-center gap-2 rounded-[8px] bg-[#1A1F36] text-base font-normal text-white transition hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-80 lg:h-auto lg:bg-[#0a162b] lg:py-3.5 lg:text-sm"
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
