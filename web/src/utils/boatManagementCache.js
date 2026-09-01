const getBoatStatus = (status) =>
  String(status ?? "").trim().toLowerCase().replace(/\s+/g, "_");

const getStatusStatsKey = (status) => {
  switch (getBoatStatus(status)) {
    case "active":
      return "active_boats";
    case "expired":
      return "expired_boats";
    case "suspended":
      return "suspended_boats";
    case "under_repair":
      return "under_repair_boats";
    default:
      return null;
  }
};

const adjustStatValue = (value, delta) => Math.max(0, Number(value ?? 0) + delta);

const isUnfilteredBoatTypesQuery = (params = {}) =>
  String(params.search ?? "") === "" &&
  String(params.usage ?? params.status ?? "all") === "all" &&
  (!params.page || params.page === 1);

const isUnfilteredOwnersQuery = (params = {}) =>
  String(params.search ?? "") === "" &&
  String(params.usage ?? params.status ?? "all") === "all" &&
  (!params.page || params.page === 1);

const isUnfilteredBoatsQuery = (params = {}) =>
  (params.boatsPaginated === false || params.boatsPaginated === undefined) &&
  String(params.search ?? "") === "" &&
  String(params.status ?? "all") === "all" &&
  String(params.owner ?? "all") === "all" &&
  String(params.boatType ?? "all") === "all" &&
  String(params.page ?? "") === "";

const updateMatchingQueries = (queryClient, queryKey, updater) => {
  queryClient.getQueriesData({ queryKey }).forEach(([queryKey, data]) => {
    if (!data) return;
    const nextData = updater(queryKey, data);
    if (nextData !== undefined) {
      queryClient.setQueryData(queryKey, nextData);
    }
  });
};

const updateBoatInData = (data, updatedBoat) => {
  if (!data || !Array.isArray(data.boats)) return undefined;
  let changed = false;
  const nextData = { ...data, boats: data.boats.map((boat) => {
    if (String(boat.boat_id) !== String(updatedBoat.boat_id)) return boat;
    changed = true;
    return {
      ...boat,
      ...updatedBoat,
      boat_name: updatedBoat.boat_name ?? boat.boat_name,
      status: updatedBoat.status ?? boat.status,
      boat_type_id: updatedBoat.boat_type_id ?? boat.boat_type_id,
      owner_id: updatedBoat.owner_id ?? boat.owner_id,
      owner: updatedBoat.owner ?? boat.owner,
      boat_type: updatedBoat.boat_type ?? updatedBoat.boatType ?? boat.boat_type ?? boat.boatType,
      boatType: updatedBoat.boatType ?? updatedBoat.boat_type ?? boat.boatType ?? boat.boat_type,
      createdBy: updatedBoat.createdBy ?? boat.createdBy,
    };
  }) };

  return changed ? nextData : undefined;
};

const updateBoatTypeInBoats = (data, boatType) => {
  if (!data || !Array.isArray(data.boats)) return undefined;
  let changed = false;
  const nextData = { ...data, boats: data.boats.map((boat) => {
    const cachedBoatTypeId = boat.boat_type_id ?? boat.boat_type?.boat_type_id ?? boat.boatType?.boat_type_id;
    if (String(cachedBoatTypeId) !== String(boatType.boat_type_id)) return boat;
    changed = true;
    return {
      ...boat,
      boat_type: { ...(boat.boat_type ?? {}), ...boatType },
      boatType: { ...(boat.boatType ?? {}), ...boatType },
    };
  }) };

  return changed ? nextData : undefined;
};

const updateOwnerInBoats = (data, owner) => {
  if (!data || !Array.isArray(data.boats)) return undefined;
  let changed = false;
  const nextData = { ...data, boats: data.boats.map((boat) => {
    const cachedOwnerId = boat.owner_id ?? boat.owner?.owner_id;
    if (String(cachedOwnerId) !== String(owner.owner_id)) return boat;
    changed = true;
    return {
      ...boat,
      owner: { ...(boat.owner ?? {}), ...owner },
    };
  }) };

  return changed ? nextData : undefined;
};

const updateStatsForBoatStatusChange = (stats, prevStatusKey, statusKey) => {
  if (!stats || !prevStatusKey || !statusKey || prevStatusKey === statusKey) return stats;
  const nextStats = { ...stats };
  if (typeof nextStats[prevStatusKey] === "number") {
    nextStats[prevStatusKey] = adjustStatValue(nextStats[prevStatusKey], -1);
  }
  if (typeof nextStats[statusKey] === "number") {
    nextStats[statusKey] = adjustStatValue(nextStats[statusKey], 1);
  }
  return nextStats;
};

const incrementBoatStats = (stats, statusKey) => {
  if (!stats) return stats;
  const nextStats = { ...stats };
  nextStats.total_registered = adjustStatValue(nextStats.total_registered, 1);
  if (statusKey) {
    nextStats[statusKey] = adjustStatValue(nextStats[statusKey], 1);
  }
  return nextStats;
};

const decrementBoatStats = (stats, statusKey) => {
  if (!stats) return stats;
  const nextStats = { ...stats };
  if (statusKey) {
    nextStats[statusKey] = adjustStatValue(nextStats[statusKey], -1);
  }
  return nextStats;
};

const addItemToArray = (data, arrayKey, item, metaKey) => {
  if (!data || !Array.isArray(data[arrayKey])) return undefined;
  if (data[arrayKey].some((entry) => String(entry[`${arrayKey.slice(0, -1)}_id`]) === String(item[`${arrayKey.slice(0, -1)}_id`]))) return undefined;

  const nextData = { ...data, [arrayKey]: [item, ...data[arrayKey]] };
  if (data[metaKey]) {
    nextData[metaKey] = { ...data[metaKey], total: Number(data[metaKey].total ?? 0) + 1 };
  }
  return nextData;
};

export const updateRegisteredBoatsDataCache = (queryClient, updatedBoat) => {
  // If caller didn't provide prev_status, try to infer it from any cached boat record
  if (updatedBoat && (updatedBoat.prev_status === undefined || updatedBoat.prev_status === null)) {
    const findPrevStatus = (queries) => {
      for (const [, data] of queries) {
        if (!data) continue;
        const boatsArr = Array.isArray(data.boats) ? data.boats : Array.isArray(data) ? data : null;
        if (!boatsArr) continue;
        const found = boatsArr.find((b) => String(b.boat_id) === String(updatedBoat.boat_id));
        if (found && found.status !== undefined) return found.status;
      }
      return null;
    };

    const rbCandidates = queryClient.getQueriesData({ queryKey: ["registered-boats-data"] });
    const boatsCandidates = queryClient.getQueriesData({ queryKey: ["boats"] });
    const inferred = findPrevStatus(rbCandidates) ?? findPrevStatus(boatsCandidates);
    if (inferred !== null) {
      updatedBoat.prev_status = inferred;
    }
  }

  const statusKey = getStatusStatsKey(updatedBoat.status);
  const prevStatusKey = getStatusStatsKey(updatedBoat.prev_status);

  const updateBoatData = (data) => {
    const nextData = updateBoatInData(data, updatedBoat);
    if (!nextData) return undefined;
    if (data.stats) {
      nextData.stats = updateStatsForBoatStatusChange(data.stats, prevStatusKey, statusKey);
    }
    return nextData;
  };

  updateMatchingQueries(queryClient, ["boats"], updateBoatData);
  updateMatchingQueries(queryClient, ["registered-boats-data"], updateBoatData);
  // As a safeguard, refetch active registered-boats-data / lookups so overview counts stay accurate
  try {
    void queryClient.invalidateQueries({ queryKey: ["registered-boats-data"], refetchType: "active" });
    void queryClient.invalidateQueries({ queryKey: ["boat-types"], refetchType: "active" });
    void queryClient.invalidateQueries({ queryKey: ["boat-types-report"], refetchType: "active" });
    void queryClient.invalidateQueries({ queryKey: ["boat-owners"], refetchType: "active" });
  } catch (err) {
    // ignore invalidation errors
  }
};

export const addRegisteredBoatToDataCache = (queryClient, boat) => {
  const statusKey = getStatusStatsKey(boat?.status);

  const updater = (queryKey, data) => {
    const params = queryKey?.[1] ?? {};
    if (!isUnfilteredBoatsQuery(params) || !Array.isArray(data.boats) || data.boats.some((cachedBoat) => String(cachedBoat.boat_id) === String(boat.boat_id))) {
      return undefined;
    }

    const nextData = { ...data, boats: [boat, ...data.boats] };
    if (data.stats) {
      nextData.stats = incrementBoatStats(data.stats, statusKey);
    }
    if (data.boatsMeta) {
      nextData.boatsMeta = { ...data.boatsMeta, total: Number(data.boatsMeta.total ?? 0) + 1 };
    }
    return nextData;
  };

  updateMatchingQueries(queryClient, ["boats"], updater);
  updateMatchingQueries(queryClient, ["registered-boats-data"], updater);

  // Also increment boats_count for the matching boat type and owner in cached lookups
  const incrementTypeCount = (queryKey, data) => {
    // handle both array form (['boat-types'] => [type,...]) and object form ({ boatTypes: [...] })
    if (Array.isArray(data)) {
      const changed = data.some((t) => String(t.boat_type_id) === String(boat.boat_type_id));
      if (!changed) return undefined;
      return data.map((t) => String(t.boat_type_id) === String(boat.boat_type_id) ? { ...t, boats_count: Number(t.boats_count ?? 0) + 1 } : t);
    }
    if (!data || !Array.isArray(data.boatTypes)) return undefined;
    let changed = false;
    const next = { ...data, boatTypes: data.boatTypes.map((t) => {
      if (String(t.boat_type_id) !== String(boat.boat_type_id)) return t;
      changed = true;
      return { ...t, boats_count: Number(t.boats_count ?? 0) + 1 };
    }) };
    return changed ? next : undefined;
  };

  const incrementOwnerCount = (queryKey, data) => {
    if (Array.isArray(data)) {
      const changed = data.some((o) => String(o.owner_id) === String(boat.owner_id));
      if (!changed) return undefined;
      return data.map((o) => String(o.owner_id) === String(boat.owner_id) ? { ...o, boats_count: Number(o.boats_count ?? 0) + 1 } : o);
    }
    if (!data || !Array.isArray(data.owners)) return undefined;
    let changed = false;
    const next = { ...data, owners: data.owners.map((o) => {
      if (String(o.owner_id) !== String(boat.owner_id)) return o;
      changed = true;
      return { ...o, boats_count: Number(o.boats_count ?? 0) + 1 };
    }) };
    return changed ? next : undefined;
  };

  updateMatchingQueries(queryClient, ["boat-types"], incrementTypeCount);
  updateMatchingQueries(queryClient, ["registered-boats-data"], incrementTypeCount);
  updateMatchingQueries(queryClient, ["boat-owners"], incrementOwnerCount);
  updateMatchingQueries(queryClient, ["registered-boats-data"], incrementOwnerCount);
};

export const archiveRegisteredBoatInDataCache = (queryClient, archivedBoat) => {
  const statusKey = getStatusStatsKey(archivedBoat?.status);

  const updater = (queryKey, data) => {
    if (!Array.isArray(data.boats)) return undefined;

    const nextBoats = data.boats.filter((boat) => String(boat.boat_id) !== String(archivedBoat.boat_id));
    if (nextBoats.length === data.boats.length) return undefined;

    const nextData = { ...data, boats: nextBoats };
    if (data.stats) {
      nextData.stats = decrementBoatStats(data.stats, statusKey);
    }
    if (data.boatsMeta) {
      nextData.boatsMeta = { ...data.boatsMeta, total: Math.max(0, Number(data.boatsMeta.total ?? 0) - 1) };
    }
    return nextData;
  };

  updateMatchingQueries(queryClient, ["boats"], updater);
  updateMatchingQueries(queryClient, ["registered-boats-data"], updater);
};

export const addBoatTypeToDataCache = (queryClient, boatType) => {
  const updater = (queryKey, data) => {
    if (!data || !Array.isArray(data.boatTypes)) return undefined;
    const params = queryKey?.[1] ?? {};

    if (queryKey[0] === "boat-types") {
      if (!isUnfilteredBoatTypesQuery(params) || data.boatTypes.some((type) => String(type.boat_type_id) === String(boatType.boat_type_id))) {
        return undefined;
      }
      return addItemToArray(data, "boatTypes", boatType, "boatTypesMeta");
    }

    if (queryKey[0] === "boats" || queryKey[0] === "registered-boats-data") {
      if (!params.withLookups && queryKey[0] === "boats") return undefined;
      if (data.boatTypes.some((type) => String(type.boat_type_id) === String(boatType.boat_type_id))) return undefined;
      return addItemToArray(data, "boatTypes", boatType, "boatTypesMeta");
    }

    return undefined;
  };

  updateMatchingQueries(queryClient, ["boat-types"], updater);
  updateMatchingQueries(queryClient, ["boats"], updater);
  updateMatchingQueries(queryClient, ["registered-boats-data"], updater);
};

export const updateBoatTypeInDataCache = (queryClient, boatType) => {
  const updater = (queryKey, data) => {
    if (!data) return undefined;
    let changed = false;
    const nextData = { ...data };

    if (Array.isArray(data.boatTypes)) {
      nextData.boatTypes = data.boatTypes.map((type) => {
        if (String(type.boat_type_id) !== String(boatType.boat_type_id)) return type;
        changed = true;
        return { ...type, ...boatType };
      });
    }

    if (Array.isArray(data.boats)) {
      const updated = updateBoatTypeInBoats(data, boatType);
      if (updated) {
        changed = true;
        nextData.boats = updated.boats;
      }
    }

    return changed ? nextData : undefined;
  };

  updateMatchingQueries(queryClient, ["boat-types"], updater);
  updateMatchingQueries(queryClient, ["boats"], updater);
  updateMatchingQueries(queryClient, ["registered-boats-data"], updater);
};

export const archiveBoatTypeInDataCache = (queryClient, boatTypeId) => {
  const updater = (queryKey, data) => {
    if (!data || !Array.isArray(data.boatTypes)) return undefined;

    const nextBoatTypes = data.boatTypes.filter((type) => String(type.boat_type_id) !== String(boatTypeId));
    if (nextBoatTypes.length === data.boatTypes.length) return undefined;

    const nextData = { ...data, boatTypes: nextBoatTypes };
    if (data.boatTypesMeta) {
      nextData.boatTypesMeta = { ...data.boatTypesMeta, total: Math.max(0, Number(data.boatTypesMeta.total ?? 0) - 1) };
    }

    if (Array.isArray(data.boats)) {
      nextData.boats = data.boats.map((boat) => {
        if ((boat.boat_type_id ?? boat.boat_type?.boat_type_id ?? boat.boatType?.boat_type_id) !== String(boatTypeId)) return boat;
        return {
          ...boat,
          boat_type: null,
          boatType: null,
        };
      });
    }

    return nextData;
  };

  updateMatchingQueries(queryClient, ["boat-types"], updater);
  updateMatchingQueries(queryClient, ["boats"], updater);
  updateMatchingQueries(queryClient, ["registered-boats-data"], updater);
};

export const addOwnerToDataCache = (queryClient, owner) => {
  const updater = (queryKey, data) => {
    if (!data || !Array.isArray(data.owners)) return undefined;
    const params = queryKey?.[1] ?? {};

    if (queryKey[0] === "boat-owners") {
      if (!isUnfilteredOwnersQuery(params) || data.owners.some((cachedOwner) => String(cachedOwner.owner_id) === String(owner.owner_id))) {
        return undefined;
      }
      return addItemToArray(data, "owners", owner, "ownersMeta");
    }

    if (queryKey[0] === "boats" || queryKey[0] === "registered-boats-data") {
      if (!params.withLookups && queryKey[0] === "boats") return undefined;
      if (data.owners.some((cachedOwner) => String(cachedOwner.owner_id) === String(owner.owner_id))) return undefined;
      return addItemToArray(data, "owners", owner, "ownersMeta");
    }

    return undefined;
  };

  updateMatchingQueries(queryClient, ["boat-owners"], updater);
  updateMatchingQueries(queryClient, ["boats"], updater);
  updateMatchingQueries(queryClient, ["registered-boats-data"], updater);
};

export const updateOwnerInDataCache = (queryClient, owner) => {
  const updater = (queryKey, data) => {
    if (!data) return undefined;
    let changed = false;
    const nextData = { ...data };

    if (Array.isArray(data.owners)) {
      nextData.owners = data.owners.map((cachedOwner) => {
        if (String(cachedOwner.owner_id) !== String(owner.owner_id)) return cachedOwner;
        changed = true;
        return { ...cachedOwner, ...owner };
      });
    }

    if (Array.isArray(data.boats)) {
      const updated = updateOwnerInBoats(data, owner);
      if (updated) {
        changed = true;
        nextData.boats = updated.boats;
      }
    }

    return changed ? nextData : undefined;
  };

  updateMatchingQueries(queryClient, ["boat-owners"], updater);
  updateMatchingQueries(queryClient, ["boats"], updater);
  updateMatchingQueries(queryClient, ["registered-boats-data"], updater);
};

export const archiveOwnerInDataCache = (queryClient, ownerId) => {
  const updater = (queryKey, data) => {
    if (!data || !Array.isArray(data.owners)) return undefined;

    const nextOwners = data.owners.filter((owner) => String(owner.owner_id) !== String(ownerId));
    if (nextOwners.length === data.owners.length) return undefined;

    const nextData = { ...data, owners: nextOwners };
    if (data.ownersMeta) {
      nextData.ownersMeta = { ...data.ownersMeta, total: Math.max(0, Number(data.ownersMeta.total ?? 0) - 1) };
    }

    if (Array.isArray(data.boats)) {
      nextData.boats = data.boats.map((boat) => {
        if (String(boat.owner_id ?? boat.owner?.owner_id) !== String(ownerId)) return boat;
        return { ...boat, owner: null };
      });
    }

    return nextData;
  };

  updateMatchingQueries(queryClient, ["boat-owners"], updater);
  updateMatchingQueries(queryClient, ["boats"], updater);
  updateMatchingQueries(queryClient, ["registered-boats-data"], updater);
};
