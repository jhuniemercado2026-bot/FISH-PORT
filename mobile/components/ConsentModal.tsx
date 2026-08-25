import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal as NativeModal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

export type SignatureConsentOptions = {
  consentedToDataPrivacy: boolean;
  declaredTermsAccepted: boolean;
  saveForFuture: boolean;
};

type ConsentModalProps = {
  isSaving?: boolean;
  visible: boolean;
  onClose: () => void;
  onConfirm: (options: SignatureConsentOptions) => void;
  onSkip: () => void;
};

export default function ConsentModal({
  isSaving = false,
  visible,
  onClose,
  onConfirm,
  onSkip,
}: ConsentModalProps) {
  const [saveForFuture, setSaveForFuture] = useState(false);
  const [dataPrivacyConsent, setDataPrivacyConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [consentError, setConsentError] = useState("");

  useEffect(() => {
    if (!visible) {
      setSaveForFuture(false);
      setDataPrivacyConsent(false);
      setTermsConsent(false);
      setConsentError("");
    }
  }, [visible]);

  const clearError = () => setConsentError("");

  const handleConfirm = () => {
    if (!saveForFuture) {
      setConsentError("Select save for future, or tap Skip for temporary only.");
      return;
    }

    if (!dataPrivacyConsent || !termsConsent) {
      setConsentError("Please confirm the data privacy consent before saving permanently.");
      return;
    }

    onConfirm({
      consentedToDataPrivacy: dataPrivacyConsent,
      declaredTermsAccepted: termsConsent,
      saveForFuture,
    });
  };

  const CheckRow = ({
    checked,
    children,
    onPress,
  }: {
    checked: boolean;
    children: string;
    onPress: () => void;
  }) => (
    <Pressable
      className="mt-3 flex-row items-start"
      disabled={isSaving}
      onPress={onPress}
    >
      <Ionicons
        name={checked ? "checkbox-outline" : "square-outline"}
        size={20}
        color={checked ? "#2563EB" : "#6F6F82"}
      />
      <Text
        className="ml-2 flex-1 text-[11px] leading-5 text-[#1A1F36]"
        style={{ fontFamily: "Montserrat_400Regular" }}
      >
        {children}
      </Text>
    </Pressable>
  );

  return (
    <NativeModal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <View
          className="w-full rounded-[18px] border border-[#E8E1E6] bg-white px-5 py-5"
          style={{
            boxShadow: "0px 8px 16px rgba(0, 0, 0, 0.14)",
            elevation: 12,
          }}
        >
          <View className="flex-row items-center">
            <View className="flex-1 pr-3">
              <Text
                className="text-[15px] text-[#1A1F36]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Signature Consent
              </Text>
              <Text
                className="mt-0 text-[12px] text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                Read all the checklist.
              </Text>
            </View>
            <Pressable
              className="h-9 w-9 items-center justify-center rounded-full bg-white"
              disabled={isSaving}
              onPress={onClose}
            >
              <Ionicons name="close-outline" size={22} color="#1A1F36" />
            </Pressable>
          </View>

          <ScrollView
            className="mt-4 max-h-[440px]"
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="rounded-[10px] border border-[#E8E1E6] bg-[#F8F8FA] px-3 pb-3 pt-1">
              <CheckRow
                checked={saveForFuture}
                onPress={() => {
                  setSaveForFuture((current) => !current);
                  clearError();
                }}
              >
                Save this signature for future Banyera transactions (By checking
                this box, I confirm that I voluntarily agree to the recording,
                storage, and use of my signature in the Fish Port Management
                System for future official Banyera transactions.)
              </CheckRow>
              <Text
                className="ml-7 mt-2 text-[11px] leading-5 text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                If skipped, this signature is temporary and will be used only
                for the current Banyera transaction.
              </Text>
              <CheckRow
                checked={dataPrivacyConsent}
                onPress={() => {
                  setDataPrivacyConsent((current) => !current);
                  clearError();
                }}
              >
                I/We give my/our consent to the collection, recording, storage,
                and processing of my/our signature and related information for
                legitimate and lawful purposes, in accordance with the Data
                Privacy Act of 2012 (R.A. No. 10173).
              </CheckRow>
              <CheckRow
                checked={termsConsent}
                onPress={() => {
                  setTermsConsent((current) => !current);
                  clearError();
                }}
              >
                I/We declare that I/we have read, understood, and voluntarily
                agreed to the above terms and consent to the processing of
                my/our information for legitimate and lawful purposes.
              </CheckRow>
              {consentError ? (
                <Text
                  className="mt-2 text-center text-[11px] text-[#DC2626]"
                  style={{ fontFamily: "Montserrat_400Regular" }}
                >
                  {consentError}
                </Text>
              ) : null}
            </View>
          </ScrollView>

          <View className="mt-4 flex-row gap-2">
            <Pressable
              className="h-11 flex-1 items-center justify-center rounded-[10px] border border-[#E8E1E6] bg-white"
              disabled={isSaving}
              onPress={onSkip}
            >
              <Text
                className="text-[13px] text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Skip
              </Text>
            </Pressable>
            <Pressable
              className={`h-11 flex-1 items-center justify-center rounded-[10px] ${
                isSaving ? "bg-[#46506E]" : "bg-[#1A1F36]"
              }`}
              disabled={isSaving}
              onPress={handleConfirm}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text
                  className="text-[13px] text-white"
                  style={{ fontFamily: "Montserrat_600SemiBold" }}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </NativeModal>
  );
}
