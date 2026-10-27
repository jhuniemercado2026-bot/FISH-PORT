export const PENALTY_SETTINGS_EVENT = "opol:penalty-settings-updated";

export const syncPenaltySettings = async (queryClient, settings) => {
  const state = {
    is_active: Boolean(settings.is_active), amount: String(settings.amount),
    interval_value: settings.interval_value, interval_unit: settings.interval_unit,
    version: settings.version, updated_at: settings.updated_at,
  };
  const previous = queryClient.getQueryData(["bill-penalty-state"]);
  queryClient.setQueryData(["bill-penalty-state"], state);
  queryClient.setQueryData(["bill-penalty-settings"], settings);
  if (JSON.stringify(previous) === JSON.stringify(state)) return;

  // Stored previews must not bring back the old fee when switching report tabs.
  try { window.sessionStorage.removeItem("opol:reports:preview-cache"); } catch { /* Storage may be unavailable. */ }
  await queryClient.invalidateQueries({ predicate: (query) =>
    /billing|bill-penalty-rules|bill-penalty-entries|statement|dashboard|payment|revenue|receivable|collection|daily-report|monthly-report|yearly-report|universal-search/.test(String(query.queryKey[0])) });
  window.dispatchEvent(new CustomEvent(PENALTY_SETTINGS_EVENT, { detail: state }));
};
