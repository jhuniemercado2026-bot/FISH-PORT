import axios from "axios";
import { applyFiscalYearToPayloadDates, isCurrentFiscalYear, OPERATIONAL_FISCAL_ENDPOINT_PATTERN } from "../lib/fiscalYear";
import { readStoredFiscalYear } from "../store/fiscalYearStore";
import { showInfoToast } from "../store/bottomToastStore";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

let pendingDatabaseRecoveries = 0;
export const isDatabaseRecoveryInProgress = () => pendingDatabaseRecoveries > 0;

// Automatically attach token to every request
api.interceptors.request.use((config) => {
  localStorage.removeItem("token");
  const token = sessionStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const method = String(config.method || "get").toLowerCase();
  const url = String(config.url || "");
  if (method === "post" && /\/database\/recover\/?$/.test(url)) {
    config.databaseRecovery = true;
    pendingDatabaseRecoveries += 1;
  }
  const fiscalYear = readStoredFiscalYear();

  if (["post", "put", "patch"].includes(method) && OPERATIONAL_FISCAL_ENDPOINT_PATTERN.test(url)) {
    config.data = applyFiscalYearToPayloadDates(config.data, fiscalYear);

    if (!isCurrentFiscalYear(fiscalYear)) {
      showInfoToast("Fiscal Year Active", `You are saving this record under fiscal year ${fiscalYear}.`, 4500);
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.config.databaseRecovery) pendingDatabaseRecoveries -= 1;
    return response;
  },
  (error) => {
    if (error.config?.databaseRecovery) pendingDatabaseRecoveries -= 1;
    return Promise.reject(error);
  },
);

export default api;
