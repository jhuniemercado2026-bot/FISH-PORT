import { Provider } from "@ant-design/react-native";
import { AntDesign } from "@expo/vector-icons";
import { Montserrat_400Regular } from "@expo-google-fonts/montserrat/400Regular";
import { Montserrat_600SemiBold } from "@expo-google-fonts/montserrat/600SemiBold";
import { Montserrat_800ExtraBold } from "@expo-google-fonts/montserrat/800ExtraBold";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { GlobalToast } from "../components/toast";
import "@/global.css";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...AntDesign.font,
    Montserrat_400Regular,
    Montserrat_600SemiBold,
    Montserrat_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Provider>
      <Stack screenOptions={{ headerShown: false }} />
      <GlobalToast />
    </Provider>
  );
}
