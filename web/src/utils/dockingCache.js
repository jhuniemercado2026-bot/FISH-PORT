const getManilaDateString = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const getDockingDate = (docking) => String(docking?.docking_date ?? "").slice(0, 10);

const getDockingFee = (docking) => Number(docking?.docking_fee ?? 0);

const adjustStatValue = (value, delta) => Math.max(0, Number(value ?? 0) + delta);

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
    if (
      !insertIfMissing ||
      !dockingId ||
      filters.paginated ||
      String(filters.search ?? "") !== "" ||
      !["all", "active"].includes(String(filters.dockingStatus ?? "all")) ||
      String(filters.dockingPeriod ?? "all") !== "all" ||
      String(filters.boatTypeId ?? "all") !== "all"
    ) {
      return;
    }

    queryClient.setQueryData(queryKey, {
      ...previous,
      dockings: [hydratedDocking, ...previousDockings],
    });
  });
};

export const syncDockingCalendarCache = (queryClient, docking, hydrateDocking, isDockingVoided) => {
  if (!docking?.docking_id) return;

  const hydratedDocking = hydrateDocking?.(docking) ?? docking;
  const dockingId = String(docking.docking_id);

  queryClient.setQueriesData({ queryKey: ["dockings-calendar"] }, (previous) => {
    if (!Array.isArray(previous)) return previous;

    const existingIndex = previous.findIndex(
      (item) => String(item?.docking_id ?? "") === dockingId
    );

    if (existingIndex < 0) return previous;

    if (!hydratedDocking || isDockingVoided?.(hydratedDocking)) {
      return previous.filter((item) => String(item?.docking_id ?? "") !== dockingId);
    }

    const nextCalendarDockings = [...previous];
    nextCalendarDockings[existingIndex] = {
      ...nextCalendarDockings[existingIndex],
      ...hydratedDocking,
    };

    return nextCalendarDockings;
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
