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
  const numericDelta = Number(delta || 0);

  if (!normalizedDate || !numericDelta) return;

  queryClient.setQueryData(["today-collection", { date: normalizedDate }], (previous) => ({
    ...(previous ?? {}),
    date: normalizedDate,
    amount: Number(previous?.amount || 0) + numericDelta,
  }));
};
