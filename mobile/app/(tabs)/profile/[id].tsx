import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { updateAuthUser } from "../../../api/auth";
import { useProfileStore } from "../../../store/profileStore";
import BirthdayPicker from "../../../components/BirthdayPicker";
import { ActivityIndicator, Pressable, ScrollView, StatusBar, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";

export default function PersonalDetailsScreen() {
  const router = useRouter();
  const profile = useProfileStore((state) => state);

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
  const [address, setAddress] = useState(
    typeof profile.address === "string" && profile.address.trim()
      ? profile.address.trim()
      : ""
  );

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

    return value <= cutoff ? "" : "Birthday must be 15 years old or above.";
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
            shadowColor: "#000000",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
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
          <View className="mt-2 rounded-[18px] border border-[#E8E1E6] bg-[#FAFAFC] p-4">
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

            <View className="mt-6 mb-4 px-1">
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                className={`h-14 flex-row items-center justify-center rounded-[10px] ${
                  isSaving ? "bg-[#9CA3AF]" : "bg-[#1A1F36]"
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
