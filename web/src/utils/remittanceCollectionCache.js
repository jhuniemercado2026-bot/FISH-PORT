const normalizeDateOnly = (value) => {
  const normalized = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
};

export const invalidateTodayCollection = (queryClient, date) => {
  const normalizedDate = normalizeDateOnly(date);

  void queryClient.invalidateQueries({
    queryKey: normalizedDate
      ? ["today-collection", { date: normalizedDate }]
      : ["today-collection"],
    refetchType: "active",
  });
};

export const adjustTodayCollection = (queryClient, date, delta) => {
  const normalizedDate = normalizeDateOnly(date);
  const parseMoneyValue = (value) => {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const numericDelta = parseMoneyValue(delta);

  if (!normalizedDate || !numericDelta) return;

  queryClient.setQueryData(["today-collection", { date: normalizedDate }], (previous) => ({
    ...(previous ?? {}),
    date: normalizedDate,
    amount: parseMoneyValue(previous?.amount) + numericDelta,
  }));
};
