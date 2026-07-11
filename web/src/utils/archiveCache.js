const normalizeArchiveType = (type = "") => String(type ?? "").trim();

const getArchiveItemKey = (item, type) => {
  const normalizedType = normalizeArchiveType(type);

  switch (normalizedType) {
    case "boats":
      return `boats:${item?.boat_id ?? item?.id ?? ""}`;
    case "boatTypes":
      return `boatTypes:${item?.boat_type_id ?? item?.id ?? ""}`;
    case "boatOwners":
      return `boatOwners:${item?.owner_id ?? item?.id ?? ""}`;
    case "fishClassifications":
      return `fishClassifications:${item?.classification_id ?? item?.id ?? ""}`;
    case "vehicleTypes":
      return `vehicleTypes:${item?.vehicle_type_id ?? item?.id ?? ""}`;
    case "fees":
      return `fees:${item?.fee_id ?? item?.id ?? ""}`;
    default:
      return `archive:${item?.id ?? item?.boat_id ?? item?.boat_type_id ?? item?.owner_id ?? item?.classification_id ?? item?.vehicle_type_id ?? item?.fee_id ?? ""}`;
  }
};

const getArchiveTimestamp = (item) => item?.archived_at ?? item?.deleted_at ?? item?.created_at ?? null;

const isTimestampToday = (value) => {
  if (!value) return false;

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return false;

  const today = new Date();
  return (
    timestamp.getFullYear() === today.getFullYear() &&
    timestamp.getMonth() === today.getMonth() &&
    timestamp.getDate() === today.getDate()
  );
};

const getArchiveItemsFromData = (data) => {
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data)) return data;
  return null;
};

const getArchiveQueryType = (queryKey = []) => normalizeArchiveType(queryKey?.[1]?.type ?? queryKey?.[1]?.resourceType ?? "");

export const upsertArchiveItemInDataCache = (queryClient, item, type) => {
  if (!item) return;

  const normalizedType = normalizeArchiveType(type);
  if (!normalizedType) return;

  queryClient.getQueriesData({ queryKey: ["archives-data"] }).forEach(([queryKey, data]) => {
    if (!data) return;

    const queryType = getArchiveQueryType(queryKey);
    if (queryType && queryType !== normalizedType) return;

    const nextData = { ...data };
    const currentItems = getArchiveItemsFromData(data);
    const hasMatchingItem = Array.isArray(currentItems)
      ? currentItems.some((cachedItem) => getArchiveItemKey(cachedItem, normalizedType) === getArchiveItemKey(item, normalizedType))
      : false;

    if (Array.isArray(currentItems) && !hasMatchingItem) {
      nextData.data = [item, ...currentItems];
    }

    const nextStats = { ...(data?.stats ?? {}) };
    nextStats.total = Number(nextStats.total ?? 0) + 1;
    if (isTimestampToday(getArchiveTimestamp(item))) {
      nextStats.archived_today = Number(nextStats.archived_today ?? 0) + 1;
    }
    if (nextStats.counts && typeof nextStats.counts === "object") {
      const nextCounts = { ...nextStats.counts };
      nextCounts[normalizedType] = Number(nextCounts[normalizedType] ?? 0) + 1;
      nextStats.counts = nextCounts;
    }
    nextData.stats = nextStats;

    if (data?.meta) {
      nextData.meta = {
        ...data.meta,
        total: Number(data.meta.total ?? 0) + 1,
      };
    }

    queryClient.setQueryData(queryKey, nextData);
  });
};

export const removeArchiveItemFromDataCache = (queryClient, item, type) => {
  if (!item) return;

  const normalizedType = normalizeArchiveType(type);
  if (!normalizedType) return;

  queryClient.getQueriesData({ queryKey: ["archives-data"] }).forEach(([queryKey, data]) => {
    if (!data) return;

    const queryType = getArchiveQueryType(queryKey);
    if (queryType && queryType !== normalizedType) return;

    const nextData = { ...data };
    const currentItems = getArchiveItemsFromData(data);
    const currentItemKey = getArchiveItemKey(item, normalizedType);

    if (Array.isArray(currentItems)) {
      const nextItems = currentItems.filter((cachedItem) => getArchiveItemKey(cachedItem, normalizedType) !== currentItemKey);
      if (nextItems.length !== currentItems.length) {
        nextData.data = nextItems;
      }
    }

    const nextStats = { ...(data?.stats ?? {}) };
    nextStats.total = Math.max(0, Number(nextStats.total ?? 0) - 1);
    if (isTimestampToday(getArchiveTimestamp(item))) {
      nextStats.archived_today = Math.max(0, Number(nextStats.archived_today ?? 0) - 1);
    }
    if (nextStats.counts && typeof nextStats.counts === "object") {
      const nextCounts = { ...nextStats.counts };
      nextCounts[normalizedType] = Math.max(0, Number(nextCounts[normalizedType] ?? 0) - 1);
      nextStats.counts = nextCounts;
    }
    nextData.stats = nextStats;

    if (data?.meta) {
      nextData.meta = {
        ...data.meta,
        total: Math.max(0, Number(data.meta.total ?? 0) - 1),
      };
    }

    queryClient.setQueryData(queryKey, nextData);
  });
};
