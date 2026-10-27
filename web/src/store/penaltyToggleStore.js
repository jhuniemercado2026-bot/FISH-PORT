import { create } from "zustand";
import api from "../api/axios";
import { syncPenaltySettings } from "../utils/penaltySettingsSync";

export const usePenaltyToggleStore = create(() => ({ operation: null }));

export const dismissPenaltyProgress = () => {
  if (usePenaltyToggleStore.getState().operation?.status !== "running") {
    usePenaltyToggleStore.setState({ operation: null });
  }
};

// The request and progress belong to the application, not the Settings page.
// Navigating away must not abort the request or remove its progress toast.
export const togglePenaltyRule = async (queryClient, rule) => {
  if (usePenaltyToggleStore.getState().operation?.status === "running") return false;
  const id = crypto.randomUUID();
  const target = !rule.is_active;
  usePenaltyToggleStore.setState({ operation: {
    id, ruleId: rule.id, name: rule.name, target, status: "running", progress: 0,
    message: "Starting penalty update…", processed: 0, total: null,
  } });
  const update = (values) => {
    const operation = usePenaltyToggleStore.getState().operation;
    if (operation?.id === id) usePenaltyToggleStore.setState({ operation: { ...operation, ...values } });
  };
  let polling = true;
  let timer;
  const controller = new AbortController();
  const poll = async () => {
    try {
      const { data } = await api.get(`/settings/bill-penalty/progress/${id}`, { signal: controller.signal });
      if (polling) {
        const state = data.data;
        update({
          progress: Math.max(usePenaltyToggleStore.getState().operation?.progress || 0, Math.min(90, state.progress)),
          processed: state.processed, total: state.total,
          message: state.total ? `Updating bills: ${Math.min(state.processed, state.total)} of ${state.total}` : "Updating penalty and bill balances…",
        });
      }
    } catch { /* A slow or missing poll does not cancel the financial update. */ }
    if (polling) timer = setTimeout(poll, 800);
  };
  timer = setTimeout(poll, 600);
  const stopPolling = () => { polling = false; clearTimeout(timer); controller.abort(); };
  try {
    let response;
    try {
      response = await api.patch(`/settings/bill-penalty/rules/${rule.id}`, { is_active: target, progress_id: id });
    } catch (error) {
      // A response can be lost after commit. Confirm the server result before
      // reporting failure and encouraging the user to retry a completed action.
      if (!error.response) {
        const state = await api.get(`/settings/bill-penalty/progress/${id}`).catch(() => null);
        if (state?.data?.data?.status !== "completed") throw error;
      } else throw error;
    }
    stopPolling();
    update({ progress: 95, message: "Refreshing billing, reports, and dashboard totals…" });
    if (response?.data?.data) {
      queryClient.setQueriesData({ queryKey: ["bill-penalty-rules"] }, (data) => data ? {
        ...data, data: (data.data || []).map((entry) => entry.id === rule.id ? response.data.data : entry),
      } : data);
    }
    let refreshed = true;
    try {
      const state = (await api.get("/settings/bill-penalty/state")).data.data;
      await syncPenaltySettings(queryClient, state);
    } catch {
      refreshed = false;
      void queryClient.invalidateQueries();
    }
    update({ progress: 100, status: "success", message: refreshed
      ? `Penalty turned ${target ? "On" : "Off"}. Bill balances and totals are updated.`
      : `Penalty turned ${target ? "On" : "Off"}. Refresh the page to load the latest totals.` });
    setTimeout(() => {
      if (usePenaltyToggleStore.getState().operation?.id === id) dismissPenaltyProgress();
    }, 6000);
    return true;
  } catch (error) {
    stopPolling();
    const errors = error.response?.data?.errors;
    update({ status: "error", message: errors ? Object.values(errors).flat()[0]
      : error.response?.data?.message || "Unable to confirm the update. Refresh Settings before trying again." });
    void queryClient.invalidateQueries({ queryKey: ["bill-penalty-rules"] });
    return false;
  }
};
