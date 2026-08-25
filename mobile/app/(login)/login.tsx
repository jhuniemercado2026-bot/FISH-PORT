import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFonts, Anton_400Regular } from "@expo-google-fonts/anton";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import { setAuthSession } from "../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../api/axios";

const FORGOT_PASSWORD_RESEND_DAILY_LIMIT = 3;
const FORGOT_PASSWORD_RESEND_COOLDOWN_SECONDS = 59;
const VERIFICATION_CODE_LIMIT_MESSAGE =
  "You have reached the verification code limit for today. Please use the latest verification code sent to your email. This code expires within this day.";
const EMPTY_RESET_CODE = ["", "", "", "", "", ""];

export default function LoginScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ Anton_400Regular });
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotEmailError, setForgotEmailError] = useState("");
  const [forgotEmailVerified, setForgotEmailVerified] = useState(false);
  const [forgotCodeVerified, setForgotCodeVerified] = useState(false);
  const [resetCode, setResetCode] = useState(EMPTY_RESET_CODE);
  const [forgotCodeError, setForgotCodeError] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotPasswordErrors, setForgotPasswordErrors] = useState<Record<string, string>>({});
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);
  const [isCheckingForgotEmail, setIsCheckingForgotEmail] = useState(false);
  const [isVerifyingForgotCode, setIsVerifyingForgotCode] = useState(false);
  const [isResettingForgotPassword, setIsResettingForgotPassword] = useState(false);
  const [forgotResendCountdown, setForgotResendCountdown] = useState(0);
  const [forgotResendCount, setForgotResendCount] = useState(0);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const resetCodeInputRefs = useRef<(TextInput | null)[]>([]);
  const forgotStep = forgotCodeVerified ? 3 : forgotEmailVerified ? 2 : 1;

  useEffect(() => {
    if (forgotResendCountdown <= 0) return undefined;

    const timer = setInterval(() => {
      setForgotResendCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [forgotResendCountdown]);

  function InlineErrorCard({ message }: { message?: string }) {
    if (!message) {
      return null;
    }

    return (
      <View className="mt-1 flex-row items-center gap-2 rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2">
        <Ionicons name="alert-circle-outline" size={14} color="#F87171" />
        <Text
          className="flex-1 text-[12px] text-[#DC2626]"
          style={{ fontFamily: "Montserrat_400Regular" }}
        >
          {message}
        </Text>
      </View>
    );
  }

  async function handleLogin() {
    const trimmedEmail = email.trim();
    let hasError = false;

    setEmailError("");
    setPasswordError("");
    setFormError("");
    setSuccessMessage("");

    if (!trimmedEmail) {
      setEmailError("Email is required.");
      hasError = true;
    }

    if (!password) {
      setPasswordError("Password is required.");
      hasError = true;
    }

    if (hasError) {
      return;
    }

    setIsSubmitting(true);
    setAuthSession(null);

    try {
      const response = await fetch(`${apiBaseUrl}/login`, {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setAuthSession(null);
        setEmailError(data?.errors?.email?.[0] ?? "");
        setPasswordError(data?.errors?.password?.[0] ?? "");
        setFormError(
          data?.errors?.email?.[0] || data?.errors?.password?.[0]
            ? ""
            : data?.message ?? "Unable to sign in. Please try again."
        );
        return;
      }

      const normalizedRole = String(data?.user?.role ?? "").trim().toLowerCase();

      if (normalizedRole !== "inspector") {
        setAuthSession(null);
        setFormError("Only inspector accounts can sign in on mobile.");
        return;
      }

      setAuthSession({
        token: data.token,
        user: data.user,
      });

      router.replace("/(tabs)/home");
    } catch {
      setAuthSession(null);
      setFormError("Unable to reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForgotState(nextEmail = "") {
    setForgotEmail(nextEmail);
    setForgotEmailError("");
    setForgotEmailVerified(false);
    setForgotCodeVerified(false);
    setResetCode([...EMPTY_RESET_CODE]);
    setForgotCodeError("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
    setForgotPasswordErrors({});
    setShowForgotNewPassword(false);
    setShowForgotConfirmPassword(false);
    setIsCheckingForgotEmail(false);
    setIsVerifyingForgotCode(false);
    setIsResettingForgotPassword(false);
    setForgotResendCountdown(0);
    setForgotResendCount(0);
  }

  function openForgotModal() {
    resetForgotState(email.trim());
    setShowForgotModal(true);
  }

  function closeForgotModal() {
    setShowForgotModal(false);
    resetForgotState();
  }

  function handleForgotBack() {
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
      setForgotCodeError("");
      setForgotCodeVerified(false);
      setResetCode([...EMPTY_RESET_CODE]);
      return;
    }

    closeForgotModal();
  }

  function handleResetCodeChange(index: number, value: string) {
    const sanitizedValue = value.replace(/\D/g, "").slice(-1);
    setForgotCodeError("");
    setResetCode((current) => {
      const next = [...current];
      next[index] = sanitizedValue;
      return next;
    });

    if (sanitizedValue && index < EMPTY_RESET_CODE.length - 1) {
      resetCodeInputRefs.current[index + 1]?.focus();
    }
  }

  function handleResetCodeKeyPress(index: number, key: string) {
    if (key === "Backspace" && !resetCode[index] && index > 0) {
      resetCodeInputRefs.current[index - 1]?.focus();
    }
  }

  async function handleForgotEmailCheck(options: { resend?: boolean } = {}) {
    const nextEmail = forgotEmail.trim();

    setForgotEmailError("");
    setForgotCodeError("");
    setForgotCodeVerified(false);
    setResetCode([...EMPTY_RESET_CODE]);

    if (!nextEmail) {
      setForgotEmailError("Email address is required.");
      return;
    }

    if (
      options.resend &&
      (forgotResendCountdown > 0 ||
        forgotResendCount >= FORGOT_PASSWORD_RESEND_DAILY_LIMIT)
    ) {
      return;
    }

    if (options.resend) {
      setForgotResendCountdown(FORGOT_PASSWORD_RESEND_COOLDOWN_SECONDS);
    }

    setIsCheckingForgotEmail(true);

    try {
      const response = await fetch(`${apiBaseUrl}/forgot-password/check-email`, {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          email: nextEmail,
          resend: options.resend || undefined,
        }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        if (options.resend) setForgotResendCountdown(0);
        const remainingResends = result?.remaining_resends;
        if (typeof remainingResends === "number") {
          setForgotResendCount(
            FORGOT_PASSWORD_RESEND_DAILY_LIMIT - remainingResends
          );
        }
        const message =
          result?.errors?.email?.[0] ||
          result?.message ||
          (options.resend
            ? "Failed to resend the verification code."
            : "Email does not exist.");
        if (options.resend) {
          setForgotCodeError(
            remainingResends === 0 ? VERIFICATION_CODE_LIMIT_MESSAGE : message
          );
        } else if (remainingResends === 0) {
          setForgotEmailError("");
          setForgotEmailVerified(true);
          setForgotCodeError(VERIFICATION_CODE_LIMIT_MESSAGE);
          setTimeout(() => resetCodeInputRefs.current[0]?.focus(), 100);
        } else {
          setForgotEmailError(message);
        }
        return;
      }

      setForgotResendCount(
        FORGOT_PASSWORD_RESEND_DAILY_LIMIT -
          Number(result?.remaining_resends ?? FORGOT_PASSWORD_RESEND_DAILY_LIMIT)
      );
      setForgotEmailVerified(true);
      setTimeout(() => resetCodeInputRefs.current[0]?.focus(), 100);
    } catch {
      if (options.resend) setForgotResendCountdown(0);
      if (options.resend) {
        setForgotCodeError("Failed to resend the verification code.");
      } else {
        setForgotEmailError("Unable to reach the server.");
      }
    } finally {
      setIsCheckingForgotEmail(false);
    }
  }

  async function handleForgotVerifyCode() {
    const verificationCode = resetCode.join("");
    setForgotCodeError("");

    if (!/^\d{6}$/.test(verificationCode)) {
      setForgotCodeError("Enter the 6 digits code sent to your email.");
      return;
    }

    setIsVerifyingForgotCode(true);

    try {
      const response = await fetch(`${apiBaseUrl}/forgot-password/verify-code`, {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          email: forgotEmail.trim(),
          verification_code: verificationCode,
        }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setForgotCodeError(
          result?.errors?.verification_code?.[0] ||
            result?.message ||
            "Failed to verify the code."
        );
        return;
      }

      setForgotCodeVerified(true);
      setForgotPasswordErrors({});
    } catch {
      setForgotCodeError("Failed to verify the code.");
    } finally {
      setIsVerifyingForgotCode(false);
    }
  }

  async function handleForgotResetPassword() {
    const verificationCode = resetCode.join("");
    const nextErrors: Record<string, string> = {};

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
    if (Object.keys(nextErrors).length) return;

    setIsResettingForgotPassword(true);

    try {
      const response = await fetch(`${apiBaseUrl}/forgot-password/reset`, {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          email: forgotEmail.trim(),
          verification_code: verificationCode,
          password: forgotNewPassword,
          password_confirmation: forgotConfirmPassword,
        }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const backendErrors = result?.errors ?? {};
        setForgotPasswordErrors({
          password: backendErrors.password?.[0] || "",
          password_confirmation:
            backendErrors.password_confirmation?.[0] || "",
          verification_code: backendErrors.verification_code?.[0] || "",
        });
        return;
      }

      closeForgotModal();
      setPassword("");
      setPasswordError("");
      setFormError("");
      setSuccessMessage("Password changed successfully. Please sign in with your new password.");
    } catch {
      setForgotPasswordErrors({
        verification_code: "Unable to reach the server.",
      });
    } finally {
      setIsResettingForgotPassword(false);
    }
  }

  if (!fontsLoaded) {
    return (
      <View className="flex-1 bg-[#1A1F36] items-center justify-center">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#1A1F36]">
      <StatusBar barStyle="light-content" />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 bg-[#1A1F36]">
          <KeyboardAwareScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            enableOnAndroid
            extraScrollHeight={120}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <SafeAreaView className="bg-[#1A1F36]" edges={["top"]}>
              <View className="min-h-[230px] items-center justify-center px-6 py-8">
                <Image
                  source={require("../../assets/images/opol_fish_port.png")}
                  style={{ width: 145, height: 145 }}
                  resizeMode="contain"
                />

                <Text
                  className="mt-3 text-center text-[36px] uppercase leading-none tracking-[0.04em] text-white"
                  style={{ fontFamily: "Anton_400Regular" }}
                >
                  Opol Fish{" "}
                  <Text
                    style={{ color: "#2563EB", fontFamily: "Anton_400Regular" }}
                  >
                    Port
                  </Text>
                </Text>
              </View>
            </SafeAreaView>

            <View className="flex-1 rounded-t-[46px] bg-[#FFFDFB] px-7 pb-10 pt-10">
              {showForgotModal ? (
                <View>
                  <View className="flex-row items-center justify-between">
                    <Pressable
                      onPress={handleForgotBack}
                      disabled={
                        isCheckingForgotEmail ||
                        isVerifyingForgotCode ||
                        isResettingForgotPassword
                      }
                      hitSlop={10}
                      className="self-start"
                    >
                      <Ionicons name="arrow-back-outline" size={22} color="#1A1F36" />
                    </Pressable>
                    <Text
                      className="text-[13px] text-[#6F7883]"
                      style={{ fontFamily: "Montserrat_600SemiBold" }}
                    >
                      {forgotStep}/3
                    </Text>
                  </View>
                  <Text
                    className="mt-3 mb-0 text-center text-[25px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_800ExtraBold" }}
                  >
                    {!forgotEmailVerified
                      ? "Forgot Password"
                      : !forgotCodeVerified
                      ? "Email Verified"
                      : "Change Password"}
                  </Text>
                  <Text
                    className="mb-[20px] text-center text-[12.5px] text-[#6F7883]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  >
                    {!forgotEmailVerified
                      ? "Enter your email address first to verify your account."
                      : !forgotCodeVerified
                      ? "Enter the 6-digit verification code sent to your email."
                      : "Enter your new password to finish resetting your account."}
                  </Text>
                </View>
              ) : (
                <>
                  <Text
                    className="mb-0 text-center text-[25px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_800ExtraBold" }}
                  >
                    Sign In
                  </Text>
                  <Text
                    className="mb-[20px] text-center text-[12.5px] text-[#6F7883]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  >
                    Enter your account to continue!
                  </Text>
                </>
              )}

              {!showForgotModal ? (
              <View className="gap-[18px]">
                <View className="gap-[6px]">
                  <Text
                    className="text-[14px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  >
                    Email Address
                  </Text>
                  <View className="h-14 flex-row items-center rounded-xl border border-[#F2E6EB] bg-white pl-4 pr-[14px]">
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color="#8C95A1"
                      style={{ marginRight: 10 }}
                    />
                    <TextInput
                      ref={emailRef}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      editable={!isSubmitting}
                      placeholder="you@gmail.com"
                      placeholderTextColor="#A8AFB8"
                      className="flex-1 text-base text-[#1A1F36]"
                      onChangeText={(value) => {
                        setEmail(value);
                        if (emailError) setEmailError("");
                        if (formError) setFormError("");
                      }}
                      value={email}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                      returnKeyType="next"
                      onFocus={() => {
                        setTimeout(() => {
                          emailRef.current?.focus();
                        }, 100);
                      }}
                      onSubmitEditing={() => passwordRef.current?.focus()}
                    />
                  </View>
                  <InlineErrorCard message={emailError} />
                </View>

                <View className="gap-[6px]">
                  <Text
                    className="text-[14px] text-[#1A1F36]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  >
                    Password
                  </Text>
                  <View className="h-14 flex-row items-center rounded-xl border border-[#F2E6EB] bg-white pl-4 pr-[14px]">
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color="#8C95A1"
                      style={{ marginRight: 10 }}
                    />
                    <TextInput
                      ref={passwordRef}
                      editable={!isSubmitting}
                      placeholder="........"
                      placeholderTextColor="#A8AFB8"
                      secureTextEntry={!showPassword}
                      className="flex-1 text-base text-[#1A1F36]"
                      onChangeText={(value) => {
                        setPassword(value);
                        if (passwordError) setPasswordError("");
                        if (formError) setFormError("");
                      }}
                      value={password}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                      returnKeyType="done"
                      onFocus={() => {
                        setTimeout(() => {
                          passwordRef.current?.focus();
                        }, 100);
                      }}
                      onSubmitEditing={handleLogin}
                    />
                    <Pressable
                      accessibilityLabel={
                        showPassword ? "Hide password" : "Show password"
                      }
                      disabled={isSubmitting}
                      hitSlop={10}
                      onPress={() => setShowPassword((value) => !value)}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color="#8C95A1"
                      />
                    </Pressable>
                  </View>
                  <InlineErrorCard message={passwordError} />
                </View>

                <View className="mt-3 flex-row items-center justify-between">
                  <Pressable
                    className="flex-row items-center"
                    disabled={isSubmitting}
                    hitSlop={10}
                    onPress={() => setRememberMe((value) => !value)}
                  >
                    <View
                      className={`mr-3 h-5 w-5 items-center justify-center rounded-md border ${
                        rememberMe
                          ? "border-[#1A1F36] bg-[#1A1F36]"
                          : "border-[#C9CFD8] bg-white"
                      }`}
                    >
                      {rememberMe ? (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      ) : null}
                    </View>
                    <Text
                      className="text-[13px] text-[#58606C]"
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      Remember me
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={isSubmitting}
                    hitSlop={10}
                    onPress={openForgotModal}
                  >
                    <Text
                      className="text-[13px] text-[#2563EB]"
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      Forgot password?
                    </Text>
                  </Pressable>
                </View>

                {formError ? (
                  <InlineErrorCard message={formError} />
                ) : null}
                {successMessage ? (
                  <View className="mt-1 flex-row items-center gap-2 rounded-[12px] border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2">
                    <Ionicons name="checkmark-circle-outline" size={14} color="#22C55E" />
                    <Text
                      className="flex-1 text-[12px] text-[#15803D]"
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {successMessage}
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  className="mt-2 h-14 flex-row items-center justify-center rounded-[8px] bg-[#1A1F36]"
                  disabled={isSubmitting}
                  onPress={handleLogin}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Text
                        className="text-[16px] text-white"
                        style={{ fontFamily: "Montserrat_800ExtraBold" }}
                      >
                        Sign In
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color="#FFFFFF"
                        style={{ marginLeft: 8 }}
                      />
                    </>
                  )}
                </Pressable>
              </View>
              ) : (
                <View>
                  {!forgotEmailVerified ? (
                    <View>
                      <Text className="mb-2 text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                        Email Address
                      </Text>
                      <View className="h-14 flex-row items-center rounded-xl border border-[#F2E6EB] bg-white pl-4 pr-[14px]">
                        <Ionicons name="mail-outline" size={18} color="#8C95A1" style={{ marginRight: 10 }} />
                        <TextInput
                          autoCapitalize="none"
                          keyboardType="email-address"
                          editable={!isCheckingForgotEmail}
                          placeholder="you@gmail.com"
                          placeholderTextColor="#A8AFB8"
                          className="flex-1 text-base text-[#1A1F36]"
                          value={forgotEmail}
                          onChangeText={(value) => {
                            setForgotEmail(value);
                            setForgotEmailError("");
                            setResetCode([...EMPTY_RESET_CODE]);
                          }}
                          style={{ fontFamily: "Montserrat_400Regular" }}
                        />
                      </View>
                      <InlineErrorCard message={forgotEmailError} />
                      <Pressable
                        className="mt-5 h-14 items-center justify-center rounded-[8px] bg-[#1A1F36]"
                        disabled={isCheckingForgotEmail}
                        onPress={() => handleForgotEmailCheck()}
                      >
                        {isCheckingForgotEmail ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text className="text-[16px] text-white" style={{ fontFamily: "Montserrat_800ExtraBold" }}>
                            Check Email
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  ) : !forgotCodeVerified ? (
                    <View>
                      <View className="flex-row justify-center gap-2">
                        {resetCode.map((digit, index) => (
                          <TextInput
                            key={`reset-code-${index}`}
                            ref={(element) => {
                              resetCodeInputRefs.current[index] = element;
                            }}
                            value={digit}
                            onChangeText={(value) => handleResetCodeChange(index, value)}
                            onKeyPress={({ nativeEvent }) =>
                              handleResetCodeKeyPress(index, nativeEvent.key)
                            }
                            editable={!isVerifyingForgotCode && !isCheckingForgotEmail}
                            keyboardType="number-pad"
                            maxLength={1}
                            className={`h-14 w-11 rounded-xl border bg-[#F8FBFF] text-center text-[20px] text-[#1A1F36] ${
                              forgotCodeError ? "border-[#DC2626]" : "border-[#E8E1E6]"
                            }`}
                            style={{ fontFamily: "Montserrat_700Bold" }}
                          />
                        ))}
                      </View>
                      <Text
                        className="mt-4 text-center text-[13px] text-[#6F7883]"
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        Did not receive the code?{" "}
                        {forgotResendCountdown > 0 ? (
                          <Text className="text-[#2563EB]" style={{ fontFamily: "Montserrat_700Bold" }}>
                            {forgotResendCountdown}
                          </Text>
                        ) : forgotResendCount >= FORGOT_PASSWORD_RESEND_DAILY_LIMIT ? (
                          <Text className="text-[#9AA3AF]">Resend</Text>
                        ) : (
                          <Text
                            className="text-[#2563EB]"
                            onPress={() => handleForgotEmailCheck({ resend: true })}
                            style={{ fontFamily: "Montserrat_400Regular" }}
                          >
                            Resend
                          </Text>
                        )}
                      </Text>
                      <InlineErrorCard message={forgotCodeError} />
                      <Pressable
                        className="mt-6 h-14 items-center justify-center rounded-[8px] bg-[#1A1F36]"
                        disabled={
                          isVerifyingForgotCode ||
                          !resetCode.every((digit) => digit.trim())
                        }
                        onPress={handleForgotVerifyCode}
                      >
                        {isVerifyingForgotCode ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text className="text-[16px] text-white" style={{ fontFamily: "Montserrat_800ExtraBold" }}>
                            Verify Code
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  ) : (
                    <View>
                      <Text className="mb-2 text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                        New Password
                      </Text>
                      <View className="h-14 flex-row items-center rounded-xl border border-[#F2E6EB] bg-white pl-4 pr-[14px]">
                        <Ionicons name="lock-closed-outline" size={18} color="#8C95A1" style={{ marginRight: 10 }} />
                        <TextInput
                          editable={!isResettingForgotPassword}
                          placeholder="Enter new password"
                          placeholderTextColor="#A8AFB8"
                          secureTextEntry={!showForgotNewPassword}
                          className="flex-1 text-base text-[#1A1F36]"
                          value={forgotNewPassword}
                          onChangeText={(value) => {
                            setForgotNewPassword(value);
                            setForgotPasswordErrors((current) => ({ ...current, password: "" }));
                          }}
                          style={{ fontFamily: "Montserrat_400Regular" }}
                        />
                        <Pressable
                          disabled={isResettingForgotPassword}
                          hitSlop={10}
                          onPress={() => setShowForgotNewPassword((value) => !value)}
                        >
                          <Ionicons name={showForgotNewPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#8C95A1" />
                        </Pressable>
                      </View>
                      <InlineErrorCard message={forgotPasswordErrors.password} />

                      <Text className="mb-2 mt-4 text-[14px] text-[#1A1F36]" style={{ fontFamily: "Montserrat_400Regular" }}>
                        Confirm Password
                      </Text>
                      <View className="h-14 flex-row items-center rounded-xl border border-[#F2E6EB] bg-white pl-4 pr-[14px]">
                        <Ionicons name="lock-closed-outline" size={18} color="#8C95A1" style={{ marginRight: 10 }} />
                        <TextInput
                          editable={!isResettingForgotPassword}
                          placeholder="Confirm new password"
                          placeholderTextColor="#A8AFB8"
                          secureTextEntry={!showForgotConfirmPassword}
                          className="flex-1 text-base text-[#1A1F36]"
                          value={forgotConfirmPassword}
                          onChangeText={(value) => {
                            setForgotConfirmPassword(value);
                            setForgotPasswordErrors((current) => ({ ...current, password_confirmation: "" }));
                          }}
                          style={{ fontFamily: "Montserrat_400Regular" }}
                        />
                        <Pressable
                          disabled={isResettingForgotPassword}
                          hitSlop={10}
                          onPress={() => setShowForgotConfirmPassword((value) => !value)}
                        >
                          <Ionicons name={showForgotConfirmPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#8C95A1" />
                        </Pressable>
                      </View>
                      <InlineErrorCard message={forgotPasswordErrors.password_confirmation} />
                      <InlineErrorCard message={forgotPasswordErrors.verification_code} />
                      <Pressable
                        className="mt-6 h-14 items-center justify-center rounded-[8px] bg-[#1A1F36]"
                        disabled={isResettingForgotPassword}
                        onPress={handleForgotResetPassword}
                      >
                        {isResettingForgotPassword ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text className="text-[16px] text-white" style={{ fontFamily: "Montserrat_800ExtraBold" }}>
                            Change Password
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </View>
          </KeyboardAwareScrollView>

        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
