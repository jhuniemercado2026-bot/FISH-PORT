import { Ionicons } from "@expo/vector-icons";
import { useRef } from "react";
import {
  Modal as NativeModal,
  Pressable,
  Text,
  View,
} from "react-native";
import OwnerSignaturePad, { OwnerSignaturePadRef } from "./OwnerSignaturePad";

type SignatureModalProps = {
  ownerName?: string;
  visible: boolean;
  onBegin?: () => void;
  onClose: () => void;
  onEmpty?: () => void;
  onOK: (signature: string) => void;
};

export default function SignatureModal({
  ownerName,
  visible,
  onBegin,
  onClose,
  onEmpty,
  onOK,
}: SignatureModalProps) {
  const signatureRef = useRef<OwnerSignaturePadRef>(null);

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
                Signature
              </Text>
              <Text
                className="mt-0 text-[12px] text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_400Regular" }}
              >
                {ownerName || "Select boat first"}
              </Text>
            </View>
            <Pressable
              className="h-9 w-9 items-center justify-center rounded-full bg-white"
              onPress={onClose}
            >
              <Ionicons name="close-outline" size={22} color="#1A1F36" />
            </Pressable>
          </View>

          <Text
            className="mt-4 text-center text-[12px] text-[#6F6F82]"
            style={{ fontFamily: "Montserrat_400Regular" }}
          >
            Please sign inside the box below.
          </Text>

          <View className="mt-3 h-[220px] overflow-hidden rounded-[10px] border border-[#E8E1E6] bg-white">
            <OwnerSignaturePad
              ref={signatureRef}
              backgroundColor="#FFFFFF"
              minWidth={1}
              maxWidth={3}
              onBegin={onBegin}
              onEmpty={onEmpty}
              onOK={onOK}
              penColor="#1A1F36"
            />
          </View>

          <View className="mt-4 flex-row gap-2">
            <Pressable
              className="h-11 flex-1 items-center justify-center rounded-[10px] border border-[#E8E1E6] bg-white"
              onPress={() => signatureRef.current?.clearSignature?.()}
            >
              <Text
                className="text-[13px] text-[#6F6F82]"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Clear
              </Text>
            </Pressable>
            <Pressable
              className="h-11 flex-1 items-center justify-center rounded-[10px] bg-[#1A1F36]"
              onPress={() => signatureRef.current?.readSignature?.()}
            >
              <Text
                className="text-[13px] text-white"
                style={{ fontFamily: "Montserrat_600SemiBold" }}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </NativeModal>
  );
}
