import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal as NativeModal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getAuthSession, getAuthToken, setAuthSession, updateAuthUser } from "../api/auth";
import { buildApiHeaders, getApiBaseUrl } from "../api/axios";
import { useProfileStore } from "../store/profileStore";
import { useToastStore } from "../store/toastStore";
import { clearOfflineResources } from "../utils/offlineMasterData";

type FormState = {
  first_name: string;
  last_name: string;
  password: string;
  password_confirmation: string;
};

type ServerErrors = Partial<Record<keyof FormState, string[]>>;
type TouchedState = Partial<Record<keyof FormState, boolean>>;

const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters" },
  { key: "uppercase", label: "One uppercase letter" },
  { key: "number", label: "One number" },
  { key: "symbol", label: "One symbol" },
] as const;

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

const normalizeRole = (role?: string | null) => String(role ?? "").trim().toLowerCase();

const needsFirstLoginCompletion = (user: {
  role?: string;
  first_name?: string;
  last_name?: string;
}) =>
  normalizeRole(user.role) === "inspector" &&
  (!String(user.first_name || "").trim() || !String(user.last_name || "").trim());

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

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
}

function FieldSuccess({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <View className="mt-2 flex-row items-center gap-2 rounded-[12px] border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2">
      <Ionicons name="checkmark-outline" size={14} color="#22C55E" />
      <Text
        className="flex-1 text-[12px] text-[#15803D]"
        style={{ fontFamily: "Montserrat_400Regular" }}
      >
        {message}
      </Text>
    </View>
  );
}

type LiveInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  placeholder: string;
  error?: string;
  success?: boolean;
  secureTextEntry?: boolean;
  rightAdornment?: React.ReactNode;
};

function LiveInput({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  error = "",
  success = false,
  secureTextEntry = false,
  rightAdornment,
}: LiveInputProps) {
  const borderClass = error
    ? "border-[#DC2626]"
    : success
    ? "border-[#22C55E]"
    : "border-[#E8E1E6]";

  return (
    <View>
      <Text
        className="mb-2 text-[11px] uppercase text-[#6F6F82]"
        style={{ fontFamily: "Montserrat_600SemiBold" }}
      >
        {label}
        <Text style={{ color: "#DC2626" }}> *</Text>
      </Text>
      <View className={`h-14 flex-row items-center rounded-[10px] border bg-white px-4 ${borderClass}`}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor="#9AA3AF"
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          autoCorrect={false}
          className="flex-1 text-[14px] text-[#1A1F36]"
          style={{ fontFamily: "Montserrat_400Regular" }}
        />
        {success && !error ? (
          <Ionicons name="checkmark-outline" size={19} color="#22C55E" />
        ) : null}
        {rightAdornment}
      </View>
    </View>
  );
}

export default function FirstLoginCompletionModal() {
  const router = useRouter();
  const profile = useProfileStore((state) => state);
  const showToast = useToastStore((state) => state.showToast);
  const [form, setForm] = useState<FormState>({
    first_name: "",
    last_name: "",
    password: "",
    password_confirmation: "",
  });
  const [touched, setTouched] = useState<TouchedState>({});
  const [serverErrors, setServerErrors] = useState<ServerErrors>({});
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const session = getAuthSession();
  const shouldShow = Boolean(getAuthToken()) && needsFirstLoginCompletion(profile);

  const localErrors = useMemo(
    () => ({
      first_name: form.first_name.trim() ? "" : "First name is required.",
      last_name: form.last_name.trim() ? "" : "Last name is required.",
      password: getPasswordError(form.password),
      password_confirmation: !form.password_confirmation
        ? "Please re type the password."
        : form.password_confirmation !== form.password
        ? "Passwords do not match."
        : "",
    }),
    [form]
  );

  const passwordStatus = useMemo(() => getPasswordStatus(form.password), [form.password]);

  const getError = (field: keyof FormState) =>
    serverErrors[field]?.[0] || (touched[field] ? localErrors[field] : "");
  const getSuccess = (field: keyof FormState) =>
    Boolean(touched[field] && !getError(field) && form[field].trim() !== "");
  const passwordError = getError("password");
  const passwordSuccess =
    Boolean(touched.password) && !passwordError && !getPasswordError(form.password);
  const confirmError = getError("password_confirmation");
  const confirmSuccess =
    Boolean(touched.password_confirmation) &&
    !confirmError &&
    form.password_confirmation !== "";

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setTouched((current) => ({ ...current, [field]: true }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
  };

  const markTouched = (field: keyof FormState) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const handleSave = async () => {
    const nextTouched: TouchedState = {
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
    ) as ServerErrors;

    if (Object.keys(nextErrors).length) {
      setServerErrors(nextErrors);
      return;
    }

    setSaving(true);
    setServerErrors({});

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const result = await updateAuthUser({
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
      password: form.password,
      password_confirmation: form.password_confirmation,
    });

    setSaving(false);

    if (!result?.success) {
      if (result?.errors) {
        setServerErrors(result.errors as ServerErrors);
      }
      showToast("error", result?.message ?? "Unable to complete your account.");
      return;
    }

    setForm({
      first_name: "",
      last_name: "",
      password: "",
      password_confirmation: "",
    });
    setTouched({});
    showToast("success", "Account details saved successfully.");
  };

  const handleSignOut = async () => {
    if (saving || signingOut) return;

    setSigningOut(true);
    const token = getAuthToken();
    void clearOfflineResources();

    if (token) {
      void fetch(`${getApiBaseUrl()}/logout`, {
        method: "POST",
        headers: buildApiHeaders(token),
      }).catch(() => null);
    }

    setAuthSession(null);
    setSigningOut(false);
    router.replace("/(login)/login");
  };

  if (!shouldShow || !session) return null;

  return (
    <NativeModal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <SafeAreaView className="flex-1 bg-black/40">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            className="flex-1 justify-center px-4"
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View
              className="max-h-[92%] w-full overflow-hidden rounded-[14px] border border-[#E8E1E6] bg-[#FFFDFB]"
              style={{
                boxShadow: "0px 10px 18px rgba(0, 0, 0, 0.12)",
                elevation: 5,
              }}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 20 }}
              >
                <Text
                  className="text-center text-[22px] text-[#1A1F36]"
                  style={{ fontFamily: "Montserrat_800ExtraBold" }}
                >
                  Complete Account
                </Text>

                <View className="mt-5 gap-4">
                  <View>
                    <LiveInput
                      label="First Name"
                      value={form.first_name}
                      onChangeText={(value) => updateField("first_name", value)}
                      onBlur={() => markTouched("first_name")}
                      placeholder="Enter first name"
                      error={getError("first_name")}
                    />
                    <FieldError message={getError("first_name")} />
                  </View>

                  <View>
                    <LiveInput
                      label="Last Name"
                      value={form.last_name}
                      onChangeText={(value) => updateField("last_name", value)}
                      onBlur={() => markTouched("last_name")}
                      placeholder="Enter last name"
                      error={getError("last_name")}
                    />
                    <FieldError message={getError("last_name")} />
                  </View>

                  <View>
                    <LiveInput
                      label="Password"
                      value={form.password}
                      onChangeText={(value) => updateField("password", value)}
                      onBlur={() => markTouched("password")}
                      placeholder="Enter password"
                      error={passwordError}
                      success={passwordSuccess}
                      secureTextEntry={!showPassword}
                      rightAdornment={
                        <Pressable
                          accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                          hitSlop={10}
                          onPress={() => setShowPassword((current) => !current)}
                        >
                          <Ionicons
                            name={showPassword ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color="#9AA3AF"
                          />
                        </Pressable>
                      }
                    />
                    <View className="mt-2 gap-1.5">
                      {PASSWORD_RULES.map((rule) => {
                        const passed = passwordStatus[rule.key];
                        const active = Boolean(touched.password || form.password);

                        return (
                          <View key={rule.key} className="flex-row items-center gap-2">
                            <Ionicons
                              name={passed ? "checkmark-outline" : "close-outline"}
                              size={14}
                              color={passed ? "#22C55E" : active ? "#F87171" : "#CBD5E1"}
                            />
                            <Text
                              className={`text-[11px] ${
                                passed
                                  ? "text-[#15803D]"
                                  : active
                                  ? "text-[#DC2626]"
                                  : "text-[#9AA3AF]"
                              }`}
                              style={{ fontFamily: "Montserrat_400Regular" }}
                            >
                              {rule.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    <FieldError message={passwordError} />
                    <FieldSuccess message={passwordSuccess ? "Password is strong." : ""} />
                  </View>

                  <View>
                    <LiveInput
                      label="Re Type Password"
                      value={form.password_confirmation}
                      onChangeText={(value) => updateField("password_confirmation", value)}
                      onBlur={() => markTouched("password_confirmation")}
                      placeholder="Re type password"
                      error={confirmError}
                      success={confirmSuccess}
                      secureTextEntry={!showConfirmPassword}
                      rightAdornment={
                        <Pressable
                          accessibilityLabel={
                            showConfirmPassword ? "Hide password" : "Show password"
                          }
                          hitSlop={10}
                          onPress={() => setShowConfirmPassword((current) => !current)}
                        >
                          <Ionicons
                            name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color="#9AA3AF"
                          />
                        </Pressable>
                      }
                    />
                    <FieldError message={confirmError} />
                    <FieldSuccess message={confirmSuccess ? "Passwords match." : ""} />
                  </View>
                </View>

                <View className="mt-6 flex-row gap-3">
                  <Pressable
                    onPress={handleSignOut}
                    disabled={saving || signingOut}
                    className="h-12 flex-1 items-center justify-center rounded-[10px] border-2 border-[#1A1F36] bg-white"
                  >
                    {signingOut ? (
                      <ActivityIndicator size="small" color="#1A1F36" />
                    ) : (
                      <Text
                        className="text-[14px] text-[#1A1F36]"
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        Go Back
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    disabled={saving}
                    className="h-12 flex-1 items-center justify-center rounded-[10px] bg-[#1A1F36]"
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text
                        className="text-[14px] text-white"
                        style={{ fontFamily: "Montserrat_600SemiBold" }}
                      >
                        Save Changes
                      </Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </SafeAreaView>
    </NativeModal>
  );
}
