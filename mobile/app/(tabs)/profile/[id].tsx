import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getAuthToken, updateAuthUser } from "../../../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../../../api/axios";
import { useProfileStore } from "../../../store/profileStore";
import { useToastStore } from "../../../store/toastStore";
import BirthdayPicker from "../../../components/BirthdayPicker";
import { ActivityIndicator, Pressable, ScrollView, StatusBar, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";

type TransactionLockState = {
  is_locked?: boolean | null;
  message?: string | null;
  applies_to?: string | null;
  unlock_at?: string | null;
  remittance_reference_no?: string | null;
};

const EMPTY_PASSWORD_FORM = { current: "", new_pass: "", confirm: "" };
const EMPTY_PASSWORD_ERRORS = { current: "", new_pass: "", confirm: "" };
const EMPTY_VERIFICATION_CODE = ["", "", "", "", "", ""];
const PASSWORD_CODE_RESEND_COOLDOWN_SECONDS = 59;
const PASSWORD_CODE_RESEND_DAILY_LIMIT = 3;
const VERIFICATION_CODE_LIMIT_MESSAGE =
  "You have reached the verification code limit for today. Please use the latest verification code sent to your email. This code expires within this day.";

export default function PersonalDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const authToken = getAuthToken();
  const profile = useProfileStore((state) => state);
  const showToast = useToastStore((state) => state.showToast);
  const isChangePasswordMode = params.mode === "change-password";
  const userId = profile.user_id;
  const codeInputRefs = useRef<(TextInput | null)[]>([]);

  const nameParts =
    typeof profile.full_name === "string" && profile.full_name.trim()
      ? profile.full_name.trim().split(/\s+/)
      : [];

  const [firstName, setFirstName] = useState(
    typeof profile.first_name === "string" && profile.first_name.trim()
      ? profile.first_name.trim()
      : nameParts[0] || ""
  );
  const [lastName, setLastName] = useState(
    typeof profile.last_name === "string" && profile.last_name.trim()
      ? profile.last_name.trim()
      : nameParts.slice(1).join(" ") || ""
  );
  const [gender, setGender] = useState(
    typeof profile.gender === "string" && profile.gender.trim()
      ? profile.gender.trim().toLowerCase()
      : ""
  );
  const [email, setEmail] = useState(
    typeof profile.email === "string" && profile.email.trim()
      ? profile.email.trim()
      : ""
  );
  const [contactNumber, setContactNumber] = useState(
    typeof profile.contact_number === "string" &&
      profile.contact_number.trim()
      ? profile.contact_number.trim()
      : ""
  );
  const [birthday, setBirthday] = useState<Date | null>(() => {
    if (typeof profile.birthday === "string" && profile.birthday.trim()) {
      const parsed = new Date(profile.birthday);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  });
  const [birthdayError, setBirthdayError] = useState("");
  const [firstNameError, setFirstNameError] = useState("");
  const [lastNameError, setLastNameError] = useState("");
  const [genderError, setGenderError] = useState("");
  const [contactNumberError, setContactNumberError] = useState("");
  const [addressError, setAddressError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [transactionLock, setTransactionLock] = useState<TransactionLockState | null>(null);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [passwordErrors, setPasswordErrors] = useState(EMPTY_PASSWORD_ERRORS);
  const [passwordError, setPasswordError] = useState("");
  const [showPasswordFields, setShowPasswordFields] = useState({
    current: false,
    new_pass: false,
    confirm: false,
  });
  const [verificationCode, setVerificationCode] = useState(EMPTY_VERIFICATION_CODE);
  const [verificationError, setVerificationError] = useState("");
  const [isVerificationStep, setIsVerificationStep] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [address, setAddress] = useState(
    typeof profile.address === "string" && profile.address.trim()
      ? profile.address.trim()
      : ""
  );
  const isSettingsLocked = Boolean(
    transactionLock?.is_locked && transactionLock?.applies_to !== "transactions"
  );

  useEffect(() => {
    if (resendCountdown <= 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setResendCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCountdown]);

  useEffect(() => {
    async function loadTransactionLockState() {
      if (!authToken) {
        setTransactionLock(null);
        return;
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/transaction-lock`, {
          headers: buildApiHeaders(authToken),
        });
        const json = await response.json().catch(() => null);
        const lock = json?.transaction_lock;

        if (lock && (lock.is_locked || lock.message)) {
          setTransactionLock(lock);
        } else {
          setTransactionLock(null);
        }
      } catch {
        setTransactionLock(null);
      }
    }

    loadTransactionLockState();
  }, [authToken]);

  const displayName = `${firstName}${lastName ? ` ${lastName}` : ""}`.trim();
  const initials = (() => {
    const source = displayName.trim();
    if (!source) return "PI";

    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  })();

  const validateBirthday = (value: Date | null) => {
    if (!value) {
      return "Birthday is required.";
    }

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 15);

    return value <= cutoff ? "" : "Users must be at least 15 years old.";
  };

  const renderErrorCard = (message: string) => {
    if (!message) {
      return null;
    }

    return (
      <View className="mt-2 flex-row items-center gap-2 rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2">
        <Ionicons name="alert-circle-outline" size={14} color="#F87171" />
        <Text
          className="flex-1 text-[12px] text-[#DC2626]"
          style={{ fontFamily: "Montserrat_400Regular" }}
        >
          {message}
        </Text>
      </View>
    );
  };

  const validateFields = () => {
    let valid = true;

    if (!firstName.trim()) {
      setFirstNameError("First name is required.");
      valid = false;
    } else {
      setFirstNameError("");
    }

    if (!lastName.trim()) {
      setLastNameError("Last name is required.");
      valid = false;
    } else {
      setLastNameError("");
    }

    if (!gender) {
      setGenderError("Gender is required.");
      valid = false;
    } else {
      setGenderError("");
    }

    const cleanContact = contactNumber.replace(/\D/g, "");
    if (!cleanContact) {
      setContactNumberError("Contact number is required.");
      valid = false;
    } else if (cleanContact.length < 11) {
      setContactNumberError("Contact number must be 11 digits.");
      valid = false;
    } else {
      setContactNumberError("");
    }

    if (!address.trim()) {
      setAddressError("Address is required.");
      valid = false;
    } else {
      setAddressError("");
    }

    const birthdayValidation = validateBirthday(birthday);
    if (birthdayValidation) {
      setBirthdayError(birthdayValidation);
      valid = false;
    } else {
      setBirthdayError("");
    }

    return valid;
  };

  const handleSave = async () => {
    if (isSettingsLocked) {
      setSaveError(transactionLock.message || "Transactions are view-only at the moment.");
      return;
    }

    const fullName = `${firstName}${lastName ? ` ${lastName}` : ""}`.trim();

    setSaveError("");

    if (!validateFields()) {
      return;
    }

    setIsSaving(true);

    const result = await updateAuthUser({
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      gender,
      contact_number: contactNumber,
      birthday: birthday ? birthday.toISOString().split("T")[0] : undefined,
      address,
    });

    setIsSaving(false);

    if (!result?.success) {
      setSaveError(result?.message ?? "Unable to update profile. Please try again.");
      return;
    }

    router.back();
  };

  const updatePasswordField = (key: keyof typeof EMPTY_PASSWORD_FORM, value: string) => {
    setPasswordForm((current) => ({ ...current, [key]: value }));
    setPasswordError("");
    setPasswordErrors((current) => ({ ...current, [key]: "" }));
  };

  const validatePasswordFields = () => {
    const nextErrors = { ...EMPTY_PASSWORD_ERRORS };

    if (!passwordForm.current.trim()) {
      nextErrors.current = "Current password is required.";
    }

    if (!passwordForm.new_pass) {
      nextErrors.new_pass = "New password is required.";
    } else if (passwordForm.new_pass.length < 8) {
      nextErrors.new_pass = "Password must be at least 8 characters.";
    } else if (passwordForm.new_pass === passwordForm.current) {
      nextErrors.new_pass = "New password must be different from your current password.";
    }

    if (!passwordForm.confirm) {
      nextErrors.confirm = "Please confirm your new password.";
    } else if (passwordForm.new_pass !== passwordForm.confirm) {
      nextErrors.confirm = "Passwords do not match.";
    }

    setPasswordErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  };

  const sendPasswordCode = async (options: { resend?: boolean } = {}) => {
    if (isSettingsLocked) {
      setPasswordError(transactionLock.message || "Transactions are view-only at the moment.");
      return;
    }

    if (!authToken || !userId) {
      setPasswordError("Unable to determine authenticated user.");
      return;
    }

    if (!validatePasswordFields()) {
      return;
    }

    if (options.resend) {
      if (
        resendCountdown > 0 ||
        isResendingCode ||
        resendCount >= PASSWORD_CODE_RESEND_DAILY_LIMIT
      ) {
        return;
      }
      setResendCountdown(PASSWORD_CODE_RESEND_COOLDOWN_SECONDS);
      setIsResendingCode(true);
    } else {
      setIsSaving(true);
    }

    setPasswordError("");
    setVerificationError("");

    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${userId}`, {
        method: "PUT",
        headers: buildApiHeaders(authToken),
        body: JSON.stringify({
          send_password_change_code: true,
          resend_password_change_code: options.resend || undefined,
          current_password: passwordForm.current,
          new_password: passwordForm.new_pass,
          new_password_confirmation: passwordForm.confirm,
        }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const backendErrors = result?.errors ?? {};
        setPasswordErrors({
          current: backendErrors.current_password?.[0] ?? "",
          new_pass: backendErrors.new_password?.[0] ?? "",
          confirm: backendErrors.new_password_confirmation?.[0] ?? "",
        });
        const retryAfter = Number(result?.retry_after || 0);
        const remainingResends = result?.remaining_resends;
        if (typeof remainingResends === "number") {
          setResendCount(PASSWORD_CODE_RESEND_DAILY_LIMIT - remainingResends);
        }
        if (options.resend) {
          setResendCountdown(retryAfter > 0 ? retryAfter : 0);
        }
        const message = result?.message ?? "Failed to send the verification code.";
        if (options.resend) {
          setVerificationError(
            remainingResends === 0 ? VERIFICATION_CODE_LIMIT_MESSAGE : message
          );
        } else if (
          remainingResends === 0 &&
          !backendErrors.current_password &&
          !backendErrors.new_password &&
          !backendErrors.new_password_confirmation
        ) {
          setPasswordError("");
          setVerificationError(VERIFICATION_CODE_LIMIT_MESSAGE);
          setVerificationCode([...EMPTY_VERIFICATION_CODE]);
          setIsVerificationStep(true);
          setTimeout(() => codeInputRefs.current[0]?.focus(), 100);
        } else if (
          !backendErrors.current_password &&
          !backendErrors.new_password &&
          !backendErrors.new_password_confirmation
        ) {
          setPasswordError(message);
        }
        return;
      }

      setVerificationCode([...EMPTY_VERIFICATION_CODE]);
      setVerificationError("");
      setResendCount(
        PASSWORD_CODE_RESEND_DAILY_LIMIT -
          Number(result?.remaining_resends ?? PASSWORD_CODE_RESEND_DAILY_LIMIT)
      );
      setIsVerificationStep(true);
      setTimeout(() => codeInputRefs.current[0]?.focus(), 100);
    } catch {
      const message = "Unable to reach the server.";
      if (options.resend) {
        setVerificationError(message);
      } else {
        setPasswordError(message);
      }
    } finally {
      if (options.resend) {
        setIsResendingCode(false);
      } else {
        setIsSaving(false);
      }
    }
  };

  const verifyPasswordChange = async () => {
    if (isSettingsLocked) {
      setVerificationError(transactionLock.message || "Transactions are view-only at the moment.");
      return;
    }

    if (!authToken || !userId) {
      setVerificationError("Unable to determine authenticated user.");
      return;
    }

    const code = verificationCode.join("").trim();
    setVerificationError("");

    if (!code) {
      setVerificationError("Verification code is required.");
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setVerificationError("Enter the 6-digit code sent to your email.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${userId}`, {
        method: "PUT",
        headers: buildApiHeaders(authToken),
        body: JSON.stringify({
          verify_password_change_code: true,
          current_password: passwordForm.current,
          new_password: passwordForm.new_pass,
          new_password_confirmation: passwordForm.confirm,
          verification_code: code,
        }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const backendErrors = result?.errors ?? {};
        if (
          backendErrors.current_password ||
          backendErrors.new_password ||
          backendErrors.new_password_confirmation
        ) {
          setPasswordErrors({
            current: backendErrors.current_password?.[0] ?? "",
            new_pass: backendErrors.new_password?.[0] ?? "",
            confirm: backendErrors.new_password_confirmation?.[0] ?? "",
          });
          setIsVerificationStep(false);
        }

        setVerificationError(
          backendErrors.verification_code?.[0] ??
            result?.message ??
            "Failed to verify the code."
        );
        return;
      }

      setPasswordForm(EMPTY_PASSWORD_FORM);
      setPasswordErrors(EMPTY_PASSWORD_ERRORS);
      setPasswordError("");
      setVerificationCode([...EMPTY_VERIFICATION_CODE]);
      setVerificationError("");
      showToast("success", "Password changed successfully.");
      router.back();
    } catch {
      setVerificationError("Unable to reach the server.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    const nextDigit = value.replace(/\D/g, "").slice(-1);
    setVerificationCode((current) => {
      const next = [...current];
      next[index] = nextDigit;
      return next;
    });
    setVerificationError("");

    if (nextDigit && index < codeInputRefs.current.length - 1) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  if (isChangePasswordMode) {
    const passwordFields = [
      {
        label: "Current Password",
        key: "current" as const,
        placeholder: "Enter current password",
      },
      {
        label: "New Password",
        key: "new_pass" as const,
        placeholder: "Minimum 8 characters",
      },
      {
        label: "Confirm Password",
        key: "confirm" as const,
        placeholder: "Re-enter new password",
      },
    ];

    return (
      <View className="flex-1 bg-[#FFFDFB]">
        <StatusBar barStyle="light-content" backgroundColor="#1A1F36" />

        <SafeAreaView
          className="absolute left-0 right-0 top-0 z-50 bg-transparent"
          edges={["top"]}
        >
          <View
            className="h-[66px] flex-row items-center justify-between overflow-hidden rounded-b-[20px] bg-[#1A1F36] px-5"
            style={{
              boxShadow: "0px 6px 12px rgba(0, 0, 0, 0.18)",
              elevation: 18,
            }}
          >
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
            <Text
              className="text-[18px] text-white"
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {isVerificationStep ? "Email Verification" : "Change Password"}
            </Text>
            <View className="w-6" />
          </View>
        </SafeAreaView>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 28, paddingTop: 105 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-5 pt-0">
            <View
              className="mt-2 rounded-[18px] border border-[#E8E1E6] bg-white p-4"
              style={{
                boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.06)",
                elevation: 3,
              }}
            >
              {!isVerificationStep ? (
                <>
                  {passwordFields.map(({ label, key, placeholder }, index) => (
                    <View
                      key={key}
                      className={`${index === 0 ? "mt-1" : "mt-4"} gap-[6px]`}
                    >
                      <Text
                        className="text-[11px] uppercase text-[#6F6F82]"
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        {label}
                        <Text style={{ color: "#DC2626" }}> *</Text>
                      </Text>
                      <View
                        className={`h-14 flex-row items-center rounded-[10px] border bg-white px-4 ${
                          passwordErrors[key] ? "border-[#DC2626]" : "border-[#E8E1E6]"
                        }`}
                      >
                        <TextInput
                          value={passwordForm[key]}
                          onChangeText={(value) => updatePasswordField(key, value)}
                          placeholder={placeholder}
                          placeholderTextColor="#9AA3AF"
                          secureTextEntry={!showPasswordFields[key]}
                          autoCapitalize="none"
                          autoCorrect={false}
                          className="flex-1 text-[14px] text-[#1A1F36]"
                          style={{ fontFamily: "Montserrat_400Regular" }}
                        />
                        <Pressable
                          onPress={() =>
                            setShowPasswordFields((current) => ({
                              ...current,
                              [key]: !current[key],
                            }))
                          }
                          hitSlop={10}
                        >
                          <Ionicons
                            name={showPasswordFields[key] ? "eye-off-outline" : "eye-outline"}
                            size={19}
                            color="#9AA3AF"
                          />
                        </Pressable>
                      </View>
                      {renderErrorCard(passwordErrors[key])}
                    </View>
                  ))}

                  {isSettingsLocked ? (
                    <View className="mt-4 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
                      <View className="flex-row items-center">
                        <Ionicons name="lock-closed-outline" size={16} color="#DC2626" />
                        <Text
                          className="ml-2 flex-1 text-[12px] leading-4 text-[#991B1B]"
                          style={{ fontFamily: "Montserrat_400Regular" }}
                        >
                          {transactionLock.message || "Transactions are view-only at the moment."}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  <View className="mt-6 mb-4 px-1">
                    <Pressable
                      onPress={() => void sendPasswordCode()}
                      disabled={isSaving || isSettingsLocked}
                      className={`h-14 flex-row items-center justify-center rounded-[10px] ${
                        isSaving || isSettingsLocked ? "bg-[#9CA3AF]" : "bg-[#1A1F36]"
                      }`}
                    >
                      {isSaving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text
                          className="text-[15px] text-white"
                          style={{ fontFamily: "Montserrat_600SemiBold" }}
                        >
                          Continue
                        </Text>
                      )}
                    </Pressable>
                    {renderErrorCard(passwordError)}
                  </View>
                </>
              ) : (
                <>
                  <Text
                    className="mt-1 text-center text-[14px] leading-6 text-[#6F6F82]"
                    style={{ fontFamily: "Montserrat_400Regular" }}
                  >
                    Please check your email. We sent a verification code to{" "}
                    {profile.email || "your registered email address"}.
                  </Text>

                  <View className="mt-6 flex-row justify-center gap-2">
                    {verificationCode.map((digit, index) => (
                      <TextInput
                        key={`password-code-${index}`}
                        ref={(element) => {
                          codeInputRefs.current[index] = element;
                        }}
                        value={digit}
                        onChangeText={(value) => handleCodeChange(index, value)}
                        keyboardType="number-pad"
                        maxLength={1}
                        selectTextOnFocus
                        className={`h-14 w-11 rounded-xl border bg-[#F8FBFF] text-center text-[20px] text-[#1A1F36] ${
                          verificationError ? "border-[#DC2626]" : "border-[#E8E1E6]"
                        }`}
                        style={{ fontFamily: "Montserrat_700Bold" }}
                      />
                    ))}
                  </View>
                  <View className="mt-5 items-center">
                    <Text
                      className="text-center text-[13px] leading-5 text-[#6F6F82]"
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      Did not get the code?{" "}
                      {resendCountdown > 0 ? (
                        <Text
                          className="text-[#2563EB]"
                          style={{ fontFamily: "Montserrat_600SemiBold" }}
                        >
                          {resendCountdown}
                        </Text>
                      ) : resendCount >= PASSWORD_CODE_RESEND_DAILY_LIMIT ? (
                        <Text className="text-[#9AA3AF]">Resend</Text>
                      ) : (
                        <Text
                          className="text-[#2563EB]"
                          style={{ fontFamily: "Montserrat_600SemiBold" }}
                          onPress={() => void sendPasswordCode({ resend: true })}
                        >
                          {isResendingCode ? "Sending..." : "Resend"}
                        </Text>
                      )}
                    </Text>
                  </View>
                  {renderErrorCard(verificationError)}

                  <View className="mt-6 mb-4 px-1">
                    <Pressable
                      onPress={verifyPasswordChange}
                      disabled={isSaving || isSettingsLocked}
                      className={`h-14 flex-row items-center justify-center rounded-[10px] ${
                        isSaving || isSettingsLocked ? "bg-[#9CA3AF]" : "bg-[#1A1F36]"
                      }`}
                    >
                      {isSaving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text
                          className="text-[15px] text-white"
                          style={{ fontFamily: "Montserrat_600SemiBold" }}
                        >
                          Verify
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FFFDFB]">
      <StatusBar barStyle="light-content" backgroundColor="#1A1F36" />

      <SafeAreaView
        className="absolute left-0 right-0 top-0 z-50 bg-transparent"
        edges={["top"]}
      >
        <View
          className="h-[66px] flex-row items-center justify-between overflow-hidden rounded-b-[20px] bg-[#1A1F36] px-5"
          style={{
            boxShadow: "0px 6px 12px rgba(0, 0, 0, 0.18)",
            elevation: 18,
          }}
        >
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text
            className="text-[18px] text-white"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            Personal Details
          </Text>
          <View className="w-6" />
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 28, paddingTop: 105 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-0">
          <View
            className="mt-2 rounded-[18px] border border-[#E8E1E6] bg-white p-4"
            style={{
              boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.06)",
              elevation: 3,
            }}
          >
            <View className="space-y-4">
            <View className="mt-1">
              <Text
                className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                First Name
                <Text style={{ color: "#DC2626" }}> *</Text>
              </Text>
              <TextInput
                value={firstName}
                onChangeText={(value) => {
                  setFirstName(value);
                  if (firstNameError) {
                    setFirstNameError("");
                  }
                }}
                placeholder="Enter your first name"
                placeholderTextColor="#9AA3AF"
                className={`h-14 rounded-[10px] bg-white px-4 text-[14px] text-[#1A1F36] ${
                  firstNameError ? "border-[#DC2626]" : "border-[#E8E1E6]"
                } border`}
                style={{ fontFamily: "Montserrat_400Regular" }}
              />
              {renderErrorCard(firstNameError)}
            </View>

            <View className="mt-4">
              <Text
                className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Last Name
                <Text style={{ color: "#DC2626" }}> *</Text>
              </Text>
              <TextInput
                value={lastName}
                onChangeText={(value) => {
                  setLastName(value);
                  if (lastNameError) {
                    setLastNameError("");
                  }
                }}
                placeholder="Enter your last name"
                placeholderTextColor="#9AA3AF"
                className={`h-14 rounded-[10px] bg-white px-4 text-[14px] text-[#1A1F36] ${
                  lastNameError ? "border-[#DC2626]" : "border-[#E8E1E6]"
                } border`}
                style={{ fontFamily: "Montserrat_400Regular" }}
              />
              {renderErrorCard(lastNameError)}
            </View>

            <View className="mt-4">
              <Text
                className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Gender
                <Text style={{ color: "#DC2626" }}> *</Text>
              </Text>
              <View className="flex-row gap-3">
                {[
                  { label: "Male", value: "male" },
                  { label: "Female", value: "female" },
                ].map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      setGender(option.value);
                      if (genderError) {
                        setGenderError("");
                      }
                    }}
                    className={`flex-1 h-12 items-center justify-center rounded-[10px] border px-4 ${
                      gender === option.value
                        ? "border-[#1A1F36] bg-[#1A1F36]"
                        : genderError
                        ? "border-[#DC2626] bg-white"
                        : "border-[#E8E1E6] bg-white"
                    }`}
                  >
                    <Text
                      className={`${gender === option.value ? "text-white" : "text-[#1A1F36]"} text-[14px]`}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {renderErrorCard(genderError)}
            </View>

            <View className="mt-4">
              <Text
                className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Email Address
              </Text>
              <TextInput
                value={email}
                editable={false}
                placeholder="email@example.com"
                placeholderTextColor="#9AA3AF"
                className="h-14 rounded-[10px] border border-[#E8E1E6] bg-[#F5F6F8] px-4 text-[14px] text-[#9AA3AF]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              />
            </View>

            <View className="mt-4">
              <Text
                className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Contact Number
                <Text style={{ color: "#DC2626" }}> *</Text>
              </Text>
              <TextInput
                value={contactNumber}
                onChangeText={(value) => {
                  const sanitized = value.replace(/\D/g, "").slice(0, 11);
                  setContactNumber(sanitized);
                  if (contactNumberError) {
                    setContactNumberError("");
                  }
                }}
                placeholder="09XXXXXXXXX"
                placeholderTextColor="#9AA3AF"
                keyboardType="numeric"
                className={`h-14 rounded-[10px] bg-white px-4 text-[14px] text-[#1A1F36] ${
                  contactNumberError ? "border-[#DC2626]" : "border-[#E8E1E6]"
                } border`}
                style={{ fontFamily: "Montserrat_400Regular" }}
              />
              {renderErrorCard(contactNumberError)}
            </View>

            <View className="mt-4">
              <BirthdayPicker
                label="Birthday"
                required
                error={birthdayError}
                errorVariant="card"
                placeholder="Select birthday"
                value={birthday}
                maxDate={new Date()}
                onChange={(value) => {
                  setBirthday(value);
                  if (birthdayError) {
                    const nextError = validateBirthday(value);
                    setBirthdayError(nextError);
                  }
                }}
              />
            </View>

            <View className="mt-4">
              <Text
                className="mb-2 text-[11px] uppercase text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Address
                <Text style={{ color: "#DC2626" }}> *</Text>
              </Text>
              <TextInput
                value={address}
                onChangeText={(value) => {
                  setAddress(value);
                  if (addressError) {
                    setAddressError("");
                  }
                }}
                placeholder="e.g. Opol, Misamis Oriental"
                placeholderTextColor="#9AA3AF"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className={`min-h-[110px] rounded-[10px] bg-white px-4 py-4 text-[14px] text-[#1A1F36] ${
                  addressError ? "border-[#DC2626]" : "border-[#E8E1E6]"
                } border`}
                style={{ fontFamily: "Montserrat_400Regular" }}
              />
              {renderErrorCard(addressError)}
            </View>

            {isSettingsLocked ? (
              <View className="mt-4 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
                <View className="flex-row items-center">
                  <Ionicons name="lock-closed-outline" size={16} color="#DC2626" />
                  <Text className="ml-2 flex-1 text-[12px] leading-4 text-[#991B1B]" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {transactionLock.message || "Transactions are view-only at the moment."}
                  </Text>
                </View>
              </View>
            ) : null}

            <View className="mt-6 mb-4 px-1">
              <Pressable
                onPress={handleSave}
                disabled={isSaving || isSettingsLocked}
                className={`h-14 flex-row items-center justify-center rounded-[10px] ${
                  isSaving || isSettingsLocked ? "bg-[#9CA3AF]" : "bg-[#1A1F36]"
                }`}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    className="text-[15px] text-white"
                    style={{ fontFamily: "Montserrat_600SemiBold" }}
                  >
                    Save
                  </Text>
                )}
              </Pressable>
              {renderErrorCard(saveError)}
            </View>
          </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
