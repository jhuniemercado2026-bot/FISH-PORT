const normalizeDateOnly = (value) => {
  const normalized = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
};

export const invalidateTodaySystemCashReceived = (queryClient, date) => {
  const normalizedDate = normalizeDateOnly(date);

  void queryClient.invalidateQueries({
    queryKey: normalizedDate
      ? ["today-system-cash-received", { date: normalizedDate }]
      : ["today-system-cash-received"],
    refetchType: "active",
  });
};

export const adjustTodaySystemCashReceived = (queryClient, date, delta) => {
  const normalizedDate = normalizeDateOnly(date);
  const numericDelta = Number(delta || 0);

  if (!normalizedDate || !numericDelta) return;

  queryClient.setQueryData(["today-system-cash-received", { date: normalizedDate }], (previous) => ({
    ...(previous ?? {}),
    date: normalizedDate,
    amount: Number(previous?.amount || 0) + numericDelta,
  }));
};
