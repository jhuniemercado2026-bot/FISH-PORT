const getManilaDateString = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const getDockingDate = (docking) => String(docking?.docking_date ?? "").slice(0, 10);

const parseMoneyValue = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDockingFee = (docking) => parseMoneyValue(docking?.docking_fee);

const adjustStatValue = (value, delta) => Math.max(0, parseMoneyValue(value) + parseMoneyValue(delta));

const sortDockingsByDate = (dockings = []) =>
  [...dockings].sort((left, right) => {
    const leftDate = String(left?.docking_date ?? "");
    const rightDate = String(right?.docking_date ?? "");
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return Number(left?.docking_id ?? 0) - Number(right?.docking_id ?? 0);
  });

const getDockingStatus = (docking) =>
  docking?.is_voided || docking?.voided_at || String(docking?.status ?? "").toLowerCase() === "voided"
    ? "voided"
    : "active";

const isDockingVisibleForFilters = (docking, filters = {}) => {
  const search = String(filters.search ?? "").trim();
  const dockingStatus = String(filters.dockingStatus ?? "all");
  const dockingPeriod = String(filters.dockingPeriod ?? "all");
  const boatTypeId = String(filters.boatTypeId ?? "all");
  const page = Number(filters.page ?? 1);

  if (search || page !== 1) return false;
  if (!["all", getDockingStatus(docking)].includes(dockingStatus)) return false;
  if (dockingPeriod !== "all") return false;
  if (boatTypeId !== "all") {
    const recordBoatTypeId =
      docking?.boat?.boat_type_id ??
      docking?.boat?.boatType?.boat_type_id ??
      docking?.boat?.boat_type?.boat_type_id;
    if (String(recordBoatTypeId ?? "") !== boatTypeId) return false;
  }

  return true;
};

const trimDockingsForPage = (dockings, filters = {}) => {
  const perPage = Number(filters.perPage ?? 0);
  if (!perPage || perPage < 1) return dockings;
  return dockings.slice(0, perPage);
};

const incrementDockingsMeta = (meta, dockingsCount) => {
  if (!meta) return meta;

  const total = Number(meta.total ?? 0) + 1;
  const perPage = Number(meta.per_page ?? meta.perPage ?? dockingsCount) || dockingsCount;
  const from = Number(meta.from ?? 0) || (dockingsCount > 0 ? 1 : 0);

  return {
    ...meta,
    total,
    from,
    to: Math.min(total, Math.max(from, dockingsCount)),
    last_page: perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : meta.last_page,
  };
};

export const updateDockingStatsInCache = (queryClient, docking, action) => {
  const isTodaysDocking = getDockingDate(docking) === getManilaDateString();
  const dockingFee = getDockingFee(docking);
  const delta = action === "void" ? -1 : 1;

  queryClient.setQueriesData({ queryKey: ["dockings-data"] }, (previous) => {
    if (!previous?.stats) return previous;

    const stats = {
      ...previous.stats,
      total_records: adjustStatValue(previous.stats.total_records, delta),
    };

    if (isTodaysDocking) {
      stats.logged_today = adjustStatValue(previous.stats.logged_today, delta);
      stats.total_fee_today = adjustStatValue(previous.stats.total_fee_today, delta * dockingFee);
    }

    return {
      ...previous,
      stats,
    };
  });
};

export const upsertDockingInDataCache = (queryClient, docking, hydrateDocking, options = {}) => {
  if (!docking) return;

  const { insertIfMissing = false } = options;

  queryClient.getQueriesData({ queryKey: ["dockings-data"] }).forEach(([queryKey, previous]) => {
    if (!previous) return previous;

    const hydratedDocking = hydrateDocking?.(docking) ?? docking;
    if (!hydratedDocking) return previous;

    const previousDockings = Array.isArray(previous.dockings) ? previous.dockings : [];
    const dockingId = String(hydratedDocking.docking_id ?? "");
    const existingIndex = previousDockings.findIndex(
      (item) => String(item?.docking_id ?? "") === dockingId
    );

    if (existingIndex >= 0) {
      const nextDockings = [...previousDockings];
      nextDockings[existingIndex] = {
        ...nextDockings[existingIndex],
        ...hydratedDocking,
      };

      queryClient.setQueryData(queryKey, {
        ...previous,
        dockings: nextDockings,
      });
      return;
    }

    const filters = queryKey?.[1] ?? {};
    if (!insertIfMissing || !dockingId || !isDockingVisibleForFilters(hydratedDocking, filters)) {
      return;
    }

    const nextDockings = trimDockingsForPage([hydratedDocking, ...previousDockings], filters);

    queryClient.setQueryData(queryKey, {
      ...previous,
      dockings: nextDockings,
      dockingsMeta: incrementDockingsMeta(previous.dockingsMeta, nextDockings.length),
    });
  });
};

const isDockingInsideCalendarRange = (docking, filters = {}) => {
  const date = getDockingDate(docking);
  if (!date) return false;

  const start = String(filters.start ?? "");
  const end = String(filters.end ?? "");

  if (start && date < start) return false;
  if (end && date > end) return false;

  return true;
};

export const syncDockingCalendarCache = (
  queryClient,
  docking,
  hydrateDocking,
  isDockingVoided,
  options = {}
) => {
  if (!docking?.docking_id) return;

  const { insertIfMissing = false } = options;
  const hydratedDocking = hydrateDocking?.(docking) ?? docking;
  const dockingId = String(docking.docking_id);

  queryClient.getQueriesData({ queryKey: ["dockings-calendar"] }).forEach(([queryKey, previous]) => {
    if (!Array.isArray(previous)) return previous;

    const existingIndex = previous.findIndex(
      (item) => String(item?.docking_id ?? "") === dockingId
    );

    if (!hydratedDocking || isDockingVoided?.(hydratedDocking)) {
      if (existingIndex < 0) return;
      queryClient.setQueryData(
        queryKey,
        previous.filter((item) => String(item?.docking_id ?? "") !== dockingId)
      );
      return;
    }

    if (existingIndex >= 0) {
      const nextCalendarDockings = [...previous];
      nextCalendarDockings[existingIndex] = {
        ...nextCalendarDockings[existingIndex],
        ...hydratedDocking,
      };

      queryClient.setQueryData(queryKey, sortDockingsByDate(nextCalendarDockings));
      return;
    }

    const filters = queryKey?.[1] ?? {};
    if (!insertIfMissing || !isDockingInsideCalendarRange(hydratedDocking, filters)) {
      return;
    }

    queryClient.setQueryData(queryKey, sortDockingsByDate([...previous, hydratedDocking]));
  });
};

export const hasDockingCalendarItemsForDate = (queryClient, date, isDockingVoided) =>
  queryClient
    .getQueriesData({ queryKey: ["dockings-calendar"] })
    .some(([, data]) =>
      Array.isArray(data) &&
      data.some(
        (item) =>
          String(item?.docking_date || "").slice(0, 10) === date &&
          !isDockingVoided?.(item)
      )
    );
