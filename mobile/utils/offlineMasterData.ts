import AsyncStorage from "@react-native-async-storage/async-storage";

const OFFLINE_BOATS_KEY = "opol_fish_port.offline_boats";
const OFFLINE_RESOURCE_PREFIX = "opol_fish_port.offline_resource.";

export const offlineResourceGroups = [
  { key: "boats", label: "Boats" },
  { key: "fish_classifications", label: "Classifications" },
  { key: "fees", label: "Fees" },
  { key: "vehicle_types", label: "Vehicle Types" },
  { key: "annual_vehicle_tickets", label: "Registered Plates" },
  { key: "home", label: "Home" },
  { key: "history", label: "History" },
  { key: "notifications", label: "Notifications" },
  { key: "user_session", label: "User Session" },
] as const;

export type OfflineResourceKey = (typeof offlineResourceGroups)[number]["key"];

type OfflineResourceEnvelope = {
  data: unknown;
  saved_at: string;
};

const resourceKey = (key: OfflineResourceKey) => `${OFFLINE_RESOURCE_PREFIX}${key}`;

function normalizeArrayResource<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function saveOfflineResource(key: OfflineResourceKey, data: unknown) {
  const envelope: OfflineResourceEnvelope = {
    data,
    saved_at: new Date().toISOString(),
  };

  await AsyncStorage.setItem(resourceKey(key), JSON.stringify(envelope));
}

export async function getOfflineResource<T>(key: OfflineResourceKey) {
  const raw = await AsyncStorage.getItem(resourceKey(key));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OfflineResourceEnvelope>;
    return {
      data: parsed.data as T,
      saved_at: String(parsed.saved_at ?? ""),
    };
  } catch {
    return null;
  }
}

export async function getOfflineResourceArray<T>(key: OfflineResourceKey) {
  const resource = await getOfflineResource<unknown>(key);
  return normalizeArrayResource<T>(resource?.data);
}

export async function getOfflineReadinessStatus() {
  const entries = await Promise.all(
    offlineResourceGroups.map(async (group) => {
      const resource = await getOfflineResource<unknown>(group.key);
      const isReady = Boolean(resource?.saved_at);

      return {
        ...group,
        isReady,
        saved_at: resource?.saved_at ?? "",
      };
    })
  );
  const readyCount = entries.filter((entry) => entry.isReady).length;

  return {
    entries,
    readyCount,
    totalCount: offlineResourceGroups.length,
    percent: Math.round((readyCount / offlineResourceGroups.length) * 100),
    lastUpdated:
      entries
        .filter((entry) => entry.saved_at)
        .sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at)))[0]
        ?.saved_at ?? "",
  };
}

export async function clearOfflineResources() {
  await Promise.all([
    ...offlineResourceGroups.map((group) => AsyncStorage.removeItem(resourceKey(group.key))),
    AsyncStorage.removeItem(OFFLINE_BOATS_KEY),
  ]);
}

export async function saveOfflineBoats(boats: unknown[]) {
  await saveOfflineResource("boats", boats);
  await AsyncStorage.setItem(OFFLINE_BOATS_KEY, JSON.stringify(boats));
}

export async function getOfflineBoats<T>() {
  const cachedResource = await getOfflineResourceArray<T>("boats");
  if (cachedResource.length > 0) return cachedResource;

  const rawBoats = await AsyncStorage.getItem(OFFLINE_BOATS_KEY);
  if (!rawBoats) return [];

  try {
    const parsed = JSON.parse(rawBoats);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
