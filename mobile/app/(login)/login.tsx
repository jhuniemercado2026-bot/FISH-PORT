import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
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
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

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
                      placeholder="name@gmail.com"
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

                  <Pressable disabled={isSubmitting} hitSlop={10}>
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
            </View>
          </KeyboardAwareScrollView>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
